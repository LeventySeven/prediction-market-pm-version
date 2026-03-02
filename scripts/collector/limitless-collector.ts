import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { limitlessAdapter } from "../../src/server/venues/limitlessAdapter";
import { upsertProviderSyncState, upsertVenueMarketsToCatalog } from "../../src/server/venues/catalogStore";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const POLL_INTERVAL_MS = Math.max(5000, Number(process.env.LIMITLESS_COLLECTOR_POLL_INTERVAL_MS ?? 15000));
const FLUSH_INTERVAL_MS = Math.max(250, Number(process.env.LIMITLESS_COLLECTOR_FLUSH_INTERVAL_MS ?? 700));
const RECONCILE_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.LIMITLESS_COLLECTOR_RECONCILE_INTERVAL_MS ?? 120000)
);
const HEALTH_PORT = Math.max(0, Number(process.env.LIMITLESS_COLLECTOR_HEALTH_PORT ?? 8081));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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
  outcome_key: string;
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

const pendingLiveByProviderMarketId = new Map<string, Omit<PendingLive, "market_id">>();
const pendingCandlesByProviderMarketId = new Map<string, Omit<PendingCandle, "market_id">>();

let lastPollAt = 0;
let lastFlushAt = 0;
let lastReconcileAt = 0;
let lastWsMessageAt = 0;
let runningSnapshot = false;
let flushing = false;

const minuteBucketIso = (tsMs: number): string => {
  const minute = Math.floor(tsMs / 60_000) * 60_000;
  return new Date(minute).toISOString();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const resolveCatalogIds = async (providerMarketIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (providerMarketIds.length === 0) return out;

  const uniqueIds = Array.from(new Set(providerMarketIds.filter(Boolean)));
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const chunk = uniqueIds.slice(i, i + 200);
    const { data, error } = await (supabase as any)
      .from("market_catalog")
      .select("id, provider_market_id")
      .eq("provider", "limitless")
      .in("provider_market_id", chunk);

    if (error) {
      console.warn("[limitless-collector] market_catalog lookup failed", error.message);
      continue;
    }

    for (const row of data ?? []) {
      const providerMarketId = String((row as Record<string, unknown>).provider_market_id ?? "").trim();
      const id = String((row as Record<string, unknown>).id ?? "").trim();
      if (providerMarketId && id) out.set(providerMarketId, id);
    }
  }

  return out;
};

const flushPending = async () => {
  if (flushing) return;
  if (pendingLiveByProviderMarketId.size === 0 && pendingCandlesByProviderMarketId.size === 0) return;

  flushing = true;
  try {
    const providerMarketIds = Array.from(
      new Set([...pendingLiveByProviderMarketId.keys(), ...pendingCandlesByProviderMarketId.keys()])
    );
    const catalogIds = await resolveCatalogIds(providerMarketIds);

    if (pendingLiveByProviderMarketId.size > 0) {
      const rows: PendingLive[] = [];
      for (const [providerMarketId, payload] of pendingLiveByProviderMarketId.entries()) {
        const marketId = catalogIds.get(providerMarketId);
        if (!marketId) continue;
        rows.push({ market_id: marketId, ...payload });
      }
      pendingLiveByProviderMarketId.clear();

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from("market_live")
          .upsert(rows, { onConflict: "market_id" });
        if (error) {
          console.error("[limitless-collector] market_live upsert failed", error.message);
        }
      }
    }

    if (pendingCandlesByProviderMarketId.size > 0) {
      const rows: PendingCandle[] = [];
      for (const [providerMarketId, payload] of pendingCandlesByProviderMarketId.entries()) {
        const marketId = catalogIds.get(providerMarketId);
        if (!marketId) continue;
        rows.push({ market_id: marketId, ...payload });
      }
      pendingCandlesByProviderMarketId.clear();

      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from("market_candles_1m")
          .upsert(rows, { onConflict: "market_id,outcome_key,bucket_start" });
        if (error) {
          console.error("[limitless-collector] market_candles_1m upsert failed", error.message);
        }
      }
    }
  } finally {
    lastFlushAt = Date.now();
    flushing = false;
  }
};

