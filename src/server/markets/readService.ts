import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ClobClient } from "@polymarket/clob-client";
import type { z } from "zod";
import { getSupabaseServiceClient } from "../supabase/client";
import type { Database } from "../../types/database";
import {
  marketOrderbookOutput,
  marketOutput,
  marketPageOutput,
  priceCandleOutputArray,
  type CandleInterval,
} from "../../lib/validations/market";
import {
  type UpstashOrderbookLevel,
  buildMarketCandlesCacheKey,
  buildMarketDetailCacheKey,
  buildLatestMarketListCacheKey,
  buildMarketListCacheKey,
  readUpstashCache,
  readUpstashMarketOrderbook,
  readUpstashSnapshotCursor,
  upstashMarketCandlesTtlSec,
  upstashMarketDetailTtlSec,
  upstashMarketListTtlSec,
  writeUpstashMarketOrderbooks,
  writeUpstashSnapshotShards,
  writeUpstashCache,
} from "../cache/upstash";
import { extractTotalVolumeFromPayload } from "../../lib/marketVolumePayload";
import {
  pickBinaryOutcomes,
  resolveReliableBinaryPrice,
  roundPercentValue,
} from "../../lib/marketPresentation";
import {
  type MarketChartRange,
} from "../../lib/chartRanges";
import {
  listEnabledProviders as listEnabledVenueProviders,
} from "../venues/registry";
import {
  parseVenueMarketRef,
  venueToCanonicalId,
  type VenueProvider,
} from "../venues/types";

type SupabaseServiceClient = SupabaseClient<Database, "public">;
type MarketOutput = z.infer<typeof marketOutput>;
type MarketPageOutput = z.infer<typeof marketPageOutput>;
type MarketOrderbookOutput = z.infer<typeof marketOrderbookOutput>;
type PriceCandleOutput = z.infer<typeof priceCandleOutputArray>[number];

type CanonicalCatalogRow = {
  id: string;
  provider: VenueProvider;
  provider_market_id: string;
  provider_condition_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  state: "open" | "closed" | "resolved" | "cancelled";
  category: string | null;
  source_url: string | null;
  image_url: string | null;
  market_created_at: string;
  closes_at: string;
  expires_at: string;
  market_type: "binary" | "multi_choice";
  resolved_outcome_title: string | null;
  total_volume_usd: number;
  is_fast_market: boolean;
  catalog_bucket: "main" | "fast";
  compare_group_id: string | null;
  provider_payload: Record<string, unknown> | null;
  source_updated_at: string;
  last_synced_at: string;
};

type CanonicalOutcomeRow = {
  market_id: string;
  provider_outcome_id: string | null;
  provider_token_id: string | null;
  outcome_key: string;
  title: string;
  sort_order: number;
  probability: number;
  price: number;
  is_active: boolean;
};

type CanonicalLiveRow = {
  market_id: string;
  best_bid: number | null;
  best_ask: number | null;
  mid: number | null;
  last_trade_price: number | null;
  last_trade_size: number | null;
  rolling_24h_volume: number | null;
  open_interest: number | null;
  source_seq: number | null;
  source_ts: string | null;
};

type CanonicalCandleRow = {
  bucket_start: string;
  outcome_key: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades_count: number;
};

type CompareGroupAggregate = {
  id: string;
  marketCount: number;
  providerCount: number;
  totalVolumeUsd: number;
  category: string | null;
  normalizedClosesAt: string | null;
};

type CatalogReadErrorContext = {
  stage:
    | "market_catalog"
    | "market_outcomes"
    | "market_live"
    | "market_compare_groups"
    | "market_compare_members";
  providers: VenueProvider[];
  onlyOpen: boolean;
  sortBy: "newest" | "volume";
  catalogBucket: "all" | "main" | "fast";
  providerMarketId?: string;
};

export class CatalogReadError extends Error {
  readonly code = "CATALOG_READ_FAILED";
  readonly context: CatalogReadErrorContext;

  constructor(context: CatalogReadErrorContext, message?: string, cause?: unknown) {
    super(message ?? "CATALOG_READ_FAILED");
    this.name = "CatalogReadError";
    this.context = context;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export const isCatalogReadError = (value: unknown): value is CatalogReadError =>
  value instanceof CatalogReadError || (value instanceof Error && value.name === "CatalogReadError");

const ENABLE_MARKET_HOT_READ_FALLBACK =
  (process.env.ENABLE_MARKET_HOT_READ_FALLBACK || "").trim().toLowerCase() === "true";
const POLYMARKET_CLOB_BASE_URL = (process.env.POLYMARKET_CLOB_URL || "https://clob.polymarket.com").replace(/\/+$/, "");
const POLYMARKET_CLOB_CHAIN_ID = Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137);
const LIMITLESS_API_ROOT = "https://api.limitless.exchange";

const normalizeApiBase = (value: string): string => value.trim().replace(/\/+$/, "");

const buildLimitlessCandidateBaseUrls = (): string[] => {
  const fromEnv = normalizeApiBase(process.env.LIMITLESS_API_BASE_URL || LIMITLESS_API_ROOT);
  const candidates = new Set<string>([fromEnv, LIMITLESS_API_ROOT]);

  const addVariants = (base: string) => {
    if (base.endsWith("/api/v1")) {
      const root = base.replace(/\/api\/v1$/, "");
      candidates.add(root);
      candidates.add(`${root}/api-v1`);
      return;
    }
    if (base.endsWith("/api-v1")) {
      const root = base.replace(/\/api-v1$/, "");
      candidates.add(root);
      candidates.add(`${root}/api/v1`);
      return;
    }
    candidates.add(`${base}/api/v1`);
    candidates.add(`${base}/api-v1`);
  };

  addVariants(fromEnv);
  addVariants(LIMITLESS_API_ROOT);

  return Array.from(candidates).filter(Boolean);
};

const CANDLE_RESOLUTION_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "1h": 60 * 60 * 1000,
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const toFiniteNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizePublicEnabledProviders = (
  providers: Array<VenueProvider | string | null | undefined>
): Array<"polymarket" | "limitless"> => {
  const out = Array.from(
    new Set(
      providers.filter(
        (provider): provider is "polymarket" | "limitless" =>
          provider === "polymarket" || provider === "limitless"
      )
    )
  );
  return out.length > 0 ? out : ["polymarket"];
};

const parseProviderSelection = (input?: {
  providers?: Array<VenueProvider> | undefined;
  providerFilter?: "all" | VenueProvider | undefined;
}): VenueProvider[] => {
  const enabled = new Set<VenueProvider>(listEnabledVenueProviders());
  if (enabled.size === 0) return ["polymarket"];

  const fromFilter =
    input?.providerFilter && input.providerFilter !== "all"
      ? [input.providerFilter]
      : [];
  const fromProviders = Array.isArray(input?.providers) ? input.providers : [];
  const requested = fromFilter.length > 0 ? fromFilter : fromProviders;

  if (requested.length === 0) return Array.from(enabled);
  const deduped = Array.from(new Set(requested));
  const filtered = deduped.filter((provider) => enabled.has(provider));
  return filtered.length > 0 ? filtered : Array.from(enabled);
};

const readIsoFromPayload = (
  payload: Record<string, unknown> | null,
  keys: string[],
  fallbackIso: string
): string => {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
  }
  return fallbackIso;
};

