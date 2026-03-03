import { Redis } from "@upstash/redis";
import { z } from "zod";

const CACHE_VERSION = "v1";

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const clampInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const configuredRedisUrl =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
const configuredRedisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";

const hasRedisCredentials =
  configuredRedisUrl.trim().length > 0 && configuredRedisToken.trim().length > 0;

export const upstashCacheEnabled =
  parseBooleanEnv(process.env.ENABLE_UPSTASH_CACHE, true) && hasRedisCredentials;

export const upstashStreamEnabled =
  parseBooleanEnv(process.env.ENABLE_UPSTASH_STREAM, upstashCacheEnabled) && hasRedisCredentials;

export const upstashMarketListTtlSec = clampInt(process.env.UPSTASH_MARKETS_LIST_TTL_SEC, 3, 1, 30);
export const upstashMarketDetailTtlSec = clampInt(process.env.UPSTASH_MARKET_DETAIL_TTL_SEC, 7, 1, 60);
export const upstashMarketTradesTtlSec = clampInt(process.env.UPSTASH_MARKET_TRADES_TTL_SEC, 3, 1, 30);

const upstashLiveStateTtlSec = clampInt(process.env.UPSTASH_LIVE_STATE_TTL_SEC, 20, 5, 300);
const upstashActivityListTtlSec = clampInt(process.env.UPSTASH_ACTIVITY_TTL_SEC, 120, 10, 900);
const upstashActivityListMaxItems = clampInt(process.env.UPSTASH_ACTIVITY_MAX_ITEMS, 200, 50, 500);

let redisClient: Redis | null | undefined;

export const getUpstashRedis = (): Redis | null => {
  if (!hasRedisCredentials) return null;
  if (redisClient !== undefined) return redisClient;

  try {
    redisClient = Redis.fromEnv({
      enableAutoPipelining: true,
      enableTelemetry: false,
      readYourWrites: true,
    });
  } catch {
    redisClient = null;
  }

  return redisClient;
};

const maybeJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const cacheEnvelopeSchema = <T>(schema: z.ZodType<T>) =>
  z.object({
    v: z.literal(CACHE_VERSION),
    cachedAt: z.string(),
    data: schema,
  });

export const readUpstashCache = async <T>(
  key: string,
  schema: z.ZodType<T>
): Promise<T | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (raw === null || raw === undefined) return null;
    const normalized = maybeJson(raw);

    const envelopeParsed = cacheEnvelopeSchema(schema).safeParse(normalized);
    if (envelopeParsed.success) return envelopeParsed.data.data;

    const directParsed = schema.safeParse(normalized);
    if (directParsed.success) return directParsed.data;

    return null;
  } catch {
    return null;
  }
};

export const writeUpstashCache = async <T>(
  key: string,
  value: T,
  ttlSec: number
): Promise<void> => {
  if (!upstashCacheEnabled) return;
  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    await redis.set(
      key,
      {
        v: CACHE_VERSION,
        cachedAt: new Date().toISOString(),
        data: value,
      },
      { ex: Math.max(1, ttlSec) }
    );
  } catch {
    // Best-effort cache write only.
  }
};

const encodeProviderList = (providers: Array<"polymarket" | "limitless">): string =>
  [...providers].sort().join(",");

export const buildMarketListCacheKey = (params: {
  onlyOpen: boolean;
  page: number;
  pageSize: number;
  sortBy: "newest" | "volume";
  providers: Array<"polymarket" | "limitless">;
}): string =>
  [
    "markets:list",
    CACHE_VERSION,
    `open:${params.onlyOpen ? 1 : 0}`,
    `page:${params.page}`,
    `size:${params.pageSize}`,
    `sort:${params.sortBy}`,
    `providers:${encodeProviderList(params.providers)}`,
  ].join(":");

export const buildMarketDetailCacheKey = (params: {
  provider: "polymarket" | "limitless";
  providerMarketId: string;
}): string =>
  ["market:detail", CACHE_VERSION, params.provider, params.providerMarketId.trim()].join(":");

export const buildMarketTradesCacheKey = (params: {
  provider: "polymarket" | "limitless";
  providerMarketId: string;
  limit: number;
}): string =>
  [
    "market:trades",
    CACHE_VERSION,
    params.provider,
    params.providerMarketId.trim(),
    `limit:${Math.max(1, params.limit)}`,
  ].join(":");

const buildLiveStateKey = (marketId: string): string =>
  ["realtime:market:live", CACHE_VERSION, marketId.trim()].join(":");

const buildLiveChannelKey = (marketId: string): string =>
  ["realtime:market:live", CACHE_VERSION, "channel", marketId.trim()].join(":");

const buildActivityListKey = (marketId: string): string =>
  ["realtime:market:activity", CACHE_VERSION, marketId.trim()].join(":");

export type UpstashMarketLivePatch = {
  marketId: string;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  lastTradePrice: number | null;
  lastTradeSize: number | null;
  rolling24hVolume: number | null;
  openInterest: number | null;
  sourceTs: string | null;
  sourceSeq: number | null;
};

