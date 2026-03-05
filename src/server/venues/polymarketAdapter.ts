import { createHmac } from "node:crypto";
import {
  getPolymarketMarketById,
  getPolymarketPriceHistory,
  getPolymarketPublicTrades,
  listPolymarketMarkets,
  searchPolymarketMarkets,
  type PolymarketMarket,
} from "../polymarket/client";
import {
  type VenueAdapter,
  type VenueCandleInterval,
  type VenueMarket,
  type VenueRelayOrderInput,
  type VenueRelayOrderOutput,
  type VenueTradeAccessStatus,
  venueToCanonicalId,
} from "./types";

const getClobBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL ||
    process.env.POLYMARKET_CLOB_API_BASE_URL ||
    "https://clob.polymarket.com"
  ).replace(/\/+$/, "");

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toIso = (value: unknown): string => {
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date().toISOString();
};

const mapPolymarketToVenue = (market: PolymarketMarket): VenueMarket => ({
  provider: "polymarket",
  providerMarketId: market.id,
  providerConditionId: market.conditionId,
  slug: market.slug,
  title: market.title,
  description: market.description,
  imageUrl: market.imageUrl,
  sourceUrl: market.sourceUrl,
  state: market.state,
  closesAt: market.closesAt,
  expiresAt: market.expiresAt,
  createdAt: market.createdAt,
  category: market.category,
  volume: market.volume,
  resolvedOutcomeTitle: market.resolvedOutcomeTitle,
  outcomes: market.outcomes.map((o) => ({
    id: o.id,
    providerOutcomeId: o.id,
    providerTokenId: o.tokenId,
    title: o.title,
    probability: clamp01(o.probability),
    price: clamp01(o.price),
    sortOrder: o.sortOrder,
    isActive: true,
  })),
  capabilities: {
    supportsTrading: true,
    supportsCandles: true,
    supportsPublicTrades: true,
    chainId: Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137),
  },
});

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

const statusCache = new Map<string, { expiresAt: number; value: VenueTradeAccessStatus }>();

const toBooleanLike = (value: JsonLike | undefined): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) return null;
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "y" ||
      normalized === "blocked" ||
      normalized === "deny" ||
      normalized === "denied"
    ) {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "n" ||
      normalized === "allowed" ||
      normalized === "ok" ||
      normalized === "eligible"
    ) {
      return false;
    }
  }
  return null;
};

const normalizeAccessStatus = (payload: JsonLike | null): VenueTradeAccessStatus => {
  const nowIso = new Date().toISOString();
  const rec =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, JsonLike | undefined>)
      : {};
  const values = Object.values(rec);
  const containsAllowedKeyword = values.some(
    (v) => typeof v === "string" && /(allow|approved|pass|ok|eligible)/i.test(v)
  );
  const containsBlockedKeyword = values.some(
    (v) => typeof v === "string" && /(block|forbid|deny|restricted|unavailable|geo)/i.test(v)
  );

  const explicitBoolean =
    toBooleanLike(rec.allowed) ??
    toBooleanLike(rec.canTrade) ??
    toBooleanLike(rec.tradingAllowed) ??
    toBooleanLike(rec.isAllowed) ??
    null;

  const rawStatus =
    typeof rec.status === "string"
      ? rec.status
      : typeof rec.result === "string"
        ? rec.result
        : typeof rec.accessStatus === "string"
          ? rec.accessStatus
        : "";

  const reasonCode =
    typeof rec.reasonCode === "string"
      ? rec.reasonCode
      : typeof rec.reason === "string"
        ? rec.reason
        : typeof rec.error === "string"
          ? rec.error
          : null;

  const message =
    typeof rec.message === "string"
      ? rec.message
      : typeof rec.detail === "string"
        ? rec.detail
        : null;

  if (
    explicitBoolean === true ||
    /allow|approved|pass|ok|eligible/i.test(rawStatus) ||
    (containsAllowedKeyword && !containsBlockedKeyword)
  ) {
    return {
      status: "ALLOWED",
      allowed: true,
      reasonCode,
      message,
      checkedAt: nowIso,
    };
  }

  if (
    explicitBoolean === false ||
    /block|forbid|deny|restrict|geo/i.test(rawStatus) ||
    containsBlockedKeyword
  ) {
    return {
      status: "BLOCKED_REGION",
      allowed: false,
      reasonCode,
      message,
      checkedAt: nowIso,
    };
  }

  return {
    status: "UNKNOWN_TEMP_ERROR",
    allowed: false,
    reasonCode: reasonCode ?? "ACCESS_STATUS_UNKNOWN",
    message: message ?? "Could not verify regional access at this time.",
    checkedAt: nowIso,
  };
};

