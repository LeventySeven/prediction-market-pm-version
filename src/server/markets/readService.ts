import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { getSupabaseServiceClient } from "../supabase/client";
import type { Database } from "../../types/database";
import {
  marketOutput,
  marketOutputArray,
  priceCandleOutputArray,
  type CandleInterval,
} from "../../lib/validations/market";
import {
  buildMarketCandlesCacheKey,
  buildMarketDetailCacheKey,
  buildMarketListCacheKey,
  readUpstashCache,
  upstashMarketCandlesTtlSec,
  upstashMarketDetailTtlSec,
  upstashMarketListTtlSec,
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

const ENABLE_MARKET_HOT_READ_FALLBACK =
  (process.env.ENABLE_MARKET_HOT_READ_FALLBACK || "").trim().toLowerCase() === "true";

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

const resolveMarketCatalogRefId = async (
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
  liveByMarketId: Map<string, CanonicalLiveRow>
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

    return {
      id: outputId,
      provider,
      providerMarketId: row.provider_market_id,
      canonicalMarketId: outputId,
      marketRefId,
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
    providerMarketId?: string;
  }
): Promise<MarketOutput[]> => {
  let query = (supabaseService as any)
    .from("market_catalog")
    .select(
      "id, provider, provider_market_id, provider_condition_id, slug, title, description, state, category, source_url, image_url, market_created_at, closes_at, expires_at, market_type, resolved_outcome_title, total_volume_usd, provider_payload, source_updated_at, last_synced_at"
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
  if (marketError || !Array.isArray(marketRows) || marketRows.length === 0) return [];

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
      .select("market_id, best_bid, best_ask, mid, last_trade_price, last_trade_size, rolling_24h_volume, open_interest, source_ts")
      .in("market_id", marketIds),
  ]);

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

  return mapCanonicalRows(marketRows as CanonicalCatalogRow[], outcomesByMarketId, liveByMarketId);
};

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
    providers?: Array<VenueProvider>;
    providerFilter?: "all" | VenueProvider;
  } = {}
): Promise<MarketOutput[]> => {
  const supabaseService = params.supabaseService ?? getSupabaseServiceClient();
  const onlyOpen = params.onlyOpen ?? false;
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.max(1, Math.min(101, Number(params.pageSize ?? 100)));
  const sortBy: "newest" | "volume" = params.sortBy ?? "newest";
  const offset = (page - 1) * pageSize;
  const candidateLimit = Math.max(pageSize * 2, offset + pageSize * 2);
  const selectedProviders = parseProviderSelection({
    providers: params.providers,
    providerFilter: params.providerFilter,
  });
  const listCacheKey = buildMarketListCacheKey({
    onlyOpen,
    page,
    pageSize,
    sortBy,
    providers: selectedProviders,
  });
  const cached = await readUpstashCache(listCacheKey, marketOutputArray);
  if (cached) return cached;

  const rows = await fetchCanonicalMarketRows(supabaseService, {
    providers: selectedProviders,
    onlyOpen,
    candidateLimit,
    sortBy,
  });
  const out = sortMarketRows(rows, sortBy).slice(offset, offset + pageSize);
  void writeUpstashCache(listCacheKey, out, upstashMarketListTtlSec);
  return out;
};

export const getCanonicalMarket = async (params: {
  supabaseService?: SupabaseServiceClient;
  marketId: string;
  provider?: VenueProvider | null;
}): Promise<MarketOutput | null> => {
  const supabaseService = params.supabaseService ?? getSupabaseServiceClient();
  const ref = parseVenueMarketRef(params.marketId, params.provider ?? null);
  const detailCacheKey = buildMarketDetailCacheKey({
    provider: ref.provider,
    providerMarketId: ref.providerMarketId,
  });
  const cached = await readUpstashCache(detailCacheKey, marketOutput);
  if (cached) return cached;

  const rows = await fetchCanonicalMarketRows(supabaseService, {
    providers: [ref.provider],
    onlyOpen: false,
    candidateLimit: 1,
    sortBy: "newest",
    providerMarketId: ref.providerMarketId,
  });
  const row = rows[0] ?? null;
  if (row) {
    void writeUpstashCache(detailCacheKey, row, upstashMarketDetailTtlSec);
    return row;
  }

  if (ENABLE_MARKET_HOT_READ_FALLBACK) {
    return null;
  }
  return null;
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