const readStringFromPayloadPath = (
  payload: Record<string, unknown> | null,
  path: string[]
): string | null => {
  let cursor: unknown = payload;
  for (const segment of path) {
    const rec = asObject(cursor);
    if (!rec) return null;
    cursor = rec[segment];
  }
  if (typeof cursor === "string" && cursor.trim().length > 0) return cursor.trim();
  if (typeof cursor === "number" && Number.isFinite(cursor)) return String(cursor);
  if (typeof cursor === "bigint") return cursor.toString();
  return null;
};

const readStringArrayFromPayloadPath = (
  payload: Record<string, unknown> | null,
  path: string[]
): string[] => {
  let cursor: unknown = payload;
  for (const segment of path) {
    const rec = asObject(cursor);
    if (!rec) return [];
    cursor = rec[segment];
  }
  if (!Array.isArray(cursor)) return [];
  return cursor
    .map((value) => {
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "bigint") return value.toString();
      return null;
    })
    .filter((value): value is string => Boolean(value));
};

const buildLimitlessTradeMetaFromPayload = (
  payload: Record<string, unknown> | null,
  outcomes: Array<{ tokenId?: string | null }> = []
) => {
  if (!payload) return null;

  const marketSlug =
    readStringFromPayloadPath(payload, ["slug"]) ??
    readStringFromPayloadPath(payload, ["marketSlug"]) ??
    readStringFromPayloadPath(payload, ["market_slug"]);
  const exchangeAddress =
    readStringFromPayloadPath(payload, ["venue", "exchange"]) ??
    readStringFromPayloadPath(payload, ["exchangeAddress"]) ??
    readStringFromPayloadPath(payload, ["exchange_address"]);
  const collateralTokenAddress =
    readStringFromPayloadPath(payload, ["collateralToken", "address"]) ??
    readStringFromPayloadPath(payload, ["collateral_token", "address"]) ??
    readStringFromPayloadPath(payload, ["collateralTokenAddress"]) ??
    readStringFromPayloadPath(payload, ["collateral_token_address"]);

  const directPositionIdsPrimary = readStringArrayFromPayloadPath(payload, ["positionIds"]);
  const directPositionIds =
    directPositionIdsPrimary.length > 0
      ? directPositionIdsPrimary
      : readStringArrayFromPayloadPath(payload, ["position_ids"]);
  const fallbackOutcomePositionIds = outcomes
    .map((outcome) => (typeof outcome.tokenId === "string" && outcome.tokenId.trim().length > 0 ? outcome.tokenId.trim() : null))
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);
  const positionIds = (directPositionIds.length >= 2 ? directPositionIds : fallbackOutcomePositionIds).slice(0, 2);

  if (!marketSlug || !exchangeAddress || !collateralTokenAddress || positionIds.length < 2) {
    return null;
  }

  const adapterAddress =
    readStringFromPayloadPath(payload, ["venue", "adapter"]) ??
    readStringFromPayloadPath(payload, ["adapterAddress"]) ??
    readStringFromPayloadPath(payload, ["adapter_address"]);
  const collateralTokenDecimals =
    toFiniteNumber(
      readStringFromPayloadPath(payload, ["collateralToken", "decimals"]) ??
        readStringFromPayloadPath(payload, ["collateral_token", "decimals"]) ??
        readStringFromPayloadPath(payload, ["collateralTokenDecimals"]) ??
        readStringFromPayloadPath(payload, ["collateral_token_decimals"])
    ) ?? 6;
  const minOrderSize =
    toFiniteNumber(
      readStringFromPayloadPath(payload, ["minOrderSize"]) ??
        readStringFromPayloadPath(payload, ["min_order_size"])
    ) ?? null;

  return {
    marketSlug,
    exchangeAddress,
    adapterAddress: adapterAddress ?? null,
    collateralTokenAddress,
    collateralTokenDecimals: Math.max(1, Math.floor(collateralTokenDecimals)),
    minOrderSize,
    positionIds: [positionIds[0]!, positionIds[1]!] as [string, string],
  };
};

const buildMarketFreshness = (
  provider: VenueProvider,
  sourceTs: string | null | undefined
) => {
  const iso = typeof sourceTs === "string" && sourceTs.trim().length > 0 ? sourceTs : null;
  const staleAfterMs =
    provider === "polymarket"
      ? Math.max(15_000, Number(process.env.POLYMARKET_WORKER_STALE_AFTER_MS ?? 45_000))
      : Math.max(15_000, Number(process.env.LIMITLESS_WORKER_STALE_AFTER_MS ?? 90_000));
  if (!iso) {
    return { sourceTs: null, stale: false };
  }
  const parsed = Date.parse(iso);
  return {
    sourceTs: iso,
    stale: !Number.isFinite(parsed) || Date.now() - parsed > staleAfterMs,
  };
};

