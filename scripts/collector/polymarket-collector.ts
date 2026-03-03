import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { listPolymarketMarketsSnapshot, type PolymarketMarket } from "../../src/server/polymarket/client";
import { parseLiveTick } from "../../src/server/polymarket/liveTickParser";
import { upsertMirroredPolymarketMarkets } from "../../src/server/polymarket/mirror";
import type { Database, Json } from "../../src/types/database";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const MARKET_WS_URL = (
  process.env.POLYMARKET_MARKET_WS_URL ||
  process.env.POLYMARKET_RTDS_WS_URL ||
  "wss://ws-subscriptions-clob.polymarket.com/ws/market"
).trim();
const MARKET_WS_FALLBACK_URL = "wss://ws-live-data.polymarket.com";
const MARKET_WS_URLS = Array.from(
  new Set([MARKET_WS_URL, "wss://ws-subscriptions-clob.polymarket.com/ws/market", MARKET_WS_FALLBACK_URL])
).filter((url) => typeof url === "string" && url.trim().length > 0);
const FLUSH_INTERVAL_MS = Math.max(500, Number(process.env.COLLECTOR_FLUSH_INTERVAL_MS ?? 2_000));
const RECONCILE_INTERVAL_MS = Math.max(60_000, Number(process.env.COLLECTOR_RECONCILE_INTERVAL_MS ?? 300_000));
const HEARTBEAT_TIMEOUT_MS = Math.max(10_000, Number(process.env.COLLECTOR_HEARTBEAT_TIMEOUT_MS ?? 45_000));
const HEARTBEAT_CLOSE_MULTIPLIER = Math.max(2, Number(process.env.COLLECTOR_HEARTBEAT_CLOSE_MULTIPLIER ?? 4));
const WS_SUBSCRIPTION_CHUNK_SIZE = Math.max(50, Math.min(500, Number(process.env.COLLECTOR_WS_SUBSCRIPTION_CHUNK_SIZE ?? 250)));
const RECONNECT_JITTER_MS = Math.max(0, Number(process.env.COLLECTOR_RECONNECT_JITTER_MS ?? 700));
const DEAD_LETTER_LOG_EVERY_MS = Math.max(500, Number(process.env.COLLECTOR_DEAD_LETTER_LOG_EVERY_MS ?? 5000));
const HEALTH_PORT = Math.max(0, Number(process.env.COLLECTOR_HEALTH_PORT ?? 0));
const SNAPSHOT_PAGE_SIZE = Math.max(50, Math.min(250, Number(process.env.COLLECTOR_SNAPSHOT_PAGE_SIZE ?? 150)));
const SNAPSHOT_MAX_PAGES = Math.max(1, Math.min(50, Number(process.env.COLLECTOR_SNAPSHOT_MAX_PAGES ?? 3)));
const NEW_MARKET_POLL_INTERVAL_MS = Math.max(
  5000,
  Number(process.env.COLLECTOR_NEW_MARKET_POLL_INTERVAL_MS ?? 10_000)
);
const NEW_MARKET_POLL_PAGE_SIZE = Math.max(
  20,
  Math.min(200, Number(process.env.COLLECTOR_NEW_MARKET_POLL_PAGE_SIZE ?? 60))
);
const PRUNE_INTERVAL_MS = Math.max(60_000, Number(process.env.COLLECTOR_PRUNE_INTERVAL_MS ?? 3_600_000));
const PRUNE_EXPIRED_AFTER_DAYS = Math.max(1, Number(process.env.COLLECTOR_PRUNE_EXPIRED_AFTER_DAYS ?? 7));
const ENABLE_MISSING_MARKET_PRUNE =
  (process.env.COLLECTOR_ENABLE_MISSING_MARKET_PRUNE || "true").trim().toLowerCase() === "true";
const MISSING_MARKET_SCAN_PAGE_SIZE = Math.max(
  50,
  Math.min(250, Number(process.env.COLLECTOR_MISSING_MARKET_SCAN_PAGE_SIZE ?? 200))
);
const MISSING_MARKET_SCAN_MAX_PAGES = Math.max(
  1,
  Math.min(80, Number(process.env.COLLECTOR_MISSING_MARKET_SCAN_MAX_PAGES ?? 20))
);
const MISSING_MARKET_MISS_THRESHOLD = Math.max(
  1,
  Math.min(20, Number(process.env.COLLECTOR_MISSING_MARKET_MISS_THRESHOLD ?? 3))
);
const MAX_TRACKED_MARKETS = Math.max(20, Number(process.env.COLLECTOR_MAX_TRACKED_MARKETS ?? 500));
const MAX_TRACKED_ASSET_IDS = Math.max(100, Number(process.env.COLLECTOR_MAX_TRACKED_ASSET_IDS ?? 1200));
const LIVE_UPSERT_CHUNK_SIZE = Math.max(100, Math.min(1000, Number(process.env.COLLECTOR_UPSERT_CHUNK_SIZE ?? 400)));
const CANDLE_UPSERT_CHUNK_SIZE = Math.max(100, Math.min(1000, Number(process.env.COLLECTOR_CANDLE_UPSERT_CHUNK_SIZE ?? 400)));
const ENABLE_SNAPSHOT_REALTIME_SEED =
  (process.env.COLLECTOR_ENABLE_SNAPSHOT_REALTIME_SEED || "false").trim().toLowerCase() === "true";
const ENABLE_CANONICAL_REALTIME_MIRROR =
  (process.env.COLLECTOR_ENABLE_CANONICAL_REALTIME_MIRROR || "false").trim().toLowerCase() === "true";

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type JsonMap = Record<string, Json | undefined>;
type LiveStateRow = Pick<
  Database["public"]["Tables"]["polymarket_market_live"]["Row"],
  "market_id" | "source_seq" | "source_ts"
>;

