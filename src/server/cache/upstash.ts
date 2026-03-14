import { Redis } from "@upstash/redis";
import { z } from "zod";

const CACHE_NAMESPACE = (process.env.UPSTASH_CACHE_NAMESPACE || "").trim() || "v2";

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
export const upstashMarketCandlesTtlSec = clampInt(process.env.UPSTASH_MARKET_CANDLES_TTL_SEC, 15, 3, 120);
export const upstashMarketTradesTtlSec = clampInt(process.env.UPSTASH_MARKET_TRADES_TTL_SEC, 3, 1, 30);

const upstashLiveStateTtlSec = clampInt(process.env.UPSTASH_LIVE_STATE_TTL_SEC, 60, 10, 900);
const upstashActivityListTtlSec = clampInt(process.env.UPSTASH_ACTIVITY_TTL_SEC, 120, 10, 900);
const upstashActivityListMaxItems = clampInt(process.env.UPSTASH_ACTIVITY_MAX_ITEMS, 200, 50, 500);
const upstashSnapshotTtlSec = clampInt(process.env.UPSTASH_SNAPSHOT_TTL_SEC, 300, 30, 3600);
const upstashSnapshotShardSize = clampInt(process.env.UPSTASH_SNAPSHOT_SHARD_SIZE, 60, 10, 120);
const upstashOrderbookTtlSec = clampInt(process.env.UPSTASH_ORDERBOOK_TTL_SEC, 45, 10, 900);
const upstashOrderbookMaxDepth = clampInt(process.env.UPSTASH_ORDERBOOK_MAX_DEPTH, 24, 4, 80);

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
    v: z.literal(CACHE_NAMESPACE),
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
        v: CACHE_NAMESPACE,
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
  snapshotId?: number | null;
  catalogBucket?: "all" | "main" | "fast";
  providers: Array<"polymarket" | "limitless">;
}): string =>
  [
    "markets:list",
    CACHE_NAMESPACE,
    `open:${params.onlyOpen ? 1 : 0}`,
    `page:${params.page}`,
    `size:${params.pageSize}`,
    `sort:${params.sortBy}`,
    `snapshot:${typeof params.snapshotId === "number" && Number.isFinite(params.snapshotId) ? params.snapshotId : "none"}`,
    `bucket:${params.catalogBucket ?? "main"}`,
    `providers:${encodeProviderList(params.providers)}`,
  ].join(":");

export const buildLatestMarketListCacheKey = (params: {
  onlyOpen: boolean;
  page: number;
  pageSize: number;
  sortBy: "newest" | "volume";
  catalogBucket?: "all" | "main" | "fast";
  providers: Array<"polymarket" | "limitless">;
}): string =>
  [
    "markets:list:latest",
    CACHE_NAMESPACE,
    `open:${params.onlyOpen ? 1 : 0}`,
    `page:${params.page}`,
    `size:${params.pageSize}`,
    `sort:${params.sortBy}`,
    `bucket:${params.catalogBucket ?? "main"}`,
    `providers:${encodeProviderList(params.providers)}`,
  ].join(":");

export const buildMarketDetailCacheKey = (params: {
  provider: "polymarket" | "limitless";
  providerMarketId: string;
}): string =>
  ["market:detail", CACHE_NAMESPACE, params.provider, params.providerMarketId.trim()].join(":");

export const buildMarketTradesCacheKey = (params: {
  provider: "polymarket" | "limitless";
  providerMarketId: string;
  limit: number;
}): string =>
  [
    "market:trades",
    CACHE_NAMESPACE,
    params.provider,
    params.providerMarketId.trim(),
    `limit:${Math.max(1, params.limit)}`,
  ].join(":");

export const buildMarketCandlesCacheKey = (params: {
  provider: "polymarket" | "limitless";
  providerMarketId: string;
  interval: "1m" | "1h";
  limit: number;
  range?: string | null;
}): string =>
  [
    "market:candles",
    CACHE_NAMESPACE,
    params.provider,
    params.providerMarketId.trim(),
    "shape:real-only-v2",
    `interval:${params.interval}`,
    `limit:${Math.max(1, params.limit)}`,
    `range:${(params.range ?? "none").toString()}`,
  ].join(":");

const buildLiveStateKey = (marketId: string): string =>
  ["realtime:market:live", CACHE_NAMESPACE, marketId.trim()].join(":");

const buildLiveChannelKey = (marketId: string): string =>
  ["realtime:market:live", CACHE_NAMESPACE, "channel", marketId.trim()].join(":");

