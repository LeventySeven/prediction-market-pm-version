import { Redis } from "@upstash/redis";
import { getSupabaseServiceClient } from "../supabase/client";
import { readUpstashSnapshotCursor, upstashCacheEnabled, upstashStreamEnabled } from "../cache/upstash";

const POLYMARKET_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.POLYMARKET_WORKER_STALE_AFTER_MS ?? 3 * 60_000)
);
const LIMITLESS_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.LIMITLESS_WORKER_STALE_AFTER_MS ?? 3 * 60_000)
);

const parseIso = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readCountFromStats = (
  stats: Record<string, unknown> | null,
  keys: string[]
): number | null => {
  if (!stats) return null;
  for (const key of keys) {
    const raw = stats[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const ageSecFromIso = (iso: string | null, now = Date.now()): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((now - parsed) / 1000));
};

const isFresh = (iso: string | null, staleAfterMs: number, now = Date.now()): boolean | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return now - parsed <= staleAfterMs;
};

const readLatestTimestamp = async (
  supabaseService: unknown,
  table: string,
  column: string
): Promise<{ iso: string | null; ageSec: number | null; fresh: boolean | null; error: string | null }> => {
  try {
    const { data, error } = await (supabaseService as any)
      .from(table)
      .select(column)
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { iso: null, ageSec: null, fresh: null, error: String(error.message ?? "query_failed") };
    }
    const iso = parseIso((data as Record<string, unknown> | null)?.[column] ?? null);
    return {
      iso,
      ageSec: ageSecFromIso(iso),
      fresh: isFresh(iso, table.includes("polymarket") ? POLYMARKET_STALE_AFTER_MS : LIMITLESS_STALE_AFTER_MS),
      error: null,
    };
  } catch (error) {
    return {
      iso: null,
      ageSec: null,
      fresh: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const readProviderSyncState = async (supabaseService: unknown) => {
  try {
    const { data, error } = await (supabaseService as any)
      .from("provider_sync_state")
      .select("provider,scope,last_started_at,last_success_at,last_error,stats,updated_at");
    if (error || !Array.isArray(data)) {
      return {
        rows: [] as Array<{
          provider: string;
          scope: string;
          lastStartedAt: string | null;
          lastSuccessAt: string | null;
          lastError: string | null;
          stats: Record<string, unknown> | null;
          updatedAt: string | null;
          ageSec: number | null;
          fresh: boolean | null;
        }>,
        error: String(error?.message ?? "query_failed"),
      };
    }

    const rows = (data as Array<Record<string, unknown>>).map((row) => {
      const provider = String(row.provider ?? "").trim().toLowerCase();
      const lastSuccessAt = parseIso(row.last_success_at ?? null);
      const staleAfterMs = provider === "polymarket" ? POLYMARKET_STALE_AFTER_MS : LIMITLESS_STALE_AFTER_MS;
      return {
        provider,
        scope: String(row.scope ?? "").trim(),
        lastStartedAt: parseIso(row.last_started_at ?? null),
        lastSuccessAt,
        lastError:
          row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
        stats: asObject(row.stats),
        updatedAt: parseIso(row.updated_at ?? null),
        ageSec: ageSecFromIso(lastSuccessAt),
        fresh: isFresh(lastSuccessAt, staleAfterMs),
      };
    });

    return { rows, error: null as string | null };
  } catch (error) {
    return {
      rows: [] as Array<{
        provider: string;
        scope: string;
        lastStartedAt: string | null;
        lastSuccessAt: string | null;
          lastError: string | null;
          stats: Record<string, unknown> | null;
          updatedAt: string | null;
          ageSec: number | null;
          fresh: boolean | null;
        }>,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const readCoverageCount = async (
  supabaseService: unknown,
  table: string,
  filters: Array<{ column: string; value: string }> = []
): Promise<number | null> => {
  try {
    let query = (supabaseService as any).from(table).select("*", { count: "exact", head: true });
    for (const filter of filters) {
      query = query.eq(filter.column, filter.value);
    }
    const { count, error } = await query;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
};

/* ── Launch-check helpers ──────────────────────────────────────────── */

const PROVIDERS = ["polymarket", "limitless"] as const;
type Provider = (typeof PROVIDERS)[number];

/**
 * Count open catalog markets for a provider that have a matching row in the
 * canonical `market_live` table.  Uses a left-join style: count open catalog
 * rows, then count open catalog rows that also appear in market_live.
 */
const readCanonicalCoverage = async (
  supabaseService: unknown,
  provider: Provider
): Promise<{ openCatalog: number; withLive: number; coveragePct: number }> => {
  try {
    const openCatalog = await readCoverageCount(supabaseService, "market_catalog", [
      { column: "provider", value: provider },
      { column: "state", value: "open" },
    ]);
    // Count distinct market_ids from market_live that belong to open catalog markets for this provider.
    // We query market_live joined through market_catalog via market_id.
    const { data, error } = await (supabaseService as any)
      .rpc("count_live_for_provider", { p_provider: provider });
    let withLive: number;
    if (error || data === null || data === undefined) {
      // Fallback: use a simpler approach – count market_live rows filtered by provider
      const fallback = await readCoverageCount(supabaseService, "market_live", []);
      // For fallback we use the existing per-provider live count from coverage
      withLive = 0; // will be overridden below
      // Try a direct query approach instead
      try {
        const { count: liveCount, error: liveErr } = await (supabaseService as any)
          .from("market_live")
          .select("market_id", { count: "exact", head: true })
          .in(
            "market_id",
            (supabaseService as any)
              .from("market_catalog")
              .select("market_id")
              .eq("provider", provider)
              .eq("state", "open")
          );
        if (!liveErr && typeof liveCount === "number") {
          withLive = liveCount;
        }
      } catch {
        // keep withLive = 0
      }
    } else {
      withLive = typeof data === "number" ? data : Number(data) || 0;
    }
    const oc = openCatalog ?? 0;
    return {
      openCatalog: oc,
      withLive,
      coveragePct: oc > 0 ? Math.round((withLive / oc) * 1000) / 10 : 0,
    };
  } catch {
    return { openCatalog: 0, withLive: 0, coveragePct: 0 };
  }
};

/**
 * Return the age in seconds of the oldest open market by source_updated_at.
 */
const readStaleSnapshotAge = async (
  supabaseService: unknown
): Promise<number | null> => {
  try {
    const { data, error } = await (supabaseService as any)
      .from("market_catalog")
      .select("source_updated_at")
      .eq("state", "open")
      .order("source_updated_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const iso = parseIso((data as Record<string, unknown>).source_updated_at ?? null);
    return ageSecFromIso(iso);
  } catch {
    return null;
  }
};

/**
 * Count open catalog markets for a provider that have NO corresponding rows
 * in the given target table (market_outcomes, market_live, market_candles_1m).
 *
 * Uses a two-step approach: get open catalog count, get count of those that
 * DO have rows in the target table, then subtract.
 */
const readMissingCount = async (
  supabaseService: unknown,
  provider: Provider,
  targetTable: string
): Promise<number> => {
  try {
    const openCatalog = await readCoverageCount(supabaseService, "market_catalog", [
      { column: "provider", value: provider },
      { column: "state", value: "open" },
    ]);
    if (!openCatalog) return 0;

    // Count catalog markets that DO have rows in the target table
    // We get distinct market_ids from targetTable, then count catalog rows matching them
    const { data: targetIds, error: targetErr } = await (supabaseService as any)
      .from(targetTable)
      .select("market_id");
    if (targetErr || !Array.isArray(targetIds)) return openCatalog;

    const targetSet = new Set(
      (targetIds as Array<Record<string, unknown>>).map((r) => String(r.market_id ?? ""))
    );

    // Get open catalog market_ids for this provider
    const { data: catalogIds, error: catalogErr } = await (supabaseService as any)
      .from("market_catalog")
      .select("market_id")
      .eq("provider", provider)
      .eq("state", "open");
    if (catalogErr || !Array.isArray(catalogIds)) return openCatalog;

    let missing = 0;
    for (const row of catalogIds as Array<Record<string, unknown>>) {
      if (!targetSet.has(String(row.market_id ?? ""))) missing++;
    }
    return missing;
  } catch {
    return 0;
  }
};

/**
 * Collect all launch-check metrics for a single provider.
 */
const collectProviderLaunchChecks = async (
  supabaseService: unknown,
  provider: Provider,
  syncStats: Record<string, unknown> | null
) => {
  const canonicalCoverage = await readCanonicalCoverage(supabaseService, provider);
  const missingOutcomes = await readMissingCount(supabaseService, provider, "market_outcomes");
  const missingLive = await readMissingCount(supabaseService, provider, "market_live");
  const missingCandles = await readMissingCount(supabaseService, provider, "market_candles_1m");

  const providerOpen = readCountFromStats(syncStats, ["trackedMarkets", "openMarkets"]);
  const catalogOpen = canonicalCoverage.openCatalog;

  return {
    canonicalCoverage,
    missingData: { missingOutcomes, missingLive, missingCandles },
    providerMismatch: {
      providerOpen,
      catalogOpen,
      delta: providerOpen !== null ? providerOpen - catalogOpen : null,
    },
  };
};

const checkUpstashPing = async () => {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "").trim();
  const configured = url.length > 0 && token.length > 0;
  if (!configured) {
    return {
      configured,
      cacheEnabled: upstashCacheEnabled,
      streamEnabled: upstashStreamEnabled,
      ping: { ok: null as boolean | null, latencyMs: null as number | null, error: "NOT_CONFIGURED" },
    };
  }

  const startedAt = Date.now();
  try {
    const redis = Redis.fromEnv({
      enableAutoPipelining: true,
      enableTelemetry: false,
      readYourWrites: true,
    });
    await redis.ping();
    return {
      configured,
      cacheEnabled: upstashCacheEnabled,
      streamEnabled: upstashStreamEnabled,
      ping: {
        ok: true,
        latencyMs: Date.now() - startedAt,
        error: null as string | null,
      },
    };
  } catch (error) {
    return {
      configured,
      cacheEnabled: upstashCacheEnabled,
      streamEnabled: upstashStreamEnabled,
      ping: {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

export const collectRealtimeHealthSnapshot = async (supabaseServiceInput?: unknown) => {
  const checkedAt = new Date().toISOString();

  let supabaseService = supabaseServiceInput;
  let supabaseError: string | null = null;
  if (!supabaseService) {
    try {
      supabaseService = getSupabaseServiceClient();
    } catch (error) {
      supabaseError = error instanceof Error ? error.message : String(error);
      supabaseService = null;
    }
  }

  const liveHeads = supabaseService
    ? {
        polymarketMarketLive: await readLatestTimestamp(
          supabaseService,
          "polymarket_market_live",
          "source_ts"
        ),
        canonicalMarketLive: await readLatestTimestamp(supabaseService, "market_live", "source_ts"),
      }
    : {
        polymarketMarketLive: { iso: null, ageSec: null, fresh: null, error: supabaseError ?? "SUPABASE_UNAVAILABLE" },
        canonicalMarketLive: { iso: null, ageSec: null, fresh: null, error: supabaseError ?? "SUPABASE_UNAVAILABLE" },
      };

  const candleHeads = supabaseService
    ? {
        polymarketCandles: await readLatestTimestamp(
          supabaseService,
          "polymarket_candles_1m",
          "bucket_start"
        ),
        canonicalCandles: await readLatestTimestamp(
          supabaseService,
          "market_candles_1m",
          "bucket_start"
        ),
      }
    : {
        polymarketCandles: { iso: null, ageSec: null, fresh: null, error: supabaseError ?? "SUPABASE_UNAVAILABLE" },
        canonicalCandles: { iso: null, ageSec: null, fresh: null, error: supabaseError ?? "SUPABASE_UNAVAILABLE" },
      };

  const providerSyncState = supabaseService
    ? await readProviderSyncState(supabaseService)
    : { rows: [], error: supabaseError ?? "SUPABASE_UNAVAILABLE" };
  const coverage = supabaseService
      ? {
        marketCatalogRows: await readCoverageCount(supabaseService, "market_catalog"),
        marketCatalogOpen: await readCoverageCount(supabaseService, "market_catalog", [
          { column: "state", value: "open" },
        ]),
        polymarketOpen: await readCoverageCount(supabaseService, "polymarket_market_cache", [
          { column: "state", value: "open" },
        ]),
        polymarketLiveRows: await readCoverageCount(supabaseService, "polymarket_market_live"),
        limitlessOpen: await readCoverageCount(supabaseService, "market_catalog", [
          { column: "provider", value: "limitless" },
          { column: "state", value: "open" },
        ]),
        limitlessLiveRows: await readCoverageCount(supabaseService, "market_live"),
      }
      : {
        marketCatalogRows: null,
        marketCatalogOpen: null,
        polymarketOpen: null,
        polymarketLiveRows: null,
        limitlessOpen: null,
      limitlessLiveRows: null,
    };
  const syncStatsByProvider = new Map(
    providerSyncState.rows.map((row) => [row.provider, row.stats] as const)
  );
  const polymarketStats = syncStatsByProvider.get("polymarket") ?? null;
  const limitlessStats = syncStatsByProvider.get("limitless") ?? null;
  const upstash = await checkUpstashPing();

  /* ── Launch checks ─────────────────────────────────────────────── */
  const launchChecks = supabaseService
    ? await (async () => {
        const [polymarketLC, limitlessLC, staleSnapshotAgeSec] = await Promise.all([
          collectProviderLaunchChecks(supabaseService, "polymarket", polymarketStats),
          collectProviderLaunchChecks(supabaseService, "limitless", limitlessStats),
          readStaleSnapshotAge(supabaseService),
        ]);
        return {
          canonicalCoverageByProvider: {
            polymarket: polymarketLC.canonicalCoverage,
            limitless: limitlessLC.canonicalCoverage,
          },
          staleSnapshotAgeSec,
          missingData: {
            polymarket: polymarketLC.missingData,
            limitless: limitlessLC.missingData,
          },
          providerMismatch: {
            polymarket: polymarketLC.providerMismatch,
            limitless: limitlessLC.providerMismatch,
          },
        };
      })()
    : {
        canonicalCoverageByProvider: {
          polymarket: { openCatalog: 0, withLive: 0, coveragePct: 0 },
          limitless: { openCatalog: 0, withLive: 0, coveragePct: 0 },
        },
        staleSnapshotAgeSec: null as number | null,
        missingData: {
          polymarket: { missingOutcomes: 0, missingLive: 0, missingCandles: 0 },
          limitless: { missingOutcomes: 0, missingLive: 0, missingCandles: 0 },
        },
        providerMismatch: {
          polymarket: { providerOpen: null as number | null, catalogOpen: 0, delta: null as number | null },
          limitless: { providerOpen: null as number | null, catalogOpen: 0, delta: null as number | null },
        },
      };

  const freshSignals = [
    liveHeads.polymarketMarketLive.fresh,
    liveHeads.canonicalMarketLive.fresh,
    candleHeads.polymarketCandles.fresh,
    candleHeads.canonicalCandles.fresh,
    ...providerSyncState.rows.map((row) => row.fresh),
  ].filter((value): value is boolean => typeof value === "boolean");

  const hasFreshSignal = freshSignals.some((value) => value);
  const degradedReasons: string[] = [];
  if (!supabaseService) degradedReasons.push("SUPABASE_UNAVAILABLE");
  if (!hasFreshSignal) degradedReasons.push("NO_FRESH_INGESTION_SIGNAL");
  if (coverage.marketCatalogRows === 0) degradedReasons.push("CATALOG_EMPTY");
  if (!upstash.configured) degradedReasons.push("UPSTASH_NOT_CONFIGURED");
  if (upstash.configured && upstash.ping.ok === false) degradedReasons.push("UPSTASH_UNREACHABLE");

  // Launch-check degraded reasons
  for (const p of PROVIDERS) {
    const cov = launchChecks.canonicalCoverageByProvider[p];
    if (cov.openCatalog > 0 && cov.coveragePct < 50) {
      degradedReasons.push(`LOW_COVERAGE_${p}`);
    }
    const md = launchChecks.missingData[p];
    const oc = cov.openCatalog || 1; // avoid div-by-zero
    if (md.missingOutcomes / oc > 0.1) {
      degradedReasons.push(`MISSING_OUTCOMES_${p}`);
    }
  }
  if (launchChecks.staleSnapshotAgeSec !== null && launchChecks.staleSnapshotAgeSec > 600) {
    degradedReasons.push("STALE_SNAPSHOT");
  }

  const snapshotId = await readUpstashSnapshotCursor("global");

  return {
    checkedAt,
    supabase: {
      available: Boolean(supabaseService),
      error: supabaseError,
      liveHeads,
      candleHeads,
      providerSyncState,
      coverage: {
        catalog: {
          rows: coverage.marketCatalogRows,
          openRows: coverage.marketCatalogOpen,
          snapshotId,
        },
        polymarket: {
          openMarkets: coverage.polymarketOpen,
          liveRows: coverage.polymarketLiveRows,
          trackedMarkets: readCountFromStats(polymarketStats, ["trackedMarkets", "openMarkets"]),
          trackedSubscriptions: readCountFromStats(polymarketStats, [
            "trackedSubscriptions",
            "activeSubscribedAssetIds",
            "trackedAssetIds",
          ]),
          trackedAssetIds: readCountFromStats(polymarketStats, ["trackedAssetIds"]),
          coveragePct:
            coverage.polymarketOpen && coverage.polymarketLiveRows !== null
              ? Math.round((coverage.polymarketLiveRows / Math.max(1, coverage.polymarketOpen)) * 1000) / 10
              : null,
        },
        limitless: {
          openMarkets: coverage.limitlessOpen,
          liveRows: coverage.limitlessLiveRows,
          trackedMarkets: readCountFromStats(limitlessStats, ["trackedMarkets", "openMarkets"]),
          trackedSubscriptions: readCountFromStats(limitlessStats, [
            "trackedSubscriptions",
            "wsSubscriptionTargets",
          ]),
          trackedSlugs: readCountFromStats(limitlessStats, ["trackedSlugs"]),
          trackedAddresses: readCountFromStats(limitlessStats, ["trackedAddresses"]),
          coveragePct:
            coverage.limitlessOpen && coverage.limitlessLiveRows !== null
              ? Math.round((coverage.limitlessLiveRows / Math.max(1, coverage.limitlessOpen)) * 1000) / 10
              : null,
        },
      },
    },
    upstash,
    launchChecks,
    pipeline: {
      status: hasFreshSignal ? (degradedReasons.length > 0 ? "degraded" : "healthy") : "degraded",
      degraded: degradedReasons.length > 0,
      reasons: degradedReasons,
      mode:
        upstash.configured && upstash.ping.ok
          ? "upstash+supabase"
          : "supabase-fallback",
      upstashFallbackActive: !upstash.configured || upstash.ping.ok === false,
    },
  };
};
