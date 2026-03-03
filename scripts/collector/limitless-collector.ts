import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { limitlessAdapter } from "../../src/server/venues/limitlessAdapter";
import { upsertProviderSyncState, upsertVenueMarketsToCatalog } from "../../src/server/venues/catalogStore";
import type { VenueMarket } from "../../src/server/venues/types";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const POLL_INTERVAL_MS = Math.max(10_000, Number(process.env.LIMITLESS_COLLECTOR_POLL_INTERVAL_MS ?? 45_000));
const FLUSH_INTERVAL_MS = Math.max(500, Number(process.env.LIMITLESS_COLLECTOR_FLUSH_INTERVAL_MS ?? 5_000));
const RECONCILE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.LIMITLESS_COLLECTOR_RECONCILE_INTERVAL_MS ?? 300000)
);
const HEALTH_PORT = Math.max(0, Number(process.env.LIMITLESS_COLLECTOR_HEALTH_PORT ?? 8081));
const SNAPSHOT_LIMIT = Math.max(50, Math.min(1500, Number(process.env.LIMITLESS_COLLECTOR_SNAPSHOT_LIMIT ?? 200)));
const HEAD_SNAPSHOT_LIMIT = Math.max(
  20,
  Math.min(SNAPSHOT_LIMIT, Number(process.env.LIMITLESS_COLLECTOR_HEAD_SNAPSHOT_LIMIT ?? 80))
);
const PRUNE_INTERVAL_MS = Math.max(60_000, Number(process.env.LIMITLESS_COLLECTOR_PRUNE_INTERVAL_MS ?? 3_600_000));
const PRUNE_EXPIRED_AFTER_DAYS = Math.max(
  1,
  Number(process.env.LIMITLESS_COLLECTOR_PRUNE_EXPIRED_AFTER_DAYS ?? 7)
);
const ENABLE_MISSING_MARKET_PRUNE =
  (process.env.LIMITLESS_COLLECTOR_ENABLE_MISSING_MARKET_PRUNE || "true").trim().toLowerCase() === "true";
const MISSING_MARKET_SCAN_LIMIT = Math.max(
  50,
  Math.min(2500, Number(process.env.LIMITLESS_COLLECTOR_MISSING_MARKET_SCAN_LIMIT ?? 1200))
);
const MISSING_MARKET_MISS_THRESHOLD = Math.max(
  1,
  Math.min(20, Number(process.env.LIMITLESS_COLLECTOR_MISSING_MARKET_MISS_THRESHOLD ?? 3))
);
const PROBE_THROTTLE_MS = Math.max(30_000, Number(process.env.LIMITLESS_COLLECTOR_PROBE_THROTTLE_MS ?? 300_000));
const LIMITLESS_WS_CONFIG = limitlessAdapter.wsCollectorConfig?.();
const LIMITLESS_BASE_URL = (process.env.LIMITLESS_API_BASE_URL || "https://api.limitless.exchange").trim();
const COLLECTOR_VERSION = "limitless-collector-v2026-03-03c";
const WS_MAX_1002_BEFORE_DISABLE = Math.max(
  1,
  Number(process.env.LIMITLESS_COLLECTOR_WS_MAX_1002_BEFORE_DISABLE ?? 5)
);
const CATALOG_ID_CACHE_TTL_MS = Math.max(
  30_000,
  Number(process.env.LIMITLESS_COLLECTOR_CATALOG_ID_CACHE_TTL_MS ?? 30 * 60_000)
);
const SEED_REALTIME_FROM_SNAPSHOT =
  (
    process.env.LIMITLESS_COLLECTOR_SEED_REALTIME_FROM_SNAPSHOT ??
    (LIMITLESS_WS_CONFIG?.url ? "false" : "true")
  )
    .trim()
    .toLowerCase() === "true";

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
const pendingCandlesByProviderMarketAndBucket = new Map<
  string,
  { providerMarketId: string; payload: Omit<PendingCandle, "market_id"> }