const buildLiveScopeChannelKey = (scope: string): string =>
  ["realtime:market:live", CACHE_NAMESPACE, "scope", encodeScopeKey(scope)].join(":");

export const buildUpstashLiveChannelKey = (marketId: string): string => buildLiveChannelKey(marketId);
export const buildUpstashLiveScopeChannelKey = (scope: string): string => buildLiveScopeChannelKey(scope);

export const buildUpstashLiveChannelPattern = (): string =>
  ["realtime:market:live", CACHE_NAMESPACE, "channel", "*"].join(":");

const buildActivityListKey = (marketId: string): string =>
  ["realtime:market:activity", CACHE_NAMESPACE, marketId.trim()].join(":");

const encodeScopeKey = (scope: string): string =>
  scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_,-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "global";

const buildSnapshotCursorKey = (scope: string): string =>
  ["snapshot", CACHE_NAMESPACE, "cursor", encodeScopeKey(scope)].join(":");

const buildSnapshotMetaKey = (scope: string, snapshotId: number): string =>
  ["snapshot", CACHE_NAMESPACE, String(Math.max(0, snapshotId)), encodeScopeKey(scope), "meta"].join(":");

const buildSnapshotShardKey = (scope: string, snapshotId: number, shardIndex: number): string =>
  [
    "snapshot",
    CACHE_NAMESPACE,
    String(Math.max(0, snapshotId)),
    encodeScopeKey(scope),
    "shard",
    String(Math.max(0, shardIndex)),
  ].join(":");

const buildOrderbookKey = (marketId: string, depth: number): string =>
  [
    "orderbook",
    CACHE_NAMESPACE,
    marketId.trim(),
    "depth",
    String(Math.max(1, Math.min(depth, upstashOrderbookMaxDepth))),
  ].join(":");

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
  snapshotId?: number | null;
  seq?: number | null;
  pageScope?: string | null;
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

export type UpstashSnapshotMeta = {
  snapshotId: number;
  seq: number;
  scope: string;
  shardCount: number;
  marketCount: number;
  createdAt: string;
  hasMore: boolean | null;
};

export type UpstashSnapshotShard<T = unknown> = {
  snapshotId: number;
  scope: string;
  shardIndex: number;
  rows: T[];
};

export type UpstashOrderbookLevel = {
  side: "bid" | "ask";
  price: number;
  size: number;
  outcomeId: string | null;
  outcomeTitle: string | null;
};

export type UpstashMarketOrderbook = {
  marketId: string;
  provider: "polymarket" | "limitless";
  depth: number;
  snapshotId: number | null;
  updatedAt: string;
  levels: UpstashOrderbookLevel[];
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
    snapshotId: toFiniteOrNull(parsed.snapshotId),
    seq: toFiniteOrNull(parsed.seq),
    pageScope: typeof parsed.pageScope === "string" ? parsed.pageScope : null,
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

const normalizeSnapshotMeta = (value: unknown): UpstashSnapshotMeta | null => {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!parsed) return null;
  const snapshotId = toFiniteOrNull(parsed.snapshotId);
  const seq = toFiniteOrNull(parsed.seq);
  const shardCount = toFiniteOrNull(parsed.shardCount);
  const marketCount = toFiniteOrNull(parsed.marketCount);
  const scope = typeof parsed.scope === "string" ? parsed.scope.trim() : "";
  const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt : "";
  if (
    snapshotId === null ||
    seq === null ||
    shardCount === null ||
    marketCount === null ||
    !scope ||
    !createdAt
  ) {
    return null;
  }
  return {
    snapshotId,
    seq,
    scope,
    shardCount,
    marketCount,
    createdAt,
    hasMore: typeof parsed.hasMore === "boolean" ? parsed.hasMore : null,
  };
};

const normalizeOrderbookLevel = (value: unknown): UpstashOrderbookLevel | null => {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!parsed) return null;
  const sideRaw = typeof parsed.side === "string" ? parsed.side.toLowerCase() : "";
  if (sideRaw !== "bid" && sideRaw !== "ask") return null;
  const price = toFiniteOrNull(parsed.price);
  const size = toFiniteOrNull(parsed.size);
  if (price === null || size === null) return null;
  return {
    side: sideRaw,
    price,
    size,
    outcomeId: typeof parsed.outcomeId === "string" ? parsed.outcomeId : null,
    outcomeTitle: typeof parsed.outcomeTitle === "string" ? parsed.outcomeTitle : null,
  };
};