const readCapabilitiesFromPayload = (
  payload: Record<string, unknown> | null,
  provider: VenueProvider
): { supportsTrading: boolean; supportsCandles: boolean; supportsPublicTrades: boolean; chainId: number | null } => {
  const defaults =
    provider === "limitless"
      ? {
          supportsTrading: true,
          supportsCandles: true,
          supportsPublicTrades: true,
          chainId: Number(process.env.LIMITLESS_CHAIN_ID || 8453),
        }
      : {
          supportsTrading: true,
          supportsCandles: true,
          supportsPublicTrades: true,
          chainId: Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137),
        };

  const cap = asObject(payload?.capabilities);
  if (!cap) return defaults;

  return {
    supportsTrading: typeof cap.supportsTrading === "boolean" ? cap.supportsTrading : defaults.supportsTrading,
    supportsCandles: typeof cap.supportsCandles === "boolean" ? cap.supportsCandles : defaults.supportsCandles,
    supportsPublicTrades:
      typeof cap.supportsPublicTrades === "boolean" ? cap.supportsPublicTrades : defaults.supportsPublicTrades,
    chainId:
      typeof cap.chainId === "number" && Number.isFinite(cap.chainId)
        ? cap.chainId
        : defaults.chainId,
  };
};

const sortMarketRows = (
  rows: MarketOutput[],
  sortBy: "newest" | "volume"
): Array<MarketOutput> => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sortBy === "newest") {
      const aTs = Date.parse(String(a.createdAt ?? ""));
      const bTs = Date.parse(String(b.createdAt ?? ""));
      const aSafe = Number.isFinite(aTs) ? aTs : 0;
      const bSafe = Number.isFinite(bTs) ? bTs : 0;
      if (bSafe !== aSafe) return bSafe - aSafe;
      return Number(b.totalVolumeUsd ?? b.volume ?? 0) - Number(a.totalVolumeUsd ?? a.volume ?? 0);
    }
    const volumeDelta = Number(b.totalVolumeUsd ?? b.volume ?? 0) - Number(a.totalVolumeUsd ?? a.volume ?? 0);
    if (volumeDelta !== 0) return volumeDelta;
    const aTs = Date.parse(String(a.createdAt ?? ""));
    const bTs = Date.parse(String(b.createdAt ?? ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return sorted;
};

const buildCatalogPageScope = (params: {
  providers: VenueProvider[];
  page: number;
  sortBy: "newest" | "volume";
  onlyOpen: boolean;
  catalogBucket: "all" | "main" | "fast";
}): string =>
  [
    "catalog",
    `providers:${[...params.providers].sort().join(",") || "none"}`,
    `page:${params.page}`,
    `sort:${params.sortBy}`,
    `open:${params.onlyOpen ? 1 : 0}`,
    `bucket:${params.catalogBucket}`,
  ].join(":");

const fetchCompareGroupAggregates = async (
  supabaseService: SupabaseServiceClient,
  compareGroupIds: string[],
  context: Omit<CatalogReadErrorContext, "stage">
): Promise<Map<string, CompareGroupAggregate>> => {
  const out = new Map<string, CompareGroupAggregate>();
  const ids = Array.from(new Set(compareGroupIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return out;

  const [groupsRes, marketsRes] = await Promise.all([
    (supabaseService as any)
      .from("market_compare_groups")
      .select("id, category, normalized_closes_at")
      .in("id", ids),
    (supabaseService as any)
      .from("market_catalog")
      .select("id, provider, compare_group_id, total_volume_usd")
      .in("compare_group_id", ids),
  ]);

  if (groupsRes.error) {
    throw new CatalogReadError(
      { ...context, stage: "market_compare_groups" },
      String(groupsRes.error.message ?? "CATALOG_READ_FAILED"),
      groupsRes.error
    );
  }
  if (marketsRes.error) {
    throw new CatalogReadError(
      { ...context, stage: "market_compare_members" },
      String(marketsRes.error.message ?? "CATALOG_READ_FAILED"),
      marketsRes.error
    );
  }

  for (const row of groupsRes.data ?? []) {
    const id = String((row as Record<string, unknown>).id ?? "").trim();
    if (!id) continue;
    out.set(id, {
      id,
      marketCount: 0,
      providerCount: 0,
      totalVolumeUsd: 0,
      category: typeof (row as Record<string, unknown>).category === "string" ? String((row as Record<string, unknown>).category) : null,
      normalizedClosesAt:
        typeof (row as Record<string, unknown>).normalized_closes_at === "string"
          ? String((row as Record<string, unknown>).normalized_closes_at)
          : null,
    });
  }

  const providerSetByGroupId = new Map<string, Set<string>>();
  for (const row of marketsRes.data ?? []) {
    const rec = row as Record<string, unknown>;
    const compareGroupId = String(rec.compare_group_id ?? "").trim();
    const provider = String(rec.provider ?? "").trim();
    if (!compareGroupId || !provider) continue;
    const aggregate = out.get(compareGroupId);
    if (!aggregate) continue;
    aggregate.marketCount += 1;
    aggregate.totalVolumeUsd += toFiniteNumber(rec.total_volume_usd as number | string | null | undefined) ?? 0;
    const set = providerSetByGroupId.get(compareGroupId) ?? new Set<string>();
    set.add(provider);
    providerSetByGroupId.set(compareGroupId, set);
  }

  for (const [groupId, providers] of providerSetByGroupId.entries()) {
    const aggregate = out.get(groupId);
    if (!aggregate) continue;
    aggregate.providerCount = providers.size;
  }

  return out;
};

const buildOrderbookFreshness = async (
  marketId: string
): Promise<MarketOutput["orderbookFreshness"]> => {
  const orderbook = await readUpstashMarketOrderbook(marketId, 12);
  if (!orderbook) return null;
  const updatedAt = typeof orderbook.updatedAt === "string" ? orderbook.updatedAt : null;
  const parsed = updatedAt ? Date.parse(updatedAt) : NaN;
  return {
    updatedAt,
    depthAvailable: Math.max(0, Math.floor(orderbook.depth ?? 0)),
    stale: !Number.isFinite(parsed) || Date.now() - parsed > 60_000,
  };
};

const fetchPolymarketOrderbookFromProvider = async (
  market: MarketOutput,
  depth: number
): Promise<MarketOrderbookOutput | null> => {
  const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
  const tokenizedOutcomes = outcomes
    .map((outcome) => ({
      outcomeId: typeof outcome.id === "string" ? outcome.id : null,
      outcomeTitle: typeof outcome.title === "string" ? outcome.title : null,
      tokenId: typeof outcome.tokenId === "string" && outcome.tokenId.trim().length > 0 ? outcome.tokenId.trim() : null,
    }))
    .filter((outcome): outcome is { outcomeId: string | null; outcomeTitle: string | null; tokenId: string } => Boolean(outcome.tokenId))
    .slice(0, 2);
  if (tokenizedOutcomes.length === 0) return null;

  const chainId = (Number.isFinite(POLYMARKET_CLOB_CHAIN_ID) ? POLYMARKET_CLOB_CHAIN_ID : 137) as ConstructorParameters<typeof ClobClient>[1];
  const client = new ClobClient(POLYMARKET_CLOB_BASE_URL, chainId);
  const books = await Promise.allSettled(
    tokenizedOutcomes.map(async (outcome) => ({
      outcome,
      book: await client.getOrderBook(outcome.tokenId),
    }))
  );

  const levels: UpstashOrderbookLevel[] = [];
  let updatedAt: string | null = null;
  for (const result of books) {
    if (result.status !== "fulfilled") continue;
    const { outcome, book } = result.value;
    const timestamp = typeof book?.timestamp === "string" && book.timestamp.trim().length > 0 ? book.timestamp : null;
    if (timestamp) {
      updatedAt =
        !updatedAt || Date.parse(timestamp) > Date.parse(updatedAt)
          ? timestamp
          : updatedAt;
    }

    for (const bid of Array.isArray(book?.bids) ? book.bids.slice(0, depth) : []) {
      const price = toFiniteNumber((bid as { price?: string | number }).price);
      const size = toFiniteNumber((bid as { size?: string | number }).size);
      if (price === null || size === null) continue;
      levels.push({
        side: "bid",
        price,
        size,
        outcomeId: outcome.outcomeId,
        outcomeTitle: outcome.outcomeTitle,
      });
    }
    for (const ask of Array.isArray(book?.asks) ? book.asks.slice(0, depth) : []) {
      const price = toFiniteNumber((ask as { price?: string | number }).price);
      const size = toFiniteNumber((ask as { size?: string | number }).size);
      if (price === null || size === null) continue;
      levels.push({
        side: "ask",
        price,
        size,
        outcomeId: outcome.outcomeId,
        outcomeTitle: outcome.outcomeTitle,
      });
    }
  }

  if (levels.length === 0) return null;
  const snapshotId = await readUpstashSnapshotCursor("global");
  const orderbook: MarketOrderbookOutput = {
    marketId: market.id,
    provider: "polymarket",
    depth,
    snapshotId,
    source: "provider",
    updatedAt,
    levels,
  };
  void writeUpstashMarketOrderbooks([
    {
      marketId: market.id,
      provider: "polymarket",
      depth,
      snapshotId,
      updatedAt: updatedAt ?? new Date().toISOString(),
      levels,
    },
  ]);
  return orderbook;
};

const fetchLimitlessOrderbookFromProvider = async (
  market: MarketOutput,
  depth: number
): Promise<MarketOrderbookOutput | null> => {
  const marketSlug =
    market.tradeMeta?.limitless?.marketSlug?.trim() ||
    (typeof market.providerMarketId === "string" ? market.providerMarketId.trim() : "");
  if (!marketSlug) return null;

  for (const base of buildLimitlessCandidateBaseUrls()) {
    const urls = [`${base}/markets/${encodeURIComponent(marketSlug)}/orderbook`];
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        });
        if (!response.ok) continue;
        const payload = asObject(await response.json().catch(() => null));
        if (!payload) continue;
        const hasBookArrays = Array.isArray(payload.bids) || Array.isArray(payload.asks);
        if (!hasBookArrays) continue;

        const levels: UpstashOrderbookLevel[] = [];
        const tokenId =
          typeof payload.tokenId === "string" && payload.tokenId.trim().length > 0
            ? payload.tokenId.trim()
            : typeof payload.tokenId === "number" && Number.isFinite(payload.tokenId)
              ? String(payload.tokenId)
              : null;
        for (const bid of Array.isArray(payload.bids) ? payload.bids.slice(0, depth) : []) {
          const price = toFiniteNumber((bid as { price?: string | number }).price);
          const size = toFiniteNumber((bid as { size?: string | number }).size);
          if (price === null || size === null) continue;
          levels.push({
            side: "bid",
            price,
            size,
            outcomeId: tokenId,
            outcomeTitle: null,
          });
        }
        for (const ask of Array.isArray(payload.asks) ? payload.asks.slice(0, depth) : []) {
          const price = toFiniteNumber((ask as { price?: string | number }).price);
          const size = toFiniteNumber((ask as { size?: string | number }).size);
          if (price === null || size === null) continue;
          levels.push({
            side: "ask",
            price,
            size,
            outcomeId: tokenId,
            outcomeTitle: null,
          });
        }
        const updatedAt = new Date().toISOString();
        const snapshotId = await readUpstashSnapshotCursor("global");
        const orderbook: MarketOrderbookOutput = {
          marketId: market.id,
          provider: "limitless",
          depth,
          snapshotId,
          source: "provider",
          updatedAt,
          levels,
        };
        void writeUpstashMarketOrderbooks([
          {
            marketId: market.id,
            provider: "limitless",
            depth,
            snapshotId,
            updatedAt,
            levels,
          },
        ]);
        return orderbook;
      } catch {
        // try the next candidate URL
      }
    }
  }

  return null;
};