export type UpstashActivityTick = {
  id: string;
  marketId: string;
  tradeId: string | null;
  side: "BUY" | "SELL" | "UNKNOWN";
  outcome: string | null;
  price: number;
  size: number;
  notional: number;
  sourceTs: string;
  createdAt: string;
};

const toFiniteOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeLivePatch = (value: unknown): UpstashMarketLivePatch | null => {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!parsed) return null;
  const marketId = typeof parsed.marketId === "string" ? parsed.marketId.trim() : "";
  if (!marketId) return null;

  return {
    marketId,
    bestBid: toFiniteOrNull(parsed.bestBid),
    bestAsk: toFiniteOrNull(parsed.bestAsk),
    mid: toFiniteOrNull(parsed.mid),
    lastTradePrice: toFiniteOrNull(parsed.lastTradePrice),
    lastTradeSize: toFiniteOrNull(parsed.lastTradeSize),
    rolling24hVolume: toFiniteOrNull(parsed.rolling24hVolume),
    openInterest: toFiniteOrNull(parsed.openInterest),
    sourceTs: typeof parsed.sourceTs === "string" ? parsed.sourceTs : null,
    sourceSeq: toFiniteOrNull(parsed.sourceSeq),
  };
};

const normalizeActivityTick = (value: unknown): UpstashActivityTick | null => {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!parsed) return null;

  const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
  const marketId = typeof parsed.marketId === "string" ? parsed.marketId.trim() : "";
  const sourceTs = typeof parsed.sourceTs === "string" ? parsed.sourceTs : "";
  const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : "";
  if (!id || !marketId || !sourceTs || !createdAt) return null;

  const sideRaw = typeof parsed.side === "string" ? parsed.side.toUpperCase() : "UNKNOWN";
  const side: UpstashActivityTick["side"] =
    sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : "UNKNOWN";

  const price = toFiniteOrNull(parsed.price);
  const size = toFiniteOrNull(parsed.size);
  const notional = toFiniteOrNull(parsed.notional);
  if (price === null || size === null || notional === null) return null;

  return {
    id,
    marketId,
    tradeId: typeof parsed.tradeId === "string" ? parsed.tradeId : null,
    side,
    outcome: typeof parsed.outcome === "string" ? parsed.outcome : null,
    price,
    size,
    notional,
    sourceTs,
    createdAt,
  };
};

export const writeUpstashMarketLivePatches = async (
  patches: UpstashMarketLivePatch[]
): Promise<void> => {
  if (!upstashCacheEnabled || patches.length === 0) return;
  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    const pipeline = redis.pipeline();
    for (const patch of patches) {
      const marketId = patch.marketId.trim();
      if (!marketId) continue;
      const key = buildLiveStateKey(marketId);
      const channel = buildLiveChannelKey(marketId);
      pipeline.set(key, patch, { ex: upstashLiveStateTtlSec });
      pipeline.publish(channel, JSON.stringify(patch));
    }
    await pipeline.exec();
  } catch {
    // Best-effort realtime cache write only.
  }
};

export const readUpstashMarketLivePatches = async (
  marketIds: string[]
): Promise<UpstashMarketLivePatch[]> => {
  if (!upstashStreamEnabled || marketIds.length === 0) return [];
  const redis = getUpstashRedis();
  if (!redis) return [];

  const uniqueIds = Array.from(new Set(marketIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  try {
    const keys = uniqueIds.map((id) => buildLiveStateKey(id));
    const raw = (await redis.mget(keys)) as unknown[];
    const out: UpstashMarketLivePatch[] = [];
    for (const item of raw) {
      const normalized = normalizeLivePatch(maybeJson(item));
      if (normalized) out.push(normalized);
    }
    return out;
  } catch {
    return [];
  }
};

export const writeUpstashActivityTicks = async (
  ticks: UpstashActivityTick[]
): Promise<void> => {
  if (!upstashCacheEnabled || ticks.length === 0) return;
  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    const pipeline = redis.pipeline();
    for (const tick of ticks) {
      const marketId = tick.marketId.trim();
      if (!marketId) continue;

      const key = buildActivityListKey(marketId);
      pipeline.lpush(key, JSON.stringify(tick));
      pipeline.ltrim(key, 0, upstashActivityListMaxItems - 1);
      pipeline.expire(key, upstashActivityListTtlSec);
    }
    await pipeline.exec();
  } catch {
    // Best-effort realtime cache write only.
  }
};

export const readUpstashActivityTicks = async (
  marketId: string,
  limit: number
): Promise<UpstashActivityTick[]> => {
  if (!upstashCacheEnabled) return [];
  const redis = getUpstashRedis();
  if (!redis) return [];

  const cleanMarketId = marketId.trim();
  if (!cleanMarketId) return [];

  const safeLimit = Math.max(1, Math.min(limit, upstashActivityListMaxItems));
  try {
    const raw = (await redis.lrange(buildActivityListKey(cleanMarketId), 0, safeLimit - 1)) as unknown[];
    const out: UpstashActivityTick[] = [];
    for (const item of raw) {
      const normalized = normalizeActivityTick(maybeJson(item));
      if (normalized) out.push(normalized);
    }
    return out;
  } catch {
    return [];
  }
};
