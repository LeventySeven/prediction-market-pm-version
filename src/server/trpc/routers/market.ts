import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHmac } from "node:crypto";
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

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketOutcomeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
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
  signedOrder: z.record(z.string(), jsonValueSchema),
  orderType: z.enum(["FOK", "GTC"]),
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

const DEFAULT_CATEGORIES = [
  { id: "all", labelRu: "Все", labelEn: "All" },
  { id: "politics", labelRu: "Политика", labelEn: "Politics" },
  { id: "crypto", labelRu: "Крипто", labelEn: "Crypto" },
  { id: "sports", labelRu: "Спорт", labelEn: "Sports" },
  { id: "culture", labelRu: "Культура", labelEn: "Culture" },
] as const;

const t = (ru: string, en: string) => ({ ru, en });
const categoryLabelMap = new Map([
  ["politics", t("Политика", "Politics")],
  ["crypto", t("Крипто", "Crypto")],
  ["sports", t("Спорт", "Sports")],
  ["culture", t("Культура", "Culture")],
  ["business", t("Бизнес", "Business")],
]);

const mapPolymarketMarket = (market: Awaited<ReturnType<typeof getPolymarketMarketById>> extends infer T ? Exclude<T, null> : never) => {
  const outcomes = market.outcomes.map((o) => ({
    id: o.id,
    marketId: market.id,
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
  const categoryKey = (market.category || "all").toLowerCase();
  const labels = categoryLabelMap.get(categoryKey) ?? t("Разное", "General");

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
    categoryId: categoryKey,
    categoryLabelRu: labels.ru,
    categoryLabelEn: labels.en,
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
  params: { onlyOpen: boolean; limit: number }
): Promise<PolymarketMarket[]> => {
  let mirrored: PolymarketMarket[] = [];
  let hadMirrorRows = false;

  try {
    mirrored = await listMirroredPolymarketMarkets(supabaseService, {
      onlyOpen: params.onlyOpen,
      limit: params.limit,
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
    const live = await listPolymarketMarkets(params.limit);
    if (live.length > 0) {
      try {
        await upsertMirroredPolymarketMarkets(supabaseService, live);
      } catch (err) {
        console.warn("Mirror upsert after live listMarkets failed", err);
      }
    }
    return params.onlyOpen ? live.filter((m) => m.state === "open") : live;
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
  const headerCandidates = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("true-client-ip"),
    req.headers.get("fly-client-ip"),
  ];
  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const first = candidate.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
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

export const marketRouter = router({
  listCategories: publicProcedure.output(z.array(marketCategoryOutput)).query(async () => {
    return DEFAULT_CATEGORIES.map((c) => ({ id: c.id, labelRu: c.labelRu, labelEn: c.labelEn }));
  }),

  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const onlyOpen = input?.onlyOpen ?? false;
      const rows = await listMarketsFromMirrorOrLive(ctx.supabaseService, {
        onlyOpen,
        limit: onlyOpen ? 500 : 800,
      });
      const mapped = rows.map(mapPolymarketMarket);
      const liveByMarket = await fetchMarketLiveSnapshots(
        ctx.supabaseService,
        mapped.map((m) => m.id)
      );
      const merged = mergeMarketsWithLive(mapped, liveByMarket);
      return onlyOpen ? merged.filter((m) => m.state === "open") : merged;
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const row = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      const mapped = mapPolymarketMarket(row);
      const liveByMarket = await fetchMarketLiveSnapshots(ctx.supabaseService, [mapped.id]);
      return mergeMarketWithLive(mapped, liveByMarket.get(mapped.id));
    }),

  searchSemantic: publicProcedure
    .input(
      z.object({
        query: z.string().min(2).max(256),
        limit: z.number().int().positive().max(30).optional(),
        onlyOpen: z.boolean().optional(),
      })
    )
    .output(marketListV1Output)
    .query(async ({ ctx, input }) => {
      const limit = Math.max(1, Math.min(30, Number(input.limit ?? 15)));
      const onlyOpen = input.onlyOpen ?? true;
      const query = input.query.trim();
      if (query.length < 2) {
        return { apiVersion: "v1", items: [] };
      }

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
      if (candidates.length === 0) {
        return { apiVersion: "v1", items: [] };
      }

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

      const items = merged
        .map((market) => {
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

  checkTradeAccess: publicProcedure.output(tradeAccessOutput).query(async ({ ctx }) => {
    ctx.responseHeaders["cache-control"] = "no-store, max-age=0";
    const ip = getClientIpFromRequest(ctx.req);
    const cacheKey = `access:${ip ?? "unknown"}`;
    return getTradeAccessStatus(cacheKey, ip);
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

      applyRelayRateLimit(authUser.id);
      const ip = getClientIpFromRequest(ctx.req);
      const cacheKey = `relay:${authUser.id}:${ip ?? "unknown"}`;
      const access = await getTradeAccessStatus(cacheKey, ip);
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: access.reasonCode ?? "TRADE_ACCESS_BLOCKED",
        });
      }

      const makerAddress = input.signedOrder.maker;
      if (typeof makerAddress !== "string" || makerAddress.trim().length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SIGNED_ORDER_MAKER_MISSING" });
      }

      const orderPayload = {
        order: input.signedOrder,
        owner: input.apiCreds.key,
        orderType: input.orderType,
      };
      const orderBody = JSON.stringify(orderPayload);
      if (orderBody.length > 16 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "SIGNED_ORDER_TOO_LARGE" });
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const requestPath = "/order";
      const signature = buildL2Signature(
        input.apiCreds.secret,
        timestamp,
        "POST",
        requestPath,
        orderBody
      );

      const timeoutMs = Math.max(2000, Number(process.env.POLYMARKET_RELAY_TIMEOUT_MS ?? 10000));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${getClobBaseUrl()}/order`, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "POLY_ADDRESS": makerAddress,
            "POLY_SIGNATURE": signature,
            "POLY_TIMESTAMP": String(timestamp),
            "POLY_API_KEY": input.apiCreds.key,
            "POLY_PASSPHRASE": input.apiCreds.passphrase,
            ...(ip
              ? {
                  "x-forwarded-for": ip,
                  "x-real-ip": ip,
                  "cf-connecting-ip": ip,
                }
              : {}),
          },
          body: orderBody,
        });
        const payload = (await response.json().catch(() => null)) as JsonValue | null;
        const payloadRec =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, JsonValue | undefined>)
            : null;
        if (!response.ok) {
          const payloadError =
            payloadRec && typeof payloadRec.error === "string"
              ? payloadRec.error
              : `ORDER_RELAY_HTTP_${response.status}`;
          return {
            success: false,
            status: response.status,
            error: payloadError,
            payload: payload ?? undefined,
          };
        }
        return {
          success: true,
          status: response.status,
          payload: payload ?? undefined,
        };
      } catch (err) {
        const msg = toErrorMessage(err);
        return {
          success: false,
          status: 0,
          error: msg.includes("aborted") ? "ORDER_RELAY_TIMEOUT" : msg,
        };
      } finally {
        clearTimeout(timeout);
      }
    }),

  generateMarketContext: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const market = await getMarketFromMirrorOrLive(supabaseService, input.marketId);
      if (!market) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const existing = await supabaseService
        .from("market_context")
        .select("market_id, context, sources, updated_at")
        .eq("market_id", input.marketId)
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
        marketId: input.marketId,
        title: market.title,
        description: market.description,
        source: market.sourceUrl,
      });
      const updatedAt = new Date().toISOString();
      const upsert = await supabaseService.from("market_context").upsert(
        {
          market_id: input.marketId,
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
        marketId: input.marketId,
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
    .input(z.object({ marketId: z.string().min(1), bookmarked: z.boolean() }))
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      if (input.bookmarked) {
        const ins = await supabaseService.from("market_bookmarks").insert({
          user_id: authUser.id,
          market_id: input.marketId,
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
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(1000).optional() }))
    .output(z.array(priceCandleOutput))
    .query(async ({ ctx, input }) => {
      const market = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!market) return [];
      const limit = input.limit ?? 200;
      const localCandles = await listLocalCandles(ctx.supabaseService, market.id, limit);
      if (localCandles.length > 0) {
        return localCandles;
      }
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
      const targetOutcomes = isBinary
        ? withToken.filter((o) => o.id === yesOutcome?.id)
        : withToken;

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
    }),

  getPublicTrades: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(publicTradeOutput))
    .query(async ({ ctx, input }) => {
      const market = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
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
    .input(z.object({ marketId: z.string().min(1), body: z.string().min(1).max(2000), parentId: z.string().nullable().optional() }))
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const body = input.body.trim();
      if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body is required" });

      const inserted = await supabaseService
        .from("market_comments")
        .insert({
          market_id: input.marketId,
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
      const markets = await Promise.all(
        ids.map(async (id) => [id, await getMarketFromMirrorOrLive(supabaseService, id)] as const)
      );
      const marketsById = new Map(markets);

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
        const market = marketsById.get(String(r.market_id));
        const title = market?.title ?? "Market";
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
