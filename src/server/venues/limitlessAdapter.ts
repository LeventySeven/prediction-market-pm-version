import {
  type VenueAdapter,
  type VenueCandleInterval,
  type VenueLimitlessTradeMeta,
  type VenueMarket,
  type VenueRelayOrderInput,
  type VenueRelayOrderOutput,
} from "./types";
import { extractTotalVolumeFromPayload } from "../../lib/marketVolumePayload";

const DEFAULT_BASE_ROOT = "https://api.limitless.exchange";
const DEFAULT_BASE = `${DEFAULT_BASE_ROOT}/api/v1`;
const DEFAULT_BASE_ALT = `${DEFAULT_BASE_ROOT}/api-v1`;
const DEFAULT_WS_URL = "wss://ws.limitless.exchange/markets";
const DEFAULT_SITE = "https://limitless.exchange";
const SNAPSHOT_CACHE_TTL_MS = Math.max(1000, Number(process.env.LIMITLESS_MARKETS_CACHE_TTL_MS ?? 15_000));
const LIMITLESS_ACTIVE_PAGE_LIMIT = Math.max(
  1,
  Math.min(200, Number(process.env.LIMITLESS_ACTIVE_PAGE_LIMIT ?? 200))
);
const LIMITLESS_DEBUG = (process.env.LIMITLESS_DEBUG || "").trim().toLowerCase() === "true";
const LIMITLESS_HTTP_TIMEOUT_MS = Math.max(2_000, Number(process.env.LIMITLESS_HTTP_TIMEOUT_MS ?? 10_000));
// Limitless API reference recommends max 2 concurrent calls with ~300ms spacing.
const LIMITLESS_PAGED_FETCH_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.LIMITLESS_PAGED_FETCH_CONCURRENCY ?? 2))
);
const LIMITLESS_HTTP_MAX_RETRIES = Math.max(0, Math.min(6, Number(process.env.LIMITLESS_HTTP_MAX_RETRIES ?? 2)));
const LIMITLESS_HTTP_RETRY_BASE_MS = Math.max(
  100,
  Number(process.env.LIMITLESS_HTTP_RETRY_BASE_MS ?? 300)
);
const LIMITLESS_HTTP_RETRY_MAX_MS = Math.max(
  LIMITLESS_HTTP_RETRY_BASE_MS,
  Number(process.env.LIMITLESS_HTTP_RETRY_MAX_MS ?? 5_000)
);
const LIMITLESS_HTTP_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
type LimitlessSnapshotSort = "newest" | "volume";

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });

const parseRetryAfterMs = (value: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const retryAt = Date.parse(trimmed);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - Date.now());
};

const retryDelayMs = (attempt: number, retryAfterMs: number | null): number =>
  Math.min(
    LIMITLESS_HTTP_RETRY_MAX_MS,
    Math.max(
      LIMITLESS_HTTP_RETRY_BASE_MS,
      retryAfterMs ?? LIMITLESS_HTTP_RETRY_BASE_MS * Math.pow(2, attempt)
    )
  );

const normalizeBase = (base: string): string => base.trim().replace(/\/+$/, "");

const getCandidateBaseUrls = (): string[] => {
  const fromEnv = normalizeBase(process.env.LIMITLESS_API_BASE_URL || DEFAULT_BASE_ROOT);
  const candidates = new Set<string>([fromEnv, DEFAULT_BASE_ROOT, DEFAULT_BASE, DEFAULT_BASE_ALT]);

  const addVariants = (base: string) => {
    if (base.endsWith("/api/v1")) {
      const root = base.replace(/\/api\/v1$/, "");
      candidates.add(root);
      candidates.add(`${root}/api-v1`);
      return;
    }
    if (base.endsWith("/api-v1")) {
      const root = base.replace(/\/api-v1$/, "");
      candidates.add(root);
      candidates.add(`${root}/api/v1`);
      return;
    }
    candidates.add(`${base}/api/v1`);
    candidates.add(`${base}/api-v1`);
  };

  addVariants(fromEnv);
  addVariants(DEFAULT_BASE_ROOT);

  return Array.from(candidates).filter(Boolean);
};

