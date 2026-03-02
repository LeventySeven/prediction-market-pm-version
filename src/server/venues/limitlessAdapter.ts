import { createHmac } from "node:crypto";
import {
  type VenueAdapter,
  type VenueMarket,
  type VenueRelayOrderInput,
  type VenueRelayOrderOutput,
  type VenueTradeAccessStatus,
} from "./types";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

const DEFAULT_BASE_ROOT = "https://api.limitless.exchange";
const DEFAULT_BASE = `${DEFAULT_BASE_ROOT}/api/v1`;
const DEFAULT_BASE_ALT = `${DEFAULT_BASE_ROOT}/api-v1`;
const DEFAULT_SITE = "https://limitless.exchange";
const SNAPSHOT_CACHE_TTL_MS = Math.max(1000, Number(process.env.LIMITLESS_MARKETS_CACHE_TTL_MS ?? 15_000));

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

const getPrimaryBaseUrl = (): string => getCandidateBaseUrls()[0] ?? DEFAULT_BASE;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
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

  const candidates = [obj.items, obj.data, obj.markets, obj.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
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

const parseOutcomes = (
  row: Record<string, unknown>,
  marketId: string
): VenueMarket["outcomes"] => {
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
          toString(rec.tokenId) ?? toString(rec.token_id) ?? toString(rec.assetId) ?? null;
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
        toString(row.yesTokenId) ?? toString(row.yes_token_id) ?? yesTokenFromTokens ?? null,
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
        toString(row.noTokenId) ?? toString(row.no_token_id) ?? noTokenFromTokens ?? null,
      title: "NO",
      probability: noPrice,
      price: noPrice,
      sortOrder: 1,
      isActive: true,
    },
  ];
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

  const volume = Math.max(0, toNumber(row.volume) ?? toNumber(row.volume24h) ?? toNumber(row.liquidity) ?? 0);

  return {
    provider: "limitless",
    providerMarketId,
    providerConditionId:
      toString(row.conditionId) ?? toString(row.condition_id) ?? toString(row.eventId) ?? null,
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
    outcomes: parseOutcomes(row, providerMarketId),
    capabilities: {
      supportsTrading: true,
      supportsCandles: true,
      supportsPublicTrades: true,
      chainId: Number(process.env.LIMITLESS_CHAIN_ID || 8453),
    },
  };
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  return await response.json();
};

