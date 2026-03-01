import { createClient } from "@supabase/supabase-js";
import { listPolymarketMarketsSnapshot } from "../../src/server/polymarket/client";
import { upsertMirroredPolymarketMarkets } from "../../src/server/polymarket/mirror";
import type { Database, Json } from "../../src/types/database";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const RTDS_URL = (process.env.POLYMARKET_RTDS_WS_URL || "wss://ws-live-data.polymarket.com").trim();
const FLUSH_INTERVAL_MS = Math.max(250, Number(process.env.COLLECTOR_FLUSH_INTERVAL_MS ?? 700));
const RECONCILE_INTERVAL_MS = Math.max(30_000, Number(process.env.COLLECTOR_RECONCILE_INTERVAL_MS ?? 120_000));
const HEARTBEAT_TIMEOUT_MS = Math.max(10_000, Number(process.env.COLLECTOR_HEARTBEAT_TIMEOUT_MS ?? 45_000));

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type JsonMap = Record<string, Json | undefined>;

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
let flushing = false;
let lastHeartbeatAt = Date.now();

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

const minuteBucketIso = (tsMs: number): string => {
  const minute = Math.floor(tsMs / 60_000) * 60_000;
  return new Date(minute).toISOString();
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

const parseIncomingUpdate = (payload: JsonMap): PendingLive | null => {
  const marketId = parseMarketId(payload);
  if (!marketId) return null;

  const nowIso = new Date().toISOString();
  const sourceTsRaw =
    (typeof payload.source_ts === "string" && payload.source_ts) ||
    (typeof payload.timestamp === "string" && payload.timestamp) ||
    (typeof payload.ts === "string" && payload.ts) ||
    nowIso;

  const sourceTsMs = Date.parse(sourceTsRaw);
  const sourceTsIso = Number.isFinite(sourceTsMs) ? new Date(sourceTsMs).toISOString() : nowIso;

  const prev = pendingLive.get(marketId);

  const mid = toNumber(payload.mid ?? payload.price ?? payload.last_trade_price ?? payload.lastPrice);
  const bestBid = toNumber(payload.best_bid ?? payload.bid ?? payload.bestBid) ?? prev?.best_bid ?? 0;
  const bestAsk = toNumber(payload.best_ask ?? payload.ask ?? payload.bestAsk) ?? prev?.best_ask ?? 0;
  const lastTradePrice =
    toNumber(payload.last_trade_price ?? payload.price ?? payload.lastPrice) ?? prev?.last_trade_price ?? 0;
  const lastTradeSize =
    toNumber(payload.last_trade_size ?? payload.size ?? payload.trade_size) ?? prev?.last_trade_size ?? 0;
  const rolling24hVolume =
    toNumber(payload.rolling_24h_volume ?? payload.volume ?? payload.volume_24h) ??
    prev?.rolling_24h_volume ??
    0;
  const openInterest = toNumber(payload.open_interest ?? payload.openInterest ?? payload.oi);
  const sourceSeq =
    toNumber(payload.source_seq ?? payload.seq ?? payload.sequence) ??
    prev?.source_seq ??
    null;

  const normalizedMid = mid !== null ? clampPrice(mid) : prev?.mid ?? 0;

  return {
    market_id: marketId,
    best_bid: clampPrice(bestBid),
    best_ask: clampPrice(bestAsk),
    mid: normalizedMid,
    last_trade_price: clampPrice(lastTradePrice),
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
  try {
    if (pendingLive.size > 0) {
      const rows = Array.from(pendingLive.values());
      pendingLive.clear();
      const { error } = await supabase
        .from("polymarket_market_live")
        .upsert(rows, { onConflict: "market_id" });
      if (error) {
        console.error("[collector] live upsert failed", error.message);
      }
    }

    if (pendingCandles.size > 0) {
      const rows = Array.from(pendingCandles.values());
      pendingCandles.clear();
      const { error } = await supabase
        .from("polymarket_candles_1m")
        .upsert(rows, { onConflict: "market_id,bucket_start" });
      if (error) {
        console.error("[collector] candle upsert failed", error.message);
      }
    }
  } finally {
    flushing = false;
  }
};

const bootstrapSnapshot = async () => {
  const markets = await listPolymarketMarketsSnapshot({
    scope: "open",
    pageSize: 200,
    maxPages: 10,
    hydrateMidpoints: true,
  });

  if (markets.length === 0) return;

  await upsertMirroredPolymarketMarkets(supabase, markets);

  const nowIso = new Date().toISOString();
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

  const { error } = await supabase
    .from("polymarket_market_live")
    .upsert(liveRows, { onConflict: "market_id" });

  if (error) {
    console.error("[collector] snapshot live upsert failed", error.message);
  }

  console.log(`[collector] snapshot synced ${markets.length} markets`);
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

const subscribeToDefaultTopics = (socket: WebSocket) => {
  const subscriptions = [
    { type: "subscribe", channel: "prices" },
    { type: "subscribe", channel: "activity" },
    { type: "subscribe", channel: "clob_market" },
  ];
  for (const item of subscriptions) {
    try {
      socket.send(JSON.stringify(item));
    } catch {
      // ignore
    }
  }
};

const runWsLoop = async () => {
  let attempt = 0;

  while (true) {
    try {
      console.log("[collector] connecting", RTDS_URL);
      const socket = new WebSocket(RTDS_URL);
      lastHeartbeatAt = Date.now();

      await new Promise<void>((resolve, reject) => {
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

        socket.onopen = () => {
          console.log("[collector] ws connected");
          subscribeToDefaultTopics(socket);
          heartbeatTimer = setInterval(() => {
            if (Date.now() - lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
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
          const raw = typeof event.data === "string" ? event.data : "";
          if (!raw) return;

          try {
            const parsed = JSON.parse(raw) as Json;
            const messages = extractMessages(parsed);
            for (const message of messages) {
              const update = parseIncomingUpdate(message);
              if (!update) continue;

              const current = pendingLive.get(update.market_id);
              const currentTs = current ? Date.parse(current.source_ts) : 0;
              const nextTs = Date.parse(update.source_ts);
              if (current && Number.isFinite(currentTs) && Number.isFinite(nextTs) && nextTs < currentTs) {
                continue;
              }

              if (
                current &&
                current.source_seq !== null &&
                update.source_seq !== null &&
                update.source_seq < current.source_seq
              ) {
                continue;
              }

              pendingLive.set(update.market_id, update);
              applyCandleFromLive(update);
            }
          } catch {
            // ignore malformed frames
          }
        };

        socket.onerror = (event) => {
          console.error("[collector] ws error", event);
        };

        socket.onclose = () => {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          resolve();
        };

        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(new Error("WS_CONNECT_TIMEOUT"));
          }
        }, 15_000);
      });

      attempt = 0;
    } catch (error) {
      const backoffMs = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      console.error("[collector] ws loop error", error instanceof Error ? error.message : String(error));
      attempt += 1;
      await wait(backoffMs);
    }
  }
};

const start = async () => {
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