const normalizeMarketOrderbook = (value: unknown): UpstashMarketOrderbook | null => {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!parsed) return null;
  const marketId = typeof parsed.marketId === "string" ? parsed.marketId.trim() : "";
  const provider =
    parsed.provider === "polymarket" || parsed.provider === "limitless"
      ? parsed.provider
      : null;
  const depth = toFiniteOrNull(parsed.depth);
  const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  const levels = Array.isArray(parsed.levels)
    ? parsed.levels.map((row) => normalizeOrderbookLevel(row)).filter((row): row is UpstashOrderbookLevel => Boolean(row))
    : [];
  if (!marketId || !provider || depth === null || !updatedAt) return null;
  return {
    marketId,
    provider,
    depth,
    snapshotId: toFiniteOrNull(parsed.snapshotId),
    updatedAt,
    levels,
  };
};

const chunkArray = <T>(rows: T[], chunkSize: number): T[][] => {
  if (rows.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    out.push(rows.slice(i, i + chunkSize));
  }
  return out;
};

export const readUpstashSnapshotCursor = async (scope = "global"): Promise<number | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(buildSnapshotCursorKey(scope));
    return toFiniteOrNull(maybeJson(raw));
  } catch {
    return null;
  }
};

export const advanceUpstashSnapshotCursor = async (scope = "global"): Promise<number | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  try {
    const next = await redis.incr(buildSnapshotCursorKey(scope));
    return typeof next === "number" && Number.isFinite(next) ? next : toFiniteOrNull(next);
  } catch {
    return null;
  }
};

export const writeUpstashMarketLivePatches = async (
  patches: UpstashMarketLivePatch[]
): Promise<void> => {
  if (!upstashCacheEnabled || patches.length === 0) return;
  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    const snapshotId = await advanceUpstashSnapshotCursor("global");
    const seq = snapshotId;
    const createdAt = new Date().toISOString();
    const pipeline = redis.pipeline();
    for (const patch of patches) {
      const marketId = patch.marketId.trim();
      if (!marketId) continue;
      const enriched = {
        ...patch,
        snapshotId: patch.snapshotId ?? snapshotId ?? null,
        seq: patch.seq ?? seq ?? null,
        pageScope: patch.pageScope ?? null,
      } satisfies UpstashMarketLivePatch;
      const key = buildLiveStateKey(marketId);
      const channel = buildLiveChannelKey(marketId);
      pipeline.set(key, enriched, { ex: upstashLiveStateTtlSec });
      pipeline.publish(channel, JSON.stringify(enriched));
      if (typeof enriched.pageScope === "string" && enriched.pageScope.trim().length > 0) {
        pipeline.publish(buildLiveScopeChannelKey(enriched.pageScope), JSON.stringify(enriched));
      }
    }
    if (snapshotId !== null && seq !== null) {
      pipeline.set(
        buildSnapshotMetaKey("global", snapshotId),
        {
          snapshotId,
          seq,
          scope: "global",
          shardCount: 0,
          marketCount: patches.length,
          createdAt,
          hasMore: null,
        } satisfies UpstashSnapshotMeta,
        { ex: upstashSnapshotTtlSec }
      );
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

export const writeUpstashSnapshotShards = async <T>(
  scope: string,
  rows: T[],
  snapshotIdInput?: number | null,
  options?: {
    hasMore?: boolean | null;
  }
): Promise<UpstashSnapshotMeta | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;

  const snapshotId = snapshotIdInput ?? (await advanceUpstashSnapshotCursor(scope));
  if (snapshotId === null) return null;

  const shards = chunkArray(rows, upstashSnapshotShardSize);
  const meta: UpstashSnapshotMeta = {
    snapshotId,
    seq: snapshotId,
    scope,
    shardCount: shards.length,
    marketCount: rows.length,
    createdAt: new Date().toISOString(),
    hasMore: typeof options?.hasMore === "boolean" ? options.hasMore : null,
  };

  try {
    const pipeline = redis.pipeline();
    pipeline.set(buildSnapshotMetaKey(scope, snapshotId), meta, { ex: upstashSnapshotTtlSec });
    shards.forEach((shardRows, shardIndex) => {
      pipeline.set(
        buildSnapshotShardKey(scope, snapshotId, shardIndex),
        {
          snapshotId,
          scope,
          shardIndex,
          rows: shardRows,
        } satisfies UpstashSnapshotShard<T>,
        { ex: upstashSnapshotTtlSec }
      );
    });
    await pipeline.exec();
    return meta;
  } catch {
    return null;
  }
};

export const readUpstashSnapshotMeta = async (
  scope: string,
  snapshotId: number
): Promise<UpstashSnapshotMeta | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(buildSnapshotMetaKey(scope, snapshotId));
    return normalizeSnapshotMeta(maybeJson(raw));
  } catch {
    return null;
  }
};

