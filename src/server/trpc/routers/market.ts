import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { publicProcedure, router } from "../trpc";
import { generateMarketContext } from "../../ai/marketContextAgent";
import {
  type PolymarketMarket,
  getPolymarketMarketById,
  getPolymarketPriceHistory,
  getPolymarketPublicTrades,
  listPolymarketMarkets,
} from "../../polymarket/client";
import {
  getMirroredPolymarketMarketById,
  listMirroredPolymarketMarkets,
  searchMirroredPolymarketMarkets,
  upsertMirroredPolymarketMarkets,
} from "../../polymarket/mirror";
import type { Database } from "../../../types/database";
import {
  getVenueAdapter,
  listEnabledProviders,
} from "../../venues/registry";
import {
  parseVenueMarketRef,
  type VenueApiCreds,
  type VenueMarket,
  type VenueProvider,
  venueToCanonicalId,
} from "../../venues/types";
import { upsertVenueMarketsToCatalog } from "../../venues/catalogStore";
import { getTrustedClientIpFromRequest } from "../../http/ip";
import { consumeDurableRateLimit } from "../../security/rateLimit";

const ENABLE_CATALOG_SYNC_ON_READ =
  (process.env.ENABLE_CATALOG_SYNC_ON_READ || "").trim().toLowerCase() === "true";

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketOutcomeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  providerOutcomeId: z.string().nullable().optional(),
  providerTokenId: z.string().nullable().optional(),
  tokenId: z.string().nullable().optional(),
  slug: z.string(),
  title: z.string(),
  iconUrl: z.string().nullable(),
  chartColor: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  probability: z.number(),
  price: z.number(),
});

const marketOutput = z.object({
  id: z.string(),
  provider: z.enum(["polymarket", "limitless"]).optional(),
  providerMarketId: z.string().optional(),
  canonicalMarketId: z.string().optional(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  state: z.enum(["open", "closed", "resolved", "cancelled"]),
  createdAt: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  marketType: z.enum(["binary", "multi_choice"]).optional(),
  resolvedOutcomeId: z.string().nullable().optional(),
  outcomes: z.array(marketOutcomeOutput).optional(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  createdBy: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  categoryLabelRu: z.string().nullable().optional(),
  categoryLabelEn: z.string().nullable().optional(),
  settlementAsset: z.string().nullable().optional(),
  feeBps: z.number().nullable().optional(),
  liquidityB: z.number().nullable().optional(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
  chance: z.number().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
  bestBid: z.number().nullable().optional(),
  bestAsk: z.number().nullable().optional(),
  mid: z.number().nullable().optional(),
  lastTradePrice: z.number().nullable().optional(),
  lastTradeSize: z.number().nullable().optional(),
  rolling24hVolume: z.number().nullable().optional(),
  openInterest: z.number().nullable().optional(),
  liveUpdatedAt: z.string().nullable().optional(),
  capabilities: z
    .object({
      supportsTrading: z.boolean(),
      supportsCandles: z.boolean(),
      supportsPublicTrades: z.boolean(),
      chainId: z.number().nullable(),
    })
    .optional(),
});

const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

const priceCandleOutput = z.object({
  bucket: z.string(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  outcomeColor: z.string().nullable().optional(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  tradesCount: z.number(),
});

const publicTradeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
});

const marketCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  userId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string(),
  authorUsername: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likesCount: z.number(),
  likedByMe: z.boolean(),
});

const myCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  likesCount: z.number(),
});

const marketContextOutput = z.object({
  marketId: z.string(),
  context: z.string(),
  sources: z.array(z.string()),
  updatedAt: z.string(),
  generated: z.boolean(),
});

const tradeAccessOutput = z.object({
  status: z.enum(["ALLOWED", "BLOCKED_REGION", "UNKNOWN_TEMP_ERROR"]),
  allowed: z.boolean(),
  reasonCode: z.string().nullable(),
  message: z.string().nullable(),
  checkedAt: z.string(),
});

const apiVersionV1 = z.literal("v1");

const marketListV1Output = z.object({
  apiVersion: apiVersionV1,
  items: z.array(
    z.object({
      market: marketOutput,
      score: z.number(),
    })
  ),
});

const similarMarketsV1Output = z.object({
  apiVersion: apiVersionV1,
  items: z.array(
    z.object({
      market: marketOutput,
      score: z.number(),
    })
  ),
});

const jsonValueSchema: z.ZodType<Database["public"]["Tables"]["user_events"]["Row"]["metadata"]> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const relaySignedOrderInput = z.object({
  provider: z.enum(["polymarket", "limitless"]).default("polymarket"),
  marketId: z.string().min(1).optional(),
  signedOrder: z.record(z.string(), jsonValueSchema),
  orderType: z.enum(["FOK", "GTC"]),
  idempotencyKey: z.string().min(8).max(128),
  clientOrderId: z.string().min(1).max(128).optional(),
  apiCreds: z.object({
    key: z.string().min(1).max(512),
    secret: z.string().min(1).max(1024),
    passphrase: z.string().min(1).max(1024),
  }),
});

const relaySignedOrderOutput = z.object({
  success: z.boolean(),
  status: z.number(),
  payload: jsonValueSchema.optional(),
  error: z.string().optional(),
});

const CATEGORY_ROWS_CACHE_TTL_MS = Math.max(10_000, Number(process.env.MARKET_CATEGORIES_CACHE_TTL_MS ?? 60_000));
let cachedCategoryRows: { expiresAt: number; rows: Array<z.infer<typeof marketCategoryOutput>> } | null = null;

const normalizeCategoryLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCategoryId = (value: unknown): string | null => {
  const label = normalizeCategoryLabel(value);
  if (!label) return null;

  const ascii = label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = label.toLowerCase().replace(/\s+/g, "_");
  const normalized = (ascii || fallback || "").trim().slice(0, 96);
  if (!normalized) return null;
  return normalized === "all" ? "all_markets" : normalized;
};

const categoryMetaFromRaw = (
  value: unknown
): { id: string; labelRu: string; labelEn: string } | null => {
  const label = normalizeCategoryLabel(value);
  const id = normalizeCategoryId(value);
  if (!label || !id) return null;
  return {
    id,
    labelRu: label,
    labelEn: label,
  };
};

const addCategoryValue = (
  categories: Map<string, string>,
  value: unknown
) => {
  const category = categoryMetaFromRaw(value);
  if (!category) return;
  if (!categories.has(category.id)) {
    categories.set(category.id, category.labelEn);
  }
};

const sortCategoryRows = (categories: Map<string, string>): Array<z.infer<typeof marketCategoryOutput>> =>
  Array.from(categories.entries())
    .sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }))
    .map(([id, label]) => ({
      id,
      labelRu: label,
      labelEn: label,
    }));

const mapPolymarketMarket = (market: Awaited<ReturnType<typeof getPolymarketMarketById>> extends infer T ? Exclude<T, null> : never) => {
  const outcomes = market.outcomes.map((o) => ({
    id: o.id,
    marketId: market.id,
    providerOutcomeId: o.id,
    providerTokenId: o.tokenId ?? null,
    tokenId: o.tokenId ?? null,
    slug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    title: o.title,
    iconUrl: null,
    chartColor: null,
    sortOrder: o.sortOrder,
    isActive: true,
    probability: o.probability,
    price: o.price,
  }));
  const yes = outcomes[0];
  const no = outcomes[1];
  const category = categoryMetaFromRaw(market.category);

  let resolved: "YES" | "NO" | null = null;
  let resolvedOutcomeId: string | null = null;
  if (market.state === "resolved" && market.resolvedOutcomeTitle) {
    const normalized = market.resolvedOutcomeTitle.toLowerCase();
    if (normalized.includes("yes")) resolved = "YES";
    if (normalized.includes("no")) resolved = "NO";
    const matched = outcomes.find((o) => o.title.toLowerCase() === normalized);
    resolvedOutcomeId = matched?.id ?? null;
  }

  return {
    id: market.id,
    provider: "polymarket" as const,
    providerMarketId: market.id,
    canonicalMarketId: venueToCanonicalId("polymarket", market.id),
    titleRu: market.title,
    titleEn: market.title,
    description: market.description,
    source: market.sourceUrl,
    imageUrl: market.imageUrl ?? "",
    state: market.state,
    createdAt: market.createdAt,
    closesAt: market.closesAt,
    expiresAt: market.expiresAt,
    marketType: outcomes.length > 2 ? ("multi_choice" as const) : ("binary" as const),
    resolvedOutcomeId,
    outcomes,
    outcome: resolved,
    createdBy: null,
    categoryId: category?.id ?? null,
    categoryLabelRu: category?.labelRu ?? null,
    categoryLabelEn: category?.labelEn ?? null,
    settlementAsset: "USD",
    feeBps: null,
    liquidityB: null,
    priceYes: yes ? yes.price : 0.5,
    priceNo: no ? no.price : 0.5,
    volume: market.volume,
    chance: yes ? yes.probability * 100 : 50,
    creatorName: null,
    creatorAvatarUrl: null,
    bestBid: null,
    bestAsk: null,
    mid: null,
    lastTradePrice: null,
    lastTradeSize: null,
    rolling24hVolume: null,
    openInterest: null,
    liveUpdatedAt: null,
    capabilities: {
      supportsTrading: true,
      supportsCandles: true,
      supportsPublicTrades: true,
      chainId: Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137),
    },
  };
};