export const resolveMarketCatalogRefId = async (
  supabaseService: SupabaseServiceClient,
  provider: VenueProvider,
  providerMarketId: string
): Promise<string | null> => {
  const { data, error } = await (supabaseService as any)
    .from("market_catalog")
    .select("id")
    .eq("provider", provider)
    .eq("provider_market_id", providerMarketId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const id = String((data as Record<string, unknown>).id ?? "").trim();
  return id || null;
};

const mapCanonicalRows = (
  marketRows: CanonicalCatalogRow[],
  outcomesByMarketId: Map<string, CanonicalOutcomeRow[]>,
  liveByMarketId: Map<string, CanonicalLiveRow>,
  compareGroupsById: Map<string, CompareGroupAggregate>,
  snapshotId: number | null
): MarketOutput[] => {
  return marketRows.map((row) => {
    const payload = asObject(row.provider_payload);
    const fallbackIso = row.source_updated_at || row.last_synced_at || new Date().toISOString();
    const createdAt = row.market_created_at || readIsoFromPayload(payload, ["created_at", "market_created_at"], fallbackIso);
    const closesAt = row.closes_at || readIsoFromPayload(payload, ["closes_at"], createdAt);
    const expiresAt = row.expires_at || readIsoFromPayload(payload, ["expires_at"], closesAt);
    const provider = row.provider;
    const capabilities = readCapabilitiesFromPayload(payload, provider);
    const marketRefId = row.id;
    const outputId = venueToCanonicalId(provider, row.provider_market_id);
    const outcomeRows = outcomesByMarketId.get(marketRefId) ?? [];
    const outcomes = outcomeRows.map((outcome, idx) => {
      const providerOutcomeIdRaw = outcome.provider_outcome_id;
      const outcomeKey = String(outcome.outcome_key ?? "").trim();
      const providerOutcomeId =
        typeof providerOutcomeIdRaw === "string" && providerOutcomeIdRaw.trim().length > 0
          ? providerOutcomeIdRaw.trim()
          : outcomeKey || `${row.provider_market_id}:${idx}`;
      const title =
        typeof outcome.title === "string" && outcome.title.trim().length > 0
          ? outcome.title.trim()
          : `Outcome ${idx + 1}`;
      const probability = clamp01(toFiniteNumber(outcome.probability) ?? 0);
      const price = clamp01(toFiniteNumber(outcome.price) ?? probability);
      const providerTokenId =
        typeof outcome.provider_token_id === "string" && outcome.provider_token_id.trim().length > 0
          ? outcome.provider_token_id.trim()
          : null;
      return {
        id: providerOutcomeId,
        marketId: outputId,
        providerOutcomeId,
        providerTokenId,
        tokenId: providerTokenId,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        title,
        iconUrl: null,
        chartColor: null,
        sortOrder: Number.isFinite(Number(outcome.sort_order)) ? Number(outcome.sort_order) : idx,
        isActive: outcome.is_active !== false,
        probability,
        price,
      };
    });

    const { yes, no } = pickBinaryOutcomes(outcomes);
    const live = liveByMarketId.get(marketRefId);
    const totalVolumeUsd =
      toFiniteNumber(row.total_volume_usd) ??
      extractTotalVolumeFromPayload(payload) ??
      0;
    const fallbackYesPrice = yes ? yes.price : 0.5;
    const priceYes = resolveReliableBinaryPrice({
      mid: toFiniteNumber(live?.mid),
      bestBid: toFiniteNumber(live?.best_bid),
      bestAsk: toFiniteNumber(live?.best_ask),
      lastTradePrice: toFiniteNumber(live?.last_trade_price),
      fallbackPrice: fallbackYesPrice,
    });
    const priceNo =
      row.market_type === "binary"
        ? Math.max(0, Math.min(1, 1 - priceYes))
        : typeof no?.price === "number"
          ? no.price
          : 0;

    const resolvedTitle = String(row.resolved_outcome_title ?? "").trim().toLowerCase();
    const resolvedOutcome = outcomes.find((outcome) => outcome.title.trim().toLowerCase() === resolvedTitle) ?? null;
    const outcome =
      resolvedTitle.includes("yes")
        ? ("YES" as const)
        : resolvedTitle.includes("no")
        ? ("NO" as const)
          : null;
    const compareGroupId = typeof row.compare_group_id === "string" && row.compare_group_id.trim().length > 0
      ? row.compare_group_id.trim()
      : null;
    const compareGroup = compareGroupId ? compareGroupsById.get(compareGroupId) ?? null : null;

    return {
      id: outputId,
      provider,
      providerMarketId: row.provider_market_id,
      canonicalMarketId: outputId,
      marketRefId,
      snapshotId,
      liveSeq: toFiniteNumber(live?.source_seq),
      compareGroupId,
      compareGroup,
      isFastMarket: true,
      catalogBucket: "main",
      titleRu: row.title,
      titleEn: row.title,
      description: row.description,
      source: row.source_url,
      imageUrl: row.image_url ?? "",
      state: row.state,
      createdAt,
      closesAt,
      expiresAt,
      marketType: row.market_type,
      resolvedOutcomeId: resolvedOutcome?.id ?? null,
      outcomes,
      outcome,
      createdBy: null,
      categoryId: row.category,
      categoryLabelRu: row.category,
      categoryLabelEn: row.category,
      settlementAsset: "USD",
      feeBps: null,
      liquidityB: null,
      priceYes,
      priceNo,
      volume: totalVolumeUsd,
      totalVolumeUsd,
      chance: roundPercentValue(row.market_type === "binary" ? priceYes : yes?.probability ?? priceYes),
      creatorName: null,
      creatorAvatarUrl: null,
      bestBid: toFiniteNumber(live?.best_bid),
      bestAsk: toFiniteNumber(live?.best_ask),
      mid: toFiniteNumber(live?.mid),
      lastTradePrice: toFiniteNumber(live?.last_trade_price),
      lastTradeSize: toFiniteNumber(live?.last_trade_size),
      rolling24hVolume: toFiniteNumber(live?.rolling_24h_volume),
      openInterest: toFiniteNumber(live?.open_interest),
      liveUpdatedAt: typeof live?.source_ts === "string" ? live.source_ts : null,
      capabilities,
      freshness: buildMarketFreshness(provider, typeof live?.source_ts === "string" ? live.source_ts : fallbackIso),
      orderbookFreshness: null,
      tradeMeta:
        provider === "limitless"
          ? {
              limitless: buildLimitlessTradeMetaFromPayload(
                payload,
                outcomes.map((marketOutcome) => ({ tokenId: marketOutcome.tokenId ?? null }))
              ),
            }
          : null,
    } satisfies MarketOutput;
  });
};

const fetchCanonicalMarketRows = async (
  supabaseService: SupabaseServiceClient,
  params: {
    providers: VenueProvider[];
    onlyOpen: boolean;
    candidateLimit: number;
    sortBy: "newest" | "volume";
    catalogBucket: "all" | "main" | "fast";
    snapshotId: number | null;
    providerMarketId?: string;
  }
): Promise<MarketOutput[]> => {
  const errorContextBase = {
    providers: params.providers,
    onlyOpen: params.onlyOpen,
    sortBy: params.sortBy,
    catalogBucket: params.catalogBucket,
    providerMarketId: params.providerMarketId,
  } satisfies Omit<CatalogReadErrorContext, "stage">;
  let query = (supabaseService as any)
    .from("market_catalog")
    .select(
      "id, provider, provider_market_id, provider_condition_id, slug, title, description, state, category, source_url, image_url, market_created_at, closes_at, expires_at, market_type, resolved_outcome_title, total_volume_usd, is_fast_market, catalog_bucket, compare_group_id, provider_payload, source_updated_at, last_synced_at"
    )
    .in("provider", params.providers)
    .limit(params.candidateLimit);

  if (params.onlyOpen) {
    query = query.eq("state", "open");
  }
  if (params.providerMarketId) {
    query = query.eq("provider_market_id", params.providerMarketId);
  }

  query =
    params.sortBy === "volume"
      ? query.order("total_volume_usd", { ascending: false }).order("market_created_at", { ascending: false })
      : query.order("market_created_at", { ascending: false }).order("total_volume_usd", { ascending: false });

  const { data: marketRows, error: marketError } = await query;
  if (marketError) {
    throw new CatalogReadError(
      { ...errorContextBase, stage: "market_catalog" },
      String(marketError.message ?? "CATALOG_READ_FAILED"),
      marketError
    );
  }
  if (!Array.isArray(marketRows) || marketRows.length === 0) return [];

  const marketIds = marketRows
    .map((row) => String((row as Record<string, unknown>).id ?? "").trim())
    .filter(Boolean);

  const [outcomesRes, liveRes] = await Promise.all([
    (supabaseService as any)
      .from("market_outcomes")
      .select("market_id, provider_outcome_id, provider_token_id, outcome_key, title, sort_order, probability, price, is_active")
      .in("market_id", marketIds),
    (supabaseService as any)
      .from("market_live")
      .select("market_id, best_bid, best_ask, mid, last_trade_price, last_trade_size, rolling_24h_volume, open_interest, source_seq, source_ts")
      .in("market_id", marketIds),
  ]);
  if (outcomesRes.error) {
    throw new CatalogReadError(
      { ...errorContextBase, stage: "market_outcomes" },
      String(outcomesRes.error.message ?? "CATALOG_READ_FAILED"),
      outcomesRes.error
    );
  }
  if (liveRes.error) {
    throw new CatalogReadError(
      { ...errorContextBase, stage: "market_live" },
      String(liveRes.error.message ?? "CATALOG_READ_FAILED"),
      liveRes.error
    );
  }

  const outcomesByMarketId = new Map<string, CanonicalOutcomeRow[]>();
  for (const row of (outcomesRes.data ?? []) as CanonicalOutcomeRow[]) {
    const marketId = String(row.market_id ?? "").trim();
    if (!marketId) continue;
    const rows = outcomesByMarketId.get(marketId) ?? [];
    rows.push(row);
    outcomesByMarketId.set(marketId, rows);
  }
  for (const rows of outcomesByMarketId.values()) {
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  }

  const liveByMarketId = new Map<string, CanonicalLiveRow>();
  for (const row of (liveRes.data ?? []) as CanonicalLiveRow[]) {
    const marketId = String(row.market_id ?? "").trim();
    if (!marketId) continue;
    liveByMarketId.set(marketId, row);
  }

  const compareGroupsById = await fetchCompareGroupAggregates(
    supabaseService,
    marketRows
      .map((row) => String((row as Record<string, unknown>).compare_group_id ?? "").trim())
      .filter(Boolean),
    errorContextBase
  );

  return mapCanonicalRows(
    marketRows as CanonicalCatalogRow[],
    outcomesByMarketId,
    liveByMarketId,
    compareGroupsById,
    params.snapshotId
  );
};

export const listCanonicalProviderMarkets = async (
  supabaseService: SupabaseServiceClient,
  params: {
    provider: VenueProvider;
    onlyOpen: boolean;
    limit: number;
    providerMarketId?: string;
  }
): Promise<MarketOutput[]> =>
  fetchCanonicalMarketRows(supabaseService, {
    providers: [params.provider],
    onlyOpen: params.onlyOpen,
    candidateLimit: Math.max(1, params.limit),
    sortBy: "newest",
    catalogBucket: "all",
    snapshotId: await readUpstashSnapshotCursor("global"),
    providerMarketId: params.providerMarketId,
  });

const candleTs = (row: PriceCandleOutput): number => Date.parse(String(row.bucket));

const aggregateCandles = (
  rows: PriceCandleOutput[],
  resolutionMs: number
): PriceCandleOutput[] => {
  if (rows.length === 0) return [];
  const safeResolution = Math.max(60_000, resolutionMs);
  const byBucket = new Map<string, PriceCandleOutput>();

  const sorted = [...rows]
    .filter((row) => Number.isFinite(candleTs(row)))
    .sort((a, b) => candleTs(a) - candleTs(b));

  for (const row of sorted) {
    const ts = candleTs(row);
    if (!Number.isFinite(ts)) continue;
    const bucketStart = Math.floor(ts / safeResolution) * safeResolution;
    const outcomeKey = row.outcomeId ?? "__market__";
    const key = `${outcomeKey}:${bucketStart}`;
    const existing = byBucket.get(key);
    if (!existing) {
      byBucket.set(key, {
        ...row,
        bucket: new Date(bucketStart).toISOString(),
        volume: Number.isFinite(row.volume) ? row.volume : 0,
        tradesCount: Number.isFinite(row.tradesCount) ? row.tradesCount : 0,
      });
      continue;
    }

    byBucket.set(key, {
      ...existing,
      high: Math.max(existing.high, row.high),
      low: Math.min(existing.low, row.low),
      close: row.close,
      volume: (Number.isFinite(existing.volume) ? existing.volume : 0) + (Number.isFinite(row.volume) ? row.volume : 0),
      tradesCount:
        (Number.isFinite(existing.tradesCount) ? existing.tradesCount : 0) +
        (Number.isFinite(row.tradesCount) ? row.tradesCount : 0),
    });
  }

  return Array.from(byBucket.values()).sort((a, b) => candleTs(a) - candleTs(b));
};

const evenlySampleCandles = (rows: PriceCandleOutput[], limit: number): PriceCandleOutput[] => {
  if (rows.length <= limit) return rows;
  const byOutcome = new Map<string, PriceCandleOutput[]>();
  for (const row of rows) {
    const key = row.outcomeId ?? "__market__";
    const bucket = byOutcome.get(key) ?? [];
    bucket.push(row);
    byOutcome.set(key, bucket);
  }

  const sampled: PriceCandleOutput[] = [];
  for (const bucket of byOutcome.values()) {
    if (bucket.length <= limit) {
      sampled.push(...bucket);
      continue;
    }
    const lastIndex = bucket.length - 1;
    for (let i = 0; i < limit; i += 1) {
      const idx = Math.min(lastIndex, Math.round((i / Math.max(1, limit - 1)) * lastIndex));
      sampled.push(bucket[idx]!);
    }
  }
  return sampled.sort((a, b) => candleTs(a) - candleTs(b));
};

const normalizeCandlesForChart = (
  rows: PriceCandleOutput[],
  params: { limit: number; interval: CandleInterval; range?: MarketChartRange | null }
): PriceCandleOutput[] => {
  if (rows.length === 0) return [];
  const sorted = [...rows]
    .filter(
      (row) =>
        Number.isFinite(candleTs(row)) &&
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    )
    .sort((a, b) => candleTs(a) - candleTs(b));
  if (sorted.length === 0) return [];
  const aggregated = aggregateCandles(sorted, CANDLE_RESOLUTION_MS[params.interval]);
  if (params.range === "Y") {
    return evenlySampleCandles(aggregated, params.limit);
  }
  return aggregated.slice(Math.max(0, aggregated.length - params.limit));
};

const listCanonicalCandles = async (
  supabaseService: SupabaseServiceClient,
  marketRefId: string,
  limit: number,
  outcomeKey: string | null = "__market__"
): Promise<PriceCandleOutput[]> => {
  let query = (supabaseService as any)
    .from("market_candles_1m")
    .select("bucket_start, outcome_key, open, high, low, close, volume, trades_count")
    .eq("market_id", marketRefId)
    .order("bucket_start", { ascending: false })
    .limit(limit);

  if (typeof outcomeKey === "string" && outcomeKey.trim().length > 0) {
    query = query.eq("outcome_key", outcomeKey.trim());
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data) || data.length === 0) return [];

  return [...(data as CanonicalCandleRow[])]
    .reverse()
    .map((row) => {
      const candleOutcomeKey = String(row.outcome_key ?? "").trim();
      const outcomeId = candleOutcomeKey.length > 0 && candleOutcomeKey !== "__market__" ? candleOutcomeKey : null;
      return {
        bucket: new Date(String(row.bucket_start ?? new Date().toISOString())).toISOString(),
        outcomeId,
        outcomeTitle: null,
        outcomeColor: null,
        open: Number(row.open ?? 0),
        high: Number(row.high ?? 0),
        low: Number(row.low ?? 0),
        close: Number(row.close ?? 0),
        volume: Number(row.volume ?? 0),
        tradesCount: Number(row.trades_count ?? 0),
      } satisfies PriceCandleOutput;
    });
};