>();
const lastSnapshotSeedByProviderMarketId = new Map<string, { mid: number; volume: number }>();
const knownMarketFingerprints = new Map<string, string>();
const missingOpenMarketMisses = new Map<string, number>();
const latestLiveStateByProviderMarketId = new Map<
  string,
  {
    sourceSeq: number | null;
    sourceTsMs: number;
    mid: number;
    bestBid: number;
    bestAsk: number;
    lastTradePrice: number;
    lastTradeSize: number;
    rolling24hVolume: number;
    openInterest: number | null;
  }
>();
const catalogIdCache = new Map<string, { id: string; expiresAt: number }>();

let lastPollAt = 0;
let lastFlushAt = 0;
let lastReconcileAt = 0;
let lastHeadPollAt = 0;
let lastWsMessageAt = 0;
let runningFullSnapshot = false;
let runningHeadSnapshot = false;
let flushing = false;
let runningPrune = false;
let lastProbeAt = 0;

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

const parseTsMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 10_000_000_000) return Math.floor(value);
    if (value > 1_000_000_000) return Math.floor(value * 1000);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) {
      if (asNum > 10_000_000_000) return Math.floor(asNum);
      if (asNum > 1_000_000_000) return Math.floor(asNum * 1000);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeSourceSeq = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.floor(value);
};

const isStaleLiveUpdate = (
  providerMarketId: string,
  payload: Omit<PendingLive, "market_id">
): boolean => {
  const current = latestLiveStateByProviderMarketId.get(providerMarketId);
  if (!current) return false;

  const incomingSeq = normalizeSourceSeq(payload.source_seq);
  if (incomingSeq !== null && current.sourceSeq !== null && incomingSeq < current.sourceSeq) {
    return true;
  }

  const incomingTs = Date.parse(payload.source_ts);
  if (!Number.isFinite(incomingTs)) return false;
  return incomingTs < current.sourceTsMs;
};

const hasMeaningfulLiveDelta = (
  previous:
    | {
        mid: number;
        bestBid: number;
        bestAsk: number;
        lastTradePrice: number;
        lastTradeSize: number;
        rolling24hVolume: number;
        openInterest: number | null;
      }
    | undefined,
  next: Omit<PendingLive, "market_id">
): boolean => {
  if (!previous) return true;
  if (Math.abs(previous.mid - next.mid) >= 0.0005) return true;
  if (Math.abs(previous.bestBid - next.best_bid) >= 0.0005) return true;
  if (Math.abs(previous.bestAsk - next.best_ask) >= 0.0005) return true;
  if (Math.abs(previous.lastTradePrice - next.last_trade_price) >= 0.0005) return true;
  if (Math.abs(previous.lastTradeSize - next.last_trade_size) >= 0.01) return true;
  if (Math.abs(previous.rolling24hVolume - next.rolling_24h_volume) >= 0.5) return true;

  const prevOi = previous.openInterest;
  const nextOi = next.open_interest;
  if (prevOi === null && nextOi === null) return false;
  if (prevOi === null || nextOi === null) return true;
  return Math.abs(prevOi - nextOi) >= 0.5;
};

const rememberLiveState = (
  providerMarketId: string,
  payload: Omit<PendingLive, "market_id">
) => {
  const sourceTsMs = Date.parse(payload.source_ts);
  const previous = latestLiveStateByProviderMarketId.get(providerMarketId);
  const sourceSeq = normalizeSourceSeq(payload.source_seq);
  latestLiveStateByProviderMarketId.set(providerMarketId, {
    sourceSeq:
      sourceSeq === null
        ? previous?.sourceSeq ?? null
        : previous?.sourceSeq === null || previous?.sourceSeq === undefined
          ? sourceSeq
          : Math.max(previous.sourceSeq, sourceSeq),
    sourceTsMs: Number.isFinite(sourceTsMs)
      ? Math.max(previous?.sourceTsMs ?? sourceTsMs, sourceTsMs)
      : previous?.sourceTsMs ?? Date.now(),
    mid: payload.mid,
    bestBid: payload.best_bid,
    bestAsk: payload.best_ask,
    lastTradePrice: payload.last_trade_price,
    lastTradeSize: payload.last_trade_size,
    rolling24hVolume: payload.rolling_24h_volume,
    openInterest: payload.open_interest,
  });
};