const toNumber = (value: unknown): number | null => {
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

const toString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toIso = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? Math.floor(value) : Math.floor(value * 1000);
    return new Date(ms).toISOString();
  }
  const raw = toString(value);
  if (!raw) return new Date().toISOString();
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    const ms = asNum > 10_000_000_000 ? Math.floor(asNum) : Math.floor(asNum * 1000);
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const parseRows = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
  }

  const obj = asRecord(payload);
  if (!obj) return [];

  const candidates = [
    obj.items,
    obj.data,
    obj.markets,
    obj.results,
    obj.rows,
    obj.candles,
    obj.history,
    obj.prices,
    obj.trades,
    obj.payload,
    obj.response,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
    }
    const rec = asRecord(candidate);
    if (rec) {
      const nestedCandidates = [
        rec.items,
        rec.data,
        rec.markets,
        rec.results,
        rec.rows,
        rec.candles,
        rec.history,
        rec.prices,
        rec.trades,
      ];
      for (const nested of nestedCandidates) {
        if (Array.isArray(nested)) {
          return nested.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
        }
      }
    }
  }

  return [];
};

const normalizeState = (value: unknown): VenueMarket["state"] => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.includes("resolve")) return "resolved";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("close") || raw.includes("ended") || raw.includes("expire")) return "closed";
  return "open";
};

const fallbackSourceUrl = (slug: string | null): string | null => {
  if (!slug) return null;
  return `${DEFAULT_SITE.replace(/\/+$/, "")}/market/${encodeURIComponent(slug)}`;
};

const readNestedString = (row: Record<string, unknown>, path: string[]): string | null => {
  let cursor: unknown = row;
  for (const segment of path) {
    const rec = asRecord(cursor);
    if (!rec) return null;
    cursor = rec[segment];
  }
  return toString(cursor);
};

const readNestedNumber = (row: Record<string, unknown>, path: string[]): number | null => {
  let cursor: unknown = row;
  for (const segment of path) {
    const rec = asRecord(cursor);
    if (!rec) return null;
    cursor = rec[segment];
  }
  return toNumber(cursor);
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toString(item))
    .filter((item): item is string => Boolean(item));
};

const buildLimitlessTradeMeta = (
  row: Record<string, unknown>,
  outcomes: VenueMarket["outcomes"]
): VenueLimitlessTradeMeta | null => {
  const marketSlug = toString(row.slug) ?? toString(row.marketSlug) ?? toString(row.market_slug);
  const exchangeAddress =
    readNestedString(row, ["venue", "exchange"]) ??
    toString(row.exchangeAddress) ??
    toString(row.exchange_address);
  const collateralTokenAddress =
    readNestedString(row, ["collateralToken", "address"]) ??
    readNestedString(row, ["collateral_token", "address"]) ??
    toString(row.collateralTokenAddress) ??
    toString(row.collateral_token_address);
  const directPositionIds = (() => {
    const primary = readStringArray(row.positionIds);
    if (primary.length > 0) return primary;
    return readStringArray(row.position_ids);
  })();
  const fallbackPositionIds = outcomes
    .map((outcome) => outcome.providerTokenId)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .slice(0, 2);
  const positionIds = (directPositionIds.length >= 2 ? directPositionIds : fallbackPositionIds).slice(0, 2);

  if (!marketSlug || !exchangeAddress || !collateralTokenAddress || positionIds.length < 2) {
    return null;
  }

  const collateralTokenDecimals = Math.max(
    1,
    Math.trunc(
      readNestedNumber(row, ["collateralToken", "decimals"]) ??
        readNestedNumber(row, ["collateral_token", "decimals"]) ??
        toNumber(row.collateralTokenDecimals) ??
        6
    )
  );
  const minOrderSize =
    readNestedNumber(row, ["settings", "minSize"]) ??
    readNestedNumber(row, ["settings", "min_size"]) ??
    toNumber(row.minSize) ??
    toNumber(row.min_size);

  return {
    marketSlug,
    exchangeAddress,
    adapterAddress:
      readNestedString(row, ["venue", "adapter"]) ??
      toString(row.adapterAddress) ??
      toString(row.adapter_address),
    collateralTokenAddress,
    collateralTokenDecimals,
    minOrderSize: minOrderSize === null ? null : Math.max(0, minOrderSize),
    positionIds: [positionIds[0]!, positionIds[1]!],
  };
};