const mapVenueMarketToMarketOutput = (market: VenueMarket) => {
  if (market.provider === "polymarket") {
    const pseudoPolymarket = {
      id: market.providerMarketId,
      conditionId: market.providerConditionId ?? market.providerMarketId,
      slug: market.slug,
      title: market.title,
      description: market.description,
      imageUrl: market.imageUrl,
      sourceUrl: market.sourceUrl,
      state: market.state,
      closesAt: market.closesAt,
      expiresAt: market.expiresAt,
      createdAt: market.createdAt,
      category: market.category,
      volume: market.volume,
      resolvedOutcomeTitle: market.resolvedOutcomeTitle,
      outcomes: market.outcomes.map((outcome) => ({
        id: outcome.id,
        tokenId: outcome.providerTokenId,
        title: outcome.title,
        probability: outcome.probability,
        price: outcome.price,
        sortOrder: outcome.sortOrder,
      })),
    };
    return mapPolymarketMarket(pseudoPolymarket as any);
  }

  const outputId = venueToCanonicalId(market.provider, market.providerMarketId);
  const sortedOutcomes = [...market.outcomes].sort((a, b) => a.sortOrder - b.sortOrder);
  const yes = sortedOutcomes[0];
  const no = sortedOutcomes[1];
  const category = categoryMetaFromRaw(market.category);
  const resolved = market.state === "resolved" ? market.resolvedOutcomeTitle : null;
  const resolvedMatch = resolved
    ? sortedOutcomes.find((outcome) => outcome.title.toLowerCase() === resolved.toLowerCase()) ?? null
    : null;

  return {
    id: outputId,
    provider: market.provider,
    providerMarketId: market.providerMarketId,
    canonicalMarketId: venueToCanonicalId(market.provider, market.providerMarketId),
    titleRu: market.title,
    titleEn: market.title,
    description: market.description,
    source: market.sourceUrl,
    imageUrl: market.imageUrl ?? "",
    state: market.state,
    createdAt: market.createdAt,
    closesAt: market.closesAt,
    expiresAt: market.expiresAt,
    marketType: sortedOutcomes.length > 2 ? ("multi_choice" as const) : ("binary" as const),
    resolvedOutcomeId: resolvedMatch?.id ?? null,
    outcomes: sortedOutcomes.map((outcome) => ({
      id: outcome.id,
      marketId: outputId,
      providerOutcomeId: outcome.providerOutcomeId ?? outcome.id,
      providerTokenId: outcome.providerTokenId,
      tokenId: outcome.providerTokenId,
      slug: outcome.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      title: outcome.title,
      iconUrl: null,
      chartColor: null,
      sortOrder: outcome.sortOrder,
      isActive: outcome.isActive,
      probability: outcome.probability,
      price: outcome.price,
    })),
    outcome: null,
    createdBy: null,
    categoryId: category?.id ?? null,
    categoryLabelRu: category?.labelRu ?? null,
    categoryLabelEn: category?.labelEn ?? null,
    settlementAsset: "USD",
    feeBps: null,
    liquidityB: null,
    priceYes: yes ? yes.price : 0.5,
    priceNo: no ? no.price : 0.5,
    volume: market.volume,
    chance: yes ? yes.probability * 100 : 50,
    creatorName: null,
    creatorAvatarUrl: null,
    bestBid: null,
    bestAsk: null,
    mid: null,
    lastTradePrice: null,
    lastTradeSize: null,
    rolling24hVolume: null,
    openInterest: null,
    liveUpdatedAt: null,
    capabilities: market.capabilities,
  };
};

const MARKET_MIRROR_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.POLYMARKET_MARKET_STALE_AFTER_MS ?? 60_000)
);
const MARKET_MIRROR_FRESHNESS_CACHE_MS = 15_000;
let mirrorFreshnessSnapshot: { checkedAt: number; isFresh: boolean } | null = null;

const isMirrorFresh = async (supabaseService: SupabaseServiceClient): Promise<boolean> => {
  const now = Date.now();
  if (
    mirrorFreshnessSnapshot &&
    now - mirrorFreshnessSnapshot.checkedAt < MARKET_MIRROR_FRESHNESS_CACHE_MS
  ) {
    return mirrorFreshnessSnapshot.isFresh;
  }

  try {
    const { data, error } = await supabaseService
      .from("polymarket_market_cache")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.last_synced_at) {
      mirrorFreshnessSnapshot = { checkedAt: now, isFresh: false };
      return false;
    }

    const lastSyncedAt = Date.parse(String(data.last_synced_at));
    const isFresh = Number.isFinite(lastSyncedAt) && now - lastSyncedAt <= MARKET_MIRROR_STALE_AFTER_MS;
    mirrorFreshnessSnapshot = { checkedAt: now, isFresh };
    return isFresh;
  } catch {
    mirrorFreshnessSnapshot = { checkedAt: now, isFresh: false };
    return false;
  }
};

const getMarketFromMirrorOrLive = async (
  supabaseService: SupabaseServiceClient,
  marketId: string
): Promise<PolymarketMarket | null> => {
  try {
    const mirrored = await getMirroredPolymarketMarketById(supabaseService, marketId);
    if (mirrored) return mirrored;
  } catch (err) {
    console.warn("Mirror getMarket failed, falling back to Polymarket API", err);
  }

  const live = await getPolymarketMarketById(marketId);
  if (live) {
    try {
      await upsertMirroredPolymarketMarkets(supabaseService, [live]);
    } catch (err) {
      console.warn("Mirror upsert after live getMarket failed", err);
    }
  }
  return live;
};

const listMarketsFromMirrorOrLive = async (
  supabaseService: SupabaseServiceClient,
  params: { onlyOpen: boolean; limit: number; sortBy: "newest" | "volume" }
): Promise<PolymarketMarket[]> => {
  let mirrored: PolymarketMarket[] = [];
  let hadMirrorRows = false;

  try {
    mirrored = await listMirroredPolymarketMarkets(supabaseService, {
      onlyOpen: params.onlyOpen,
      limit: params.limit,
      sortBy: params.sortBy === "newest" ? "created_desc" : "volume",
    });
    hadMirrorRows = mirrored.length > 0;
    if (hadMirrorRows) {
      const fresh = await isMirrorFresh(supabaseService);
      if (fresh) return mirrored;
    }
  } catch (err) {
    console.warn("Mirror listMarkets failed, falling back to Polymarket API", err);
  }

  try {
    const live = await listPolymarketMarkets(params.limit, { hydrateMidpoints: false });
    const sortedLive = [...live].sort((a, b) =>
      params.sortBy === "newest"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : Number(b.volume ?? 0) - Number(a.volume ?? 0)
    );
    if (live.length > 0) {
      try {
        await upsertMirroredPolymarketMarkets(supabaseService, live);
      } catch (err) {
        console.warn("Mirror upsert after live listMarkets failed", err);
      }
    }
    return params.onlyOpen
      ? sortedLive.filter((m) => m.state === "open")
      : sortedLive;
  } catch (err) {
    if (hadMirrorRows) {
      console.warn("Live listMarkets failed, serving stale mirrored markets", err);
      return params.onlyOpen ? mirrored.filter((m) => m.state === "open") : mirrored;
    }
    throw err;
  }
};

type MarketLiveSnapshot = {
  marketId: string;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  lastTradePrice: number | null;
  lastTradeSize: number | null;
  rolling24hVolume: number | null;
  openInterest: number | null;
  sourceTs: string | null;
};

type MappedMarket = ReturnType<typeof mapPolymarketMarket>;
type SupabaseServiceClient = SupabaseClient<Database, "public">;
type MarketLiveRow = Pick<
  Database["public"]["Tables"]["polymarket_market_live"]["Row"],
  | "market_id"
  | "best_bid"
  | "best_ask"
  | "mid"
  | "last_trade_price"
  | "last_trade_size"
  | "rolling_24h_volume"
  | "open_interest"
  | "source_ts"
>;
type Candle1mRow = Pick<
  Database["public"]["Tables"]["polymarket_candles_1m"]["Row"],
  "bucket_start" | "open" | "high" | "low" | "close" | "volume" | "trades_count"
>;
type MarketEmbeddingRow = Pick<
  Database["public"]["Tables"]["market_embeddings"]["Row"],
  "market_id" | "embedding"
>;
type MarketContextRow = Pick<
  Database["public"]["Tables"]["market_context"]["Row"],
  "market_id" | "context" | "sources" | "updated_at"
>;
type MarketBookmarkRow = Pick<
  Database["public"]["Tables"]["market_bookmarks"]["Row"],
  "market_id" | "created_at"
>;
type MarketCommentRow = Pick<
  Database["public"]["Tables"]["market_comments"]["Row"],
  "id" | "market_id" | "user_id" | "parent_id" | "body" | "created_at"
>;
type MarketCommentLikeRow = Pick<
  Database["public"]["Tables"]["market_comment_likes"]["Row"],
  "comment_id" | "user_id"
>;

const sortMarketRows = (
  rows: Array<z.infer<typeof marketOutput>>,
  sortBy: "newest" | "volume"
): Array<z.infer<typeof marketOutput>> => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sortBy === "newest") {
      const aTs = Date.parse(String(a.createdAt ?? ""));
      const bTs = Date.parse(String(b.createdAt ?? ""));
      const aSafe = Number.isFinite(aTs) ? aTs : 0;
      const bSafe = Number.isFinite(bTs) ? bTs : 0;
      if (bSafe !== aSafe) return bSafe - aSafe;
      return Number(b.volume ?? 0) - Number(a.volume ?? 0);
    }
    const volumeDelta = Number(b.volume ?? 0) - Number(a.volume ?? 0);
    if (volumeDelta !== 0) return volumeDelta;
    const aTs = Date.parse(String(a.createdAt ?? ""));
    const bTs = Date.parse(String(b.createdAt ?? ""));
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
  return sorted;
};