export const getPublicEnabledProviders = (): Array<"polymarket" | "limitless"> =>
  normalizePublicEnabledProviders(listEnabledVenueProviders());

export const listCanonicalMarkets = async (
  params: {
    supabaseService?: SupabaseServiceClient;
    onlyOpen?: boolean;
    page?: number;
    pageSize?: number;
    sortBy?: "newest" | "volume";
    catalogBucket?: "all" | "main" | "fast";
    providers?: Array<VenueProvider>;
    providerFilter?: "all" | VenueProvider;
  } = {}
): Promise<MarketPageOutput> => {
  const supabaseService = params.supabaseService ?? getSupabaseServiceClient();
  const onlyOpen = params.onlyOpen ?? false;
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.max(1, Math.min(101, Number(params.pageSize ?? 100)));
  const sortBy: "newest" | "volume" = params.sortBy ?? "newest";
  const catalogBucket: "main" = "main";
  const offset = (page - 1) * pageSize;
  const candidateLimit = Math.max(pageSize * 2, offset + pageSize * 2);
  const selectedProviders = parseProviderSelection({
    providers: params.providers,
    providerFilter: params.providerFilter,
  });
  const snapshotId = await readUpstashSnapshotCursor("global");
  const pageScope = buildCatalogPageScope({
    providers: selectedProviders,
    page,
    sortBy,
    onlyOpen,
    catalogBucket,
  });
  const latestListCacheKey = buildLatestMarketListCacheKey({
    onlyOpen,
    page,
    pageSize,
    sortBy,
    catalogBucket,
    providers: selectedProviders,
  });
  const listCacheKey = buildMarketListCacheKey({
    onlyOpen,
    page,
    pageSize,
    sortBy,
    snapshotId,
    catalogBucket,
    providers: selectedProviders,
  });
  const latestCached = await readUpstashCache(latestListCacheKey, marketPageOutput);
  if (
    latestCached &&
    (snapshotId === null || latestCached.snapshotId === snapshotId)
  ) {
    return {
      ...latestCached,
      pageScope: latestCached.pageScope || pageScope,
      source: "redis",
      stale: false,
    };
  }
  const cached = await readUpstashCache(listCacheKey, marketPageOutput);
  if (cached) {
    return {
      ...cached,
      pageScope: cached.pageScope || pageScope,
      source: "redis",
      stale: false,
    };
  }

  let rows: MarketOutput[];
  try {
    rows = await fetchCanonicalMarketRows(supabaseService, {
      providers: selectedProviders,
      onlyOpen,
      candidateLimit,
      sortBy,
      catalogBucket: "all",
      snapshotId,
    });
  } catch (error) {
    if (latestCached) {
      return {
        ...latestCached,
        pageScope: latestCached.pageScope || pageScope,
        source: "redis",
        stale: true,
      };
    }
    throw error;
  }
  const sorted = sortMarketRows(rows, sortBy);
  const out: MarketPageOutput = {
    items: sorted.slice(offset, offset + pageSize),
    snapshotId,
    pageScope,
    hasMore: sorted.length > offset + pageSize,
    source: "supabase",
    stale: false,
  };
  void writeUpstashCache(listCacheKey, out, upstashMarketListTtlSec);
  void writeUpstashCache(latestListCacheKey, out, upstashMarketListTtlSec);
  void writeUpstashSnapshotShards(pageScope, out.items, snapshotId);
  return out;
};