const parseOutcomes = (
  row: Record<string, unknown>,
  marketId: string
): VenueMarket["outcomes"] => {
  const rowPositionIds = (() => {
    const primary = readStringArray(row.positionIds);
    if (primary.length > 0) return primary;
    return readStringArray(row.position_ids);
  })();
  const raw = row.outcomes;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item, idx) => {
        const rec = asRecord(item);
        if (!rec) return null;
        const title =
          toString(rec.title) ?? toString(rec.name) ?? toString(rec.label) ?? `Outcome ${idx + 1}`;
        const probabilityRaw =
          toNumber(rec.probability) ?? toNumber(rec.price) ?? toNumber(rec.odds) ?? toNumber(rec.percent);
        const probability =
          probabilityRaw === null
            ? 0
            : probabilityRaw > 1
              ? clamp01(probabilityRaw / 100)
              : clamp01(probabilityRaw);
        const providerOutcomeId =
          toString(rec.id) ?? toString(rec.outcome_id) ?? `${marketId}:outcome:${idx}`;
        const providerTokenId =
          toString(rec.tokenId) ??
          toString(rec.token_id) ??
          toString(rec.assetId) ??
          rowPositionIds[idx] ??
          null;
        return {
          id: providerOutcomeId,
          providerOutcomeId,
          providerTokenId,
          title,
          probability,
          price: probability,
          sortOrder: idx,
          isActive: true,
        };
      })
      .filter((item): item is VenueMarket["outcomes"][number] => Boolean(item));
  }

  const pricesRaw = Array.isArray(row.prices) ? row.prices : [];
  const yesFromPrices = pricesRaw.length > 0 ? toNumber(pricesRaw[0]) : null;
  const noFromPrices = pricesRaw.length > 1 ? toNumber(pricesRaw[1]) : null;
  const yesTokenFromTokens =
    asRecord(row.tokens) && typeof (row.tokens as Record<string, unknown>).yes !== "undefined"
      ? toString((row.tokens as Record<string, unknown>).yes)
      : null;
  const noTokenFromTokens =
    asRecord(row.tokens) && typeof (row.tokens as Record<string, unknown>).no !== "undefined"
      ? toString((row.tokens as Record<string, unknown>).no)
      : null;

  const yesPriceRaw =
    yesFromPrices ?? toNumber(row.yesPrice) ?? toNumber(row.probability) ?? toNumber(row.price) ?? 0.5;
  const yesPrice = yesPriceRaw > 1 ? clamp01(yesPriceRaw / 100) : clamp01(yesPriceRaw);
  const noPrice =
    noFromPrices === null
      ? clamp01(1 - yesPrice)
      : noFromPrices > 1
        ? clamp01(noFromPrices / 100)
        : clamp01(noFromPrices);

  return [
    {
      id: `${marketId}:yes`,
      providerOutcomeId: `${marketId}:yes`,
      providerTokenId:
        toString(row.yesTokenId) ?? toString(row.yes_token_id) ?? yesTokenFromTokens ?? rowPositionIds[0] ?? null,
      title: "YES",
      probability: yesPrice,
      price: yesPrice,
      sortOrder: 0,
      isActive: true,
    },
    {
      id: `${marketId}:no`,
      providerOutcomeId: `${marketId}:no`,
      providerTokenId:
        toString(row.noTokenId) ?? toString(row.no_token_id) ?? noTokenFromTokens ?? rowPositionIds[1] ?? null,
      title: "NO",
      probability: noPrice,
      price: noPrice,
      sortOrder: 1,
      isActive: true,
    },
  ];
};

const parseLimitlessVolume = (row: Record<string, unknown>): number => {
  return Math.max(0, extractTotalVolumeFromPayload(row) ?? 0);
};