export const __marketRouterTestUtils = {
  normalizeCategoryId,
  categoryMetaFromRaw,
  sortMarketRows,
};
type UserProfileRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "display_name" | "username" | "avatar_url" | "telegram_photo_url"
>;
type JsonValue = Database["public"]["Tables"]["user_events"]["Row"]["metadata"];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toFiniteNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const fetchMarketLiveSnapshots = async (
  supabaseService: SupabaseServiceClient,
  marketIds: string[]
): Promise<Map<string, MarketLiveSnapshot>> => {
  const map = new Map<string, MarketLiveSnapshot>();
  if (marketIds.length === 0) return map;
  const uniqueIds = Array.from(new Set(marketIds.filter(Boolean)));
  const chunkSize = 400;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseService
      .from("polymarket_market_live")
      .select(
        "market_id, best_bid, best_ask, mid, last_trade_price, last_trade_size, rolling_24h_volume, open_interest, source_ts"
      )
      .in("market_id", chunk);

    if (error) continue;
    for (const row of (data ?? []) as MarketLiveRow[]) {
      const marketId = row.market_id.trim();
      if (!marketId) continue;
      map.set(marketId, {
        marketId,
        bestBid: toFiniteNumber(row.best_bid),
        bestAsk: toFiniteNumber(row.best_ask),
        mid: toFiniteNumber(row.mid),
        lastTradePrice: toFiniteNumber(row.last_trade_price),
        lastTradeSize: toFiniteNumber(row.last_trade_size),
        rolling24hVolume: toFiniteNumber(row.rolling_24h_volume),
        openInterest: toFiniteNumber(row.open_interest),
        sourceTs: typeof row.source_ts === "string" ? row.source_ts : null,
      });
    }
  }

  return map;
};

const mergeMarketWithLive = (
  market: MappedMarket,
  live: MarketLiveSnapshot | undefined
): MappedMarket => {
  if (!live) return market;
  const isBinary = (market.marketType ?? "binary") === "binary";
  const useMid = isBinary && live.mid !== null && live.mid >= 0 && live.mid <= 1;
  const nextYes = useMid ? live.mid ?? market.priceYes : market.priceYes;
  const nextNo = useMid ? Math.max(0, Math.min(1, 1 - nextYes)) : market.priceNo;
  const liveChance = useMid ? Math.round(nextYes * 100) : market.chance;

  return {
    ...market,
    priceYes: nextYes,
    priceNo: nextNo,
    chance: liveChance,
    volume:
      typeof live.rolling24hVolume === "number" && Number.isFinite(live.rolling24hVolume)
        ? Math.max(market.volume, live.rolling24hVolume)
        : market.volume,
    bestBid: live.bestBid,
    bestAsk: live.bestAsk,
    mid: live.mid,
    lastTradePrice: live.lastTradePrice,
    lastTradeSize: live.lastTradeSize,
    rolling24hVolume: live.rolling24hVolume,
    openInterest: live.openInterest,
    liveUpdatedAt: live.sourceTs,
  };
};

const mergeMarketsWithLive = (
  markets: MappedMarket[],
  liveByMarket: Map<string, MarketLiveSnapshot>
): MappedMarket[] => markets.map((market) => mergeMarketWithLive(market, liveByMarket.get(market.id)));

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

const readCategoryFromPayload = (payload: Record<string, unknown> | null): string | null => {
  if (!payload) return null;
  const directKeys = ["category", "group", "tag", "topic"];
  for (const key of directKeys) {
    const value = normalizeCategoryLabel(payload[key]);
    if (value) return value;
  }
  const categories = payload.categories;
  if (Array.isArray(categories)) {
    for (const value of categories) {
      const normalized = normalizeCategoryLabel(value);
      if (normalized) return normalized;
    }
  }
  return null;
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

const listCanonicalProviderMarkets = async (
  supabaseService: SupabaseServiceClient,
  params: {
    provider: VenueProvider;
    onlyOpen: boolean;
    limit: number;
  }
): Promise<Array<z.infer<typeof marketOutput>>> => {
  let query = (supabaseService as any)
    .from("market_catalog")
    .select(
      "id, provider, provider_market_id, provider_condition_id, slug, title, description, state, category, source_url, image_url, provider_payload, source_updated_at, last_synced_at"
    )
    .eq("provider", params.provider)
    .order("source_updated_at", { ascending: false })
    .limit(params.limit);

  if (params.onlyOpen) {
    query = query.eq("state", "open");
  }

  const { data: marketRows, error: marketError } = await query;
  if (marketError || !Array.isArray(marketRows) || marketRows.length === 0) return [];

  const marketIds = marketRows
    .map((row) => String((row as Record<string, unknown>).id ?? "").trim())
    .filter(Boolean);

  const [outcomesRes, liveRes] = await Promise.all([
    (supabaseService as any)
      .from("market_outcomes")
      .select(
        "market_id, provider_outcome_id, provider_token_id, outcome_key, title, sort_order, probability, price, is_active"
      )
      .in("market_id", marketIds),
    (supabaseService as any)
      .from("market_live")
      .select("market_id, best_bid, best_ask, mid, last_trade_price, last_trade_size, rolling_24h_volume, open_interest, source_ts")
      .in("market_id", marketIds),
  ]);

  const outcomesByMarketId = new Map<string, Array<Record<string, unknown>>>();
  for (const row of (outcomesRes.data ?? []) as Record<string, unknown>[]) {
    const marketId = String(row.market_id ?? "").trim();
    if (!marketId) continue;
    const rows = outcomesByMarketId.get(marketId) ?? [];
    rows.push(row);
    outcomesByMarketId.set(marketId, rows);
  }

  for (const rows of outcomesByMarketId.values()) {
    rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  }

  const liveByMarketId = new Map<string, Record<string, unknown>>();
  for (const row of (liveRes.data ?? []) as Record<string, unknown>[]) {
    const marketId = String(row.market_id ?? "").trim();
    if (!marketId) continue;
    liveByMarketId.set(marketId, row);
  }

  return marketRows.map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const marketRefId = String(row.id ?? "").trim();
    const provider = String(row.provider ?? params.provider).trim() as VenueProvider;
    const providerMarketId = String(row.provider_market_id ?? "").trim();
    const payload = asObject(row.provider_payload);
    const categorySource = normalizeCategoryLabel(row.category) ?? readCategoryFromPayload(payload);
    const category = categoryMetaFromRaw(categorySource);
    const fallbackTs = Date.parse(String(row.source_updated_at ?? row.last_synced_at ?? ""));
    const fallbackIso = Number.isFinite(fallbackTs)
      ? new Date(fallbackTs).toISOString()
      : new Date().toISOString();

    const createdAt = readIsoFromPayload(payload, ["created_at", "createdAt", "market_created_at"], fallbackIso);
    const closesAt = readIsoFromPayload(payload, ["closes_at", "closesAt"], createdAt);
    const expiresAt = readIsoFromPayload(payload, ["expires_at", "expiresAt"], closesAt);
    const capabilities = readCapabilitiesFromPayload(payload, provider);

    const outcomeRows = outcomesByMarketId.get(marketRefId) ?? [];
    const outputId = venueToCanonicalId(provider, providerMarketId);
    const outcomes = outcomeRows.map((outcome, idx) => {
      const providerOutcomeIdRaw = outcome.provider_outcome_id;
      const outcomeKey = String(outcome.outcome_key ?? "").trim();
      const providerOutcomeId =
        typeof providerOutcomeIdRaw === "string" && providerOutcomeIdRaw.trim().length > 0
          ? providerOutcomeIdRaw.trim()
          : outcomeKey || `${providerMarketId}:${idx}`;
      const title =
        typeof outcome.title === "string" && outcome.title.trim().length > 0
          ? outcome.title.trim()
          : `Outcome ${idx + 1}`;
      const probability = clamp01(toFiniteNumber(outcome.probability as any) ?? 0);
      const price = clamp01(toFiniteNumber(outcome.price as any) ?? probability);
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

    const yes = outcomes[0];
    const no = outcomes[1];
    const live = liveByMarketId.get(marketRefId);
    const liveMid = toFiniteNumber(live?.mid as any);
    const useLiveMid = typeof liveMid === "number" && liveMid >= 0 && liveMid <= 1;
    const priceYes = useLiveMid ? liveMid : yes ? yes.price : 0.5;
    const priceNo = useLiveMid ? Math.max(0, Math.min(1, 1 - priceYes)) : no ? no.price : 0.5;

    const stateRaw = String(row.state ?? "open").trim().toLowerCase();
    const state: z.infer<typeof marketOutput>["state"] =
      stateRaw === "open" || stateRaw === "closed" || stateRaw === "resolved" || stateRaw === "cancelled"
        ? stateRaw
        : "open";

    return {
      id: outputId,
      provider,
      providerMarketId,
      canonicalMarketId: outputId,
      titleRu: String(row.title ?? "Untitled market"),
      titleEn: String(row.title ?? "Untitled market"),
      description: typeof row.description === "string" ? row.description : null,
      source: typeof row.source_url === "string" ? row.source_url : null,
      imageUrl: typeof row.image_url === "string" ? row.image_url : "",
      state,
      createdAt,
      closesAt,
      expiresAt,
      marketType: outcomes.length > 2 ? ("multi_choice" as const) : ("binary" as const),
      resolvedOutcomeId: null,
      outcomes,
      outcome: null,
      createdBy: null,
      categoryId: category?.id ?? null,
      categoryLabelRu: category?.labelRu ?? null,
      categoryLabelEn: category?.labelEn ?? null,
      settlementAsset: "USD",
      feeBps: null,
      liquidityB: null,
      priceYes,
      priceNo,
      volume: Math.max(0, toFiniteNumber(live?.rolling_24h_volume as any) ?? 0),
      chance: Math.round(priceYes * 100),
      creatorName: null,
      creatorAvatarUrl: null,
      bestBid: toFiniteNumber(live?.best_bid as any),
      bestAsk: toFiniteNumber(live?.best_ask as any),
      mid: toFiniteNumber(live?.mid as any),
      lastTradePrice: toFiniteNumber(live?.last_trade_price as any),
      lastTradeSize: toFiniteNumber(live?.last_trade_size as any),
      rolling24hVolume: toFiniteNumber(live?.rolling_24h_volume as any),
      openInterest: toFiniteNumber(live?.open_interest as any),
      liveUpdatedAt: typeof live?.source_ts === "string" ? live.source_ts : null,
      capabilities,
    } satisfies z.infer<typeof marketOutput>;
  });
};

const listLocalCandles = async (
  supabaseService: SupabaseServiceClient,
  marketId: string,
  limit: number
): Promise<Array<z.infer<typeof priceCandleOutput>>> => {
  if (!marketId) return [];
  const { data, error } = await supabaseService
    .from("polymarket_candles_1m")
    .select("bucket_start, open, high, low, close, volume, trades_count")
    .eq("market_id", marketId)
    .order("bucket_start", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data) || data.length === 0) return [];

  return [...data]
    .reverse()
    .map((row: Candle1mRow) => ({
      bucket: new Date(row.bucket_start).toISOString(),
      outcomeId: null,
      outcomeTitle: null,
      outcomeColor: null,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      tradesCount: Number(row.trades_count),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
      );
};

const listCanonicalCandles = async (
  supabaseService: SupabaseServiceClient,
  marketRefId: string,
  limit: number,
  outcomeKey = "__market__"
): Promise<Array<z.infer<typeof priceCandleOutput>>> => {
  if (!marketRefId) return [];

  const { data, error } = await (supabaseService as any)
    .from("market_candles_1m")
    .select("bucket_start, open, high, low, close, volume, trades_count")
    .eq("market_id", marketRefId)
    .eq("outcome_key", outcomeKey)
    .order("bucket_start", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  return [...data]
    .reverse()
    .map((row: Record<string, unknown>) => ({
      bucket: new Date(String(row.bucket_start ?? new Date().toISOString())).toISOString(),
      outcomeId: null,
      outcomeTitle: null,
      outcomeColor: null,
      open: Number(row.open ?? 0),
      high: Number(row.high ?? 0),
      low: Number(row.low ?? 0),
      close: Number(row.close ?? 0),
      volume: Number(row.volume ?? 0),
      tradesCount: Number(row.trades_count ?? 0),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    );
};

const embeddingCache = new Map<string, { expiresAt: number; vector: number[] }>();
let openAIClient: OpenAI | null = null;

const normalizeVector = (raw: number[]): number[] => {
  let normSq = 0;
  for (const value of raw) normSq += value * value;
  if (normSq <= 0) return raw;
  const norm = Math.sqrt(normSq);
  return raw.map((value) => value / norm);
};

const dot = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < len; i += 1) total += a[i] * b[i];
  return total;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const lexicalScore = (query: string, market: PolymarketMarket): number => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const source = `${market.title} ${market.description ?? ""} ${(market.category ?? "")} ${market.outcomes.map((o) => o.title).join(" ")}`.toLowerCase();
  const exact = source.includes(q) ? 1 : 0;
  const tokens = tokenize(q);
  if (tokens.length === 0) return exact;
  let hits = 0;
  for (const token of tokens) {
    if (source.includes(token)) hits += 1;
  }
  return clamp01(exact * 0.6 + (hits / tokens.length) * 0.7);
};

const lexicalScoreText = (query: string, text: string): number => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const source = text.toLowerCase();
  const exact = source.includes(q) ? 1 : 0;
  const tokens = tokenize(q);
  if (tokens.length === 0) return exact;
  let hits = 0;
  for (const token of tokens) {
    if (source.includes(token)) hits += 1;
  }
  return clamp01(exact * 0.6 + (hits / tokens.length) * 0.7);
};

const parseVector = (value: number[] | string | null | undefined): number[] | null => {
  if (Array.isArray(value)) {
    const out = value
      .map((v) => (typeof v === "number" ? v : Number(v)))
      .filter((v) => Number.isFinite(v));
    return out.length > 0 ? normalizeVector(out) : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as number[] | string | null;
      return parseVector(parsed);
    } catch {
      return null;
    }
  }
  return null;
};

const getOpenAIClient = (): OpenAI | null => {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openAIClient) openAIClient = new OpenAI({ apiKey: key });
  return openAIClient;
};