export const readUpstashSnapshotShard = async <T = unknown>(
  scope: string,
  snapshotId: number,
  shardIndex: number
): Promise<UpstashSnapshotShard<T> | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  try {
    const raw = maybeJson(await redis.get(buildSnapshotShardKey(scope, snapshotId, shardIndex)));
    const parsed = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!parsed) return null;
    const rows = Array.isArray(parsed.rows) ? (parsed.rows as T[]) : null;
    const scopeValue = typeof parsed.scope === "string" ? parsed.scope : "";
    const snapshot = toFiniteOrNull(parsed.snapshotId);
    const shard = toFiniteOrNull(parsed.shardIndex);
    if (!rows || !scopeValue || snapshot === null || shard === null) return null;
    return {
      snapshotId: snapshot,
      scope: scopeValue,
      shardIndex: shard,
      rows,
    };
  } catch {
    return null;
  }
};

export const readUpstashSnapshotRows = async <T = unknown>(
  scope: string,
  snapshotId: number
): Promise<{
  meta: UpstashSnapshotMeta;
  rows: T[];
} | null> => {
  const meta = await readUpstashSnapshotMeta(scope, snapshotId);
  if (!meta || meta.shardCount <= 0) {
    if (meta && meta.shardCount === 0) {
      return {
        meta,
        rows: [],
      };
    }
    return null;
  }

  const shards = await Promise.all(
    Array.from({ length: meta.shardCount }, (_, shardIndex) =>
      readUpstashSnapshotShard<T>(scope, snapshotId, shardIndex)
    )
  );
  if (shards.some((shard) => !shard)) return null;

  const rows: T[] = [];
  for (const shard of shards) {
    if (!shard) return null;
    rows.push(...shard.rows);
  }

  return {
    meta,
    rows,
  };
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

export const writeUpstashMarketOrderbooks = async (
  orderbooks: UpstashMarketOrderbook[]
): Promise<void> => {
  if (!upstashCacheEnabled || orderbooks.length === 0) return;
  const redis = getUpstashRedis();
  if (!redis) return;
  try {
    const pipeline = redis.pipeline();
    for (const orderbook of orderbooks) {
      const marketId = orderbook.marketId.trim();
      if (!marketId) continue;
      const depth = Math.max(1, Math.min(orderbook.depth, upstashOrderbookMaxDepth));
      const payload = {
        ...orderbook,
        marketId,
        depth,
        levels: orderbook.levels.slice(0, depth * 2),
      } satisfies UpstashMarketOrderbook;
      for (const keyDepth of Array.from(new Set([depth, upstashOrderbookMaxDepth]))) {
        pipeline.set(
          buildOrderbookKey(marketId, keyDepth),
          payload,
          { ex: upstashOrderbookTtlSec }
        );
      }
    }
    await pipeline.exec();
  } catch {
    // Best-effort orderbook cache write only.
  }
};

export const readUpstashMarketOrderbook = async (
  marketId: string,
  depth: number
): Promise<UpstashMarketOrderbook | null> => {
  if (!upstashCacheEnabled) return null;
  const redis = getUpstashRedis();
  if (!redis) return null;
  const cleanMarketId = marketId.trim();
  if (!cleanMarketId) return null;
  const safeDepth = Math.max(1, Math.min(depth, upstashOrderbookMaxDepth));
  const candidateDepths = Array.from(new Set([safeDepth, upstashOrderbookMaxDepth]));
  try {
    for (const candidateDepth of candidateDepths) {
      const raw = await redis.get(buildOrderbookKey(cleanMarketId, candidateDepth));
      const normalized = normalizeMarketOrderbook(maybeJson(raw));
      if (!normalized) continue;
      if (normalized.depth <= safeDepth) return normalized;
      return {
        ...normalized,
        depth: safeDepth,
        levels: normalized.levels.slice(0, safeDepth * 2),
      };
    }
    return null;
  } catch {
    return null;
  }
};