const fetchMarketRows = async (params: {
  query?: string;
  limit?: number;
  onlyOpen?: boolean;
}): Promise<Record<string, unknown>[]> => {
  const limit = Math.max(1, Math.min(params.limit ?? 300, 1000));
  const pageSize = Math.max(20, Math.min(200, Number(process.env.LIMITLESS_MARKETS_PAGE_SIZE ?? 100)));
  const maxPages = Math.max(1, Math.min(20, Math.ceil(limit / pageSize) + 2));
  const bases = getCandidateBaseUrls();

  const fetchFirstNonEmpty = async (urls: string[]): Promise<Record<string, unknown>[]> => {
    for (const url of urls) {
      try {
        const payload = await fetchJson(url);
        const rows = parseRows(payload);
        if (rows.length > 0) return rows;
      } catch {
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
    for (let page = 1; page <= maxPages && collected.length < limit; page += 1) {
      const limitForPage = Math.min(pageSize, limit - collected.length);
      const queryParts = [`page=${page}`, `limit=${limitForPage}`];
      if (extraQuery && extraQuery.trim().length > 0) queryParts.push(extraQuery.trim());
      const url = `${base}${route}?${queryParts.join("&")}`;
      try {
        const payload = await fetchJson(url);
        const rows = parseRows(payload);
        if (rows.length === 0) break;
        collected.push(...rows);
        if (rows.length < limitForPage) break;
      } catch {
        break;
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

    const openRows = await fetchPaged(base, "/markets/active", "sortBy=newest");
    if (openRows.length > 0) {
      if (params.onlyOpen) return openRows.slice(0, limit);
      if (openRows.length >= limit) return openRows.slice(0, limit);
    }

    const status = params.onlyOpen ? "open" : "all";
    const rows = await fetchFirstNonEmpty([
      `${base}/markets?limit=${limit}&status=${status}&sortBy=newest`,
      `${base}/markets?limit=${limit}&status=${status}`,
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

const accessCache = new Map<string, { expiresAt: number; value: VenueTradeAccessStatus }>();

const checkTradeAccess = async (params: {
  requestIp?: string | null;
  cacheKey: string;
}): Promise<VenueTradeAccessStatus> => {
  const ttlMs = Math.max(1000, Number(process.env.LIMITLESS_ACCESS_STATUS_TTL_MS ?? 60000));
  const now = Date.now();
  const cached = accessCache.get(params.cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const endpoint = (process.env.LIMITLESS_ACCESS_STATUS_URL || "").trim();
  if (!endpoint) {
    const blocked: VenueTradeAccessStatus = {
      status: "BLOCKED_REGION",
      allowed: false,
      reasonCode: "LIMITLESS_ACCESS_UNVERIFIED",
      message: "Limitless access status is not configured.",
      checkedAt: new Date().toISOString(),
    };
    accessCache.set(params.cacheKey, { value: blocked, expiresAt: now + ttlMs });
    return blocked;
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (params.requestIp) {
    headers["x-forwarded-for"] = params.requestIp;
    headers["x-real-ip"] = params.requestIp;
    headers["cf-connecting-ip"] = params.requestIp;
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      const fallback: VenueTradeAccessStatus = {
        status: "UNKNOWN_TEMP_ERROR",
        allowed: false,
        reasonCode: `HTTP_${response.status}`,
        message: "Could not verify regional access at this time.",
        checkedAt: new Date().toISOString(),
      };
      accessCache.set(params.cacheKey, { value: fallback, expiresAt: now + 3000 });
      return fallback;
    }

    const payload = (await response.json().catch(() => null)) as JsonLike | null;
    const rec =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, JsonLike | undefined>)
        : {};

    const allowed =
      typeof rec.allowed === "boolean"
        ? rec.allowed
        : typeof rec.canTrade === "boolean"
          ? rec.canTrade
          : typeof rec.tradingAllowed === "boolean"
            ? rec.tradingAllowed
            : null;

    if (allowed === true) {
      const value: VenueTradeAccessStatus = {
        status: "ALLOWED",
        allowed: true,
        reasonCode: null,
        message: null,
        checkedAt: new Date().toISOString(),
      };
      accessCache.set(params.cacheKey, { value, expiresAt: now + ttlMs });
      return value;
    }

    if (allowed === false) {
      const value: VenueTradeAccessStatus = {
        status: "BLOCKED_REGION",
        allowed: false,
        reasonCode:
          typeof rec.reasonCode === "string"
            ? rec.reasonCode
            : typeof rec.reason === "string"
              ? rec.reason
              : "LIMITLESS_BLOCKED",
        message:
          typeof rec.message === "string"
            ? rec.message
            : "Trading is unavailable in your jurisdiction.",
        checkedAt: new Date().toISOString(),
      };
      accessCache.set(params.cacheKey, { value, expiresAt: now + ttlMs });
      return value;
    }

    const unknown: VenueTradeAccessStatus = {
      status: "UNKNOWN_TEMP_ERROR",
      allowed: false,
      reasonCode: "LIMITLESS_ACCESS_UNKNOWN",
      message: "Could not verify regional access at this time.",
      checkedAt: new Date().toISOString(),
    };
    accessCache.set(params.cacheKey, { value: unknown, expiresAt: now + 3000 });
    return unknown;
  } catch {
    const fallback: VenueTradeAccessStatus = {
      status: "UNKNOWN_TEMP_ERROR",
      allowed: false,
      reasonCode: "LIMITLESS_ACCESS_FETCH_FAILED",
      message: "Could not verify regional access at this time.",
      checkedAt: new Date().toISOString(),
    };
    accessCache.set(params.cacheKey, { value: fallback, expiresAt: now + 3000 });
    return fallback;
  }
};

const relaySignedOrder = async (input: VenueRelayOrderInput): Promise<VenueRelayOrderOutput> => {
  const relayUrl = (process.env.LIMITLESS_ORDER_RELAY_URL || `${getPrimaryBaseUrl()}/orders`).trim();
  if (!relayUrl) {
    return { success: false, status: 500, error: "LIMITLESS_RELAY_URL_MISSING" };
  }

  const payload = {
    order: input.signedOrder,
    orderType: input.orderType,
    owner: input.apiCreds.key,
    clientOrderId: input.clientOrderId ?? null,
  };
  const body = JSON.stringify(payload);

  if (body.length > 16 * 1024) {
    return { success: false, status: 413, error: "SIGNED_ORDER_TOO_LARGE" };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", input.apiCreds.secret).update(`${timestamp}.${body}`).digest("hex");

  const timeoutMs = Math.max(2000, Number(process.env.LIMITLESS_RELAY_TIMEOUT_MS ?? 10000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(relayUrl, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        LIMITLESS_API_KEY: input.apiCreds.key,
        LIMITLESS_PASSPHRASE: input.apiCreds.passphrase,
        LIMITLESS_SIGNATURE: signature,
        LIMITLESS_TIMESTAMP: timestamp,
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

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const rec =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : null;
      return {
        success: false,
        status: response.status,
        error:
          rec && typeof rec.error === "string"
            ? rec.error
            : `ORDER_RELAY_HTTP_${response.status}`,
        payload: result ?? undefined,
      };
    }

    return {
      success: true,
      status: response.status,
      payload: result ?? undefined,
    };
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
    const cacheKey = `${onlyOpen ? "open" : "all"}:${limit}`;
    const now = Date.now();
    const cached = snapshotCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.rows.slice(0, limit);
    }

    const rows = await fetchMarketRows({ limit, onlyOpen });
    const mapped = rows
      .map(mapLimitlessMarket)
      .filter((item): item is VenueMarket => Boolean(item))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    snapshotCache.set(cacheKey, { rows: mapped, expiresAt: now + SNAPSHOT_CACHE_TTL_MS });
    if (params?.onlyOpen) return mapped.filter((m) => m.state === "open");
    return mapped;
  },
  searchMarkets: async (query, limit = 80) => {
    if (!query.trim()) return [];
    const rows = await fetchMarketRows({ query, limit, onlyOpen: false });
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

    const rows = await fetchMarketRows({ limit: 600, onlyOpen: false });
    const mapped = rows.map(mapLimitlessMarket).filter((item): item is VenueMarket => Boolean(item));
    return mapped.find((m) => m.providerMarketId === clean || m.slug === clean) ?? null;
  },
  getPriceHistory: async (market, limit = 400) => {
    const id = encodeURIComponent(market.providerMarketId);
    for (const base of getCandidateBaseUrls()) {
      const urls = [
        `${base}/markets/${id}/candles?interval=1m&limit=${Math.max(10, Math.min(limit, 2000))}`,
        `${base}/candles?market_id=${id}&interval=1m&limit=${Math.max(10, Math.min(limit, 2000))}`,
        `${base}/markets/${id}/prices?interval=1m&limit=${Math.max(10, Math.min(limit, 2000))}`,
      ];

      for (const url of urls) {
        try {
          const payload = await fetchJson(url);
          const rows = parseRows(payload);
          if (rows.length === 0 && Array.isArray(payload)) {
            const directRows = (payload as unknown[])
              .map((item) => asRecord(item))
              .filter((item): item is Record<string, unknown> => Boolean(item));
            if (directRows.length > 0) {
              const points = directRows
                .map((row) => {
                  const ts =
                    toNumber(row.ts) ??
                    toNumber(row.timestamp) ??
                    toNumber(row.t) ??
                    toNumber(row.time) ??
                    null;
                  const price =
                    toNumber(row.price) ?? toNumber(row.close) ?? toNumber(row.p) ?? toNumber(row.value) ?? null;
                  if (ts === null || price === null) return null;
                  const unix = ts > 10_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts);
                  return { ts: unix, price: clamp01(price > 1 ? price / 100 : price) };
                })
                .filter((item): item is { ts: number; price: number } => Boolean(item));
              if (points.length > 0) return points.slice(Math.max(0, points.length - limit));
            }
          }

          const points = rows
            .map((row) => {
              const ts =
                toNumber(row.ts) ??
                toNumber(row.timestamp) ??
                toNumber(row.t) ??
                toNumber(row.time) ??
                null;
              const price =
                toNumber(row.price) ?? toNumber(row.close) ?? toNumber(row.p) ?? toNumber(row.value) ?? null;
              if (ts === null || price === null) return null;
              const unix = ts > 10_000_000_000 ? Math.floor(ts / 1000) : Math.floor(ts);
              return { ts: unix, price: clamp01(price > 1 ? price / 100 : price) };
            })
            .filter((item): item is { ts: number; price: number } => Boolean(item));

          if (points.length > 0) return points.slice(Math.max(0, points.length - limit));
        } catch {
          // try next
        }
      }
    }

    return [];
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
  checkTradeAccess,
  relaySignedOrder,
  wsCollectorConfig: () => ({
    url: (process.env.LIMITLESS_RTDS_WS_URL || process.env.LIMITLESS_WS_URL || "").trim() || null,
    channels: ["markets", "prices", "trades"],
  }),
};