type PendingLive = {
  market_id: string;
  best_bid: number;
  best_ask: number;
  mid: number;
  last_trade_price: number;
  last_trade_size: number;
  rolling_24h_volume: number;
  open_interest: number | null;
  source_seq: number | null;
  source_ts: string;
  updated_at: string;
  ingested_at: string;
};

type PendingCandle = {
  market_id: string;
  bucket_start: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades_count: number;
  source_ts_max: string | null;
  updated_at: string;
};

type PendingTick = {
  market_id: string;
  trade_id: string | null;
  source_seq: number | null;
  source_ts: string;
  side: "BUY" | "SELL" | "UNKNOWN";
  outcome: string | null;
  price: number;
  size: number;
  dedupe_key: string;
  payload: Json | null;
  created_at: string;
  ingested_at: string;
};

const pendingLive = new Map<string, PendingLive>();
const pendingCandles = new Map<string, PendingCandle>();
const pendingTicks = new Map<string, PendingTick>();
const latestLiveState = new Map<string, { sourceSeq: number | null; sourceTsMs: number }>();
const knownMarketFingerprints = new Map<string, string>();
const missingOpenMarketMisses = new Map<string, number>();
const trackedAssetIds = new Set<string>();
let flushing = false;
let lastHeartbeatAt = Date.now();
let lastWsMessageAt = 0;
let lastFlushAt = 0;
let lastReconcileAt = 0;
let lastHeadPollAt = 0;
let deadLetterSuppressed = 0;
let lastDeadLetterLogAt = 0;
const startedAt = Date.now();
let activeSocket: WebSocket | null = null;
const activeSubscribedAssetIds = new Set<string>();
let runningFullSnapshot = false;
let runningHeadSnapshot = false;
let runningPrune = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clampPrice = (value: number): number => Math.max(0, Math.min(1, value));

const toNumber = (value: Json | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, Json | undefined> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Json | undefined>;
};

