import "server-only";
import { TRPCError } from "@trpc/server";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { authenticatedProcedure, publicProcedure, router } from "../trpc";
import { assertCsrfForMutation } from "../../security/csrf";
import {
  API_VERSION_V1,
  DEFAULT_MARKET_ACTIVITY_LIMIT,
  DEFAULT_MARKET_COMMENT_LIMIT,
  DEFAULT_MARKET_LIST_PAGE_SIZE,
  DEFAULT_MARKET_SEARCH_LIMIT,
  DEFAULT_MARKET_SIMILAR_LIMIT,
  DEFAULT_PUBLIC_TRADES_LIMIT,
  MAX_MARKET_ACTIVITY_LIMIT,
  MAX_MARKET_LIST_CANDIDATE_LIMIT,
  MAX_MARKET_LIST_PAGE_SIZE,
  MAX_MARKET_LIVE_HYDRATION_LIMIT,
  MAX_MARKET_SEARCH_LIMIT,
  MAX_MARKET_SIMILAR_LIMIT,
} from "@/src/lib/constants";
import {
  type CandleInterval,
  type LimitlessTradeMetaOutput,
  type LiveActivityTickOutput,
  type MarketCategoryOutput,
  type MarketOutput,
  type PriceCandleOutput,
  type PublicTradeOutput,
  enabledProvidersOutput,
  generateMarketContextInput,
  getLiveActivityInput,
  getMarketCommentsInput,
  getMarketInput,
  getOrderbookInput,
  getPriceCandlesInput,
  getPublicTradesInput,
  getSimilarMarketsInput,
  liveActivityTickOutput,
  liveActivityTickOutputArray,
  listMarketCategoriesInput,
  listMarketsInput,
  marketBookmarkOutputArray,
  marketCategoryOutputArray,
  marketCommentOutput,
  marketCommentOutputArray,
  marketContextOutput,
  marketListV1Output,
  marketOrderbookOutput,
  marketOutput,
  marketOutputArray,
  marketPageOutput,
  myCommentOutputArray,
  myCommentsInput,
  postMarketCommentInput,
  priceCandleOutputArray,
  publicTradeOutputArray,
  relaySignedOrderInput,
  relaySignedOrderOutput,
  searchSemanticInput,
  setBookmarkInput,
  setBookmarkOutput,
  similarMarketsV1Output,
  toggleMarketCommentLikeInput,
  toggleMarketCommentLikeOutput,
} from "@/src/lib/validations/market";
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
  listEnabledProviders as listEnabledVenueProviders,
} from "../../venues/registry";
import {
  parseVenueMarketRef,
  type VenueApiCreds,
  type VenueMarket,
  type VenueProvider,
  venueToCanonicalId,
} from "../../venues/types";
import { upsertProviderSyncState, upsertVenueMarketsToCatalog } from "../../venues/catalogStore";
import { getTrustedClientIpFromRequest } from "../../http/ip";
import { consumeDurableRateLimit } from "../../security/rateLimit";
import {
  incrementRealtimeMetricCounter,
  recordRealtimeMetricTiming,
} from "../../observability/realtimeMetrics";
import {
  buildMarketDetailCacheKey,
  buildMarketListCacheKey,
  buildMarketTradesCacheKey,
  readUpstashActivityTicks,
  readUpstashCache,
  upstashMarketDetailTtlSec,
  upstashMarketListTtlSec,
  upstashMarketTradesTtlSec,
  writeUpstashCache,
} from "../../cache/upstash";
import {
  getCanonicalOrderbook,
  getCanonicalMarket,
  getCanonicalPriceCandles,
  getPublicEnabledProviders,
  isCatalogReadError,
  listCanonicalMarkets,
  listCanonicalProviderMarkets,
  resolveMarketCatalogRefId,
} from "../../markets/readService";
import {
  computeEffectiveVolumeRaw,
  pickBinaryOutcomes,
  pickYesLikeOutcome,
  resolveReliableBinaryPrice,
  roundPercentValue,
} from "../../../lib/marketPresentation";
import { extractTotalVolumeFromPayload } from "../../../lib/marketVolumePayload";

const ENABLE_CATALOG_SYNC_ON_READ =
  (process.env.ENABLE_CATALOG_SYNC_ON_READ || "").trim().toLowerCase() === "true";

const CATEGORY_ROWS_CACHE_TTL_MS = Math.max(10_000, Number(process.env.MARKET_CATEGORIES_CACHE_TTL_MS ?? 60_000));
const cachedCategoryRowsByProviderKey = new Map<
  string,
  { expiresAt: number; rows: MarketCategoryOutput[] }
>();

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

const inferFastMarketFlags = (params: { title: string; closesAt: string }): { isFastMarket: boolean; catalogBucket: "main" | "fast" } => {
  return {
    isFastMarket: true,
    catalogBucket: "main",
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

const sortCategoryRows = (categories: Map<string, string>): MarketCategoryOutput[] =>
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
  const { yes, no } = pickBinaryOutcomes(outcomes);
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

  const priceYes = resolveReliableBinaryPrice({
    fallbackPrice: yes ? yes.price : 0.5,
  });
  const priceNo = no ? no.price : clamp01(1 - priceYes);
  const { isFastMarket, catalogBucket } = inferFastMarketFlags({
    title: market.title,
    closesAt: market.closesAt,
  });

  return {
    id: market.id,
    provider: "polymarket" as const,
    providerMarketId: market.id,
    canonicalMarketId: venueToCanonicalId("polymarket", market.id),
    marketRefId: null,
    snapshotId: null,
    liveSeq: null,
    compareGroupId: null,
    compareGroup: null,
    isFastMarket,
    catalogBucket,
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
    priceYes,
    priceNo,
    volume: market.volume,
    totalVolumeUsd: market.volume,
    chance: roundPercentValue(priceYes),
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
    freshness: {
      sourceTs: null,
      stale: false,
    },
    orderbookFreshness: null,
    tradeMeta: null,
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
  const { yes, no } = pickBinaryOutcomes(sortedOutcomes);
  const category = categoryMetaFromRaw(market.category);
  const resolved = market.state === "resolved" ? market.resolvedOutcomeTitle : null;
  const resolvedMatch = resolved
    ? sortedOutcomes.find((outcome) => outcome.title.toLowerCase() === resolved.toLowerCase()) ?? null
    : null;
  const priceYes = resolveReliableBinaryPrice({
    fallbackPrice: yes ? yes.price : 0.5,
  });
  const priceNo = no ? no.price : clamp01(1 - priceYes);
  const { isFastMarket, catalogBucket } = inferFastMarketFlags({
    title: market.title,
    closesAt: market.closesAt,
  });

  return {
    id: outputId,
    provider: market.provider,
    providerMarketId: market.providerMarketId,
    canonicalMarketId: venueToCanonicalId(market.provider, market.providerMarketId),
    marketRefId: null,
    snapshotId: null,
    liveSeq: null,
    compareGroupId: null,
    compareGroup: null,
    isFastMarket,
    catalogBucket,
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
    priceYes,
    priceNo,
    volume: market.volume,
    totalVolumeUsd: market.volume,
    chance: roundPercentValue(priceYes),
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
    freshness: {
      sourceTs: null,
      stale: false,
    },
    orderbookFreshness: null,
    tradeMeta: market.tradeMeta ?? null,
  };
};

const getMarketFromMirrorOrLive = async (
  supabaseService: SupabaseServiceClient,
  marketId: string
): Promise<PolymarketMarket | null> => {
  const preferMirror = await isPolymarketWorkerFresh(supabaseService).catch(() => false);

  if (preferMirror) {
    try {
      const mirrored = await getMirroredPolymarketMarketById(supabaseService, marketId);
      if (mirrored) return mirrored;
    } catch (err) {
      console.warn("Mirror getMarket failed while worker marked fresh, trying live", err);
    }
  }

  try {
    const live = await getPolymarketMarketById(marketId);
    if (live) {
      try {
        await upsertMirroredPolymarketMarkets(supabaseService, [live]);
      } catch (err) {
        console.warn("Mirror upsert after live getMarket failed", err);
      }
      return live;
    }
  } catch (err) {
    console.warn("Live getMarket failed, falling back to mirror", err);
  }

  try {
    const mirrored = await getMirroredPolymarketMarketById(supabaseService, marketId);
    if (mirrored) return mirrored;
  } catch (err) {
    console.warn("Mirror getMarket failed", err);
  }
  return null;
};

type TimeoutOutcome<T> = { kind: "ok"; value: T } | { kind: "timeout" };

const waitForWithTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<TimeoutOutcome<T>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve({ kind: "ok", value });
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });

const POLYMARKET_LIVE_LIST_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.POLYMARKET_LIVE_LIST_TIMEOUT_MS ?? 1_800)
);

const listMarketsFromMirrorOrLive = async (
  supabaseService: SupabaseServiceClient,
  params: { onlyOpen: boolean; limit: number; sortBy: "newest" | "volume" }
): Promise<PolymarketMarket[]> => {
  const [preferMirror, mirrored] = await Promise.all([
    isPolymarketWorkerFresh(supabaseService).catch(() => false),
    listMirroredPolymarketMarkets(supabaseService, {
      onlyOpen: params.onlyOpen,
      limit: params.limit,
      sortBy: params.sortBy === "newest" ? "created_desc" : "volume",
    }).catch((err) => {
      console.warn("Mirror listMarkets prefetch failed", err);
      return [] as PolymarketMarket[];
    }),
  ]);
  const filterRows = (rows: PolymarketMarket[]) =>
    params.onlyOpen ? rows.filter((m) => m.state === "open") : rows;
  const sortRows = (rows: PolymarketMarket[]) =>
    [...rows].sort((a, b) =>
      params.sortBy === "newest"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : Number(b.volume ?? 0) - Number(a.volume ?? 0)
    );

  if (preferMirror && mirrored.length > 0) {
    return filterRows(mirrored);
  }

  const livePromise = listPolymarketMarkets(params.limit, { hydrateMidpoints: false }).then(async (live) => {
    if (live.length > 0) {
      try {
        await upsertMirroredPolymarketMarkets(supabaseService, live);
      } catch (err) {
        console.warn("Mirror upsert after live listMarkets failed", err);
      }
    }
    return sortRows(live);
  });

  if (mirrored.length > 0) {
    try {
      const liveAttempt = await waitForWithTimeout(livePromise, POLYMARKET_LIVE_LIST_TIMEOUT_MS);
      if (liveAttempt.kind === "timeout") {
        void livePromise.catch((err) => {
          console.warn("Live listMarkets background refresh failed", err);
        });
        return filterRows(mirrored);
      }
      if (liveAttempt.value.length === 0) return filterRows(mirrored);
      return filterRows(liveAttempt.value);
    } catch (err) {
      console.warn("Live listMarkets failed, serving stale mirrored markets", err);
      return filterRows(mirrored);
    }
  }

  try {
    const live = await livePromise;
    return filterRows(live);
  } catch (err) {
    if (mirrored.length > 0) {
      console.warn("Live listMarkets failed, serving stale mirrored markets", err);
      return filterRows(mirrored);
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
type MarketTickRow = Pick<
  Database["public"]["Tables"]["polymarket_market_ticks"]["Row"],
  "id" | "market_id" | "trade_id" | "side" | "outcome" | "price" | "size" | "notional" | "source_ts" | "created_at"
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
type MarketFreshness = {
  sourceTs: string | null;
  stale: boolean;
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

const hasSuspiciousBinaryPresentation = (row: MarketOutput): boolean => {
  if ((row.marketType ?? "binary") !== "binary") return false;
  if (row.state !== "open") return false;
  const chance = Number(row.chance ?? NaN);
  const suspiciousChance = chance === 0 || chance === 50 || chance === 100;
  const hasLiveSignal =
    row.bestBid !== null ||
    row.bestAsk !== null ||
    row.mid !== null ||
    row.lastTradePrice !== null;
  return suspiciousChance && !hasLiveSignal;
};

const shouldPreferLiveHydratedRow = (
  current: MarketOutput,
  live: MarketOutput
): boolean => {
  if (Number(live.volume ?? 0) > Number(current.volume ?? 0)) return true;
  if (!hasSuspiciousBinaryPresentation(current)) return false;
  return (
    Number(live.chance ?? NaN) !== Number(current.chance ?? NaN) ||
    Number(live.priceYes ?? NaN) !== Number(current.priceYes ?? NaN) ||
    Number(live.priceNo ?? NaN) !== Number(current.priceNo ?? NaN)
  );
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
  const nextYes = isBinary
    ? resolveReliableBinaryPrice({
        mid: live.mid,
        bestBid: live.bestBid,
        bestAsk: live.bestAsk,
        lastTradePrice: live.lastTradePrice,
        fallbackPrice: market.priceYes,
      })
    : market.priceYes;
  const nextNo = isBinary ? Math.max(0, Math.min(1, 1 - nextYes)) : market.priceNo;
  const liveChance = isBinary ? roundPercentValue(nextYes) : market.chance;
  const totalVolumeUsd =
    typeof market.totalVolumeUsd === "number" && Number.isFinite(market.totalVolumeUsd)
      ? market.totalVolumeUsd
      : market.volume;

  return {
    ...market,
    priceYes: nextYes,
    priceNo: nextNo,
    chance: liveChance,
    bestBid: live.bestBid,
    bestAsk: live.bestAsk,
    mid: live.mid,
    lastTradePrice: live.lastTradePrice,
    lastTradeSize: live.lastTradeSize,
    volume: totalVolumeUsd,
    totalVolumeUsd,
    rolling24hVolume: live.rolling24hVolume,
    openInterest: live.openInterest,
    liveUpdatedAt: live.sourceTs,
    freshness: buildMarketFreshness("polymarket", live.sourceTs),
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

const WORKER_FRESHNESS_CACHE_MS = Math.max(
  1_000,
  Number(process.env.WORKER_FRESHNESS_CACHE_MS ?? 5_000)
);
const POLYMARKET_WORKER_STALE_AFTER_MS = Math.max(
  15_000,
  Number(process.env.POLYMARKET_WORKER_STALE_AFTER_MS ?? 45_000)
);
const LIMITLESS_WORKER_STALE_AFTER_MS = Math.max(
  15_000,
  Number(process.env.LIMITLESS_WORKER_STALE_AFTER_MS ?? 90_000)
);

let polymarketWorkerFreshnessSnapshot: { checkedAt: number; isFresh: boolean } | null = null;
let limitlessWorkerFreshnessSnapshot: { checkedAt: number; isFresh: boolean } | null = null;

const isTimestampFresh = (
  isoValue: string | null | undefined,
  staleAfterMs: number,
  now = Date.now()
): boolean => {
  if (!isoValue) return false;
  const parsed = Date.parse(isoValue);
  if (!Number.isFinite(parsed)) return false;
  return now - parsed <= staleAfterMs;
};

const buildMarketFreshness = (
  provider: VenueProvider,
  sourceTs: string | null | undefined
): MarketFreshness => {
  const iso = typeof sourceTs === "string" && sourceTs.trim().length > 0 ? sourceTs : null;
  const staleAfterMs =
    provider === "polymarket" ? POLYMARKET_WORKER_STALE_AFTER_MS : LIMITLESS_WORKER_STALE_AFTER_MS;

  return {
    sourceTs: iso,
    stale: iso ? !isTimestampFresh(iso, staleAfterMs) : false,
  };
};

const isPolymarketWorkerFresh = async (
  supabaseService: SupabaseServiceClient
): Promise<boolean> => {
  const now = Date.now();
  if (
    polymarketWorkerFreshnessSnapshot &&
    now - polymarketWorkerFreshnessSnapshot.checkedAt <= WORKER_FRESHNESS_CACHE_MS
  ) {
    return polymarketWorkerFreshnessSnapshot.isFresh;
  }

  try {
    const providerState = await (supabaseService as any)
      .from("provider_sync_state")
      .select("last_success_at")
      .eq("provider", "polymarket")
      .in("scope", ["catalog", "live", "snapshot", "open"])
      .order("last_success_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const syncIso = String(providerState.data?.last_success_at ?? "").trim() || null;
    if (isTimestampFresh(syncIso, POLYMARKET_WORKER_STALE_AFTER_MS, now)) {
      polymarketWorkerFreshnessSnapshot = { checkedAt: now, isFresh: true };
      return true;
    }
  } catch {
    // Continue to table-based fallbacks.
  }

  try {
    const liveHead = await supabaseService
      .from("polymarket_market_live")
      .select("source_ts")
      .order("source_ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isTimestampFresh(liveHead.data?.source_ts ?? null, POLYMARKET_WORKER_STALE_AFTER_MS, now)) {
      polymarketWorkerFreshnessSnapshot = { checkedAt: now, isFresh: true };
      return true;
    }
  } catch {
    // Continue to mirror freshness fallback.
  }

  try {
    const mirrorHead = await supabaseService
      .from("polymarket_market_cache")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isFresh = isTimestampFresh(
      mirrorHead.data?.last_synced_at ?? null,
      POLYMARKET_WORKER_STALE_AFTER_MS,
      now
    );
    polymarketWorkerFreshnessSnapshot = { checkedAt: now, isFresh };
    return isFresh;
  } catch {
    polymarketWorkerFreshnessSnapshot = { checkedAt: now, isFresh: false };
    return false;
  }
};

const isLimitlessWorkerFresh = async (
  supabaseService: SupabaseServiceClient
): Promise<boolean> => {
  const now = Date.now();
  if (
    limitlessWorkerFreshnessSnapshot &&
    now - limitlessWorkerFreshnessSnapshot.checkedAt <= WORKER_FRESHNESS_CACHE_MS
  ) {
    return limitlessWorkerFreshnessSnapshot.isFresh;
  }

  try {
    const providerState = await (supabaseService as any)
      .from("provider_sync_state")
      .select("last_success_at")
      .eq("provider", "limitless")
      .in("scope", ["catalog", "live", "snapshot", "open"])
      .order("last_success_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const syncIso = String(providerState.data?.last_success_at ?? "").trim() || null;
    if (isTimestampFresh(syncIso, LIMITLESS_WORKER_STALE_AFTER_MS, now)) {
      limitlessWorkerFreshnessSnapshot = { checkedAt: now, isFresh: true };
      return true;
    }
  } catch {
    // Continue to market_live fallback.
  }

  try {
    const liveHead = await (supabaseService as any)
      .from("market_live")
      .select("source_ts")
      .order("source_ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sourceTs = String(liveHead.data?.source_ts ?? "").trim() || null;
    const isFresh = isTimestampFresh(sourceTs, LIMITLESS_WORKER_STALE_AFTER_MS, now);
    limitlessWorkerFreshnessSnapshot = { checkedAt: now, isFresh };
    return isFresh;
  } catch {
    limitlessWorkerFreshnessSnapshot = { checkedAt: now, isFresh: false };
    return false;
  }
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
): LimitlessTradeMetaOutput | null => {
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

  const collateralTokenDecimals = Math.max(
    1,
    Math.trunc(
      readNumericValue(
        readStringFromPayloadPath(payload, ["collateralToken", "decimals"]) ??
          readStringFromPayloadPath(payload, ["collateral_token", "decimals"]) ??
          readStringFromPayloadPath(payload, ["collateralTokenDecimals"]) ??
          6
      ) ?? 6
    )
  );
  const minOrderSize = readNumericValue(
    readStringFromPayloadPath(payload, ["settings", "minSize"]) ??
      readStringFromPayloadPath(payload, ["settings", "min_size"]) ??
      readStringFromPayloadPath(payload, ["minSize"]) ??
      readStringFromPayloadPath(payload, ["min_size"])
  );

  return {
    marketSlug,
    exchangeAddress,
    adapterAddress:
      readStringFromPayloadPath(payload, ["venue", "adapter"]) ??
      readStringFromPayloadPath(payload, ["adapterAddress"]) ??
      readStringFromPayloadPath(payload, ["adapter_address"]),
    collateralTokenAddress,
    collateralTokenDecimals,
    minOrderSize: minOrderSize === null ? null : Math.max(0, minOrderSize),
    positionIds: [positionIds[0]!, positionIds[1]!],
  };
};

const readNumericValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const compact = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([kmb])$/i);
    if (compact) {
      const base = Number(compact[1]);
      const suffix = compact[2].toLowerCase();
      const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
      const out = base * multiplier;
      if (Number.isFinite(out)) return out;
    }
    const normalized = trimmed.replace(/[$,%_\s]/g, "").replace(/,/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const readVolumeFromPayload = (payload: Record<string, unknown> | null): number | null => {
  return extractTotalVolumeFromPayload(payload);
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

const listLocalCandles = async (
  supabaseService: SupabaseServiceClient,
  marketId: string,
  limit: number
): Promise<PriceCandleOutput[]> => {
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
  outcomeKey: string | null = "__market__"
): Promise<PriceCandleOutput[]> => {
  if (!marketRefId) return [];

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

  return [...data]
    .reverse()
    .map((row: Record<string, unknown>) => {
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
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close)
    );
};

type PriceCandleRow = PriceCandleOutput;

const CANDLE_MIN_POINTS_FOR_COVERAGE = Math.max(
  24,
  Number(process.env.CANDLE_MIN_POINTS_FOR_COVERAGE ?? 72)
);
const CANDLE_MIN_SPAN_MS_FOR_COVERAGE = Math.max(
  60 * 60 * 1000,
  Number(process.env.CANDLE_MIN_SPAN_MS_FOR_COVERAGE ?? 12 * 60 * 60 * 1000)
);
const CANDLE_MIN_POINTS_FOR_1M_COVERAGE = Math.max(
  10,
  Number(process.env.CANDLE_MIN_POINTS_FOR_1M_COVERAGE ?? 60)
);
const CANDLE_MIN_SPAN_MS_FOR_1M_COVERAGE = Math.max(
  5 * 60 * 1000,
  Number(process.env.CANDLE_MIN_SPAN_MS_FOR_1M_COVERAGE ?? 30 * 60 * 1000)
);

const CANDLE_RESOLUTION_MS: Record<CandleInterval, number> = {
  "1m": 60 * 1000,
  "1h": 60 * 60 * 1000,
};

const candleTs = (row: PriceCandleRow): number => Date.parse(String(row.bucket));

const candleSpanMs = (rows: PriceCandleRow[]): number => {
  if (rows.length <= 1) return 0;
  const sortedTs = rows
    .map(candleTs)
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (sortedTs.length <= 1) return 0;
  const first = sortedTs[0] ?? 0;
  const last = sortedTs[sortedTs.length - 1] ?? 0;
  return Math.max(0, last - first);
};

const isSparseCandleCoverage = (rows: PriceCandleRow[], interval: CandleInterval): boolean => {
  if (interval === "1m") {
    return (
      rows.length < CANDLE_MIN_POINTS_FOR_1M_COVERAGE ||
      candleSpanMs(rows) < CANDLE_MIN_SPAN_MS_FOR_1M_COVERAGE
    );
  }
  return rows.length < CANDLE_MIN_POINTS_FOR_COVERAGE || candleSpanMs(rows) < CANDLE_MIN_SPAN_MS_FOR_COVERAGE;
};

const selectCandleResolutionMs = (interval: CandleInterval): number =>
  CANDLE_RESOLUTION_MS[interval];

const aggregateCandles = (
  rows: PriceCandleRow[],
  resolutionMs: number
): PriceCandleRow[] => {
  if (rows.length === 0) return [];
  const safeResolution = Math.max(60 * 1000, resolutionMs);
  const byBucket = new Map<string, PriceCandleRow>();

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
      volume:
        (Number.isFinite(existing.volume) ? existing.volume : 0) +
        (Number.isFinite(row.volume) ? row.volume : 0),
      tradesCount:
        (Number.isFinite(existing.tradesCount) ? existing.tradesCount : 0) +
        (Number.isFinite(row.tradesCount) ? row.tradesCount : 0),
    });
  }

  return Array.from(byBucket.values()).sort((a, b) => candleTs(a) - candleTs(b));
};

const normalizeCandlesForChart = (
  rows: PriceCandleRow[],
  limit: number,
  interval: CandleInterval
): PriceCandleRow[] => {
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
  const resolutionMs = selectCandleResolutionMs(interval);
  const aggregated = aggregateCandles(sorted, resolutionMs);
  return aggregated.slice(Math.max(0, aggregated.length - limit));
};

const candleMovementScore = (rows: PriceCandleRow[]): number => {
  if (rows.length === 0) return 0;
  const closes = new Set<number>();
  let minLow = Number.POSITIVE_INFINITY;
  let maxHigh = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const close = Number(row.close);
    const high = Number(row.high);
    const low = Number(row.low);
    if (Number.isFinite(close)) closes.add(Number(close.toFixed(4)));
    if (Number.isFinite(high)) maxHigh = Math.max(maxHigh, high);
    if (Number.isFinite(low)) minLow = Math.min(minLow, low);
  }

  const range = Number.isFinite(maxHigh) && Number.isFinite(minLow) ? Math.max(0, maxHigh - minLow) : 0;
  return closes.size + range * 100;
};

const pickBetterCandleSet = (a: PriceCandleRow[], b: PriceCandleRow[]): PriceCandleRow[] => {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const aMovement = candleMovementScore(a);
  const bMovement = candleMovementScore(b);
  const aHasMeaningfulMovement = aMovement >= 2.5;
  const bHasMeaningfulMovement = bMovement >= 2.5;
  if (aHasMeaningfulMovement !== bHasMeaningfulMovement) {
    return bHasMeaningfulMovement ? b : a;
  }
  if (Math.abs(bMovement - aMovement) >= 1.5) {
    return bMovement > aMovement ? b : a;
  }
  const aSpan = candleSpanMs(a);
  const bSpan = candleSpanMs(b);
  if (bSpan > aSpan) return b;
  if (aSpan > bSpan) return a;
  return b.length > a.length ? b : a;
};

const BASELINE_CANDLE_POINTS_MIN_BY_INTERVAL: Record<CandleInterval, number> = {
  "1m": 60,
  "1h": 16,
};
const BASELINE_CANDLE_POINTS_MAX_BY_INTERVAL: Record<CandleInterval, number> = {
  "1m": 360,
  "1h": 72,
};

const buildBaselineBuckets = (limit: number, interval: CandleInterval): string[] => {
  const points = Math.max(
    BASELINE_CANDLE_POINTS_MIN_BY_INTERVAL[interval],
    Math.min(BASELINE_CANDLE_POINTS_MAX_BY_INTERVAL[interval], limit)
  );
  const now = Date.now();
  const resolutionMs = CANDLE_RESOLUTION_MS[interval];
  const alignedNow = Math.floor(now / resolutionMs) * resolutionMs;
  const firstTs = alignedNow - (points - 1) * resolutionMs;
  return Array.from({ length: points }, (_, idx) =>
    new Date(firstTs + idx * resolutionMs).toISOString()
  );
};

const buildFlatBaselineCandles = (
  limit: number,
  price: number,
  outcomeId: string | null,
  outcomeTitle: string | null,
  interval: CandleInterval
): PriceCandleRow[] => {
  const safePrice = clamp01(Number.isFinite(price) ? price : 0.5);
  return buildBaselineBuckets(limit, interval).map((bucket) => ({
    bucket,
    outcomeId,
    outcomeTitle,
    outcomeColor: null,
    open: safePrice,
    high: safePrice,
    low: safePrice,
    close: safePrice,
    volume: 0,
    tradesCount: 0,
  }));
};

const buildBaselineCandlesFromPolymarketMarket = (
  market: PolymarketMarket,
  limit: number,
  interval: CandleInterval
): PriceCandleRow[] => {
  const outcomes = market.outcomes.filter(
    (outcome) => Number.isFinite(outcome.price)
  );
  if (outcomes.length === 0) {
    return buildFlatBaselineCandles(limit, 0.5, null, null, interval);
  }
  if (outcomes.length > 2) {
    return outcomes.flatMap((outcome) =>
      buildFlatBaselineCandles(limit, outcome.price, outcome.id, outcome.title, interval)
    );
  }
  const yesOutcome = pickYesLikeOutcome(outcomes);
  const yesPrice = yesOutcome ? yesOutcome.price : outcomes[0]?.price ?? 0.5;
  return buildFlatBaselineCandles(limit, yesPrice, null, null, interval);
};

const buildBaselineCandlesFromVenueMarket = (
  market: VenueMarket,
  limit: number,
  interval: CandleInterval
): PriceCandleRow[] => {
  const outcomes = market.outcomes.filter((outcome) =>
    Number.isFinite(outcome.price)
  );
  if (outcomes.length === 0) {
    return buildFlatBaselineCandles(limit, 0.5, null, null, interval);
  }
  if (outcomes.length > 2) {
    return outcomes.flatMap((outcome) =>
      buildFlatBaselineCandles(limit, outcome.price, outcome.id, outcome.title, interval)
    );
  }
  const yesOutcome = pickYesLikeOutcome(outcomes);
  const yesPrice = yesOutcome ? yesOutcome.price : outcomes[0]?.price ?? 0.5;
  return buildFlatBaselineCandles(limit, yesPrice, null, null, interval);
};

export const __marketRouterTestUtils = {
  normalizeCategoryId,
  categoryMetaFromRaw,
  sortMarketRows,
  readVolumeFromPayload,
  pickBetterCandleSet,
  selectCandleResolutionMs,
  normalizeCandlesForChart,
  normalizePublicEnabledProviders,
};

const listLocalLiveActivityTicks = async (
  supabaseService: SupabaseServiceClient,
  marketId: string,
  limit: number
): Promise<LiveActivityTickOutput[]> => {
  if (!marketId) return [];
  const safeLimit = Math.max(1, Math.min(limit, 200));
  const { data, error } = await supabaseService
    .from("polymarket_market_ticks")
    .select("id, market_id, trade_id, side, outcome, price, size, notional, source_ts, created_at")
    .eq("market_id", marketId)
    .order("source_ts", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  const out: LiveActivityTickOutput[] = [];
  for (const row of data as MarketTickRow[]) {
    const sideRaw = typeof row.side === "string" ? row.side.toUpperCase() : "UNKNOWN";
    const side: "BUY" | "SELL" | "UNKNOWN" =
      sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : "UNKNOWN";
    const price = Number(row.price ?? 0);
    const size = Number(row.size ?? 0);
    const notional = Number(row.notional ?? price * size);
    if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(notional)) continue;

    const parsed = liveActivityTickOutput.safeParse({
      id: String(row.id),
      marketId: row.market_id,
      tradeId: row.trade_id ?? null,
      side,
      outcome: row.outcome ?? null,
      price,
      size,
      notional,
      sourceTs: row.source_ts,
      createdAt: row.created_at,
    });
    if (parsed.success) {
      out.push(parsed.data);
    }
  }

  return out;
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

const relayRateLimitMap = new Map<string, { count: number; resetAt: number }>();

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

const buildProviderSelectionCacheKey = (providers: VenueProvider[]): string => {
  const deduped = Array.from(new Set(providers));
  return deduped.sort().join(",") || "none";
};

const collectCategoryValuesFromRows = (
  categories: Map<string, string>,
  rows: unknown[] | null | undefined,
  column: string
) => {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const rec = asObject(row);
    if (!rec) continue;
    addCategoryValue(categories, rec[column]);
  }
};

const loadDynamicCategoryRows = async (
  supabaseService: unknown,
  providers: VenueProvider[]
): Promise<MarketCategoryOutput[]> => {
  const categories = new Map<string, string>();
  const selectedProviders = Array.from(new Set(providers));

  if (supabaseService && selectedProviders.length > 0) {
    await Promise.all(
      selectedProviders.map(async (provider) => {
        try {
          const { data, error } = await (supabaseService as any)
            .from("market_catalog")
            .select("category")
            .eq("provider", provider)
            .eq("state", "open")
            .not("category", "is", null)
            .order("source_updated_at", { ascending: false })
            .limit(5000);
          if (!error) {
            collectCategoryValuesFromRows(categories, data, "category");
          }
        } catch {
          // Continue with fallback sources.
        }
      })
    );
  }

  if (supabaseService && selectedProviders.includes("polymarket")) {
    try {
      const { data, error } = await (supabaseService as any)
        .from("polymarket_market_cache")
        .select("category")
        .eq("state", "open")
        .not("category", "is", null)
        .order("source_updated_at", { ascending: false })
        .limit(5000);
      if (!error) {
        collectCategoryValuesFromRows(categories, data, "category");
      }
    } catch {
      // Continue with adapter/API fallback.
    }
  }

  if (categories.size === 0) {
    await Promise.all(
      selectedProviders.map(async (provider) => {
        if (provider === "polymarket") {
          try {
            const liveMarkets = await listPolymarketMarkets(500, { hydrateMidpoints: false });
            for (const market of liveMarkets) {
              addCategoryValue(categories, market.category);
            }
          } catch {
            // Best-effort fallback.
          }
          return;
        }

        try {
          const adapter = getVenueAdapter(provider);
          if (!adapter.isEnabled()) return;
          const snapshot = await adapter.listMarketsSnapshot({ onlyOpen: true, limit: 600 });
          for (const market of snapshot) {
            addCategoryValue(categories, market.category);
          }
        } catch {
          // Best-effort fallback.
        }
      })
    );
  }

  return sortCategoryRows(categories);
};

const getCachedDynamicCategoryRows = async (
  supabaseService: unknown,
  providers: VenueProvider[]
): Promise<MarketCategoryOutput[]> => {
  const now = Date.now();
  const cacheKey = buildProviderSelectionCacheKey(providers);
  const cached = cachedCategoryRowsByProviderKey.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.rows;
  }
  const rows = await loadDynamicCategoryRows(supabaseService, providers);
  cachedCategoryRowsByProviderKey.set(cacheKey, {
    rows,
    expiresAt: now + CATEGORY_ROWS_CACHE_TTL_MS,
  });
  return rows;
};

function normalizePublicEnabledProviders(
  providers: Array<VenueProvider | string | null | undefined>
): Array<"polymarket" | "limitless"> {
  const out = Array.from(
    new Set(
      providers.filter(
        (provider): provider is "polymarket" | "limitless" =>
          provider === "polymarket" || provider === "limitless"
      )
    )
  );
  return out.length > 0 ? out : ["polymarket"];
}

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

const attachMarketCatalogRefIds = async (
  supabaseService: unknown,
  rows: MarketOutput[]
): Promise<MarketOutput[]> => {
  if (!supabaseService || rows.length === 0) return rows;

  const resolvedByKey = new Map<string, string>();
  const grouped = new Map<VenueProvider, Set<string>>();

  for (const row of rows) {
    const provider = row.provider ?? "polymarket";
    const providerMarketId = String(row.providerMarketId ?? row.id ?? "").trim();
    if (!providerMarketId) continue;

    if (row.marketRefId) {
      resolvedByKey.set(`${provider}:${providerMarketId}`, row.marketRefId);
      continue;
    }

    const ids = grouped.get(provider) ?? new Set<string>();
    ids.add(providerMarketId);
    grouped.set(provider, ids);
  }

  for (const [provider, providerMarketIds] of grouped.entries()) {
    const values = Array.from(providerMarketIds);
    for (let i = 0; i < values.length; i += 250) {
      const chunk = values.slice(i, i + 250);
      const { data, error } = await (supabaseService as any)
        .from("market_catalog")
        .select("id, provider_market_id")
        .eq("provider", provider)
        .in("provider_market_id", chunk);
      if (error) continue;

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const providerMarketId = String(row.provider_market_id ?? "").trim();
        const marketRefId = String(row.id ?? "").trim();
        if (!providerMarketId || !marketRefId) continue;
        resolvedByKey.set(`${provider}:${providerMarketId}`, marketRefId);
      }
    }
  }

  return rows.map((row) => {
    if (row.marketRefId) return row;
    const provider = row.provider ?? "polymarket";
    const providerMarketId = String(row.providerMarketId ?? row.id ?? "").trim();
    if (!providerMarketId) return row;
    return {
      ...row,
      marketRefId: resolvedByKey.get(`${provider}:${providerMarketId}`) ?? null,
    };
  });
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

const inferSignedOrderPrice = (signedOrder: Record<string, unknown>): number | null => {
  const makerAmount = toFiniteNumber(
    (signedOrder.makerAmount as number | string | null | undefined) ??
      (signedOrder.maker_amount as number | string | null | undefined)
  );
  const takerAmount = toFiniteNumber(
    (signedOrder.takerAmount as number | string | null | undefined) ??
      (signedOrder.taker_amount as number | string | null | undefined)
  );
  if (makerAmount !== null && takerAmount !== null && makerAmount > 0 && takerAmount > 0) {
    const direct = makerAmount / takerAmount;
    if (direct > 0 && direct < 1) return direct;
    const inverse = takerAmount / makerAmount;
    if (inverse > 0 && inverse < 1) return inverse;
  }
  return toFiniteNumber(
    (signedOrder.price as number | string | null | undefined) ??
      (signedOrder.limitPrice as number | string | null | undefined) ??
      (signedOrder.limit_price as number | string | null | undefined)
  );
};

const validateRelayOrderReadiness = async (params: {
  supabaseService: SupabaseServiceClient;
  provider: VenueProvider;
  marketId: string | null;
  signedOrder: Record<string, unknown>;
}) => {
  if (!params.marketId) return;
  const market = await getCanonicalMarket({
    supabaseService: params.supabaseService,
    marketId: params.marketId,
    provider: params.provider,
  });
  if (!market) {
    throw new TRPCError({ code: "NOT_FOUND", message: "MARKET_NOT_FOUND" });
  }
  if (market.capabilities?.supportsTrading === false) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_TRADING_DISABLED" });
  }
  if (market.state !== "open") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_NOT_OPEN" });
  }
  const closesAtMs = Date.parse(String(market.closesAt ?? market.expiresAt ?? ""));
  if (Number.isFinite(closesAtMs) && closesAtMs <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MARKET_TRADING_CLOSED" });
  }

  const signedOrderChainId = toFiniteNumber(
    (params.signedOrder.chainId as number | string | null | undefined) ??
      (params.signedOrder.chain_id as number | string | null | undefined)
  );
  if (
    signedOrderChainId !== null &&
    typeof market.capabilities?.chainId === "number" &&
    Number.isFinite(market.capabilities.chainId) &&
    signedOrderChainId !== market.capabilities.chainId
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "SIGNED_ORDER_CHAIN_MISMATCH" });
  }

  const price = inferSignedOrderPrice(params.signedOrder);
  if (price !== null && (!Number.isFinite(price) || price <= 0 || price >= 1)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "SIGNED_ORDER_PRICE_OUT_OF_BOUNDS" });
  }
};