const mapLimitlessMarket = (row: Record<string, unknown>): VenueMarket | null => {
  const providerMarketId =
    toString(row.id) ?? toString(row.marketId) ?? toString(row.market_id) ?? toString(row.slug);
  if (!providerMarketId) return null;

  const slug =
    toString(row.slug) ??
    toString(row.marketSlug) ??
    toString(row.market_slug) ??
    providerMarketId.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const title =
    toString(row.title) ?? toString(row.question) ?? toString(row.name) ?? `Market ${providerMarketId}`;

  const closesAt =
    toIso(
      row.closesAt ??
      row.closeTime ??
      row.close_time ??
      row.endTime ??
      row.end_time ??
      row.expirationTimestamp ??
      row.expiration
    );
  const expiresAt =
    toIso(
      row.expiresAt ??
      row.expireTime ??
      row.expire_time ??
      row.expirationTimestamp ??
      row.endTime ??
      row.end_time ??
      closesAt
    );
  const createdAt =
    toIso(row.createdAt ?? row.created_at ?? row.startTime ?? row.start_time ?? row.createdAtTimestamp ?? closesAt);

  const sourceUrlRaw = toString(row.url) ?? toString(row.sourceUrl) ?? toString(row.source_url);
  const sourceUrl = sourceUrlRaw && /^https?:\/\//i.test(sourceUrlRaw)
    ? sourceUrlRaw
    : fallbackSourceUrl(slug);
  const marketAddress =
    toString(row.marketAddress) ??
    toString(row.market_address) ??
    toString(row.address) ??
    null;

  const volume = parseLimitlessVolume(row);
  const outcomes = parseOutcomes(row, providerMarketId);

  return {
    provider: "limitless",
    providerMarketId,
    providerConditionId:
      toString(row.conditionId) ?? toString(row.condition_id) ?? toString(row.eventId) ?? null,
    marketAddress,
    slug,
    title,
    description: toString(row.description),
    imageUrl: toString(row.imageUrl) ?? toString(row.image) ?? toString(row.icon),
    sourceUrl,
    state: normalizeState(row.state ?? row.status),
    closesAt,
    expiresAt,
    createdAt,
    category:
      toString(row.category) ??
      toString(row.tag) ??
      (Array.isArray(row.categories) ? toString(row.categories[0]) : null),
    volume,
    resolvedOutcomeTitle: toString(row.resolvedOutcome) ?? toString(row.winningOutcome),
    outcomes,
    capabilities: {
      supportsTrading: true,
      supportsCandles: true,
      supportsPublicTrades: true,
      chainId: Number(process.env.LIMITLESS_CHAIN_ID || 8453),
    },
    tradeMeta: {
      limitless: buildLimitlessTradeMeta(row, outcomes),
    },
    providerPayload: row,
  };
};

const fetchJson = async (url: string): Promise<unknown> => {
  for (let attempt = 0; attempt <= LIMITLESS_HTTP_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIMITLESS_HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "prediction-market-worker/1.0 (+https://prediction-market.local)",
        },
      });

      if (!response.ok) {
        if (LIMITLESS_DEBUG) {
          const body = await response.text().catch(() => "");
          console.warn(
            `[limitless-adapter] http ${response.status} ${url} body=${body
              .slice(0, 180)
              .replace(/\s+/g, " ")}`
          );
        }
        const shouldRetry =
          LIMITLESS_HTTP_RETRYABLE_STATUSES.has(response.status) &&
          attempt < LIMITLESS_HTTP_MAX_RETRIES;
        if (shouldRetry) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
          await wait(retryDelayMs(attempt, retryAfterMs));
          continue;
        }
        throw new Error(`HTTP_${response.status}`);
      }

      const payload = await response.json();
      if (LIMITLESS_DEBUG) {
        const rows = parseRows(payload);
        console.log(`[limitless-adapter] ok ${url} rows=${rows.length}`);
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        attempt < LIMITLESS_HTTP_MAX_RETRIES &&
        (message.includes("aborted") ||
          message.includes("timed out") ||
          message.includes("fetch failed") ||
          message.includes("ECONNRESET") ||
          message.includes("ENOTFOUND"));
      if (!shouldRetry) throw error;
      await wait(retryDelayMs(attempt, null));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("LIMITLESS_HTTP_RETRY_EXHAUSTED");
};