const snapshotSync = async () => {
  if (runningSnapshot) return;
  runningSnapshot = true;
  const startedAt = new Date().toISOString();

  try {
    await upsertProviderSyncState(supabase, {
      provider: "limitless",
      scope: "open",
      startedAt,
      errorMessage: null,
    });

    const markets = await limitlessAdapter.listMarketsSnapshot({
      onlyOpen: true,
      limit: 800,
    });

    if (markets.length > 0) {
      await upsertVenueMarketsToCatalog(supabase, markets);

      const nowIso = new Date().toISOString();
      const bucket = minuteBucketIso(Date.now());
      for (const market of markets) {
        const primary = market.outcomes[0] ?? null;
        const primaryPrice = clamp01(primary?.price ?? 0.5);
        const fallbackAsk = clamp01(primaryPrice + 0.01);
        const fallbackBid = clamp01(primaryPrice - 0.01);
        pendingLiveByProviderMarketId.set(market.providerMarketId, {
          best_bid: Math.min(fallbackBid, primaryPrice),
          best_ask: Math.max(fallbackAsk, primaryPrice),
          mid: primaryPrice,
          last_trade_price: primaryPrice,
          last_trade_size: 0,
          rolling_24h_volume: Math.max(0, market.volume),
          open_interest: null,
          source_seq: null,
          source_ts: nowIso,
          updated_at: nowIso,
          ingested_at: nowIso,
        });

        pendingCandlesByProviderMarketId.set(market.providerMarketId, {
          outcome_key: "__market__",
          bucket_start: bucket,
          open: primaryPrice,
          high: primaryPrice,
          low: primaryPrice,
          close: primaryPrice,
          volume: 0,
          trades_count: 0,
          source_ts_max: nowIso,
          updated_at: nowIso,
        });
      }

      await flushPending();
    }

    const finishedAt = new Date().toISOString();
    await upsertProviderSyncState(supabase, {
      provider: "limitless",
      scope: "open",
      startedAt,
      successAt: finishedAt,
      errorMessage: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[limitless-collector] snapshot sync failed", message);
    await upsertProviderSyncState(supabase, {
      provider: "limitless",
      scope: "open",
      startedAt,
      errorMessage: message,
    });
  } finally {
    lastPollAt = Date.now();
    lastReconcileAt = lastPollAt;
    runningSnapshot = false;
  }
};

const parseWsMarketId = (payload: Record<string, unknown>): string | null => {
  const candidates = [
    payload.market_id,
    payload.marketId,
    payload.market,
    payload.id,
    payload.condition_id,
    payload.conditionId,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

const handleWsPayload = (payload: Record<string, unknown>) => {
  const providerMarketId = parseWsMarketId(payload);
  if (!providerMarketId) return;

  const nowIso = new Date().toISOString();
  const sourceTs =
    typeof payload.source_ts === "string"
      ? payload.source_ts
      : typeof payload.timestamp === "string"
        ? payload.timestamp
        : nowIso;

  const sourceTsMs = Date.parse(sourceTs);
  const sourceTsIso = Number.isFinite(sourceTsMs) ? new Date(sourceTsMs).toISOString() : nowIso;

  const midRaw =
    parseNumber(payload.mid) ??
    parseNumber(payload.price) ??
    parseNumber(payload.last_trade_price) ??
    parseNumber(payload.lastPrice) ??
    0.5;

  const mid = clamp01(midRaw > 1 ? midRaw / 100 : midRaw);
  const bestBid = clamp01(
    parseNumber(payload.best_bid) ?? parseNumber(payload.bid) ?? Math.max(0, mid - 0.01)
  );
  const bestAsk = clamp01(
    parseNumber(payload.best_ask) ?? parseNumber(payload.ask) ?? Math.min(1, mid + 0.01)
  );

  const lastTradePriceRaw =
    parseNumber(payload.last_trade_price) ?? parseNumber(payload.price) ?? parseNumber(payload.lastPrice) ?? mid;
  const lastTradePrice = clamp01(lastTradePriceRaw > 1 ? lastTradePriceRaw / 100 : lastTradePriceRaw);
  const lastTradeSize = Math.max(0, parseNumber(payload.last_trade_size) ?? parseNumber(payload.size) ?? 0);
  const rolling24h = Math.max(
    0,
    parseNumber(payload.rolling_24h_volume) ?? parseNumber(payload.volume) ?? parseNumber(payload.volume_24h) ?? 0
  );

  pendingLiveByProviderMarketId.set(providerMarketId, {
    best_bid: bestBid,
    best_ask: bestAsk,
    mid,
    last_trade_price: lastTradePrice,
    last_trade_size: lastTradeSize,
    rolling_24h_volume: rolling24h,
    open_interest: parseNumber(payload.open_interest) ?? parseNumber(payload.openInterest) ?? null,
    source_seq: parseNumber(payload.source_seq) ?? parseNumber(payload.seq) ?? null,
    source_ts: sourceTsIso,
    updated_at: nowIso,
    ingested_at: nowIso,
  });

  const bucket = minuteBucketIso(Date.now());
  pendingCandlesByProviderMarketId.set(providerMarketId, {
    outcome_key: "__market__",
    bucket_start: bucket,
    open: lastTradePrice,
    high: lastTradePrice,
    low: lastTradePrice,
    close: lastTradePrice,
    volume: Math.max(0, lastTradeSize),
    trades_count: lastTradeSize > 0 ? 1 : 0,
    source_ts_max: sourceTsIso,
    updated_at: nowIso,
  });
};

const runWsLoop = async () => {
  const wsConfig = limitlessAdapter.wsCollectorConfig?.();
  if (!wsConfig?.url) {
    console.log("[limitless-collector] websocket URL not configured; running in polling mode");
    return;
  }

  let attempt = 0;

  while (true) {
    try {
      console.log("[limitless-collector] connecting", wsConfig.url);
      const socket = new WebSocket(wsConfig.url);

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => {
          console.log("[limitless-collector] ws connected");
          for (const channel of wsConfig.channels) {
            try {
              socket.send(JSON.stringify({ type: "subscribe", channel }));
            } catch {
              // ignore
            }
          }
        };

        socket.onmessage = (event) => {
          lastWsMessageAt = Date.now();
          const raw = typeof event.data === "string" ? event.data : "";
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                  handleWsPayload(item as Record<string, unknown>);
                }
              }
            } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const rec = parsed as Record<string, unknown>;
              if (Array.isArray(rec.data)) {
                for (const item of rec.data) {
                  if (item && typeof item === "object" && !Array.isArray(item)) {
                    handleWsPayload(item as Record<string, unknown>);
                  }
                }
              } else {
                handleWsPayload(rec);
              }
            }
          } catch {
            // ignore malformed payload
          }
        };

        socket.onerror = () => {
          // handled by close and backoff
        };

        socket.onclose = () => {
          resolve();
        };

        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(new Error("LIMITLESS_WS_CONNECT_TIMEOUT"));
          }
        }, 15000);
      });

      attempt = 0;
    } catch (error) {
      const baseBackoffMs = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      const jitterMs = Math.floor(Math.random() * 700);
      const backoffMs = baseBackoffMs + jitterMs;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[limitless-collector] ws loop error", message);
      attempt += 1;
      await wait(backoffMs);
    }
  }
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
    const ready =
      now - lastPollAt <= Math.max(POLL_INTERVAL_MS * 3, 60_000) &&
      now - lastReconcileAt <= Math.max(RECONCILE_INTERVAL_MS * 3, 180_000);

    const payload = {
      ok: path === "/health" ? true : ready,
      ready,
      pendingLive: pendingLiveByProviderMarketId.size,
      pendingCandles: pendingCandlesByProviderMarketId.size,
      lastPollAt: lastPollAt > 0 ? new Date(lastPollAt).toISOString() : null,
      lastFlushAt: lastFlushAt > 0 ? new Date(lastFlushAt).toISOString() : null,
      lastReconcileAt: lastReconcileAt > 0 ? new Date(lastReconcileAt).toISOString() : null,
      lastWsMessageAt: lastWsMessageAt > 0 ? new Date(lastWsMessageAt).toISOString() : null,
    };

    res.statusCode = path === "/ready" && !ready ? 503 : 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  });

  server.listen(HEALTH_PORT, () => {
    console.log(`[limitless-collector] health probe listening on :${HEALTH_PORT}`);
  });
};

const start = async () => {
  if (!limitlessAdapter.isEnabled()) {
    console.log("[limitless-collector] ENABLE_LIMITLESS is false; exiting");
    return;
  }

  startHealthServer();
  await snapshotSync();

  setInterval(() => {
    void snapshotSync();
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    void flushPending();
  }, FLUSH_INTERVAL_MS);

  setInterval(() => {
    void snapshotSync();
  }, RECONCILE_INTERVAL_MS);

  await runWsLoop();
};

void start().catch((error) => {
  console.error("[limitless-collector] fatal", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