const getQueryEmbedding = async (query: string): Promise<number[] | null> => {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return null;
  const cacheKey = `query:${normalized}`;
  const now = Date.now();
  const cached = embeddingCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.vector;

  const client = getOpenAIClient();
  if (!client) return null;
  try {
    const model = (process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
    const response = await client.embeddings.create({ model, input: normalized });
    const vector = normalizeVector(response.data[0]?.embedding ?? []);
    if (vector.length === 0) return null;
    embeddingCache.set(cacheKey, {
      vector,
      expiresAt: now + 10 * 60_000,
    });
    return vector;
  } catch {
    return null;
  }
};

const getEmbeddingByMarketId = async (
  supabaseService: SupabaseServiceClient,
  marketId: string
): Promise<number[] | null> => {
  if (!marketId) return null;
  const { data, error } = await supabaseService
    .from("market_embeddings")
    .select("embedding")
    .eq("market_id", marketId)
    .maybeSingle();
  if (error || !data) return null;
  return parseVector(data.embedding);
};

const getClobBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL ||
    process.env.POLYMARKET_CLOB_API_BASE_URL ||
    "https://clob.polymarket.com"
  ).replace(/\/+$/, "");

const toErrorMessage = (error: Error | string | JsonValue) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "UNKNOWN_ERROR";
  }
};

type TradeAccessStatus = {
  status: "ALLOWED" | "BLOCKED_REGION" | "UNKNOWN_TEMP_ERROR";
  allowed: boolean;
  reasonCode: string | null;
  message: string | null;
  checkedAt: string;
};

const accessStatusCache = new Map<string, { expiresAt: number; value: TradeAccessStatus }>();
const relayRateLimitMap = new Map<string, { count: number; resetAt: number }>();

const normalizeAccessStatus = (payload: JsonValue | null): TradeAccessStatus => {
  const nowIso = new Date().toISOString();
  const rec: Record<string, JsonValue | undefined> =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, JsonValue | undefined>)
      : {};
  const values = Object.values(rec);
  const containsAllowedKeyword = values.some(
    (v) => typeof v === "string" && /(allow|approved|pass|ok|eligible)/i.test(v)
  );
  const containsBlockedKeyword = values.some(
    (v) => typeof v === "string" && /(block|forbid|deny|restricted|unavailable|geo)/i.test(v)
  );

  const explicitBoolean =
    typeof rec.allowed === "boolean"
      ? rec.allowed
      : typeof rec.canTrade === "boolean"
        ? rec.canTrade
        : typeof rec.tradingAllowed === "boolean"
          ? rec.tradingAllowed
          : null;

  const rawStatus = typeof rec.status === "string" ? rec.status : typeof rec.result === "string" ? rec.result : "";
  const reasonCode =
    typeof rec.reasonCode === "string"
      ? rec.reasonCode
      : typeof rec.reason === "string"
        ? rec.reason
        : typeof rec.error === "string"
          ? rec.error
          : null;
  const message = typeof rec.message === "string" ? rec.message : null;

  if (
    explicitBoolean === true ||
    /allow|approved|pass|ok|eligible/i.test(rawStatus) ||
    (containsAllowedKeyword && !containsBlockedKeyword)
  ) {
    return { status: "ALLOWED", allowed: true, reasonCode, message, checkedAt: nowIso };
  }

  if (
    explicitBoolean === false ||
    /block|forbid|deny|restrict|geo/i.test(rawStatus) ||
    containsBlockedKeyword
  ) {
    return { status: "BLOCKED_REGION", allowed: false, reasonCode, message, checkedAt: nowIso };
  }

  return {
    status: "UNKNOWN_TEMP_ERROR",
    allowed: false,
    reasonCode: reasonCode ?? "ACCESS_STATUS_UNKNOWN",
    message: message ?? "Could not verify regional access at this time.",
    checkedAt: nowIso,
  };
};

const getClientIpFromRequest = (req: Request): string | null => {
  return getTrustedClientIpFromRequest(req);
};

const getTradeAccessStatus = async (cacheKey: string, clientIp?: string | null): Promise<TradeAccessStatus> => {
  const ttlMs = Math.max(1000, Number(process.env.POLYMARKET_ACCESS_STATUS_TTL_MS ?? 60000));
  const now = Date.now();
  const cached = accessStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (clientIp) {
    headers["x-forwarded-for"] = clientIp;
    headers["x-real-ip"] = clientIp;
    headers["cf-connecting-ip"] = clientIp;
  }

  try {
    // Official geocheck endpoint: https://polymarket.com/api/geoblock
    const geoResponse = await fetch("https://polymarket.com/api/geoblock", {
      cache: "no-store",
      headers,
    });
    if (geoResponse.ok) {
      const geoPayload = (await geoResponse.json().catch(() => null)) as JsonValue | null;
      const geoRec: Record<string, JsonValue | undefined> =
        geoPayload && typeof geoPayload === "object"
          ? (geoPayload as Record<string, JsonValue | undefined>)
          : {};
      const blocked =
        typeof geoRec.blocked === "boolean"
          ? geoRec.blocked
          : typeof geoRec.isBlocked === "boolean"
            ? geoRec.isBlocked
            : null;
      if (blocked === true) {
        const blockedValue: TradeAccessStatus = {
          status: "BLOCKED_REGION",
          allowed: false,
          reasonCode:
            typeof geoRec.reason === "string"
              ? geoRec.reason
              : typeof geoRec.country === "string"
                ? `COUNTRY_${geoRec.country}`
                : "GEO_BLOCKED",
          message:
            typeof geoRec.message === "string"
              ? geoRec.message
              : "Trading is unavailable in your jurisdiction.",
          checkedAt: new Date().toISOString(),
        };
        accessStatusCache.set(cacheKey, { value: blockedValue, expiresAt: now + ttlMs });
        return blockedValue;
      }
      if (blocked === false) {
        const allowedValue: TradeAccessStatus = {
          status: "ALLOWED",
          allowed: true,
          reasonCode: null,
          message: null,
          checkedAt: new Date().toISOString(),
        };
        accessStatusCache.set(cacheKey, { value: allowedValue, expiresAt: now + ttlMs });
        return allowedValue;
      }
    }

    // Backward-compatible fallback for CLOB access check
    const clobResponse = await fetch(`${getClobBaseUrl()}/auth/access-status`, {
      cache: "no-store",
      headers,
    });
    if (!clobResponse.ok) {
      const fallback: TradeAccessStatus = {
        status: "UNKNOWN_TEMP_ERROR",
        allowed: false,
        reasonCode: `HTTP_${clobResponse.status}`,
        message: "Could not verify regional access at this time.",
        checkedAt: new Date().toISOString(),
      };
      accessStatusCache.set(cacheKey, { value: fallback, expiresAt: now + 3000 });
      return fallback;
    }
    const payload = (await clobResponse.json()) as JsonValue;
    const normalized = normalizeAccessStatus(payload);
    accessStatusCache.set(cacheKey, { value: normalized, expiresAt: now + ttlMs });
    return normalized;
  } catch {
    const fallback: TradeAccessStatus = {
      status: "UNKNOWN_TEMP_ERROR",
      allowed: false,
      reasonCode: "ACCESS_STATUS_FETCH_FAILED",
      message: "Could not verify regional access at this time.",
      checkedAt: new Date().toISOString(),
    };
    accessStatusCache.set(cacheKey, { value: fallback, expiresAt: now + 3000 });
    return fallback;
  }
};

