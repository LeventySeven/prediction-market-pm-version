import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { listPolymarketMarketsSnapshot } from "../../src/server/polymarket/client";
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
const FLUSH_INTERVAL_MS = Math.max(250, Number(process.env.COLLECTOR_FLUSH_INTERVAL_MS ?? 700));
const RECONCILE_INTERVAL_MS = Math.max(30_000, Number(process.env.COLLECTOR_RECONCILE_INTERVAL_MS ?? 120_000));
const HEARTBEAT_TIMEOUT_MS = Math.max(10_000, Number(process.env.COLLECTOR_HEARTBEAT_TIMEOUT_MS ?? 45_000));
const HEARTBEAT_CLOSE_MULTIPLIER = Math.max(2, Number(process.env.COLLECTOR_HEARTBEAT_CLOSE_MULTIPLIER ?? 4));
const WS_SUBSCRIPTION_CHUNK_SIZE = Math.max(50, Math.min(500, Number(process.env.COLLECTOR_WS_SUBSCRIPTION_CHUNK_SIZE ?? 250)));
const RECONNECT_JITTER_MS = Math.max(0, Number(process.env.COLLECTOR_RECONNECT_JITTER_MS ?? 700));
const DEAD_LETTER_LOG_EVERY_MS = Math.max(500, Number(process.env.COLLECTOR_DEAD_LETTER_LOG_EVERY_MS ?? 5000));
const HEALTH_PORT = Math.max(0, Number(process.env.COLLECTOR_HEALTH_PORT ?? 0));
const SNAPSHOT_PAGE_SIZE = Math.max(50, Math.min(250, Number(process.env.COLLECTOR_SNAPSHOT_PAGE_SIZE ?? 150)));
const SNAPSHOT_MAX_PAGES = Math.max(1, Math.min(50, Number(process.env.COLLECTOR_SNAPSHOT_MAX_PAGES ?? 6)));
const LIVE_UPSERT_CHUNK_SIZE = Math.max(100, Math.min(1000, Number(process.env.COLLECTOR_UPSERT_CHUNK_SIZE ?? 400)));
const CANDLE_UPSERT_CHUNK_SIZE = Math.max(100, Math.min(1000, Number(process.env.COLLECTOR_CANDLE_UPSERT_CHUNK_SIZE ?? 400)));

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

const pendingLive = new Map<string, PendingLive>();
const pendingCandles = new Map<string, PendingCandle>();
const latestLiveState = new Map<string, { sourceSeq: number | null; sourceTsMs: number }>();
const trackedAssetIds = new Set<string>();
let flushing = false;
let lastHeartbeatAt = Date.now();
let lastWsMessageAt = 0;
let lastFlushAt = 0;
let lastReconcileAt = 0;
let deadLetterSuppressed = 0;
let lastDeadLetterLogAt = 0;
const startedAt = Date.now();
let activeSocket: WebSocket | null = null;
const activeSubscribedAssetIds = new Set<string>();

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
    const ready = websocketHealthy && reconcileHealthy;
    const payload = {
      ok: path === "/health" ? true : ready,
      ready,
      uptimeSec: Math.floor((now - startedAt) / 1000),
      pendingLive: pendingLive.size,
      pendingCandles: pendingCandles.size,
      lastHeartbeatAt: lastHeartbeatAt > 0 ? new Date(lastHeartbeatAt).toISOString() : null,
      lastWsMessageAt: lastWsMessageAt > 0 ? new Date(lastWsMessageAt).toISOString() : null,
      lastFlushAt: lastFlushAt > 0 ? new Date(lastFlushAt).toISOString() : null,
      lastReconcileAt: lastReconcileAt > 0 ? new Date(lastReconcileAt).toISOString() : null,
      websocketHealthy,
      reconcileHealthy,
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
    toNumber(payload.last_trade_size ?? payload.size ?? payload.trade_size ?? payload.amount) ?? prev?.last_trade_size ?? 0;
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
  if (pendingLive.size === 0 && pendingCandles.size === 0) return;

  flushing = true;
  let liveRows: PendingLive[] = [];
  let candleRows: PendingCandle[] = [];
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

    if (liveRows.length > 0 || candleRows.length > 0) {
      await mirrorIntoCanonicalRealtime(liveRows, candleRows);
    }
  } finally {
    lastFlushAt = Date.now();
    flushing = false;
  }
};

const bootstrapSnapshot = async () => {
  try {
    const markets = await listPolymarketMarketsSnapshot({
      scope: "open",
      pageSize: SNAPSHOT_PAGE_SIZE,
      maxPages: SNAPSHOT_MAX_PAGES,
      hydrateMidpoints: false,
    });

    if (markets.length === 0) return;

    await upsertMirroredPolymarketMarkets(supabase, markets);

    const nowIso = new Date().toISOString();
    const currentBucket = minuteBucketIso(Date.now());
    const liveRows: PendingLive[] = markets.map((market) => {
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

    const baselineCandles: PendingCandle[] = liveRows.map((row) => ({
      market_id: row.market_id,
      bucket_start: currentBucket,
      open: row.mid,
      high: row.mid,
      low: row.mid,
      close: row.mid,
      volume: 0,
      trades_count: 0,
      source_ts_max: row.source_ts,
      updated_at: nowIso,
    }));
    try {
      await upsertRowsInChunks(
        "polymarket_candles_1m",
        baselineCandles as unknown as Record<string, unknown>[],
        "market_id,bucket_start",
        CANDLE_UPSERT_CHUNK_SIZE,
        "SNAPSHOT_CANDLE_UPSERT_FAILED"
      );
    } catch (error) {
      console.error("[collector] snapshot candle backfill failed", error instanceof Error ? error.message : String(error));
    }

    await mirrorIntoCanonicalRealtime(liveRows, baselineCandles);

    for (const row of liveRows) {
      rememberLiveState(row);
    }

    const nextTrackedAssetIds = new Set<string>();
    for (const market of markets) {
      for (const tokenId of Array.isArray(market.clobTokenIds) ? market.clobTokenIds : []) {
        if (typeof tokenId === "string" && tokenId.trim().length > 0) {
          nextTrackedAssetIds.add(tokenId.trim());
        }
      }
      for (const outcome of market.outcomes) {
        if (typeof outcome.tokenId === "string" && outcome.tokenId.trim().length > 0) {
          nextTrackedAssetIds.add(outcome.tokenId.trim());
        }
      }
    }
    trackedAssetIds.clear();
    for (const assetId of nextTrackedAssetIds) {
      trackedAssetIds.add(assetId);
    }

    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      await syncMarketSubscriptions(activeSocket, false);
    }

    console.log(`[collector] snapshot synced ${markets.length} markets`);
  } finally {
    lastReconcileAt = Date.now();
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
    try {
      if (trackedAssetIds.size === 0) {
        await wait(2000);
        continue;
      }
      console.log("[collector] connecting", MARKET_WS_URL);
      const socket = new WebSocket(MARKET_WS_URL);
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
      console.error("[collector] ws loop error", error instanceof Error ? error.message : String(error));
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
  startHealthServer();
  await loadPersistedLiveState();
  await bootstrapSnapshot();

  setInterval(() => {
    void flushPending();
  }, FLUSH_INTERVAL_MS);

  setInterval(() => {
    void bootstrapSnapshot().catch((error) => {
      console.error("[collector] reconcile snapshot failed", error instanceof Error ? error.message : String(error));
    });
  }, RECONCILE_INTERVAL_MS);

  await runWsLoop();
};

void start().catch((error) => {
  console.error("[collector] fatal", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