const queueLiveUpdate = (
  providerMarketId: string,
  payload: Omit<PendingLive, "market_id">
): boolean => {
  if (!providerMarketId) return false;
  if (isStaleLiveUpdate(providerMarketId, payload)) return false;
  const previous = latestLiveStateByProviderMarketId.get(providerMarketId);
  if (!hasMeaningfulLiveDelta(previous, payload)) {
    rememberLiveState(providerMarketId, payload);
    return false;
  }

  pendingLiveByProviderMarketId.set(providerMarketId, payload);
  rememberLiveState(providerMarketId, payload);
  return true;
};

const queueCandleUpdate = (
  providerMarketId: string,
  params: {
    price: number;
    size: number;
    sourceTsMs: number;
    sourceTsIso: string;
    nowIso: string;
  }
) => {
  if (!providerMarketId) return;
  const bucketStart = minuteBucketIso(params.sourceTsMs);
  const key = `${providerMarketId}:${bucketStart}`;
  const existing = pendingCandlesByProviderMarketAndBucket.get(key);
  if (!existing) {
    pendingCandlesByProviderMarketAndBucket.set(key, {
      providerMarketId,
      payload: {
        outcome_key: "__market__",
        bucket_start: bucketStart,
        open: params.price,
        high: params.price,
        low: params.price,
        close: params.price,
        volume: Math.max(0, params.size),
        trades_count: params.size > 0 ? 1 : 0,
        source_ts_max: params.sourceTsIso,
        updated_at: params.nowIso,
      },
    });
    return;
  }

  existing.payload.high = Math.max(existing.payload.high, params.price);
  existing.payload.low = Math.min(existing.payload.low, params.price);
  existing.payload.close = params.price;
  existing.payload.volume = Math.max(0, existing.payload.volume + Math.max(0, params.size));
  existing.payload.trades_count = existing.payload.trades_count + (params.size > 0 ? 1 : 0);
  existing.payload.source_ts_max = params.sourceTsIso;
  existing.payload.updated_at = params.nowIso;
  pendingCandlesByProviderMarketAndBucket.set(key, existing);
};