export const getCanonicalMarket = async (params: {
  supabaseService?: SupabaseServiceClient;
  marketId: string;
  provider?: VenueProvider | null;
}): Promise<MarketOutput | null> => {
  const supabaseService = params.supabaseService ?? getSupabaseServiceClient();
  const ref = parseVenueMarketRef(params.marketId, params.provider ?? null);
  const snapshotId = await readUpstashSnapshotCursor("global");
  const detailCacheKey = buildMarketDetailCacheKey({
    provider: ref.provider,
    providerMarketId: ref.providerMarketId,
  });
  const cached = await readUpstashCache(detailCacheKey, marketOutput);
  if (cached && (snapshotId === null || cached.snapshotId === snapshotId)) return cached;

  let rows: MarketOutput[];
  try {
    rows = await fetchCanonicalMarketRows(supabaseService, {
      providers: [ref.provider],
      onlyOpen: false,
      candidateLimit: 1,
      sortBy: "newest",
      catalogBucket: "all",
      snapshotId,
      providerMarketId: ref.providerMarketId,
    });
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
  const row = rows[0]
    ? {
        ...rows[0],
        snapshotId,
        orderbookFreshness: await buildOrderbookFreshness(rows[0].id),
      }
    : null;
  if (row) {
    void writeUpstashCache(detailCacheKey, row, upstashMarketDetailTtlSec);
    return row;
  }

  if (ENABLE_MARKET_HOT_READ_FALLBACK) {
    return null;
  }
  return null;
};

export const getCanonicalOrderbook = async (params: {
  supabaseService?: SupabaseServiceClient;
  marketId: string;
  provider?: VenueProvider | null;
  depth?: number;
}): Promise<MarketOrderbookOutput> => {
  const ref = parseVenueMarketRef(params.marketId, params.provider ?? null);
  const marketId = venueToCanonicalId(ref.provider, ref.providerMarketId);
  const depth = Math.max(1, Math.min(Number(params.depth ?? 12), 40));
  const cached = await readUpstashMarketOrderbook(marketId, depth);
  if (cached) {
    return {
      marketId,
      provider: ref.provider,
      depth,
      snapshotId: cached.snapshotId ?? null,
      source: "upstash",
      updatedAt: cached.updatedAt ?? null,
      levels: cached.levels.slice(0, depth * 2),
    };
  }

  if (ref.provider === "polymarket") {
    const market = await getCanonicalMarket({
      supabaseService: params.supabaseService,
      marketId: params.marketId,
      provider: params.provider ?? null,
    });
    if (market) {
      const fallback = await fetchPolymarketOrderbookFromProvider(market, depth).catch(() => null);
      if (fallback) return fallback;
    }
  } else if (ref.provider === "limitless") {
    const market = await getCanonicalMarket({
      supabaseService: params.supabaseService,
      marketId: params.marketId,
      provider: params.provider ?? null,
    });
    if (market) {
      const fallback = await fetchLimitlessOrderbookFromProvider(market, depth).catch(() => null);
      if (fallback) return fallback;
    }
  }

  return {
    marketId,
    provider: ref.provider,
    depth,
    snapshotId: await readUpstashSnapshotCursor("global"),
    source: "none",
    updatedAt: null,
    levels: [],
  };
};

export const getCanonicalPriceCandles = async (params: {
  supabaseService?: SupabaseServiceClient;
  marketId: string;
  provider?: VenueProvider | null;
  interval?: CandleInterval;
  limit?: number;
  range?: MarketChartRange | null;
}): Promise<PriceCandleOutput[]> => {
  const supabaseService = params.supabaseService ?? getSupabaseServiceClient();
  const ref = parseVenueMarketRef(params.marketId, params.provider ?? null);
  const interval = params.interval ?? "1h";
  const limit = Math.max(1, Math.min(params.limit ?? 200, 20_000));
  const range = params.range ?? null;
  const market = await getCanonicalMarket({
    supabaseService,
    marketId: params.marketId,
    provider: params.provider ?? null,
  });
  if (!market?.marketRefId) return [];
  const candlesCacheKey = buildMarketCandlesCacheKey({
    provider: ref.provider,
    providerMarketId: ref.providerMarketId,
    interval,
    limit,
    range,
  });
  const cachedCandles = await readUpstashCache(candlesCacheKey, priceCandleOutputArray);
  if (cachedCandles) return cachedCandles;

  const rawLimit = range === "Y"
    ? 20_000
    : Math.min(
        20_000,
        Math.max(
          interval === "1h" ? limit * 90 : limit * 4,
          interval === "1h" ? 8_000 : 4_000
        )
      );

  let rows: PriceCandleOutput[] = [];
  if (market.marketType === "multi_choice" && Array.isArray(market.outcomes) && market.outcomes.length > 2) {
    rows = await listCanonicalCandles(supabaseService, market.marketRefId, rawLimit, null);
    if (!rows.some((row) => Boolean(row.outcomeId))) {
      rows = await listCanonicalCandles(supabaseService, market.marketRefId, rawLimit, "__market__");
    }
  } else {
    rows = await listCanonicalCandles(supabaseService, market.marketRefId, rawLimit, "__market__");
  }

  if (rows.length > 0) {
    const normalized = normalizeCandlesForChart(rows, { limit, interval, range });
    void writeUpstashCache(candlesCacheKey, normalized, upstashMarketCandlesTtlSec);
    return normalized;
  }

  if (ENABLE_MARKET_HOT_READ_FALLBACK && ref.provider) {
    return [];
  }
  return [];
};

export const __readServiceTestUtils = {
  mapCanonicalRows,
  evenlySampleCandles,
  normalizeCandlesForChart,
  normalizePublicEnabledProviders,
};