const fetchMarketRows = async (params: {
  query?: string;
  limit?: number;
  onlyOpen?: boolean;
  sortBy?: LimitlessSnapshotSort;
}): Promise<Record<string, unknown>[]> => {
  const limit = Math.max(1, Math.min(params.limit ?? 300, 1000));
  const pageSize = Math.max(
    5,
    Math.min(LIMITLESS_ACTIVE_PAGE_LIMIT, Number(process.env.LIMITLESS_MARKETS_PAGE_SIZE ?? LIMITLESS_ACTIVE_PAGE_LIMIT))
  );
  const maxPages = Math.max(1, Math.min(20, Math.ceil(limit / pageSize) + 2));
  const bases = getCandidateBaseUrls();

  const fetchFirstNonEmpty = async (urls: string[]): Promise<Record<string, unknown>[]> => {
    for (const url of urls) {
      try {
        const payload = await fetchJson(url);
        const rows = parseRows(payload);
        if (rows.length > 0) return rows;
        if (LIMITLESS_DEBUG) {
          console.warn(`[limitless-adapter] empty rows from ${url}`);
        }
      } catch {
        if (LIMITLESS_DEBUG) {
          console.warn(`[limitless-adapter] request failed ${url}`);
        }
        // try next endpoint
      }
    }
    return [];
  };

  const fetchPaged = async (
    base: string,
    route: string,
    extraQuery?: string
  ): Promise<Record<string, unknown>[]> => {
    const collected: Record<string, unknown>[] = [];
    let shouldStop = false;

    for (
      let pageStart = 1;
      pageStart <= maxPages && collected.length < limit && !shouldStop;
      pageStart += LIMITLESS_PAGED_FETCH_CONCURRENCY
    ) {
      const pages: Array<{ page: number; pageLimit: number }> = [];
      for (
        let page = pageStart;
        page < pageStart + LIMITLESS_PAGED_FETCH_CONCURRENCY && page <= maxPages;
        page += 1
      ) {
        const remaining = limit - (collected.length + pages.reduce((acc, p) => acc + p.pageLimit, 0));
        if (remaining <= 0) break;
        pages.push({ page, pageLimit: Math.min(pageSize, remaining) });
      }
      if (pages.length === 0) break;

      const batch = await Promise.all(
        pages.map(async ({ page, pageLimit }) => {
          const queryParts = [`page=${page}`, `limit=${pageLimit}`];
          if (extraQuery && extraQuery.trim().length > 0) queryParts.push(extraQuery.trim());
          const url = `${base}${route}?${queryParts.join("&")}`;
          try {
            const payload = await fetchJson(url);
            return { page, pageLimit, url, rows: parseRows(payload), ok: true as const };
          } catch {
            if (LIMITLESS_DEBUG) {
              console.warn(`[limitless-adapter] paged request failed ${url}`);
            }
            return { page, pageLimit, url, rows: [] as Record<string, unknown>[], ok: false as const };
          }
        })
      );

      batch.sort((a, b) => a.page - b.page);
      for (const result of batch) {
        if (!result.ok) {
          shouldStop = true;
          break;
        }
        if (result.rows.length === 0) {
          shouldStop = true;
          break;
        }
        collected.push(...result.rows);
        if (result.rows.length < result.pageLimit || collected.length >= limit) {
          shouldStop = true;
          break;
        }
      }
    }

    return collected.slice(0, limit);
  };

  for (const base of bases) {
    if (params.query && params.query.trim().length > 0) {
      const q = encodeURIComponent(params.query.trim());
      const rows = await fetchFirstNonEmpty([
        `${base}/markets/search?q=${q}&limit=${limit}`,
        `${base}/markets/search?query=${q}&limit=${limit}`,
        `${base}/markets?q=${q}&limit=${limit}`,
        `${base}/markets?query=${q}&limit=${limit}`,
      ]);
      if (rows.length > 0) return rows.slice(0, limit);
      continue;
    }

    const activeSortHints =
      params.sortBy === "volume"
        ? ["high_value", "newest", ""]
        : ["newest", "ending_soon", ""];
    let openRows: Record<string, unknown>[] = [];
    for (const sortHint of activeSortHints) {
      const rows = await fetchPaged(
        base,
        "/markets/active",
        sortHint ? `sortBy=${encodeURIComponent(sortHint)}` : undefined
      );
      if (rows.length > 0) {
        openRows = rows;
        break;
      }
    }
    if (openRows.length > 0) {
      if (params.onlyOpen) return openRows.slice(0, limit);
      if (openRows.length >= limit) return openRows.slice(0, limit);
    }

    const status = params.onlyOpen ? "open" : "all";
    const statusSortHints =
      params.sortBy === "volume"
        ? ["high_value", "newest", ""]
        : ["newest", "ending_soon", ""];
    const statusUrls = statusSortHints.map((sortHint) =>
      sortHint
        ? `${base}/markets?limit=${limit}&status=${status}&sortBy=${encodeURIComponent(sortHint)}`
        : `${base}/markets?limit=${limit}&status=${status}`
    );
    const rows = await fetchFirstNonEmpty([
      ...statusUrls,
      `${base}/markets?limit=${limit}`,
    ]);
    if (rows.length > 0) {
      if (openRows.length === 0 || params.onlyOpen) return rows.slice(0, limit);
      const deduped = new Map<string, Record<string, unknown>>();
      for (const row of [...openRows, ...rows]) {
        const id = toString(row.id) ?? toString(row.market_id) ?? toString(row.slug);
        if (!id) continue;
        if (!deduped.has(id)) deduped.set(id, row);
      }
      return Array.from(deduped.values()).slice(0, limit);
    }

    if (openRows.length > 0) return openRows.slice(0, limit);
  }

  return [];
};