const toBase64 = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${pad}`;
};

const buildL2Signature = (
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string
) => {
  let message = `${timestamp}${method}${requestPath}`;
  if (body) message += body;
  const key = Buffer.from(toBase64(secret), "base64");
  return createHmac("sha256", key)
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const checkTradeAccess = async (params: {
  requestIp?: string | null;
  cacheKey: string;
}): Promise<VenueTradeAccessStatus> => {
  const ttlMs = Math.max(1000, Number(process.env.POLYMARKET_ACCESS_STATUS_TTL_MS ?? 60000));
  const now = Date.now();
  const cached = statusCache.get(params.cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (params.requestIp) {
    headers["x-forwarded-for"] = params.requestIp;
    headers["x-real-ip"] = params.requestIp;
    headers["cf-connecting-ip"] = params.requestIp;
  }

  try {
    const geoResponse = await fetch("https://polymarket.com/api/geoblock", {
      cache: "no-store",
      headers,
    });

    if (geoResponse.ok) {
      const payload = (await geoResponse.json().catch(() => null)) as JsonLike | null;
      const rec =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, JsonLike | undefined>)
          : {};
      const blocked =
        toBooleanLike(rec.blocked) ??
        toBooleanLike(rec.isBlocked) ??
        toBooleanLike(rec.is_blocked) ??
        toBooleanLike(rec.geoBlocked) ??
        null;

      if (blocked === true) {
        const value: VenueTradeAccessStatus = {
          status: "BLOCKED_REGION",
          allowed: false,
          reasonCode:
            typeof rec.reason === "string"
              ? rec.reason
              : typeof rec.country === "string"
                ? `COUNTRY_${rec.country}`
                : "GEO_BLOCKED",
          message:
            typeof rec.message === "string"
              ? rec.message
              : "Trading is unavailable in your jurisdiction.",
          checkedAt: new Date().toISOString(),
        };
        statusCache.set(params.cacheKey, { value, expiresAt: now + ttlMs });
        return value;
      }

      if (blocked === false) {
        const value: VenueTradeAccessStatus = {
          status: "ALLOWED",
          allowed: true,
          reasonCode: null,
          message: null,
          checkedAt: new Date().toISOString(),
        };
        statusCache.set(params.cacheKey, { value, expiresAt: now + ttlMs });
        return value;
      }

      const normalizedGeo = normalizeAccessStatus(payload);
      if (normalizedGeo.status !== "UNKNOWN_TEMP_ERROR") {
        statusCache.set(params.cacheKey, { value: normalizedGeo, expiresAt: now + ttlMs });
        return normalizedGeo;
      }
    }

    const clobResponse = await fetch(`${getClobBaseUrl()}/auth/access-status`, {
      cache: "no-store",
      headers,
    });

    if (!clobResponse.ok) {
      const fallback: VenueTradeAccessStatus = {
        status: "UNKNOWN_TEMP_ERROR",
        allowed: false,
        reasonCode: `HTTP_${clobResponse.status}`,
        message: "Could not verify regional access at this time.",
        checkedAt: new Date().toISOString(),
      };
      statusCache.set(params.cacheKey, { value: fallback, expiresAt: now + 3000 });
      return fallback;
    }

    const payload = (await clobResponse.json()) as JsonLike;
    const normalized = normalizeAccessStatus(payload);
    statusCache.set(params.cacheKey, { value: normalized, expiresAt: now + ttlMs });
    return normalized;
  } catch {
    const fallback: VenueTradeAccessStatus = {
      status: "UNKNOWN_TEMP_ERROR",
      allowed: false,
      reasonCode: "ACCESS_STATUS_FETCH_FAILED",
      message: "Could not verify regional access at this time.",
      checkedAt: new Date().toISOString(),
    };
    statusCache.set(params.cacheKey, { value: fallback, expiresAt: now + 3000 });
    return fallback;
  }
};

const relaySignedOrder = async (input: VenueRelayOrderInput): Promise<VenueRelayOrderOutput> => {
  const makerAddress =
    typeof input.makerAddress === "string" && input.makerAddress.trim().length > 0
      ? input.makerAddress.trim()
      : typeof input.signedOrder.maker === "string"
        ? (input.signedOrder.maker as string).trim()
        : "";

  if (!makerAddress) {
    return { success: false, status: 400, error: "SIGNED_ORDER_MAKER_MISSING" };
  }

  const requestPath = "/order";
  const payload = {
    order: input.signedOrder,
    owner: input.apiCreds.key,
    orderType: input.orderType,
  };
  const body = JSON.stringify(payload);

  if (body.length > 16 * 1024) {
    return { success: false, status: 413, error: "SIGNED_ORDER_TOO_LARGE" };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildL2Signature(input.apiCreds.secret, timestamp, "POST", requestPath, body);

  const timeoutMs = Math.max(2000, Number(process.env.POLYMARKET_RELAY_TIMEOUT_MS ?? 10000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getClobBaseUrl()}${requestPath}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        POLY_ADDRESS: makerAddress,
        POLY_SIGNATURE: signature,
        POLY_TIMESTAMP: String(timestamp),
        POLY_API_KEY: input.apiCreds.key,
        POLY_PASSPHRASE: input.apiCreds.passphrase,
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
      const payloadRec =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : null;

      const message =
        payloadRec && typeof payloadRec.error === "string"
          ? payloadRec.error
          : `ORDER_RELAY_HTTP_${response.status}`;
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

export const polymarketAdapter: VenueAdapter = {
  provider: "polymarket",
  capabilities: {
    supportsTrading: true,
    supportsCandles: true,
    supportsPublicTrades: true,
    chainId: Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137),
  },
  isEnabled: () => true,
  listMarketsSnapshot: async (params) => {
    const rows = await listPolymarketMarkets(Math.max(1, Math.min(params?.limit ?? 500, 2000)));
    const mapped = rows.map(mapPolymarketToVenue);
    if (params?.onlyOpen) return mapped.filter((m) => m.state === "open");
    return mapped;
  },
  searchMarkets: async (query, limit = 80) => {
    const rows = await searchPolymarketMarkets(query, Math.max(1, Math.min(limit, 200)));
    return rows.map(mapPolymarketToVenue);
  },
  getMarketById: async (marketId) => {
    const row = await getPolymarketMarketById(marketId);
    return row ? mapPolymarketToVenue(row) : null;
  },
  getPriceHistory: async (
    market,
    limit = 400,
    params?: { interval?: VenueCandleInterval }
  ) => {
    const yesOutcome =
      market.outcomes.find((o) => o.title.trim().toLowerCase() === "yes") ?? market.outcomes[0] ?? null;

    if (!yesOutcome?.providerTokenId) {
      return [];
    }

    const rows = await getPolymarketPriceHistory(yesOutcome.providerTokenId, {
      interval: params?.interval ?? "1h",
    });
    return rows.slice(Math.max(0, rows.length - limit));
  },
  getPublicTrades: async (market, limit = 50) => {
    const conditionId = market.providerConditionId || market.providerMarketId;
    const rows = await getPolymarketPublicTrades(conditionId, Math.max(1, Math.min(limit, 200)));
    return rows.map((row) => ({
      id: row.id,
      side: row.side,
      outcome: row.outcome,
      size: row.size,
      price: row.price,
      timestamp: row.timestamp,
    }));
  },
  checkTradeAccess,
  relaySignedOrder,
  wsCollectorConfig: () => ({
    url: (
      process.env.POLYMARKET_MARKET_WS_URL ||
      process.env.POLYMARKET_RTDS_WS_URL ||
      "wss://ws-subscriptions-clob.polymarket.com/ws/market"
    ).trim(),
    channels: ["market"],
  }),
};

export const toPolymarketCanonicalId = (providerMarketId: string) =>
  venueToCanonicalId("polymarket", providerMarketId);