const applyRelayRateLimit = (userId: string) => {
  const windowMs = 60_000;
  const maxPerWindow = 25;
  const now = Date.now();
  const entry = relayRateLimitMap.get(userId);
  if (!entry || entry.resetAt <= now) {
    relayRateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxPerWindow) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ORDER_RELAY_RATE_LIMITED" });
  }
  entry.count += 1;
};

const toBase64 = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${pad}`;
};

const buildL2Signature = (
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string
) => {
  let message = `${timestamp}${method}${requestPath}`;
  if (body) message += body;
  const key = Buffer.from(toBase64(secret), "base64");
  return createHmac("sha256", key)
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const loadDynamicPolymarketCategoryRows = async (
  supabaseService: unknown
): Promise<Array<z.infer<typeof marketCategoryOutput>>> => {
  const categories = new Map<string, string>();
  const collectFromRows = (rows: unknown[] | null | undefined, column: string) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const rec = asObject(row);
      if (!rec) continue;
      addCategoryValue(categories, rec[column]);
    }
  };

  if (supabaseService) {
    try {
      const { data, error } = await (supabaseService as any)
        .from("market_catalog")
        .select("category")
        .eq("provider", "polymarket")
        .eq("state", "open")
        .not("category", "is", null)
        .order("source_updated_at", { ascending: false })
        .limit(5000);
      if (!error) {
        collectFromRows(data, "category");
      }
    } catch {
      // Continue with fallback sources.
    }

    if (categories.size === 0) {
      try {
        const { data, error } = await (supabaseService as any)
          .from("polymarket_market_cache")
          .select("category")
          .eq("state", "open")
          .not("category", "is", null)
          .order("source_updated_at", { ascending: false })
          .limit(5000);
        if (!error) {
          collectFromRows(data, "category");
        }
      } catch {
        // Continue with API fallback.
      }
    }
  }

  if (categories.size === 0) {
    try {
      const liveMarkets = await listPolymarketMarkets(500, { hydrateMidpoints: false });
      for (const market of liveMarkets) {
        addCategoryValue(categories, market.category);
      }
    } catch {
      // Best-effort fallback.
    }
  }

  return sortCategoryRows(categories);
};

const getCachedDynamicPolymarketCategoryRows = async (
  supabaseService: unknown
): Promise<Array<z.infer<typeof marketCategoryOutput>>> => {
  const now = Date.now();
  if (cachedCategoryRows && cachedCategoryRows.expiresAt > now) {
    return cachedCategoryRows.rows;
  }
  const rows = await loadDynamicPolymarketCategoryRows(supabaseService);
  cachedCategoryRows = {
    rows,
    expiresAt: now + CATEGORY_ROWS_CACHE_TTL_MS,
  };
  return rows;
};

const parseProviderSelection = (input?: {
  providers?: Array<VenueProvider> | undefined;
  providerFilter?: "all" | VenueProvider | undefined;
}): VenueProvider[] => {
  const enabled = new Set<VenueProvider>(listEnabledProviders());
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

const resolveMarketCatalogRefId = async (
  supabaseService: unknown,
  provider: VenueProvider,
  providerMarketId: string
): Promise<string | null> => {
  if (!supabaseService || !providerMarketId) return null;
  try {
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
  } catch {
    return null;
  }
};

const buildOrderHash = (payload: string): string =>
  createHash("sha256").update(payload).digest("hex");

const createRelayAuditPending = async (
  supabaseService: unknown,
  params: {
    provider: VenueProvider;
    userId: string;
    marketRefId: string | null;
    idempotencyKey: string;
    clientOrderId?: string | null;
    orderHash: string;
    requestIp?: string | null;
  }
): Promise<
  | { kind: "inserted"; id: number }
  | { kind: "duplicate"; status: string; httpStatus: number | null }
> => {
  if (!supabaseService) return { kind: "inserted", id: 0 };

  const { data: existing } = await (supabaseService as any)
    .from("trade_relay_audit")
    .select("id,status,http_status")
    .eq("provider", params.provider)
    .eq("user_id", params.userId)
    .eq("idempotency_key", params.idempotencyKey)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const status = String((existing as Record<string, unknown>).status ?? "duplicate");
    const httpStatusRaw = (existing as Record<string, unknown>).http_status;
    const httpStatus =
      typeof httpStatusRaw === "number" && Number.isFinite(httpStatusRaw)
        ? httpStatusRaw
        : null;
    return { kind: "duplicate", status, httpStatus };
  }

  const { data, error } = await (supabaseService as any)
    .from("trade_relay_audit")
    .insert({
      provider: params.provider,
      user_id: params.userId,
      market_ref_id: params.marketRefId,
      idempotency_key: params.idempotencyKey,
      client_order_id: params.clientOrderId ?? null,
      order_hash: params.orderHash,
      status: "pending",
      request_ip: params.requestIp ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: error?.message ?? "RELAY_AUDIT_INSERT_FAILED",
    });
  }

  const id = Number((data as Record<string, unknown>).id ?? 0);
  return { kind: "inserted", id: Number.isFinite(id) ? id : 0 };
};

const finalizeRelayAudit = async (
  supabaseService: unknown,
  auditId: number,
  params: {
    status: "success" | "failed" | "rejected";
    httpStatus: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }
) => {
  if (!supabaseService || !auditId) return;
  await (supabaseService as any)
    .from("trade_relay_audit")
    .update({
      status: params.status,
      http_status: params.httpStatus,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auditId);
};

export const marketRouter = router({
  listCategories: publicProcedure.output(z.array(marketCategoryOutput)).query(async ({ ctx }) => {
    const rows = await getCachedDynamicPolymarketCategoryRows(ctx.supabaseService);
    return rows;
  }),

  listMarkets: publicProcedure
    .input(
      z
        .object({
          onlyOpen: z.boolean().optional(),
          page: z.number().int().positive().max(1000).optional(),
          pageSize: z.number().int().positive().max(100).optional(),
          sortBy: z.enum(["newest", "volume"]).optional(),
          providers: z.array(z.enum(["polymarket", "limitless"])).optional(),
          providerFilter: z.enum(["all", "polymarket", "limitless"]).optional(),
        })
        .optional()
    )
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const onlyOpen = input?.onlyOpen ?? false;
      const page = Math.max(1, Number(input?.page ?? 1));
      const pageSize = Math.max(1, Math.min(100, Number(input?.pageSize ?? 50)));
      const sortBy: "newest" | "volume" = input?.sortBy ?? "newest";
      const offset = (page - 1) * pageSize;
      const candidateLimit = Math.min(4000, Math.max(pageSize * 2, offset + pageSize * 2));
      const selectedProviders = parseProviderSelection({
        providers: input?.providers,
        providerFilter: input?.providerFilter,
      });

      const responseRows: Array<z.infer<typeof marketOutput>> = [];

      if (selectedProviders.includes("polymarket")) {
        const rows = await listMarketsFromMirrorOrLive(ctx.supabaseService, {
          onlyOpen,
          limit: candidateLimit,
          sortBy,
        });
        const mapped = rows.map(mapPolymarketMarket);
        const liveByMarket = await fetchMarketLiveSnapshots(
          ctx.supabaseService,
          mapped.map((m) => m.id)
        );
        const merged = mergeMarketsWithLive(mapped, liveByMarket);
        responseRows.push(...(onlyOpen ? merged.filter((m) => m.state === "open") : merged));
      }

      if (selectedProviders.includes("limitless")) {
        const canonicalRows = await listCanonicalProviderMarkets(ctx.supabaseService, {
          provider: "limitless",
          onlyOpen,
          limit: candidateLimit,
        });

        if (canonicalRows.length > 0) {
          responseRows.push(...canonicalRows);
        } else {
          const adapter = getVenueAdapter("limitless");
          if (adapter.isEnabled()) {
            const rows = await adapter.listMarketsSnapshot({
              onlyOpen,
              limit: candidateLimit,
            });
            if (rows.length > 0) {
              if (ENABLE_CATALOG_SYNC_ON_READ) {
                void upsertVenueMarketsToCatalog(ctx.supabaseService, rows).catch(() => {
                  // Best effort only for canonical table sync.
                });
              }
              responseRows.push(...rows.map((row) => mapVenueMarketToMarketOutput(row)));
            }
          }
        }
      }

      const deduped = new Map<string, z.infer<typeof marketOutput>>();
      for (const row of responseRows) {
        const key = row.canonicalMarketId ?? `${row.provider ?? "polymarket"}:${row.id}`;
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, row);
          continue;
        }
        if ((row.volume ?? 0) > (existing.volume ?? 0)) {
          deduped.set(key, row);
        }
      }

      const sorted = sortMarketRows(Array.from(deduped.values()), sortBy);
      return sorted.slice(offset, offset + pageSize);
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().min(1), provider: z.enum(["polymarket", "limitless"]).optional() }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);

      if (ref.provider === "polymarket") {
        const row = await getMarketFromMirrorOrLive(ctx.supabaseService, ref.providerMarketId);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
        }
        const mapped = mapPolymarketMarket(row);
        const liveByMarket = await fetchMarketLiveSnapshots(ctx.supabaseService, [mapped.id]);
        return mergeMarketWithLive(mapped, liveByMarket.get(mapped.id));
      }

      const adapter = getVenueAdapter(ref.provider);
      if (!adapter.isEnabled()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market provider unavailable" });
      }

      const row = await adapter.getMarketById(ref.providerMarketId);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      if (ENABLE_CATALOG_SYNC_ON_READ) {
        void upsertVenueMarketsToCatalog(ctx.supabaseService, [row]).catch(() => {
          // Canonical table sync is best effort.
        });
      }
      return mapVenueMarketToMarketOutput(row);
    }),

  searchSemantic: publicProcedure
    .input(
      z.object({
        query: z.string().min(2).max(256),
        limit: z.number().int().positive().max(30).optional(),
        onlyOpen: z.boolean().optional(),
        providers: z.array(z.enum(["polymarket", "limitless"])).optional(),
        providerFilter: z.enum(["all", "polymarket", "limitless"]).optional(),
      })
    )
    .output(marketListV1Output)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(30, Number(input.limit ?? 15)));
      const onlyOpen = input.onlyOpen ?? true;
      const query = input.query.trim();
      const selectedProviders = parseProviderSelection({
        providers: input.providers,
        providerFilter: input.providerFilter,
      });
      if (query.length < 2) {
        return { apiVersion: "v1", items: [] };
      }

      const scoredItems: Array<{ market: z.infer<typeof marketOutput>; score: number }> = [];

      if (selectedProviders.includes("polymarket")) {
        const primary = await searchMirroredPolymarketMarkets(ctx.supabaseService, query, limit * 8);
        const fallback =
          primary.length > 0
            ? []
            : await listMirroredPolymarketMarkets(ctx.supabaseService, { onlyOpen: true, limit: 300 });

        const byId = new Map<string, PolymarketMarket>();
        for (const row of [...primary, ...fallback]) {
          if (onlyOpen && row.state !== "open") continue;
          byId.set(row.id, row);
        }
        const candidates = Array.from(byId.values());
        if (candidates.length > 0) {
          const marketIds = candidates.map((m) => m.id);
          const liveByMarket = await fetchMarketLiveSnapshots(ctx.supabaseService, marketIds);

          const vectorByMarket = new Map<string, number[]>();
          const chunkSize = 200;
          for (let i = 0; i < marketIds.length; i += chunkSize) {
            const chunk = marketIds.slice(i, i + chunkSize);
            const { data } = await ctx.supabaseService
              .from("market_embeddings")
              .select("market_id, embedding")
              .in("market_id", chunk);
            for (const row of (data ?? []) as MarketEmbeddingRow[]) {
              const marketId = row.market_id.trim();
              const vector = parseVector(row.embedding);
              if (marketId && vector) vectorByMarket.set(marketId, vector);
            }
          }

          const queryVector = await getQueryEmbedding(query);
          const mapped = candidates.map(mapPolymarketMarket);
          const merged = mergeMarketsWithLive(mapped, liveByMarket);

          scoredItems.push(
            ...merged.map((market) => {
              const raw = byId.get(market.id);
              const lex = raw ? lexicalScore(query, raw) : 0;
              const semanticVector = queryVector ? vectorByMarket.get(market.id) ?? null : null;
              const semantic =
                queryVector && semanticVector ? clamp01((dot(queryVector, semanticVector) + 1) / 2) : 0;
              const volumeBoost = clamp01(Math.log10(Math.max(0, market.volume) + 1) / 6);
              const score =
                queryVector && semanticVector
                  ? clamp01(semantic * 0.65 + lex * 0.25 + volumeBoost * 0.1)
                  : clamp01(lex * 0.8 + volumeBoost * 0.2);
              return { market, score };
            })
          );
        }
      }

      if (selectedProviders.includes("limitless")) {
        const adapter = getVenueAdapter("limitless");
        if (adapter.isEnabled()) {
          const rows = await adapter.searchMarkets(query, Math.max(limit * 6, 60));
          const filtered = onlyOpen ? rows.filter((row) => row.state === "open") : rows;
          if (ENABLE_CATALOG_SYNC_ON_READ && filtered.length > 0) {
            void upsertVenueMarketsToCatalog(ctx.supabaseService, filtered).catch(() => {
              // Best effort sync.
            });
          }
          scoredItems.push(
            ...filtered.map((row) => {
              const market = mapVenueMarketToMarketOutput(row);
              const lex = lexicalScoreText(
                query,
                `${row.title} ${row.description ?? ""} ${row.category ?? ""} ${row.outcomes
                  .map((outcome) => outcome.title)
                  .join(" ")}`
              );
              const volumeBoost = clamp01(Math.log10(Math.max(0, row.volume) + 1) / 6);
              return {
                market,
                score: clamp01(lex * 0.8 + volumeBoost * 0.2),
              };
            })
          );
        }
      }

      const deduped = new Map<string, { market: z.infer<typeof marketOutput>; score: number }>();
      for (const item of scoredItems) {
        const key =
          item.market.canonicalMarketId ??
          `${item.market.provider ?? "polymarket"}:${item.market.providerMarketId ?? item.market.id}`;
        const existing = deduped.get(key);
        if (!existing || item.score > existing.score) {
          deduped.set(key, item);
        }
      }

      const items = Array.from(deduped.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return {
        apiVersion: "v1",
        items,
      };
    }),

  getSimilar: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(30).optional() }))
    .output(similarMarketsV1Output)
    .query(async ({ ctx, input }) => {
      const baseMarket = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!baseMarket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const limit = Math.max(1, Math.min(30, Number(input.limit ?? 10)));
      const targetVector = await getEmbeddingByMarketId(ctx.supabaseService, baseMarket.id);

      if (!targetVector) {
        const pool = await listMirroredPolymarketMarkets(ctx.supabaseService, {
          onlyOpen: true,
          limit: 300,
        });
        const sameCategory = pool
          .filter((row) => row.id !== baseMarket.id && row.category === baseMarket.category)
          .sort((a, b) => b.volume - a.volume)
          .slice(0, limit);
        const mapped = sameCategory.map(mapPolymarketMarket);
        const liveByMarket = await fetchMarketLiveSnapshots(
          ctx.supabaseService,
          mapped.map((m) => m.id)
        );
        return {
          apiVersion: "v1",
          items: mergeMarketsWithLive(mapped, liveByMarket).map((market) => ({
            market,
            score: clamp01(Math.log10(Math.max(0, market.volume) + 1) / 6),
          })),
        };
      }

      const { data } = await ctx.supabaseService
        .from("market_embeddings")
        .select("market_id, embedding")
        .limit(700);

      const scored = (data ?? [])
        .map((row: MarketEmbeddingRow) => {
          const marketId = row.market_id.trim();
          if (!marketId || marketId === baseMarket.id) return null;
          const vector = parseVector(row.embedding);
          if (!vector) return null;
          const score = clamp01((dot(targetVector, vector) + 1) / 2);
          return { marketId, score };
        })
        .filter((row: { marketId: string; score: number } | null): row is { marketId: string; score: number } => Boolean(row))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * 3);

      const markets = await Promise.all(
        scored.map(async (row) => ({
          row,
          market: await getMarketFromMirrorOrLive(ctx.supabaseService, row.marketId),
        }))
      );

      const mapped = markets
        .filter((entry): entry is { row: { marketId: string; score: number }; market: PolymarketMarket } => Boolean(entry.market))
        .map((entry) => ({
          market: mapPolymarketMarket(entry.market),
          score: entry.row.score,
        }))
        .slice(0, limit);

      const liveByMarket = await fetchMarketLiveSnapshots(
        ctx.supabaseService,
        mapped.map((m) => m.market.id)
      );

      return {
        apiVersion: "v1",
        items: mapped.map((item) => ({
          market: mergeMarketWithLive(item.market, liveByMarket.get(item.market.id)),
          score: item.score,
        })),
      };
    }),

  checkTradeAccess: publicProcedure
    .input(z.object({ provider: z.enum(["polymarket", "limitless"]).optional() }).optional())
    .output(tradeAccessOutput)
    .query(async ({ ctx, input }) => {
      ctx.responseHeaders["cache-control"] = "no-store, max-age=0";
      const provider = (input?.provider ?? "polymarket") as VenueProvider;
      const adapter = getVenueAdapter(provider);
      if (!adapter.isEnabled()) {
        return {
          status: "BLOCKED_REGION" as const,
          allowed: false,
          reasonCode: "PROVIDER_DISABLED",
          message: "Trading provider is disabled.",
          checkedAt: new Date().toISOString(),
        };
      }
      const ip = getClientIpFromRequest(ctx.req);
      const cacheKey = `access:${provider}:${ip ?? "unknown"}`;
      return adapter.checkTradeAccess({ cacheKey, requestIp: ip });
    }),

  relaySignedOrder: publicProcedure
    .input(relaySignedOrderInput)
    .output(relaySignedOrderOutput)
    .mutation(async ({ ctx, input }) => {
      const { authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      ctx.responseHeaders["cache-control"] = "no-store, max-age=0";

      const provider = (input.provider ?? "polymarket") as VenueProvider;
      const adapter = getVenueAdapter(provider);
      if (!adapter.isEnabled()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PROVIDER_DISABLED" });
      }

      const ip = getClientIpFromRequest(ctx.req);

      const relayRate = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `relay:${provider}:${authUser.id}:${ip ?? "unknown"}`,
        limit: 25,
        windowSeconds: 60,
      });
      if (!relayRate.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ORDER_RELAY_RATE_LIMITED" });
      }

      const access = await adapter.checkTradeAccess({
        cacheKey: `relay_access:${provider}:${authUser.id}:${ip ?? "unknown"}`,
        requestIp: ip,
      });
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: access.reasonCode ?? "TRADE_ACCESS_BLOCKED",
        });
      }

      const orderBody = JSON.stringify({
        order: input.signedOrder,
        owner: input.apiCreds.key,
        orderType: input.orderType,
        provider,
      });
      if (orderBody.length > 16 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "SIGNED_ORDER_TOO_LARGE" });
      }

      const marketRef = parseVenueMarketRef(
        input.marketId ??
          (typeof input.signedOrder.market === "string"
            ? String(input.signedOrder.market)
            : typeof input.signedOrder.market_id === "string"
              ? String(input.signedOrder.market_id)
              : ""),
        provider
      );
      const marketRefId = await resolveMarketCatalogRefId(
        ctx.supabaseService,
        marketRef.provider,
        marketRef.providerMarketId
      );

      const orderHash = buildOrderHash(orderBody);
      const pendingAudit = await createRelayAuditPending(ctx.supabaseService, {
        provider,
        userId: authUser.id,
        marketRefId,
        idempotencyKey: input.idempotencyKey,
        clientOrderId: input.clientOrderId,
        orderHash,
        requestIp: ip,
      });

      if (pendingAudit.kind === "duplicate") {
        return {
          success: false,
          status: pendingAudit.httpStatus ?? 409,
          error: "ORDER_RELAY_DUPLICATE",
        };
      }

      const apiCreds: VenueApiCreds = {
        key: input.apiCreds.key,
        secret: input.apiCreds.secret,
        passphrase: input.apiCreds.passphrase,
      };

      const relay = await adapter.relaySignedOrder({
        signedOrder: input.signedOrder as Record<string, unknown>,
        orderType: input.orderType,
        apiCreds,
        makerAddress:
          typeof input.signedOrder.maker === "string" ? String(input.signedOrder.maker) : null,
        clientOrderId: input.clientOrderId,
        requestIp: ip,
      });

      if (relay.success) {
        await finalizeRelayAudit(ctx.supabaseService, pendingAudit.id, {
          status: "success",
          httpStatus: relay.status,
        });
      } else {
        await finalizeRelayAudit(ctx.supabaseService, pendingAudit.id, {
          status: relay.status >= 400 ? "rejected" : "failed",
          httpStatus: relay.status,
          errorCode: relay.error ?? null,
          errorMessage: relay.error ?? null,
        });
      }

      return {
        success: relay.success,
        status: relay.status,
        payload: relay.payload as JsonValue | undefined,
        error: relay.error,
      };
    }),

  generateMarketContext: publicProcedure
    .input(z.object({ marketId: z.string().min(1), provider: z.enum(["polymarket", "limitless"]).optional() }))
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const contextMarketKey =
        ref.provider === "polymarket"
          ? ref.providerMarketId
          : venueToCanonicalId(ref.provider, ref.providerMarketId);

      const market =
        ref.provider === "polymarket"
          ? await getMarketFromMirrorOrLive(supabaseService, ref.providerMarketId)
          : await getVenueAdapter(ref.provider).getMarketById(ref.providerMarketId);
      if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });

      const existing = await supabaseService
        .from("market_context")
        .select("market_id, context, sources, updated_at")
        .eq("market_id", contextMarketKey)
        .maybeSingle();
      const existingRow = existing.data as MarketContextRow | null;
      if (!existing.error && existingRow?.context) {
        const src = Array.isArray(existingRow.sources) ? existingRow.sources.map(String) : [];
        return {
          marketId: String(existingRow.market_id),
          context: String(existingRow.context),
          sources: src,
          updatedAt: String(existingRow.updated_at),
          generated: false,
        };
      }

      const generated = await generateMarketContext({
        marketId: contextMarketKey,
        title: market.title,
        description: market.description,
        source: market.sourceUrl ?? null,
      });
      const updatedAt = new Date().toISOString();
      const marketRefId = await resolveMarketCatalogRefId(
        ctx.supabaseService,
        ref.provider,
        ref.providerMarketId
      );
      const upsert = await (supabaseService as any).from("market_context").upsert(
        {
          market_id: contextMarketKey,
          market_ref_id: marketRefId,
          context: generated.context,
          sources: generated.sources,
          updated_at: updatedAt,
        },
        { onConflict: "market_id" }
      );
      if (upsert.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: upsert.error.message });
      }
      return {
        marketId: contextMarketKey,
        context: generated.context,
        sources: generated.sources,
        updatedAt,
        generated: true,
      };
    }),

  myBookmarks: publicProcedure
    .output(z.array(marketBookmarkOutput))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const { data, error } = await supabaseService
        .from("market_bookmarks")
        .select("market_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return ((data ?? []) as MarketBookmarkRow[]).map((r) => ({
        marketId: String(r.market_id),
        createdAt: new Date(String(r.created_at)).toISOString(),
      }));
    }),

  setBookmark: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        provider: z.enum(["polymarket", "limitless"]).optional(),
        bookmarked: z.boolean(),
      })
    )
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const marketRefId = await resolveMarketCatalogRefId(
        ctx.supabaseService,
        ref.provider,
        ref.providerMarketId
      );
      if (input.bookmarked) {
        const ins = await (supabaseService as any).from("market_bookmarks").insert({
          user_id: authUser.id,
          market_id: input.marketId,
          market_ref_id: marketRefId,
        });
        if (ins.error && !String(ins.error.message).toLowerCase().includes("duplicate")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
        }
      } else {
        const del = await supabaseService
          .from("market_bookmarks")
          .delete()
          .eq("user_id", authUser.id)
          .eq("market_id", input.marketId);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }
      return { marketId: input.marketId, bookmarked: input.bookmarked };
    }),

  getPriceCandles: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        provider: z.enum(["polymarket", "limitless"]).optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
    )
    .output(z.array(priceCandleOutput))
    .query(async ({ ctx, input }) => {
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const limit = input.limit ?? 200;

      if (ref.provider === "polymarket") {
        const market = await getMarketFromMirrorOrLive(ctx.supabaseService, ref.providerMarketId);
        if (!market) return [];

        const marketRefId = await resolveMarketCatalogRefId(
          ctx.supabaseService,
          ref.provider,
          ref.providerMarketId
        );
        if (marketRefId) {
          const canonical = await listCanonicalCandles(ctx.supabaseService, marketRefId, limit);
          if (canonical.length > 0) return canonical;
        }

        const localCandles = await listLocalCandles(ctx.supabaseService, market.id, limit);
        if (localCandles.length > 0) return localCandles;

        const withToken = market.outcomes.filter((o) => Boolean(o.tokenId));
        if (withToken.length === 0) {
          const fallback = market.outcomes[0]?.price ?? 0.5;
          return [
            {
              bucket: new Date().toISOString(),
              outcomeId: market.outcomes[0]?.id ?? null,
              outcomeTitle: market.outcomes[0]?.title ?? null,
              outcomeColor: null,
              open: fallback,
              high: fallback,
              low: fallback,
              close: fallback,
              volume: market.volume,
              tradesCount: 0,
            },
          ];
        }

        const isBinary = market.outcomes.length <= 2;
        const yesOutcome =
          market.outcomes.find((o) => o.title.trim().toLowerCase() === "yes") ??
          market.outcomes.find((o) => o.sortOrder === 0) ??
          market.outcomes[0] ??
          null;
        const targetOutcomes = isBinary ? withToken.filter((o) => o.id === yesOutcome?.id) : withToken;

        const histories = await Promise.all(
          targetOutcomes.map(async (o) => ({
            outcome: o,
            history: await getPolymarketPriceHistory(String(o.tokenId)),
          }))
        );

        const candles = histories
          .flatMap(({ outcome, history }) => {
            const deduped = history
              .slice()
              .sort((a, b) => a.ts - b.ts)
              .filter((point, idx, arr) => idx === arr.length - 1 || point.ts !== arr[idx + 1]?.ts);

            return deduped.map((point, idx) => {
              const prev = deduped[idx - 1] ?? point;
              const open = prev.price;
              const close = point.price;
              return {
                bucket: new Date(point.ts * 1000).toISOString(),
                outcomeId: outcome.id,
                outcomeTitle: outcome.title,
                outcomeColor: null,
                open,
                high: Math.max(open, close),
                low: Math.min(open, close),
                close,
                volume: 0,
                tradesCount: 0,
              };
            });
          })
          .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
        if (candles.length === 0) return [];
        return candles.slice(Math.max(0, candles.length - limit));
      }

      const adapter = getVenueAdapter(ref.provider);
      if (!adapter.isEnabled()) return [];
      const market = await adapter.getMarketById(ref.providerMarketId);
      if (!market) return [];

      const marketRefId = await resolveMarketCatalogRefId(
        ctx.supabaseService,
        ref.provider,
        ref.providerMarketId
      );
      if (marketRefId) {
        const canonical = await listCanonicalCandles(ctx.supabaseService, marketRefId, limit);
        if (canonical.length > 0) return canonical;
      }

      const history = await adapter.getPriceHistory(market, limit * 3);
      if (history.length === 0) {
        const fallback = market.outcomes[0]?.price ?? 0.5;
        return [
          {
            bucket: new Date().toISOString(),
            outcomeId: market.outcomes[0]?.id ?? null,
            outcomeTitle: market.outcomes[0]?.title ?? null,
            outcomeColor: null,
            open: fallback,
            high: fallback,
            low: fallback,
            close: fallback,
            volume: market.volume,
            tradesCount: 0,
          },
        ];
      }

      const deduped = history
        .slice()
        .sort((a, b) => a.ts - b.ts)
        .filter((point, idx, arr) => idx === arr.length - 1 || point.ts !== arr[idx + 1]?.ts);
      const outcome = market.outcomes[0] ?? null;
      const candles = deduped.map((point, idx) => {
        const prev = deduped[idx - 1] ?? point;
        const open = prev.price;
        const close = point.price;
        return {
          bucket: new Date(point.ts * 1000).toISOString(),
          outcomeId: outcome?.id ?? null,
          outcomeTitle: outcome?.title ?? null,
          outcomeColor: null,
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
          volume: 0,
          tradesCount: 0,
        };
      });
      return candles.slice(Math.max(0, candles.length - limit));
    }),

  getPublicTrades: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        provider: z.enum(["polymarket", "limitless"]).optional(),
        limit: z.number().int().positive().max(200).optional(),
      })
    )
    .output(z.array(publicTradeOutput))
    .query(async ({ ctx, input }) => {
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);

      if (ref.provider === "polymarket") {
        const market = await getMarketFromMirrorOrLive(ctx.supabaseService, ref.providerMarketId);
        if (!market) return [];
        const rows = await getPolymarketPublicTrades(market.conditionId, input.limit ?? 50);
        const outcomesByTitle = new Map(
          market.outcomes.map((o) => [o.title.trim().toLowerCase(), o] as const)
        );
        return rows.map((t) => {
          const normalizedOutcome = (t.outcome ?? "").trim().toLowerCase();
          const outcome = outcomesByTitle.get(normalizedOutcome);
          const action = t.side === "SELL" ? "sell" : "buy";
          const yn =
            normalizedOutcome === "yes"
              ? ("YES" as const)
              : normalizedOutcome === "no"
                ? ("NO" as const)
                : null;
          return {
            id: t.id,
            marketId: market.id,
            action,
            outcome: yn,
            outcomeId: outcome?.id ?? null,
            outcomeTitle: outcome?.title ?? (t.outcome ?? null),
            collateralGross: t.size * t.price,
            sharesDelta: t.size,
            priceBefore: t.price,
            priceAfter: t.price,
            createdAt: new Date(t.timestamp * 1000).toISOString(),
          };
        });
      }

      const adapter = getVenueAdapter(ref.provider);
      if (!adapter.isEnabled()) return [];
      const market = await adapter.getMarketById(ref.providerMarketId);
      if (!market) return [];
      const rows = await adapter.getPublicTrades(market, input.limit ?? 50);
      const outcomesByTitle = new Map(
        market.outcomes.map((outcome) => [outcome.title.trim().toLowerCase(), outcome] as const)
      );
      return rows.map((trade) => {
        const normalizedOutcome = (trade.outcome ?? "").trim().toLowerCase();
        const outcome = outcomesByTitle.get(normalizedOutcome);
        const action = trade.side === "SELL" ? "sell" : "buy";
        const yn =
          normalizedOutcome === "yes"
            ? ("YES" as const)
            : normalizedOutcome === "no"
              ? ("NO" as const)
              : null;
        return {
          id: trade.id,
          marketId: venueToCanonicalId(ref.provider, ref.providerMarketId),
          action,
          outcome: yn,
          outcomeId: outcome?.id ?? null,
          outcomeTitle: outcome?.title ?? (trade.outcome ?? null),
          collateralGross: trade.size * trade.price,
          sharesDelta: trade.size,
          priceBefore: trade.price,
          priceAfter: trade.price,
          createdAt: new Date(trade.timestamp * 1000).toISOString(),
        };
      });
    }),

  getMarketComments: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(marketCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { data: comments, error } = await supabaseService
        .from("market_comments")
        .select("id, market_id, user_id, parent_id, body, created_at")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 100);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const commentRows = (comments ?? []) as MarketCommentRow[];
      const userIds = Array.from(new Set(commentRows.map((c) => String(c.user_id))));
      const [{ data: users }, { data: likes }] = await Promise.all([
        userIds.length > 0
          ? supabaseService
              .from("users")
              .select("id, display_name, username, avatar_url, telegram_photo_url")
              .in("id", userIds)
          : Promise.resolve({ data: [] as UserProfileRow[] }),
        commentRows.length > 0
          ? supabaseService
              .from("market_comment_likes")
              .select("comment_id, user_id")
              .in("comment_id", commentRows.map((c) => String(c.id)))
          : Promise.resolve({ data: [] as MarketCommentLikeRow[] }),
      ]);
      const usersById = new Map(((users ?? []) as UserProfileRow[]).map((u) => [String(u.id), u]));
      const likesByComment = new Map<string, Set<string>>();
      for (const like of (likes ?? []) as MarketCommentLikeRow[]) {
        const commentId = String(like.comment_id);
        const userId = String(like.user_id);
        const set = likesByComment.get(commentId) ?? new Set<string>();
        set.add(userId);
        likesByComment.set(commentId, set);
      }

      return commentRows.map((c) => {
        const author = usersById.get(String(c.user_id));
        const likeSet = likesByComment.get(String(c.id)) ?? new Set<string>();
        return {
          id: String(c.id),
          marketId: String(c.market_id),
          userId: String(c.user_id),
          parentId: c.parent_id ? String(c.parent_id) : null,
          body: String(c.body ?? ""),
          createdAt: new Date(String(c.created_at)).toISOString(),
          authorName: String(author?.display_name ?? author?.username ?? "User"),
          authorUsername: author?.username ? String(author.username) : null,
          authorAvatarUrl: author?.avatar_url ?? author?.telegram_photo_url ?? null,
          likesCount: likeSet.size,
          likedByMe: authUser ? likeSet.has(authUser.id) : false,
        };
      });
    }),

  postMarketComment: publicProcedure
    .input(
      z.object({
        marketId: z.string().min(1),
        provider: z.enum(["polymarket", "limitless"]).optional(),
        body: z.string().min(1).max(2000),
        parentId: z.string().nullable().optional(),
      })
    )
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const body = input.body.trim();
      if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body is required" });
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const marketRefId = await resolveMarketCatalogRefId(
        ctx.supabaseService,
        ref.provider,
        ref.providerMarketId
      );

      const inserted = await (supabaseService as any)
        .from("market_comments")
        .insert({
          market_id: input.marketId,
          market_ref_id: marketRefId,
          user_id: authUser.id,
          parent_id: input.parentId ?? null,
          body,
        })
        .select("id, market_id, user_id, parent_id, body, created_at")
        .single();
      if (inserted.error || !inserted.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: inserted.error?.message ?? "Failed to post comment" });
      }

      const profile = await supabaseService
        .from("users")
        .select("display_name, username, avatar_url, telegram_photo_url")
        .eq("id", authUser.id)
        .maybeSingle();
      const p = profile.data ?? null;
      return {
        id: String(inserted.data.id),
        marketId: String(inserted.data.market_id),
        userId: String(inserted.data.user_id),
        parentId: inserted.data.parent_id ? String(inserted.data.parent_id) : null,
        body: String(inserted.data.body ?? body),
        createdAt: new Date(String(inserted.data.created_at)).toISOString(),
        authorName: String(p?.display_name ?? p?.username ?? authUser.username ?? "User"),
        authorUsername: p?.username ? String(p.username) : null,
        authorAvatarUrl: p?.avatar_url ?? p?.telegram_photo_url ?? null,
        likesCount: 0,
        likedByMe: false,
      };
    }),

  toggleMarketCommentLike: publicProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .output(z.object({ commentId: z.string(), liked: z.boolean(), likesCount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const existing = await supabaseService
        .from("market_comment_likes")
        .select("comment_id, user_id")
        .eq("comment_id", input.commentId)
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existing.error.message });

      const liked = !existing.data;
      if (liked) {
        const ins = await supabaseService.from("market_comment_likes").insert({
          comment_id: input.commentId,
          user_id: authUser.id,
        });
        if (ins.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
      } else {
        const del = await supabaseService
          .from("market_comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", authUser.id);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }

      const countRes = await supabaseService
        .from("market_comment_likes")
        .select("comment_id", { count: "exact", head: true })
        .eq("comment_id", input.commentId);
      return {
        commentId: input.commentId,
        liked,
        likesCount: Number(countRes.count ?? 0),
      };
    }),

  myComments: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).optional() }).optional())
    .output(z.array(myCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const limit = input?.limit ?? 100;
      const { data, error } = await supabaseService
        .from("market_comments")
        .select("id, market_id, parent_id, body, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = (data ?? []) as MarketCommentRow[];
      const ids = Array.from(new Set(rows.map((r) => String(r.market_id))));
      const marketTitles = await Promise.all(
        ids.map(async (id) => {
          const ref = parseVenueMarketRef(id);
          if (ref.provider === "polymarket") {
            const market = await getMarketFromMirrorOrLive(supabaseService, ref.providerMarketId);
            return [id, market?.title ?? null] as const;
          }
          const adapter = getVenueAdapter(ref.provider);
          if (!adapter.isEnabled()) return [id, null] as const;
          const market = await adapter.getMarketById(ref.providerMarketId);
          return [id, market?.title ?? null] as const;
        })
      );
      const marketTitlesById = new Map<string, string | null>(marketTitles);

      const likeCountsRes = await supabaseService
        .from("market_comment_likes")
        .select("comment_id")
        .in("comment_id", rows.map((r) => String(r.id)));
      const likesByComment = new Map<string, number>();
      for (const like of (likeCountsRes.data ?? []) as Pick<MarketCommentLikeRow, "comment_id">[]) {
        const key = String(like.comment_id);
        likesByComment.set(key, (likesByComment.get(key) ?? 0) + 1);
      }

      return rows.map((r) => {
        const title = marketTitlesById.get(String(r.market_id)) ?? "Market";
        return {
          id: String(r.id),
          marketId: String(r.market_id),
          parentId: r.parent_id ? String(r.parent_id) : null,
          body: String(r.body ?? ""),
          createdAt: new Date(String(r.created_at)).toISOString(),
          marketTitleRu: title,
          marketTitleEn: title,
          likesCount: likesByComment.get(String(r.id)) ?? 0,
        };
      });
    }),

});