const fingerprintMarket = (market: VenueMarket): string => {
  const outcomes = [...market.outcomes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((outcome) =>
      [
        outcome.id,
        outcome.providerOutcomeId ?? "",
        outcome.providerTokenId ?? "",
        outcome.title,
        outcome.sortOrder,
        outcome.isActive ? "1" : "0",
      ].join("|")
    )
    .join(";");

  return [
    market.state,
    market.slug,
    market.title,
    market.description ?? "",
    market.category ?? "",
    market.sourceUrl ?? "",
    market.imageUrl ?? "",
    market.createdAt,
    market.closesAt,
    market.expiresAt,
    market.resolvedOutcomeTitle ?? "",
    outcomes,
  ].join("||");
};

const selectChangedMarkets = (markets: VenueMarket[]): VenueMarket[] => {
  const changed: VenueMarket[] = [];
  for (const market of markets) {
    const nextFingerprint = fingerprintMarket(market);
    const previousFingerprint = knownMarketFingerprints.get(market.providerMarketId);
    if (previousFingerprint !== nextFingerprint) {
      changed.push(market);
    }
    knownMarketFingerprints.set(market.providerMarketId, nextFingerprint);
  }
  return changed;
};

const probeLimitlessApi = async () => {
  const now = Date.now();
  if (now - lastProbeAt < PROBE_THROTTLE_MS) return;
  lastProbeAt = now;

  const bases = Array.from(
    new Set([
      LIMITLESS_BASE_URL,
      "https://api.limitless.exchange",
      "https://api.limitless.exchange/api/v1",
      "https://api.limitless.exchange/api-v1",
    ])
  );

  for (const base of bases) {
    const url = `${base.replace(/\/+$/, "")}/markets/active?page=1&limit=1`;
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const body = await response.text();
      let rowsCount = -1;
      try {
        const parsed = JSON.parse(body) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const data = (parsed as Record<string, unknown>).data;
          if (Array.isArray(data)) rowsCount = data.length;
        } else if (Array.isArray(parsed)) {
          rowsCount = parsed.length;
        }
      } catch {
        // ignore parse failures
      }
      console.log(
        `[limitless-collector] probe url=${url} status=${response.status} rows=${rowsCount} bodyPreview=${body.slice(0, 140).replace(/\s+/g, " ")}`
      );
      if (response.ok && rowsCount !== 0) return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[limitless-collector] probe failed url=${url} err=${message}`);
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rec = payload as Record<string, unknown>;
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

const deleteCanonicalLimitlessRowsByProviderIds = async (providerMarketIds: string[]) => {
  if (providerMarketIds.length === 0) return;
  for (const chunk of chunkStrings(providerMarketIds, 400)) {
    await (supabase as any)
      .from("market_catalog")
      .delete()
      .eq("provider", "limitless")
      .in("provider_market_id", chunk);
  }
  for (const providerMarketId of providerMarketIds) {
    catalogIdCache.delete(providerMarketId);
    latestLiveStateByProviderMarketId.delete(providerMarketId);
    lastSnapshotSeedByProviderMarketId.delete(providerMarketId);
  }
};

const pruneExpiredMarkets = async () => {
  const cutoffIso = new Date(Date.now() - PRUNE_EXPIRED_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await (supabase as any)
    .from("market_catalog")
    .select("provider_market_id, provider_payload")
    .eq("provider", "limitless")
    .limit(12000);
  if (error) {
    console.warn("[limitless-collector] prune expired query failed", error.message);
    return;
  }

  const idsToDeleteSet = new Set<string>();
  for (const row of data ?? []) {
    const rec = row as Record<string, unknown>;
    const expiryIso = parseExpiryFromPayload(rec.provider_payload);
    if (!expiryIso || expiryIso > cutoffIso) continue;
    const marketId = String(rec.provider_market_id ?? "").trim();
    if (!marketId) continue;
    idsToDeleteSet.add(marketId);
  }
  const idsToDelete = Array.from(idsToDeleteSet);
  if (idsToDelete.length === 0) return;

  await deleteCanonicalLimitlessRowsByProviderIds(idsToDelete);
  for (const marketId of idsToDelete) {
    knownMarketFingerprints.delete(marketId);
    missingOpenMarketMisses.delete(marketId);
    latestLiveStateByProviderMarketId.delete(marketId);
    lastSnapshotSeedByProviderMarketId.delete(marketId);
    catalogIdCache.delete(marketId);
  }
  console.log(`[limitless-collector] prune expired removed=${idsToDelete.length} cutoff=${cutoffIso}`);
};

const pruneMissingOpenMarkets = async () => {
  if (!ENABLE_MISSING_MARKET_PRUNE) return;

  const openMarkets = await limitlessAdapter.listMarketsSnapshot({
    onlyOpen: true,
    limit: MISSING_MARKET_SCAN_LIMIT,
  });

  if (openMarkets.length >= MISSING_MARKET_SCAN_LIMIT) {
    console.warn(
      `[limitless-collector] missing prune skipped because coverage may be truncated fetched=${openMarkets.length} limit=${MISSING_MARKET_SCAN_LIMIT}`
    );
    return;
  }

  const openNow = new Set(
    openMarkets
      .map((market) => market.providerMarketId)
      .filter((id) => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
  );

  const { data: currentOpenRows, error: currentOpenError } = await (supabase as any)
    .from("market_catalog")
    .select("provider_market_id")
    .eq("provider", "limitless")
    .eq("state", "open")
    .limit(12000);
  if (currentOpenError) {
    console.warn("[limitless-collector] prune missing query failed", currentOpenError.message);
    return;
  }

  const staleIds: string[] = [];
  for (const row of currentOpenRows ?? []) {
    const marketId = String((row as Record<string, unknown>).provider_market_id ?? "").trim();
    if (!marketId) continue;
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

  await deleteCanonicalLimitlessRowsByProviderIds(staleIds);
  for (const marketId of staleIds) {
    knownMarketFingerprints.delete(marketId);
    missingOpenMarketMisses.delete(marketId);
    latestLiveStateByProviderMarketId.delete(marketId);
    lastSnapshotSeedByProviderMarketId.delete(marketId);
    catalogIdCache.delete(marketId);
  }
  console.log(
    `[limitless-collector] prune missing-open removed=${staleIds.length} threshold=${MISSING_MARKET_MISS_THRESHOLD}`
  );
};

const pruneStaleMarkets = async () => {
  if (runningPrune) return;
  runningPrune = true;
  try {
    await pruneExpiredMarkets();
    await pruneMissingOpenMarkets();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[limitless-collector] prune failed", message);
  } finally {
    runningPrune = false;
  }
};

const resolveCatalogIds = async (providerMarketIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (providerMarketIds.length === 0) return out;

  const uniqueIds = Array.from(new Set(providerMarketIds.filter(Boolean)));
  const now = Date.now();
  const misses: string[] = [];

  for (const providerMarketId of uniqueIds) {
    const cached = catalogIdCache.get(providerMarketId);
    if (cached && cached.expiresAt > now) {
      out.set(providerMarketId, cached.id);
    } else {
      misses.push(providerMarketId);
    }
  }

  for (let i = 0; i < misses.length; i += 200) {
    const chunk = misses.slice(i, i + 200);
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
      if (providerMarketId && id) {
        out.set(providerMarketId, id);
        catalogIdCache.set(providerMarketId, {
          id,
          expiresAt: now + CATALOG_ID_CACHE_TTL_MS,
        });
      }
    }
  }

  return out;
};

const flushPending = async () => {
  if (flushing) return;
  if (pendingLiveByProviderMarketId.size === 0 && pendingCandlesByProviderMarketAndBucket.size === 0) return;

  flushing = true;
  try {
    const providerMarketIds = Array.from(
      new Set([
        ...pendingLiveByProviderMarketId.keys(),
        ...Array.from(pendingCandlesByProviderMarketAndBucket.values()).map((entry) => entry.providerMarketId),
      ])
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

    if (pendingCandlesByProviderMarketAndBucket.size > 0) {
      const rows: PendingCandle[] = [];
      for (const { providerMarketId, payload } of pendingCandlesByProviderMarketAndBucket.values()) {
        const marketId = catalogIds.get(providerMarketId);
        if (!marketId) continue;
        rows.push({ market_id: marketId, ...payload });
      }
      pendingCandlesByProviderMarketAndBucket.clear();

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

const snapshotSync = async (mode: "head" | "full") => {
  if (mode === "full") {
    if (runningFullSnapshot) return;
    runningFullSnapshot = true;
  } else {
    if (runningHeadSnapshot || runningFullSnapshot) return;
    runningHeadSnapshot = true;
  }

  const limit = mode === "head" ? HEAD_SNAPSHOT_LIMIT : SNAPSHOT_LIMIT;
  const writeSyncState = mode === "full";
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  try {
    console.log(`[limitless-collector] ${mode} snapshot sync started`);
    if (writeSyncState) {
      await upsertProviderSyncState(supabase, {
        provider: "limitless",
        scope: "open",
        startedAt,
        errorMessage: null,
      });
    }

    const markets = await limitlessAdapter.listMarketsSnapshot({
      onlyOpen: true,
      limit,
    });

    console.log(`[limitless-collector] ${mode} snapshot fetched ${markets.length} markets`);

    if (markets.length > 0) {
      const changedMarkets = selectChangedMarkets(markets);
      if (changedMarkets.length > 0) {
        await upsertVenueMarketsToCatalog(supabase, changedMarkets);
      }
      console.log(`[limitless-collector] ${mode} snapshot changed=${changedMarkets.length}`);

      if (SEED_REALTIME_FROM_SNAPSHOT) {
        const nowIso = new Date().toISOString();
        const sourceTsMs = Date.now();
        const sourceTsIso = new Date(sourceTsMs).toISOString();
        let seededCount = 0;
        for (const market of markets) {
          const primary = market.outcomes[0] ?? null;
          const primaryPrice = clamp01(primary?.price ?? 0.5);
          const rolling24hVolume = Math.max(0, market.volume);
          const prev = lastSnapshotSeedByProviderMarketId.get(market.providerMarketId);
          const changed =
            !prev ||
            Math.abs(prev.mid - primaryPrice) >= 0.002 ||
            Math.abs(prev.volume - rolling24hVolume) >= 1;
          if (!changed) continue;

          lastSnapshotSeedByProviderMarketId.set(market.providerMarketId, {
            mid: primaryPrice,
            volume: rolling24hVolume,
          });

          const fallbackAsk = clamp01(primaryPrice + 0.01);
          const fallbackBid = clamp01(primaryPrice - 0.01);
          const queued = queueLiveUpdate(market.providerMarketId, {
            best_bid: Math.min(fallbackBid, primaryPrice),
            best_ask: Math.max(fallbackAsk, primaryPrice),
            mid: primaryPrice,
            last_trade_price: primaryPrice,
            last_trade_size: 0,
            rolling_24h_volume: rolling24hVolume,
            open_interest: null,
            source_seq: null,
            source_ts: sourceTsIso,
            updated_at: nowIso,
            ingested_at: nowIso,
          });
          if (!queued) continue;

          queueCandleUpdate(market.providerMarketId, {
            price: primaryPrice,
            size: 0,
            sourceTsMs,
            sourceTsIso,
            nowIso,
          });
          seededCount += 1;
        }

        if (seededCount > 0 && mode === "full") {
          await flushPending();
        }
        console.log(`[limitless-collector] ${mode} snapshot realtime seeds queued=${seededCount}`);
      }
    } else {
      console.warn(
        `[limitless-collector] ${mode} snapshot returned 0 markets; base=${LIMITLESS_BASE_URL}; verify LIMITLESS_API_BASE_URL/egress/venue access`
      );
      await probeLimitlessApi();
    }

    if (writeSyncState) {
      const finishedAt = new Date().toISOString();
      await upsertProviderSyncState(supabase, {
        provider: "limitless",
        scope: "open",
        startedAt,
        successAt: finishedAt,
        errorMessage: null,
      });
    }
    const elapsedMs = Date.now() - startedMs;
    console.log(`[limitless-collector] ${mode} snapshot sync completed in ${elapsedMs}ms`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[limitless-collector] ${mode} snapshot sync failed`, message);
    if (writeSyncState) {
      await upsertProviderSyncState(supabase, {
        provider: "limitless",
        scope: "open",
        startedAt,
        errorMessage: message,
      });
    }
  } finally {
    const now = Date.now();
    lastPollAt = now;
    if (mode === "full") {
      lastReconcileAt = now;
      runningFullSnapshot = false;
    } else {
      lastHeadPollAt = now;
      runningHeadSnapshot = false;
    }
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
  const sourceTsMs = parseTsMs(payload.source_ts ?? payload.timestamp ?? payload.ts) ?? Date.now();
  const sourceTsIso = new Date(sourceTsMs).toISOString();

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

  const queued = queueLiveUpdate(providerMarketId, {
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
  if (!queued) return;

  queueCandleUpdate(providerMarketId, {
    price: lastTradePrice,
    size: Math.max(0, lastTradeSize),
    sourceTsMs,
    sourceTsIso,
    nowIso,
  });
};

const runWsLoop = async () => {
  if (!LIMITLESS_WS_CONFIG?.url) {
    console.log("[limitless-collector] websocket URL not configured; running in polling mode");
    return;
  }

  let attempt = 0;
  let ws1002Streak = 0;
  const stableThresholdMs = 30_000;

  while (true) {
    try {
      console.log("[limitless-collector] connecting", LIMITLESS_WS_CONFIG.url);
      const socket = new WebSocket(LIMITLESS_WS_CONFIG.url);

      const session = await new Promise<{ stableMs: number; closeCode: number; closeReason: string }>((resolve, reject) => {
        const openedAt = Date.now();
        socket.onopen = () => {
          console.log("[limitless-collector] ws connected");
          for (const channel of LIMITLESS_WS_CONFIG.channels) {
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

        socket.onclose = (event) => {
          const reason = typeof event.reason === "string" && event.reason.trim().length > 0
            ? event.reason.trim()
            : "no_reason";
          resolve({
            stableMs: Date.now() - openedAt,
            closeCode: Number(event.code || 0),
            closeReason: reason,
          });
        };

        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            reject(new Error("LIMITLESS_WS_CONNECT_TIMEOUT"));
          }
        }, 15000);
      });

      const unstable = session.stableMs < stableThresholdMs;
      if (session.closeCode === 1002) {
        ws1002Streak += 1;
      } else {
        ws1002Streak = 0;
      }
      if (ws1002Streak >= WS_MAX_1002_BEFORE_DISABLE) {
        console.warn(
          `[limitless-collector] disabling ws after ${ws1002Streak} consecutive code=1002 closes; continuing in polling-only mode`
        );
        while (true) {
          await wait(Math.max(POLL_INTERVAL_MS, 10_000));
        }
      }
      if (unstable) {
        attempt += 1;
      } else {
        attempt = 0;
      }
      const baseBackoffMs = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 6)));
      const jitterMs = Math.floor(Math.random() * 700);
      const backoffMs = baseBackoffMs + jitterMs;
      console.warn(
        `[limitless-collector] ws closed code=${session.closeCode} reason=${session.closeReason} stableMs=${session.stableMs} reconnectInMs=${backoffMs}`
      );
      await wait(backoffMs);
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
      now - lastReconcileAt <= Math.max(RECONCILE_INTERVAL_MS * 3, 180_000) &&
      now - lastHeadPollAt <= Math.max(POLL_INTERVAL_MS * 4, 60_000);

    const payload = {
      ok: path === "/health" ? true : ready,
      ready,
      pendingLive: pendingLiveByProviderMarketId.size,
      pendingCandles: pendingCandlesByProviderMarketAndBucket.size,
      lastPollAt: lastPollAt > 0 ? new Date(lastPollAt).toISOString() : null,
      lastFlushAt: lastFlushAt > 0 ? new Date(lastFlushAt).toISOString() : null,
      lastReconcileAt: lastReconcileAt > 0 ? new Date(lastReconcileAt).toISOString() : null,
      lastHeadPollAt: lastHeadPollAt > 0 ? new Date(lastHeadPollAt).toISOString() : null,
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

  console.log(
    `[limitless-collector] starting version=${COLLECTOR_VERSION} base=${LIMITLESS_BASE_URL} ws=${LIMITLESS_WS_CONFIG?.url ?? "none"} poll=${POLL_INTERVAL_MS}ms reconcile=${RECONCILE_INTERVAL_MS}ms prune=${PRUNE_INTERVAL_MS}ms headLimit=${HEAD_SNAPSHOT_LIMIT} snapshotLimit=${SNAPSHOT_LIMIT} seedFromSnapshot=${SEED_REALTIME_FROM_SNAPSHOT}`
  );
  startHealthServer();
  await snapshotSync("full");
  await snapshotSync("head");
  await pruneStaleMarkets();

  setInterval(() => {
    void snapshotSync("head");
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    void flushPending();
  }, FLUSH_INTERVAL_MS);

  setInterval(() => {
    void snapshotSync("full");
  }, RECONCILE_INTERVAL_MS);

  setInterval(() => {
    void pruneStaleMarkets();
  }, PRUNE_INTERVAL_MS);

  await runWsLoop();
};

void start().catch((error) => {
  console.error("[limitless-collector] fatal", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