const parseTsMs = (value: Json | undefined): number | null => {
  const numeric = toNumber(value);
  if (numeric !== null) {
    if (numeric > 10_000_000_000) return Math.floor(numeric);
    if (numeric > 1_000_000_000) return Math.floor(numeric * 1000);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNum = Number(trimmed);
    if (Number.isFinite(asNum)) {
      if (asNum > 10_000_000_000) return Math.floor(asNum);
      if (asNum > 1_000_000_000) return Math.floor(asNum * 1000);
    }
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const minuteBucketIso = (tsMs: number): string => {
  const minute = Math.floor(tsMs / 60_000) * 60_000;
  return new Date(minute).toISOString();
};

const chunkArray = <T>(rows: T[], chunkSize: number): T[][] => {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
};

const fingerprintMarket = (market: PolymarketMarket): string => {
  const outcomes = market.outcomes
    .map((outcome) => `${outcome.id}|${outcome.tokenId ?? ""}|${outcome.title}|${outcome.sortOrder}`)
    .join(";");
  const tokens = market.clobTokenIds.join(",");
  return [
    market.state,
    market.slug,
    market.title,
    market.description ?? "",
    market.imageUrl ?? "",
    market.sourceUrl ?? "",
    market.createdAt,
    market.closesAt,
    market.expiresAt,
    market.category ?? "",
    market.resolvedOutcomeTitle ?? "",
    outcomes,
    tokens,
  ].join("||");
};

const selectChangedMarkets = (markets: PolymarketMarket[]): PolymarketMarket[] => {
  const changed: PolymarketMarket[] = [];
  for (const market of markets) {
    const nextFingerprint = fingerprintMarket(market);
    const previousFingerprint = knownMarketFingerprints.get(market.id);
    if (previousFingerprint !== nextFingerprint) {
      changed.push(market);
    }
    knownMarketFingerprints.set(market.id, nextFingerprint);
  }
  return changed;
};

const collectTrackedAssetIds = (markets: PolymarketMarket[]): Set<string> => {
  const out = new Set<string>();
  for (const market of markets.slice(0, MAX_TRACKED_MARKETS)) {
    for (const tokenId of Array.isArray(market.clobTokenIds) ? market.clobTokenIds : []) {
      if (typeof tokenId !== "string" || tokenId.trim().length === 0) continue;
      out.add(tokenId.trim());
      if (out.size >= MAX_TRACKED_ASSET_IDS) return out;
    }
    for (const outcome of market.outcomes) {
      if (typeof outcome.tokenId !== "string" || outcome.tokenId.trim().length === 0) continue;
      out.add(outcome.tokenId.trim());
      if (out.size >= MAX_TRACKED_ASSET_IDS) return out;
    }
  }
  return out;
};

const mergeTrackedAssetIds = (markets: PolymarketMarket[]) => {
  if (trackedAssetIds.size >= MAX_TRACKED_ASSET_IDS) return;
  for (const market of markets.slice(0, Math.max(10, Math.min(100, MAX_TRACKED_MARKETS)))) {
    for (const tokenId of Array.isArray(market.clobTokenIds) ? market.clobTokenIds : []) {
      if (typeof tokenId !== "string" || tokenId.trim().length === 0) continue;
      trackedAssetIds.add(tokenId.trim());
      if (trackedAssetIds.size >= MAX_TRACKED_ASSET_IDS) return;
    }
    for (const outcome of market.outcomes) {
      if (typeof outcome.tokenId !== "string" || outcome.tokenId.trim().length === 0) continue;
      trackedAssetIds.add(outcome.tokenId.trim());
      if (trackedAssetIds.size >= MAX_TRACKED_ASSET_IDS) return;
    }
  }
};

const parseIsoOrNull = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const parseExpiryFromPayload = (payload: unknown): string | null => {
  const rec = asRecord(payload);
  if (!rec) return null;
  const expiresAt = parseIsoOrNull(rec.expires_at) ?? parseIsoOrNull(rec.expiresAt);
  if (expiresAt) return expiresAt;
  return parseIsoOrNull(rec.closes_at) ?? parseIsoOrNull(rec.closesAt);
};

const chunkStrings = (values: string[], size: number): string[][] => {
  const out: string[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
};

const deleteLegacyPolymarketRows = async (marketIds: string[]) => {
  if (marketIds.length === 0) return;
  for (const chunk of chunkStrings(marketIds, 400)) {
    await (supabase as any).from("polymarket_candles_1m").delete().in("market_id", chunk);
    await (supabase as any).from("polymarket_market_live").delete().in("market_id", chunk);
    await (supabase as any).from("polymarket_market_cache").delete().in("market_id", chunk);
  }
};

const deleteCanonicalPolymarketRowsByProviderIds = async (providerMarketIds: string[]) => {
  if (providerMarketIds.length === 0) return;
  for (const chunk of chunkStrings(providerMarketIds, 400)) {
    await (supabase as any)
      .from("market_catalog")
      .delete()
      .eq("provider", "polymarket")
      .in("provider_market_id", chunk);
  }
};

const pruneExpiredMarkets = async () => {
  const cutoffIso = new Date(Date.now() - PRUNE_EXPIRED_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: legacyRows, error: legacyError } = await (supabase as any)
    .from("polymarket_market_cache")
    .select("market_id, expires_at")
    .lt("expires_at", cutoffIso)
    .limit(8000);
  if (legacyError) {
    console.warn("[collector] prune expired legacy query failed", legacyError.message);
  }
  const legacyIdsSet = new Set<string>();
  for (const row of legacyRows ?? []) {
    const marketId = String((row as Record<string, unknown>).market_id ?? "").trim();
    if (!marketId) continue;
    legacyIdsSet.add(marketId);
  }
  const legacyIds = Array.from(legacyIdsSet);

  const { data: canonicalRows, error: canonicalError } = await (supabase as any)
    .from("market_catalog")
    .select("provider_market_id, provider_payload")
    .eq("provider", "polymarket")
    .limit(8000);
  if (canonicalError) {
    console.warn("[collector] prune expired canonical query failed", canonicalError.message);
  }

  const canonicalIdsSet = new Set<string>();
  for (const row of canonicalRows ?? []) {
    const rec = row as Record<string, unknown>;
    const expiryIso = parseExpiryFromPayload(rec.provider_payload);
    if (!expiryIso || expiryIso > cutoffIso) continue;
    const marketId = String(rec.provider_market_id ?? "").trim();
    if (!marketId) continue;
    canonicalIdsSet.add(marketId);
  }
  const canonicalIds = Array.from(canonicalIdsSet);

  const idsToDelete = Array.from(new Set([...legacyIds, ...canonicalIds]));
  if (idsToDelete.length === 0) return;

  await deleteLegacyPolymarketRows(idsToDelete);
  await deleteCanonicalPolymarketRowsByProviderIds(idsToDelete);
  for (const marketId of idsToDelete) {
    latestLiveState.delete(marketId);
    knownMarketFingerprints.delete(marketId);
    missingOpenMarketMisses.delete(marketId);
  }
  console.log(`[collector] prune expired removed=${idsToDelete.length} cutoff=${cutoffIso}`);
};

const pruneMissingOpenMarkets = async () => {
  if (!ENABLE_MISSING_MARKET_PRUNE) return;

  const coverageMarkets = await listPolymarketMarketsSnapshot({
    scope: "open",
    pageSize: MISSING_MARKET_SCAN_PAGE_SIZE,
    maxPages: MISSING_MARKET_SCAN_MAX_PAGES,
    hydrateMidpoints: false,
  });
  const maxCoverage = MISSING_MARKET_SCAN_PAGE_SIZE * MISSING_MARKET_SCAN_MAX_PAGES;
  if (coverageMarkets.length >= maxCoverage) {
    console.warn(
      `[collector] missing prune skipped because coverage may be truncated fetched=${coverageMarkets.length} max=${maxCoverage}`
    );
    return;
  }

  const openNow = new Set(
    coverageMarkets
      .map((market) => market.id)
      .filter((id) => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
  );

  const [legacyOpenRes, canonicalOpenRes] = await Promise.all([
    (supabase as any)
      .from("polymarket_market_cache")
      .select("market_id")
      .eq("state", "open")
      .limit(8000),
    (supabase as any)
      .from("market_catalog")
      .select("provider_market_id")
      .eq("provider", "polymarket")
      .eq("state", "open")
      .limit(8000),
  ]);

  const currentOpenIds = Array.from(
    new Set([
      ...(legacyOpenRes.data ?? [])
        .map((row: Record<string, unknown>) => String(row.market_id ?? "").trim())
        .filter(Boolean),
      ...(canonicalOpenRes.data ?? [])
        .map((row: Record<string, unknown>) => String(row.provider_market_id ?? "").trim())
        .filter(Boolean),
    ])
  );

  const staleIds: string[] = [];
  for (const marketId of currentOpenIds) {
    if (openNow.has(marketId)) {
      missingOpenMarketMisses.delete(marketId);
      continue;
    }
    const nextMisses = (missingOpenMarketMisses.get(marketId) ?? 0) + 1;
    missingOpenMarketMisses.set(marketId, nextMisses);
    if (nextMisses >= MISSING_MARKET_MISS_THRESHOLD) {
      staleIds.push(marketId);
    }
  }

  if (staleIds.length === 0) return;

  await deleteLegacyPolymarketRows(staleIds);
  await deleteCanonicalPolymarketRowsByProviderIds(staleIds);

  for (const marketId of staleIds) {
    latestLiveState.delete(marketId);
    knownMarketFingerprints.delete(marketId);
    missingOpenMarketMisses.delete(marketId);
  }
  console.log(
    `[collector] prune missing-open removed=${staleIds.length} threshold=${MISSING_MARKET_MISS_THRESHOLD}`
  );
};

const pruneStaleMarkets = async () => {
  if (runningPrune) return;
  runningPrune = true;
  try {
    await pruneExpiredMarkets();
    await pruneMissingOpenMarkets();
  } catch (error) {
    console.error("[collector] prune failed", error instanceof Error ? error.message : String(error));
  } finally {
    runningPrune = false;
  }
};

const resolveCatalogIds = async (providerMarketIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (providerMarketIds.length === 0) return out;
  const unique = Array.from(new Set(providerMarketIds.filter(Boolean)));
  const chunkSize = 300;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from("market_catalog")
      .select("id, provider_market_id")
      .eq("provider", "polymarket")
      .in("provider_market_id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const providerMarketId = String((row as Record<string, unknown>).provider_market_id ?? "").trim();
      const id = String((row as Record<string, unknown>).id ?? "").trim();
      if (providerMarketId && id) out.set(providerMarketId, id);
    }
  }

  return out;
};

const upsertRowsInChunks = async (
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize: number,
  errorLabel: string
) => {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const { error } = await (supabase as any)
      .from(table)
      .upsert(batch, { onConflict });
    if (error) {
      throw new Error(`${errorLabel}:${error.message}`);
    }
  }
};

const mirrorIntoCanonicalRealtime = async (liveRows: PendingLive[], candleRows: PendingCandle[]) => {
  const providerMarketIds = Array.from(
    new Set([
      ...liveRows.map((row) => row.market_id),
      ...candleRows.map((row) => row.market_id),
    ])
  );

  const catalogIds = await resolveCatalogIds(providerMarketIds);
  if (catalogIds.size === 0) return;

  const canonicalLiveRows = liveRows
    .map((row) => {
      const marketRefId = catalogIds.get(row.market_id);
      if (!marketRefId) return null;
      return {
        market_id: marketRefId,
        best_bid: row.best_bid,
        best_ask: row.best_ask,
        mid: row.mid,
        last_trade_price: row.last_trade_price,
        last_trade_size: row.last_trade_size,
        rolling_24h_volume: row.rolling_24h_volume,
        open_interest: row.open_interest,
        source_seq: row.source_seq,
        source_ts: row.source_ts,
        updated_at: row.updated_at,
        ingested_at: row.ingested_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const canonicalCandleRows = candleRows
    .map((row) => {
      const marketRefId = catalogIds.get(row.market_id);
      if (!marketRefId) return null;
      return {
        market_id: marketRefId,
        outcome_key: "__market__",
        bucket_start: row.bucket_start,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        trades_count: row.trades_count,
        source_ts_max: row.source_ts_max,
        updated_at: row.updated_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (canonicalLiveRows.length > 0) {
    try {
      await upsertRowsInChunks(
        "market_live",
        canonicalLiveRows as unknown as Record<string, unknown>[],
        "market_id",
        LIVE_UPSERT_CHUNK_SIZE,
        "CANONICAL_LIVE_UPSERT_FAILED"
      );
    } catch (error) {
      console.error("[collector] canonical live upsert failed", error instanceof Error ? error.message : String(error));
    }
  }

  if (canonicalCandleRows.length > 0) {
    try {
      await upsertRowsInChunks(
        "market_candles_1m",
        canonicalCandleRows as unknown as Record<string, unknown>[],
        "market_id,outcome_key,bucket_start",
        CANDLE_UPSERT_CHUNK_SIZE,
        "CANONICAL_CANDLE_UPSERT_FAILED"
      );
    } catch (error) {
      console.error("[collector] canonical candle upsert failed", error instanceof Error ? error.message : String(error));
    }
  }
};

const rememberLiveState = (row: { market_id: string; source_seq: number | null; source_ts: string }) => {
  const marketId = row.market_id.trim();
  if (!marketId) return;
  const parsedTs = Date.parse(row.source_ts);
  const sourceTsMs = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  const sourceSeq = row.source_seq !== null && Number.isFinite(row.source_seq) ? Math.floor(row.source_seq) : null;
  const existing = latestLiveState.get(marketId);
  if (!existing) {
    latestLiveState.set(marketId, { sourceSeq, sourceTsMs });
    return;
  }
  latestLiveState.set(marketId, {
    sourceSeq:
      sourceSeq === null
        ? existing.sourceSeq
        : existing.sourceSeq === null
          ? sourceSeq
          : Math.max(existing.sourceSeq, sourceSeq),
    sourceTsMs: Math.max(existing.sourceTsMs, sourceTsMs),
  });
};

const isStaleLiveUpdate = (update: PendingLive): boolean => {
  const current = latestLiveState.get(update.market_id);
  if (!current) return false;
  if (
    current.sourceSeq !== null &&
    update.source_seq !== null &&
    Number.isFinite(update.source_seq) &&
    update.source_seq < current.sourceSeq
  ) {
    return true;
  }
  const nextTs = Date.parse(update.source_ts);
  return Number.isFinite(nextTs) && nextTs < current.sourceTsMs;
};

const logDeadLetter = (reason: string, payload: unknown) => {
  const now = Date.now();
  if (now - lastDeadLetterLogAt < DEAD_LETTER_LOG_EVERY_MS) {
    deadLetterSuppressed += 1;
    return;
  }
  const suppressed = deadLetterSuppressed;
  deadLetterSuppressed = 0;
  lastDeadLetterLogAt = now;
  let preview = "";
  try {
    preview = typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch {
    preview = "[unserializable]";
  }
  const compactPreview = preview.slice(0, 240).replace(/\s+/g, " ");
  const suffix = suppressed > 0 ? `; suppressed=${suppressed}` : "";
  console.warn(`[collector] dead-letter ${reason}${suffix}: ${compactPreview}`);
};

const looksLikeLivePayload = (payload: JsonMap): boolean => {
  const keys: Array<keyof JsonMap> = [
    "price",
    "mid",
    "best_bid",
    "best_ask",
    "last_trade_price",
    "volume",
    "rolling_24h_volume",
    "source_seq",
    "seq",
    "timestamp",
    "ts",
    "bids",
    "asks",
    "price_changes",
  ];
  return keys.some((key) => payload[key] !== undefined);
};

const isNewMarketEventPayload = (payload: JsonMap): boolean => {
  const candidates = [
    payload.event,
    payload.event_type,
    payload.eventType,
    payload.type,
    payload.channel,
    payload.topic,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLowerCase();
    if (normalized.includes("new_market") || normalized.includes("newmarket")) {
      return true;
    }
  }
  return false;
};

const startHealthServer = () => {
  if (HEALTH_PORT <= 0) return;
  const server = createServer((req, res) => {
    const path = String(req.url ?? "/");
    if (path !== "/health" && path !== "/ready") {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("not found");
      return;
    }
    const now = Date.now();
    const recentSignalAt = Math.max(lastHeartbeatAt, lastWsMessageAt);
    const websocketHealthy = recentSignalAt > 0 && now - recentSignalAt <= HEARTBEAT_TIMEOUT_MS * 2;
    const reconcileHealthy =
      lastReconcileAt > 0 && now - lastReconcileAt <= Math.max(RECONCILE_INTERVAL_MS * 3, 180_000);
    const headPollHealthy =
      lastHeadPollAt > 0 &&
      now - lastHeadPollAt <= Math.max(NEW_MARKET_POLL_INTERVAL_MS * 4, 60_000);
    const ready = websocketHealthy && reconcileHealthy && headPollHealthy;
    const payload = {
      ok: path === "/health" ? true : ready,
      ready,
      uptimeSec: Math.floor((now - startedAt) / 1000),
      pendingLive: pendingLive.size,
      pendingCandles: pendingCandles.size,
      pendingTicks: pendingTicks.size,
      lastHeartbeatAt: lastHeartbeatAt > 0 ? new Date(lastHeartbeatAt).toISOString() : null,
      lastWsMessageAt: lastWsMessageAt > 0 ? new Date(lastWsMessageAt).toISOString() : null,
      lastFlushAt: lastFlushAt > 0 ? new Date(lastFlushAt).toISOString() : null,
      lastReconcileAt: lastReconcileAt > 0 ? new Date(lastReconcileAt).toISOString() : null,
      lastHeadPollAt: lastHeadPollAt > 0 ? new Date(lastHeadPollAt).toISOString() : null,
      websocketHealthy,
      reconcileHealthy,
      headPollHealthy,
      trackedAssetIds: trackedAssetIds.size,
    };
    res.statusCode = path === "/ready" && !ready ? 503 : 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  });
  server.listen(HEALTH_PORT, () => {
    console.log(`[collector] health probe listening on :${HEALTH_PORT}`);
  });
};

const loadPersistedLiveState = async () => {
  const { data, error } = await supabase
    .from("polymarket_market_live")
    .select("market_id, source_seq, source_ts")
    .limit(5000);
  if (error) {
    console.warn("[collector] unable to preload persisted live state", error.message);
    return;
  }
  for (const row of (data ?? []) as LiveStateRow[]) {
    rememberLiveState({
      market_id: row.market_id,
      source_seq: row.source_seq ?? null,
      source_ts: row.source_ts,
    });
  }
  if (latestLiveState.size > 0) {
    console.log(`[collector] preloaded ${latestLiveState.size} persisted live states`);
  }
};

const parseMarketId = (payload: JsonMap): string | null => {
  const candidates = [
    payload.market_id,
    payload.marketId,
    payload.market,
    payload.condition_id,
    payload.conditionId,
    payload.asset_id,
    payload.assetId,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

const parseBookPrice = (value: Json | undefined, side: "bid" | "ask"): number | null => {
  if (!Array.isArray(value) || value.length === 0) return null;
  const prices: number[] = [];
  for (const level of value) {
    const rec = asRecord(level);
    if (!rec) continue;
    const p = toNumber(rec.price ?? rec.p);
    if (p !== null) {
      prices.push(clampPrice(p > 1 ? p / 100 : p));
    }
  }
  if (prices.length === 0) return null;
  return side === "bid" ? Math.max(...prices) : Math.min(...prices);
};

const parseBestFromPriceChanges = (value: Json | undefined): { bid: number | null; ask: number | null } => {
  if (!Array.isArray(value) || value.length === 0) return { bid: null, ask: null };
  let bestBid: number | null = null;
  let bestAsk: number | null = null;
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const side = typeof rec.side === "string" ? rec.side.trim().toUpperCase() : "";
    const rawPrice = toNumber(rec.price ?? rec.p);
    if (rawPrice === null) continue;
    const price = clampPrice(rawPrice > 1 ? rawPrice / 100 : rawPrice);
    if (side === "BUY") {
      bestBid = bestBid === null ? price : Math.max(bestBid, price);
    } else if (side === "SELL") {
      bestAsk = bestAsk === null ? price : Math.min(bestAsk, price);
    }
  }
  return { bid: bestBid, ask: bestAsk };
};

const parseIncomingUpdate = (payload: JsonMap): PendingLive | null => {
  const marketId = parseMarketId(payload);
  if (!marketId) return null;

  const nowIso = new Date().toISOString();
  const sourceTsMs = parseTsMs(payload.source_ts ?? payload.timestamp ?? payload.ts) ?? Date.now();
  const sourceTsIso = new Date(sourceTsMs).toISOString();

  const prev = pendingLive.get(marketId);
  const priceChanges = parseBestFromPriceChanges(payload.price_changes ?? payload.changes);
  const parsedBidFromBook = parseBookPrice(payload.bids, "bid");
  const parsedAskFromBook = parseBookPrice(payload.asks, "ask");

  const mid = toNumber(payload.mid ?? payload.price ?? payload.last_trade_price ?? payload.lastPrice);
  const bestBidRaw =
    toNumber(payload.best_bid ?? payload.bid ?? payload.bestBid) ??
    priceChanges.bid ??
    parsedBidFromBook ??
    prev?.best_bid ??
    0;
  const bestAskRaw =
    toNumber(payload.best_ask ?? payload.ask ?? payload.bestAsk) ??
    priceChanges.ask ??
    parsedAskFromBook ??
    prev?.best_ask ??
    0;
  const lastTradePrice =
    toNumber(payload.last_trade_price ?? payload.price ?? payload.lastPrice) ?? prev?.last_trade_price ?? 0;
  const lastTradeSize =
    toNumber(payload.last_trade_size ?? payload.size ?? payload.trade_size ?? payload.amount) ?? 0;
  const rolling24hVolume =
    toNumber(payload.rolling_24h_volume ?? payload.volume ?? payload.volume_24h) ??
    prev?.rolling_24h_volume ??
    0;
  const openInterest = toNumber(payload.open_interest ?? payload.openInterest ?? payload.oi);
  const sourceSeq =
    toNumber(payload.source_seq ?? payload.seq ?? payload.sequence) ??
    prev?.source_seq ??
    null;

  const bestBid = clampPrice(bestBidRaw > 1 ? bestBidRaw / 100 : bestBidRaw);
  const bestAsk = clampPrice(bestAskRaw > 1 ? bestAskRaw / 100 : bestAskRaw);
  const derivedMid = bestBid > 0 && bestAsk > 0 ? clampPrice((bestBid + bestAsk) / 2) : prev?.mid ?? 0;
  const normalizedMid =
    mid !== null
      ? clampPrice(mid > 1 ? mid / 100 : mid)
      : derivedMid;
  const normalizedTradePrice = clampPrice(lastTradePrice > 1 ? lastTradePrice / 100 : lastTradePrice);

  return {
    market_id: marketId,
    best_bid: bestBid,
    best_ask: bestAsk,
    mid: normalizedMid,
    last_trade_price: normalizedTradePrice,
    last_trade_size: Math.max(0, lastTradeSize),
    rolling_24h_volume: Math.max(0, rolling24hVolume),
    open_interest: openInterest,
    source_seq: sourceSeq,
    source_ts: sourceTsIso,
    updated_at: nowIso,
    ingested_at: nowIso,
  };
};

const parseIncomingTick = (payload: JsonMap, live: PendingLive): PendingTick | null => {
  const parsed = parseLiveTick(payload as Record<string, unknown>, {
    marketId: live.market_id,
    sourceSeq: live.source_seq,
    sourceTs: live.source_ts,
    lastTradePrice: live.last_trade_price,
  });
  if (!parsed) return null;
  const nowIso = new Date().toISOString();

  return {
    market_id: parsed.marketId,
    trade_id: parsed.tradeId,
    source_seq: parsed.sourceSeq,
    source_ts: parsed.sourceTs,
    side: parsed.side,
    outcome: parsed.outcome,
    price: parsed.price,
    size: parsed.size,
    dedupe_key: parsed.dedupeKey,
    payload,
    created_at: parsed.sourceTs,
    ingested_at: nowIso,
  };
};

const applyCandleFromLive = (live: PendingLive) => {
  const tsMs = Date.parse(live.source_ts);
  const bucket = minuteBucketIso(Number.isFinite(tsMs) ? tsMs : Date.now());
  const key = `${live.market_id}:${bucket}`;
  const nowIso = new Date().toISOString();
  const tradePrice = clampPrice(live.last_trade_price || live.mid);
  const tradeVolume = Math.max(0, live.last_trade_size);

  const existing = pendingCandles.get(key);
  if (!existing) {
    pendingCandles.set(key, {
      market_id: live.market_id,
      bucket_start: bucket,
      open: tradePrice,
      high: tradePrice,
      low: tradePrice,
      close: tradePrice,
      volume: tradeVolume,
      trades_count: tradeVolume > 0 ? 1 : 0,
      source_ts_max: live.source_ts,
      updated_at: nowIso,
    });
    return;
  }

  pendingCandles.set(key, {
    ...existing,
    high: Math.max(existing.high, tradePrice),
    low: Math.min(existing.low, tradePrice),
    close: tradePrice,
    volume: existing.volume + tradeVolume,
    trades_count: existing.trades_count + (tradeVolume > 0 ? 1 : 0),
    source_ts_max: live.source_ts,
    updated_at: nowIso,
  });
};

const flushPending = async () => {
  if (flushing) return;
  if (pendingLive.size === 0 && pendingCandles.size === 0 && pendingTicks.size === 0) return;

  flushing = true;
  let liveRows: PendingLive[] = [];
  let candleRows: PendingCandle[] = [];
  let tickRows: PendingTick[] = [];
  try {
    if (pendingLive.size > 0) {
      liveRows = Array.from(pendingLive.values());
      pendingLive.clear();
      try {
        await upsertRowsInChunks(
          "polymarket_market_live",
          liveRows as unknown as Record<string, unknown>[],
          "market_id",
          LIVE_UPSERT_CHUNK_SIZE,
          "LIVE_UPSERT_FAILED"
        );
      } catch (error) {
        console.error("[collector] live upsert failed", error instanceof Error ? error.message : String(error));
      }
    }

    if (pendingCandles.size > 0) {
      candleRows = Array.from(pendingCandles.values());
      pendingCandles.clear();
      try {
        await upsertRowsInChunks(
          "polymarket_candles_1m",
          candleRows as unknown as Record<string, unknown>[],
          "market_id,bucket_start",
          CANDLE_UPSERT_CHUNK_SIZE,
          "CANDLE_UPSERT_FAILED"
        );
      } catch (error) {
        console.error("[collector] candle upsert failed", error instanceof Error ? error.message : String(error));
      }
    }

    if (pendingTicks.size > 0) {
      tickRows = Array.from(pendingTicks.values());
      pendingTicks.clear();
      try {
        await upsertRowsInChunks(
          "polymarket_market_ticks",
          tickRows as unknown as Record<string, unknown>[],
          "dedupe_key",
          LIVE_UPSERT_CHUNK_SIZE,
          "TICK_UPSERT_FAILED"
        );
      } catch (error) {
        console.error("[collector] tick upsert failed", error instanceof Error ? error.message : String(error));
      }
    }

    if (ENABLE_CANONICAL_REALTIME_MIRROR && (liveRows.length > 0 || candleRows.length > 0)) {
      await mirrorIntoCanonicalRealtime(liveRows, candleRows);
    }
  } finally {
    lastFlushAt = Date.now();
    flushing = false;
  }
};

const syncSnapshot = async (mode: "full" | "head") => {
  if (mode === "full") {
    if (runningFullSnapshot) return;
    runningFullSnapshot = true;
  } else {
    if (runningHeadSnapshot || runningFullSnapshot) return;
    runningHeadSnapshot = true;
  }

  try {
    const markets = await listPolymarketMarketsSnapshot({
      scope: "open",
      pageSize: mode === "head" ? NEW_MARKET_POLL_PAGE_SIZE : SNAPSHOT_PAGE_SIZE,
      maxPages: mode === "head" ? 1 : SNAPSHOT_MAX_PAGES,
      hydrateMidpoints: false,
    });

    if (markets.length === 0) return;

    const changedMarkets = selectChangedMarkets(markets);
    if (changedMarkets.length > 0) {
      await upsertMirroredPolymarketMarkets(supabase, changedMarkets);
    }

    if (ENABLE_SNAPSHOT_REALTIME_SEED) {
      const nowIso = new Date().toISOString();
      const liveRows: PendingLive[] = changedMarkets
        .filter((market) => !latestLiveState.has(market.id))
        .map((market) => {
          const yes = market.outcomes[0]?.price ?? 0.5;
          const no = market.outcomes[1]?.price ?? Math.max(0, 1 - yes);
          const bid = Math.max(0, Math.min(1, Math.min(yes, no)));
          const ask = Math.max(0, Math.min(1, Math.max(yes, no)));
          return {
            market_id: market.id,
            best_bid: bid,
            best_ask: ask,
            mid: clampPrice(yes),
            last_trade_price: clampPrice(yes),
            last_trade_size: 0,
            rolling_24h_volume: Math.max(0, market.volume),
            open_interest: null,
            source_seq: null,
            source_ts: nowIso,
            updated_at: nowIso,
            ingested_at: nowIso,
          };
        });

      if (liveRows.length > 0) {
        try {
          await upsertRowsInChunks(
            "polymarket_market_live",
            liveRows as unknown as Record<string, unknown>[],
            "market_id",
            LIVE_UPSERT_CHUNK_SIZE,
            "SNAPSHOT_LIVE_UPSERT_FAILED"
          );
        } catch (error) {
          console.error("[collector] snapshot live upsert failed", error instanceof Error ? error.message : String(error));
        }

        if (ENABLE_CANONICAL_REALTIME_MIRROR) {
          await mirrorIntoCanonicalRealtime(liveRows, []);
        }

        for (const row of liveRows) {
          rememberLiveState(row);
        }
        console.log(`[collector] snapshot seeded realtime for ${liveRows.length} new markets`);
      }
    }

    if (mode === "full") {
      const nextTrackedAssetIds = collectTrackedAssetIds(markets);
      trackedAssetIds.clear();
      for (const assetId of nextTrackedAssetIds) {
        trackedAssetIds.add(assetId);
      }
    } else {
      mergeTrackedAssetIds(markets);
    }

    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      await syncMarketSubscriptions(activeSocket, false);
    }

    const tag = mode === "head" ? "head sync" : "snapshot sync";
    console.log(
      `[collector] ${tag} fetched=${markets.length} changed=${changedMarkets.length} trackedAssets=${trackedAssetIds.size}`
    );
  } finally {
    const now = Date.now();
    if (mode === "full") {
      lastReconcileAt = now;
      runningFullSnapshot = false;
    } else {
      lastHeadPollAt = now;
      runningHeadSnapshot = false;
    }
  }
};

const extractMessages = (payload: Json): JsonMap[] => {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is JsonMap => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }
  if (payload && typeof payload === "object") {
    const rec = payload as JsonMap;
    if (Array.isArray(rec.data)) {
      return rec.data.filter(
        (row): row is JsonMap => Boolean(row && typeof row === "object" && !Array.isArray(row))
      );
    }
    return [rec];
  }
  return [];
};

const syncMarketSubscriptions = async (socket: WebSocket, forceResubscribe: boolean) => {
  const desiredAssetIds = Array.from(trackedAssetIds);
  if (desiredAssetIds.length === 0) return;

  if (forceResubscribe) {
    activeSubscribedAssetIds.clear();
  }

  const toSubscribe = desiredAssetIds.filter((assetId) => !activeSubscribedAssetIds.has(assetId));
  const toUnsubscribe = forceResubscribe
    ? []
    : Array.from(activeSubscribedAssetIds).filter((assetId) => !trackedAssetIds.has(assetId));

  for (const chunk of chunkArray(toSubscribe, WS_SUBSCRIPTION_CHUNK_SIZE)) {
    const payload: Record<string, unknown> = {
      type: "market",
      assets_ids: chunk,
      custom_feature_enabled: true,
    };
    if (!forceResubscribe) {
      payload.operation = "subscribe";
    }
    try {
      socket.send(JSON.stringify(payload));
      for (const assetId of chunk) activeSubscribedAssetIds.add(assetId);
    } catch {
      // ignore send failures
    }
  }

  for (const chunk of chunkArray(toUnsubscribe, WS_SUBSCRIPTION_CHUNK_SIZE)) {
    const payload = {
      type: "market",
      operation: "unsubscribe",
      assets_ids: chunk,
      custom_feature_enabled: true,
    };
    try {
      socket.send(JSON.stringify(payload));
      for (const assetId of chunk) activeSubscribedAssetIds.delete(assetId);
    } catch {
      // ignore send failures
    }
  }

  if (toSubscribe.length > 0 || toUnsubscribe.length > 0) {
    console.log(
      `[collector] ws subscriptions synced subscribed=${activeSubscribedAssetIds.size} added=${toSubscribe.length} removed=${toUnsubscribe.length}`
    );
  }
};

const runWsLoop = async () => {
  let attempt = 0;
  const stableThresholdMs = Math.max(30_000, HEARTBEAT_TIMEOUT_MS);

  while (true) {
    const wsUrl = MARKET_WS_URLS[Math.abs(attempt) % MARKET_WS_URLS.length] ?? MARKET_WS_URL;
    try {
      if (trackedAssetIds.size === 0) {
        await wait(2000);
        continue;
      }
      console.log("[collector] connecting", wsUrl);
      const socket = new WebSocket(wsUrl);
      lastHeartbeatAt = Date.now();
      activeSocket = socket;
      activeSubscribedAssetIds.clear();

      const session = await new Promise<{ stableMs: number }>((resolve, reject) => {
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        const openedAt = Date.now();

        socket.onopen = () => {
          console.log("[collector] ws connected");
          void syncMarketSubscriptions(socket, true);
          heartbeatTimer = setInterval(() => {
            if (Date.now() - lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS * HEARTBEAT_CLOSE_MULTIPLIER) {
              console.warn("[collector] ws heartbeat timeout, reconnecting");
              try {
                socket.close();
              } catch {
                // ignore
              }
            }
          }, Math.min(HEARTBEAT_TIMEOUT_MS, 10_000));
        };

        socket.onmessage = (event) => {
          lastHeartbeatAt = Date.now();
          lastWsMessageAt = lastHeartbeatAt;
          const raw = typeof event.data === "string" ? event.data : "";
          if (!raw) return;

          try {
            const parsed = JSON.parse(raw) as Json;
            const messages = extractMessages(parsed);
            for (const message of messages) {
              if (isNewMarketEventPayload(message)) {
                void syncSnapshot("head").catch((error) => {
                  console.error(
                    "[collector] new-market head sync failed",
                    error instanceof Error ? error.message : String(error)
                  );
                });
                continue;
              }

              const update = parseIncomingUpdate(message);
              if (!update) {
                if (looksLikeLivePayload(message)) {
                  logDeadLetter("missing_market_id", message);
                }
                continue;
              }
              if (isStaleLiveUpdate(update)) {
                continue;
              }

              rememberLiveState(update);
              pendingLive.set(update.market_id, update);
              applyCandleFromLive(update);
              const tick = parseIncomingTick(message, update);
              if (tick) {
                pendingTicks.set(tick.dedupe_key, tick);
              }
            }
          } catch {
            logDeadLetter("invalid_json", raw);
          }
        };

        socket.onerror = (event) => {
          console.error("[collector] ws error", event);
        };

        socket.onclose = (event) => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (activeSocket === socket) {
            activeSocket = null;
            activeSubscribedAssetIds.clear();
          }
          const reason = typeof event.reason === "string" && event.reason.trim() ? event.reason.trim() : "no_reason";
          console.warn(`[collector] ws closed code=${event.code} reason=${reason}`);
          resolve({ stableMs: Date.now() - openedAt });
        };

        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(new Error("WS_CONNECT_TIMEOUT"));
          }
        }, 15_000);
      });
      if (session.stableMs >= stableThresholdMs) {
        attempt = 0;
      } else {
        attempt += 1;
      }
      const baseBackoffMs = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      const jitterMs = RECONNECT_JITTER_MS > 0 ? Math.floor(Math.random() * RECONNECT_JITTER_MS) : 0;
      await wait(baseBackoffMs + jitterMs);
    } catch (error) {
      const baseBackoffMs = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      const jitterMs = RECONNECT_JITTER_MS > 0 ? Math.floor(Math.random() * RECONNECT_JITTER_MS) : 0;
      const backoffMs = baseBackoffMs + jitterMs;
      console.error(
        "[collector] ws loop error",
        error instanceof Error ? `${error.message} (${wsUrl})` : `${String(error)} (${wsUrl})`
      );
      if (activeSocket && activeSocket.readyState !== WebSocket.OPEN) {
        activeSocket = null;
        activeSubscribedAssetIds.clear();
      }
      attempt += 1;
      await wait(backoffMs);
    }
  }
};

const start = async () => {
  console.log(
    `[collector] starting flush=${FLUSH_INTERVAL_MS}ms headPoll=${NEW_MARKET_POLL_INTERVAL_MS}ms reconcile=${RECONCILE_INTERVAL_MS}ms prune=${PRUNE_INTERVAL_MS}ms snapshotSeed=${ENABLE_SNAPSHOT_REALTIME_SEED} canonicalMirror=${ENABLE_CANONICAL_REALTIME_MIRROR}`
  );
  startHealthServer();
  await loadPersistedLiveState();
  await syncSnapshot("full");
  await syncSnapshot("head");
  await pruneStaleMarkets();

  setInterval(() => {
    void flushPending();
  }, FLUSH_INTERVAL_MS);

  setInterval(() => {
    void syncSnapshot("head").catch((error) => {
      console.error("[collector] head snapshot failed", error instanceof Error ? error.message : String(error));
    });
  }, NEW_MARKET_POLL_INTERVAL_MS);

  setInterval(() => {
    void syncSnapshot("full").catch((error) => {
      console.error("[collector] reconcile snapshot failed", error instanceof Error ? error.message : String(error));
    });
  }, RECONCILE_INTERVAL_MS);

  setInterval(() => {
    void pruneStaleMarkets();
  }, PRUNE_INTERVAL_MS);

  await runWsLoop();
};

void start().catch((error) => {
  console.error("[collector] fatal", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