export const marketRouter = router({
  listCategories: publicProcedure
    .input(listMarketCategoriesInput)
    .output(marketCategoryOutputArray)
    .query(async ({ ctx, input }) => {
      const selectedProviders = parseProviderSelection({
        providers: input?.providers,
        providerFilter: input?.providerFilter,
      });
      const rows = await getCachedDynamicCategoryRows(ctx.supabaseService, selectedProviders);
      return rows;
    }),

  listEnabledProviders: publicProcedure
    .output(enabledProvidersOutput)
    .query(() => {
      const providers = getPublicEnabledProviders();
      return {
        providers,
      };
    }),

  listMarkets: publicProcedure
    .input(listMarketsInput)
    .output(marketPageOutput)
    .query(async ({ ctx, input }) => {
      const startedAt = Date.now();
      incrementRealtimeMetricCounter("trpc.market.listMarkets.calls");
      const onlyOpen = input?.onlyOpen ?? false;
      const page = input?.page ?? 1;
      const pageSize = Math.max(
        1,
        Math.min(MAX_MARKET_LIST_PAGE_SIZE, Number(input?.pageSize ?? DEFAULT_MARKET_LIST_PAGE_SIZE))
      );
      const sortBy = input?.sortBy ?? "newest";
      const selectedProviders = parseProviderSelection({
        providers: input?.providers,
        providerFilter: input?.providerFilter,
      });
      try {
        try {
          const result = await listCanonicalMarkets({
            supabaseService: ctx.supabaseService,
            onlyOpen,
            page,
            pageSize,
            sortBy,
            catalogBucket: input?.catalogBucket ?? "main",
            providers: input?.providers,
            providerFilter: input?.providerFilter,
          });
          const isLimitlessOnly =
            selectedProviders.length === 1 && selectedProviders[0] === "limitless";
          if (isLimitlessOnly && result.items.length === 0) {
            const adapter = getVenueAdapter("limitless");
            if (adapter.isEnabled()) {
              const fallbackLimit = Math.max(page * pageSize, 200);
              const rows = await adapter.listMarketsSnapshot({
                onlyOpen,
                limit: fallbackLimit,
                sortBy,
              });
              if (rows.length > 0) {
                if (ENABLE_CATALOG_SYNC_ON_READ) {
                  void upsertVenueMarketsToCatalog(ctx.supabaseService, rows).catch(() => {
                    // best-effort sync
                  });
                }
                const mapped = sortMarketRows(rows.map(mapVenueMarketToMarketOutput), sortBy);
                const offset = (page - 1) * pageSize;
                return {
                  ...result,
                  items: mapped.slice(offset, offset + pageSize),
                  hasMore: mapped.length > offset + pageSize,
                };
              }
            }
          }
          return result;
        } catch (error) {
          if (isCatalogReadError(error)) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.code, cause: error });
          }
          throw error;
        }
      } finally {
        recordRealtimeMetricTiming("trpc.market.listMarkets.ms", Date.now() - startedAt);
      }
    }),

  getMarket: publicProcedure
    .input(getMarketInput)
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const startedAt = Date.now();
      incrementRealtimeMetricCounter("trpc.market.getMarket.calls");
      try {
        let row: MarketOutput | null = null;
        try {
          row = await getCanonicalMarket({
            supabaseService: ctx.supabaseService,
            marketId: input.marketId,
            provider: input.provider ?? null,
          });
        } catch (error) {
          if (isCatalogReadError(error)) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.code, cause: error });
          }
          throw error;
        }
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
        }
        return row;
      } finally {
        recordRealtimeMetricTiming("trpc.market.getMarket.ms", Date.now() - startedAt);
      }
    }),

  getOrderbook: publicProcedure
    .input(getOrderbookInput)
    .output(marketOrderbookOutput)
    .query(async ({ ctx, input }) => {
      return await getCanonicalOrderbook({
        supabaseService: ctx.supabaseService,
        marketId: input.marketId,
        provider: input.provider ?? null,
        depth: input.depth,
      });
    }),

  searchSemantic: publicProcedure
    .input(searchSemanticInput)
    .output(marketListV1Output)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(MAX_MARKET_SEARCH_LIMIT, Number(input.limit ?? DEFAULT_MARKET_SEARCH_LIMIT)));
      const onlyOpen = input.onlyOpen ?? true;
      const query = input.query.trim();
      const selectedProviders = parseProviderSelection({
        providers: input.providers,
        providerFilter: input.providerFilter,
      });
      const limitlessWorkerFresh = selectedProviders.includes("limitless")
        ? await isLimitlessWorkerFresh(ctx.supabaseService).catch(() => false)
        : false;
      if (query.length < 2) {
        return { apiVersion: API_VERSION_V1, items: [] };
      }

      const scoredItems: Array<{ market: MarketOutput; score: number }> = [];

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
        let usedWorkerSearch = false;
        if (limitlessWorkerFresh) {
          const workerRows = await listCanonicalProviderMarkets(ctx.supabaseService, {
            provider: "limitless",
            onlyOpen,
            limit: Math.max(limit * 10, 200),
          });
          if (workerRows.length > 0) {
            usedWorkerSearch = true;
            scoredItems.push(
              ...workerRows.map((market) => {
                const lex = lexicalScoreText(
                  query,
                  `${market.titleEn} ${market.description ?? ""} ${market.categoryLabelEn ?? market.categoryLabelRu ?? ""} ${(market.outcomes ?? [])
                    .map((outcome) => outcome.title)
                    .join(" ")}`
                );
                const volumeBoost = clamp01(Math.log10(Math.max(0, market.volume) + 1) / 6);
                return {
                  market,
                  score: clamp01(lex * 0.8 + volumeBoost * 0.2),
                };
              })
            );
          }
        }

        if (!usedWorkerSearch) {
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
      }

      const deduped = new Map<string, { market: MarketOutput; score: number }>();
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
        apiVersion: API_VERSION_V1,
        items,
      };
    }),

  getSimilar: publicProcedure
    .input(getSimilarMarketsInput)
    .output(similarMarketsV1Output)
    .query(async ({ ctx, input }) => {
      const baseMarket = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!baseMarket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const limit = Math.max(1, Math.min(MAX_MARKET_SIMILAR_LIMIT, Number(input.limit ?? DEFAULT_MARKET_SIMILAR_LIMIT)));
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
          apiVersion: API_VERSION_V1,
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
        apiVersion: API_VERSION_V1,
        items: mapped.map((item) => ({
          market: mergeMarketWithLive(item.market, liveByMarket.get(item.market.id)),
          score: item.score,
        })),
      };
    }),

  relaySignedOrder: authenticatedProcedure
    .input(relaySignedOrderInput)
    .output(relaySignedOrderOutput)
    .mutation(async ({ ctx, input }) => {
      const { authUser } = ctx;
      try {
        assertCsrfForMutation(ctx.req, ctx.cookies ?? {});
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: error instanceof Error ? error.message : "CSRF_VALIDATION_FAILED",
        });
      }
      ctx.responseHeaders["cache-control"] = "no-store, max-age=0";

      const provider = (input.provider ?? "polymarket") as VenueProvider;
      const adapter = getVenueAdapter(provider);
      if (!adapter.isEnabled()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PROVIDER_DISABLED" });
      }

      const ip = getTrustedClientIpFromRequest(ctx.req);

      const relayRate = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `relay:${provider}:${authUser.id}:${ip ?? "unknown"}`,
        limit: 25,
        windowSeconds: 60,
      });
      if (!relayRate.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ORDER_RELAY_RATE_LIMITED" });
      }

      const orderBody = JSON.stringify({
        order: input.signedOrder,
        orderType: input.orderType,
        provider,
        authMode: input.authMode ?? (provider === "limitless" ? "bearer" : "api_key"),
        marketId: input.marketId ?? null,
        marketSlug: input.marketSlug ?? null,
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
      const tradeSyncStartedAt = new Date().toISOString();

      await upsertProviderSyncState(ctx.supabaseService, {
        provider,
        scope: "trade",
        startedAt: tradeSyncStartedAt,
        errorMessage: null,
        stats: {
          marketId: input.marketId ?? marketRef.canonicalMarketId,
          authMode: input.authMode ?? (provider === "limitless" ? "bearer" : "api_key"),
        },
      });

      await validateRelayOrderReadiness({
        supabaseService: ctx.supabaseService,
        provider: marketRef.provider,
        marketId: input.marketId ?? marketRef.canonicalMarketId,
        signedOrder: input.signedOrder as Record<string, unknown>,
      });

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

      const apiCreds: VenueApiCreds | null = input.apiCreds
        ? {
            key: input.apiCreds.key,
            secret: input.apiCreds.secret,
            passphrase: input.apiCreds.passphrase,
          }
        : null;

      const relay = await adapter.relaySignedOrder({
        signedOrder: input.signedOrder as Record<string, unknown>,
        orderType: input.orderType,
        authMode: input.authMode ?? (provider === "limitless" ? "bearer" : "api_key"),
        apiCreds,
        limitlessAuth: input.limitlessAuth
          ? {
              bearerToken: input.limitlessAuth.bearerToken,
              ownerId: input.limitlessAuth.ownerId,
            }
          : null,
        marketSlug: input.marketSlug ?? null,
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
        await upsertProviderSyncState(ctx.supabaseService, {
          provider,
          scope: "trade",
          startedAt: tradeSyncStartedAt,
          successAt: new Date().toISOString(),
          errorMessage: null,
          stats: {
            marketId: input.marketId ?? marketRef.canonicalMarketId,
            status: relay.status,
          },
        });
      } else {
        await finalizeRelayAudit(ctx.supabaseService, pendingAudit.id, {
          status: relay.status >= 400 ? "rejected" : "failed",
          httpStatus: relay.status,
          errorCode: relay.error ?? null,
          errorMessage: relay.error ?? null,
        });
        await upsertProviderSyncState(ctx.supabaseService, {
          provider,
          scope: "trade",
          startedAt: tradeSyncStartedAt,
          errorMessage: relay.error ?? `ORDER_RELAY_HTTP_${relay.status}`,
          stats: {
            marketId: input.marketId ?? marketRef.canonicalMarketId,
            status: relay.status,
          },
        });
      }

      return {
        success: relay.success,
        status: relay.status,
        payload: relay.payload as JsonValue | undefined,
        error: relay.error,
      };
    }),

  generateMarketContext: authenticatedProcedure
    .input(generateMarketContextInput)
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const ip = getTrustedClientIpFromRequest(ctx.req);
      const contextRate = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `context:${authUser.id}:${ip ?? "unknown"}`,
        limit: 5,
        windowSeconds: 60,
      });
      if (!contextRate.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "CONTEXT_RATE_LIMITED" });
      }
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

  myBookmarks: authenticatedProcedure
    .output(marketBookmarkOutputArray)
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
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

  setBookmark: authenticatedProcedure
    .input(setBookmarkInput)
    .output(setBookmarkOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const ip = getTrustedClientIpFromRequest(ctx.req);
      const rl = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `bookmark:${authUser.id}:${ip ?? "unknown"}`,
        limit: 30,
        windowSeconds: 60,
      });
      if (!rl.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "RATE_LIMITED" });
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
    .input(getPriceCandlesInput)
    .output(priceCandleOutputArray)
    .query(async ({ ctx, input }) => {
      const startedAt = Date.now();
      incrementRealtimeMetricCounter("trpc.market.getPriceCandles.calls");
      try {
        return await getCanonicalPriceCandles({
          supabaseService: ctx.supabaseService,
          marketId: input.marketId,
          provider: input.provider ?? null,
          interval: input.interval ?? "1h",
          limit: input.limit ?? 200,
          range: input.range ?? null,
        });
      } finally {
        recordRealtimeMetricTiming("trpc.market.getPriceCandles.ms", Date.now() - startedAt);
      }
    }),

  getLiveActivity: publicProcedure
    .input(getLiveActivityInput)
    .output(liveActivityTickOutputArray)
    .query(async ({ ctx, input }) => {
      const startedAt = Date.now();
      incrementRealtimeMetricCounter("trpc.market.getLiveActivity.calls");
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_MARKET_ACTIVITY_LIMIT, MAX_MARKET_ACTIVITY_LIMIT));

      if (ref.provider !== "polymarket") {
        recordRealtimeMetricTiming("trpc.market.getLiveActivity.ms", Date.now() - startedAt);
        return [];
      }

      const marketId = ref.providerMarketId;

      const redisTicks = await readUpstashActivityTicks(marketId, limit);
      if (redisTicks.length > 0) {
        incrementRealtimeMetricCounter("upstash.cache.liveActivity.hit");
        const mappedRedisTicks = redisTicks.map((tick) => ({
          id: tick.id,
          marketId: tick.marketId,
          tradeId: tick.tradeId,
          side: tick.side,
          outcome: tick.outcome,
          price: tick.price,
          size: tick.size,
          notional: tick.notional,
          sourceTs: tick.sourceTs,
          createdAt: tick.createdAt,
        }));
        recordRealtimeMetricTiming("trpc.market.getLiveActivity.ms", Date.now() - startedAt);
        return mappedRedisTicks;
      }
      incrementRealtimeMetricCounter("upstash.cache.liveActivity.miss");
      recordRealtimeMetricTiming("trpc.market.getLiveActivity.ms", Date.now() - startedAt);
      return [];
    }),

  getPublicTrades: publicProcedure
    .input(getPublicTradesInput)
    .output(publicTradeOutputArray)
    .query(async ({ ctx, input }) => {
      const startedAt = Date.now();
      incrementRealtimeMetricCounter("trpc.market.getPublicTrades.calls");
      const ref = parseVenueMarketRef(input.marketId, input.provider ?? null);
      const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PUBLIC_TRADES_LIMIT, MAX_MARKET_ACTIVITY_LIMIT));
      const tradesCacheKey = buildMarketTradesCacheKey({
        provider: ref.provider,
        providerMarketId: ref.providerMarketId,
        limit,
      });
      const cachedTrades = await readUpstashCache(tradesCacheKey, publicTradeOutputArray);
      if (cachedTrades) {
        incrementRealtimeMetricCounter("upstash.cache.marketTrades.hit");
        recordRealtimeMetricTiming("trpc.market.getPublicTrades.ms", Date.now() - startedAt);
        return cachedTrades;
      }
      incrementRealtimeMetricCounter("upstash.cache.marketTrades.miss");

      if (ref.provider === "polymarket") {
        const marketId = ref.providerMarketId;
        const mapTickToTrade = (
          tick: {
            id: string;
            marketId: string;
            tradeId: string | null;
            side: "BUY" | "SELL" | "UNKNOWN";
            outcome: string | null;
            price: number;
            size: number;
            sourceTs: string;
            createdAt: string;
          }
        ) => {
          const normalizedOutcome = (tick.outcome ?? "").trim().toLowerCase();
          const yn =
            normalizedOutcome === "yes"
              ? ("YES" as const)
              : normalizedOutcome === "no"
                ? ("NO" as const)
                : null;
          const action: "buy" | "sell" = tick.side === "SELL" ? "sell" : "buy";
          return {
            id: tick.tradeId ?? tick.id,
            marketId: tick.marketId,
            action,
            outcome: yn,
            outcomeId: null,
            outcomeTitle: tick.outcome,
            collateralGross: tick.size * tick.price,
            sharesDelta: tick.size,
            priceBefore: tick.price,
            priceAfter: tick.price,
            createdAt: tick.sourceTs || tick.createdAt,
          } satisfies PublicTradeOutput;
        };

        const redisTicks = await readUpstashActivityTicks(marketId, limit);
        if (redisTicks.length > 0) {
          const out = redisTicks.map((tick) =>
            mapTickToTrade({
              id: tick.id,
              marketId: tick.marketId,
              tradeId: tick.tradeId,
              side: tick.side,
              outcome: tick.outcome,
              price: tick.price,
              size: tick.size,
              sourceTs: tick.sourceTs,
              createdAt: tick.createdAt,
            })
          );
          void writeUpstashCache(tradesCacheKey, out, upstashMarketTradesTtlSec);
          recordRealtimeMetricTiming("trpc.market.getPublicTrades.ms", Date.now() - startedAt);
          return out;
        }

        recordRealtimeMetricTiming("trpc.market.getPublicTrades.ms", Date.now() - startedAt);
        return [];
      }

      recordRealtimeMetricTiming("trpc.market.getPublicTrades.ms", Date.now() - startedAt);
      return [];
    }),

  getMarketComments: publicProcedure
    .input(getMarketCommentsInput)
    .output(marketCommentOutputArray)
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { data: comments, error } = await supabaseService
        .from("market_comments")
        .select("id, market_id, user_id, parent_id, body, created_at")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? DEFAULT_MARKET_COMMENT_LIMIT);
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

  postMarketComment: authenticatedProcedure
    .input(postMarketCommentInput)
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const ip = getTrustedClientIpFromRequest(ctx.req);
      const commentRate = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `comment:${authUser.id}:${ip ?? "unknown"}`,
        limit: 10,
        windowSeconds: 60,
      });
      if (!commentRate.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "COMMENT_RATE_LIMITED" });
      }
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

  toggleMarketCommentLike: authenticatedProcedure
    .input(toggleMarketCommentLikeInput)
    .output(toggleMarketCommentLikeOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const ip = getTrustedClientIpFromRequest(ctx.req);
      const likeRate = await consumeDurableRateLimit(ctx.supabaseService, {
        key: `like:${authUser.id}:${ip ?? "unknown"}`,
        limit: 30,
        windowSeconds: 60,
      });
      if (!likeRate.allowed) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "LIKE_RATE_LIMITED" });
      }
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

  myComments: authenticatedProcedure
    .input(myCommentsInput)
    .output(myCommentOutputArray)
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
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