const snapshotCache = new Map<string, { expiresAt: number; rows: VenueMarket[] }>();

const relaySignedOrder = async (input: VenueRelayOrderInput): Promise<VenueRelayOrderOutput> => {
  const limitlessAuth = input.limitlessAuth;
  if (!limitlessAuth?.apiKey || !Number.isInteger(limitlessAuth.ownerId) || limitlessAuth.ownerId <= 0) {
    return { success: false, status: 400, error: "LIMITLESS_AUTH_REQUIRED" };
  }

  const marketSlug = typeof input.marketSlug === "string" ? input.marketSlug.trim() : "";
  if (!marketSlug) {
    return { success: false, status: 400, error: "LIMITLESS_MARKET_SLUG_REQUIRED" };
  }

  const makerAddress =
    typeof input.makerAddress === "string" && input.makerAddress.trim().length > 0
      ? input.makerAddress.trim()
      : typeof input.signedOrder.maker === "string"
        ? String(input.signedOrder.maker).trim()
        : typeof input.signedOrder.signer === "string"
          ? String(input.signedOrder.signer).trim()
          : "";
  if (!makerAddress) {
    return { success: false, status: 400, error: "SIGNED_ORDER_MAKER_MISSING" };
  }

  const body = JSON.stringify({
    order: input.signedOrder,
    ownerId: limitlessAuth.ownerId,
    orderType: input.orderType,
    marketSlug,
  });
  if (body.length > 16 * 1024) {
    return { success: false, status: 413, error: "SIGNED_ORDER_TOO_LARGE" };
  }

  const timeoutMs = Math.max(2_000, Number(process.env.LIMITLESS_RELAY_TIMEOUT_MS ?? 10_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const candidateUrls = Array.from(
    new Set(
      getCandidateBaseUrls().map((base) => `${normalizeBase(base)}/orders`)
    )
  );

  try {
    for (let idx = 0; idx < candidateUrls.length; idx += 1) {
      const response = await fetch(candidateUrls[idx]!, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "X-API-Key": limitlessAuth.apiKey,
          "x-account": makerAddress,
          ...(input.requestIp
            ? {
                "x-forwarded-for": input.requestIp,
                "x-real-ip": input.requestIp,
                "cf-connecting-ip": input.requestIp,
              }
            : {}),
        },
        body,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if ((response.status === 404 || response.status === 405) && idx < candidateUrls.length - 1) {
          continue;
        }
        const payloadRec =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;
        const message =
          (payloadRec && typeof payloadRec.error === "string" && payloadRec.error.trim()) ||
          (payloadRec && typeof payloadRec.message === "string" && payloadRec.message.trim()) ||
          `ORDER_RELAY_HTTP_${response.status}`;
        return {
          success: false,
          status: response.status,
          error: message,
          payload: payload ?? undefined,
        };
      }

      return {
        success: true,
        status: response.status,
        payload: payload ?? undefined,
      };
    }

    return { success: false, status: 404, error: "ORDER_RELAY_ENDPOINT_NOT_FOUND" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: 0,
      error: message.includes("aborted") ? "ORDER_RELAY_TIMEOUT" : message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const mapHistoryRowsToPoints = (
  rows: Record<string, unknown>[],
  limit: number
): Array<{ ts: number; price: number }> => {
  const parseUnixTs = (value: unknown): number | null => {
    const numeric = toNumber(value);
    if (numeric !== null) {
      return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const text = toString(value);
    if (!text) return null;
    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed / 1000);
  };

  const points = rows
    .map((row) => {
      const ts =
        parseUnixTs(row.ts) ??
        parseUnixTs(row.timestamp) ??
        parseUnixTs(row.t) ??
        parseUnixTs(row.time) ??
        parseUnixTs(row.bucket_start) ??
        parseUnixTs(row.bucketStart) ??
        parseUnixTs(row.open_time) ??
        parseUnixTs(row.openTime) ??
        parseUnixTs(row.start) ??
        parseUnixTs(row.date) ??
        null;
      const price =
        toNumber(row.price) ??
        toNumber(row.close) ??
        toNumber(row.closePrice) ??
        toNumber(row.mid) ??
        toNumber(row.p) ??
        toNumber(row.value) ??
        null;
      if (ts === null || price === null) return null;
      return { ts, price: clamp01(price > 1 ? price / 100 : price) };
    })
    .filter((item): item is { ts: number; price: number } => Boolean(item))
    .sort((a, b) => a.ts - b.ts);

  if (points.length === 0) return [];

  const byTs = new Map<number, { ts: number; price: number }>();
  for (const point of points) {
    byTs.set(point.ts, point);
  }

  const deduped = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
  return deduped.slice(Math.max(0, deduped.length - limit));
};

const historySpanSeconds = (points: Array<{ ts: number; price: number }>): number => {
  if (points.length <= 1) return 0;
  return Math.max(0, points[points.length - 1]!.ts - points[0]!.ts);
};

export const limitlessAdapter: VenueAdapter = {
  provider: "limitless",
  capabilities: {
    supportsTrading: true,
    supportsCandles: true,
    supportsPublicTrades: true,
    chainId: Number(process.env.LIMITLESS_CHAIN_ID || 8453),
  },
  isEnabled: () => (process.env.ENABLE_LIMITLESS || "").trim().toLowerCase() === "true",
  listMarketsSnapshot: async (params) => {
    const onlyOpen = params?.onlyOpen ?? false;
    const limit = Math.max(1, Math.min(params?.limit ?? 300, 1000));
    const sortBy: LimitlessSnapshotSort = params?.sortBy ?? "newest";
    const cacheKey = `${onlyOpen ? "open" : "all"}:${sortBy}:${limit}`;
    const now = Date.now();
    const cached = snapshotCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.rows.slice(0, limit);
    }

    const rows = await fetchMarketRows({ limit, onlyOpen, sortBy });
    const mapped = rows
      .map(mapLimitlessMarket)
      .filter((item): item is VenueMarket => Boolean(item))
      .sort((a, b) =>
        sortBy === "volume"
          ? b.volume - a.volume || Date.parse(b.createdAt) - Date.parse(a.createdAt)
          : Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
    if (LIMITLESS_DEBUG) {
      console.log(`[limitless-adapter] snapshot raw=${rows.length} mapped=${mapped.length} onlyOpen=${onlyOpen} limit=${limit}`);
      if (mapped.length > 0) {
        console.log(
          `[limitless-adapter] sample ids=${mapped
            .slice(0, 3)
            .map((m) => m.providerMarketId)
            .join(",")}`
        );
      }
    }
    snapshotCache.set(cacheKey, { rows: mapped, expiresAt: now + SNAPSHOT_CACHE_TTL_MS });
    if (params?.onlyOpen) return mapped.filter((m) => m.state === "open");
    return mapped;
  },
  searchMarkets: async (query, limit = 80) => {
    if (!query.trim()) return [];
    const rows = await fetchMarketRows({ query, limit, onlyOpen: false, sortBy: "newest" });
    return rows.map(mapLimitlessMarket).filter((item): item is VenueMarket => Boolean(item));
  },
  getMarketById: async (marketId) => {
    const clean = marketId.trim();
    if (!clean) return null;

    const bases = getCandidateBaseUrls();
    for (const base of bases) {
      const urls = [`${base}/markets/${encodeURIComponent(clean)}`, `${base}/market/${encodeURIComponent(clean)}`];
      for (const url of urls) {
        try {
          const payload = await fetchJson(url);
          const row = asRecord(payload);
          if (!row) continue;
          const mapped = mapLimitlessMarket(row);
          if (mapped) return mapped;
        } catch {
          // fallback below
        }
      }
    }

    const rows = await fetchMarketRows({ limit: 600, onlyOpen: false, sortBy: "newest" });
    const mapped = rows.map(mapLimitlessMarket).filter((item): item is VenueMarket => Boolean(item));
    return mapped.find((m) => m.providerMarketId === clean || m.slug === clean) ?? null;
  },
  getPriceHistory: async (
    market,
    limit = 400,
    params?: { interval?: VenueCandleInterval }
  ) => {
    const id = encodeURIComponent(market.providerMarketId);
    const safeLimit = Math.max(10, Math.min(limit, 5000));
    const requestedInterval = params?.interval ?? "1h";
    const intervalPlans: Array<{ interval: string; perIntervalLimit: number }> =
      requestedInterval === "1m"
        ? [
            { interval: "1m", perIntervalLimit: Math.max(240, Math.min(2000, safeLimit)) },
            { interval: "15m", perIntervalLimit: Math.max(240, Math.min(5000, safeLimit)) },
            { interval: "1h", perIntervalLimit: Math.max(240, Math.min(5000, safeLimit)) },
            { interval: "1d", perIntervalLimit: Math.max(90, Math.min(1500, Math.ceil(safeLimit / 4))) },
          ]
        : [
            { interval: "1h", perIntervalLimit: Math.max(240, Math.min(5000, safeLimit)) },
            { interval: "15m", perIntervalLimit: Math.max(240, Math.min(5000, safeLimit)) },
            { interval: "1d", perIntervalLimit: Math.max(90, Math.min(1500, Math.ceil(safeLimit / 4))) },
            { interval: "1m", perIntervalLimit: Math.max(240, Math.min(2000, safeLimit)) },
          ];

    let bestPoints: Array<{ ts: number; price: number }> = [];
    let bestSpan = 0;

    for (const plan of intervalPlans) {
      for (const base of getCandidateBaseUrls()) {
        const urls = [
          `${base}/markets/${id}/candles?interval=${plan.interval}&limit=${plan.perIntervalLimit}`,
          `${base}/candles?market_id=${id}&interval=${plan.interval}&limit=${plan.perIntervalLimit}`,
          `${base}/markets/${id}/prices?interval=${plan.interval}&limit=${plan.perIntervalLimit}`,
        ];

        for (const url of urls) {
          try {
            const payload = await fetchJson(url);
            const rows = parseRows(payload);
            const sourceRows =
              rows.length > 0
                ? rows
                : Array.isArray(payload)
                  ? (payload as unknown[])
                      .map((item) => asRecord(item))
                      .filter((item): item is Record<string, unknown> => Boolean(item))
                  : [];
            if (sourceRows.length === 0) continue;

            const points = mapHistoryRowsToPoints(sourceRows, safeLimit);
            if (points.length === 0) continue;

            const span = historySpanSeconds(points);
            const isBetter =
              span > bestSpan || (span === bestSpan && points.length > bestPoints.length);
            if (isBetter) {
              bestSpan = span;
              bestPoints = points;
            }

            if (bestSpan >= 7 * 24 * 60 * 60 && bestPoints.length >= Math.min(120, safeLimit)) {
              return bestPoints;
            }
          } catch {
            // try next endpoint / interval
          }
        }
      }
    }

    return bestPoints;
  },
  getPublicTrades: async (market, limit = 50) => {
    const id = encodeURIComponent(market.providerMarketId);
    for (const base of getCandidateBaseUrls()) {
      const urls = [
        `${base}/markets/${id}/trades?limit=${Math.max(1, Math.min(limit, 200))}`,
        `${base}/trades?market_id=${id}&limit=${Math.max(1, Math.min(limit, 200))}`,
      ];

      for (const url of urls) {
        try {
          const payload = await fetchJson(url);
          const rows = parseRows(payload);
          if (rows.length === 0 && !Array.isArray(payload)) continue;
          const sourceRows = rows.length > 0
            ? rows
            : (payload as unknown[])
                .map((item) => asRecord(item))
                .filter((item): item is Record<string, unknown> => Boolean(item));

          const mapped = sourceRows
            .map((row) => {
              const sideRaw = toString(row.side)?.toUpperCase();
              const side = sideRaw === "SELL" ? "SELL" : sideRaw === "BUY" ? "BUY" : null;
              if (!side) return null;
              const price = toNumber(row.price);
              const size = toNumber(row.size) ?? toNumber(row.amount);
              const ts = toNumber(row.timestamp) ?? toNumber(row.ts) ?? toNumber(row.time);
              if (price === null || size === null || ts === null) return null;
              const unix = ts > 10_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts);
              const id =
                toString(row.id) ??
                toString(row.tradeId) ??
                `${market.providerMarketId}:${unix}:${price}:${size}:${side}`;
              return {
                id,
                side,
                outcome: toString(row.outcome),
                size: Math.max(0, size),
                price: clamp01(price > 1 ? price / 100 : price),
                timestamp: unix,
              };
            })
            .filter((item): item is { id: string; side: "BUY" | "SELL"; outcome: string | null; size: number; price: number; timestamp: number } => Boolean(item));

          if (mapped.length > 0) return mapped;
        } catch {
          // try next endpoint
        }
      }
    }

    return [];
  },
  relaySignedOrder,
  wsCollectorConfig: () => ({
    url: (
      process.env.LIMITLESS_RTDS_WS_URL ||
      process.env.LIMITLESS_WS_URL ||
      DEFAULT_WS_URL
    )
      .trim() || null,
    channels: ["markets", "prices", "trades"],
  }),
};
