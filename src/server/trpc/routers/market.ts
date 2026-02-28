import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { publicProcedure, router } from "../trpc";
import { generateMarketContext } from "../../ai/marketContextAgent";
import {
  type PolymarketMarket,
  getPolymarketMarketById,
  getPolymarketPriceHistory,
  getPolymarketPublicTrades,
  listPolymarketMarkets,
} from "../../polymarket/client";
import {
  getMirroredPolymarketMarketById,
  listMirroredPolymarketMarkets,
  upsertMirroredPolymarketMarkets,
} from "../../polymarket/mirror";

const marketCategoryOutput = z.object({
  id: z.string(),
  labelRu: z.string(),
  labelEn: z.string(),
});

const marketOutcomeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  tokenId: z.string().nullable().optional(),
  slug: z.string(),
  title: z.string(),
  iconUrl: z.string().nullable(),
  chartColor: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  probability: z.number(),
  price: z.number(),
});

const marketOutput = z.object({
  id: z.string(),
  titleRu: z.string(),
  titleEn: z.string(),
  description: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  state: z.enum(["open", "closed", "resolved", "cancelled"]),
  createdAt: z.string(),
  closesAt: z.string(),
  expiresAt: z.string(),
  marketType: z.enum(["binary", "multi_choice"]).optional(),
  resolvedOutcomeId: z.string().nullable().optional(),
  outcomes: z.array(marketOutcomeOutput).optional(),
  outcome: z.enum(["YES", "NO"]).nullable(),
  createdBy: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  categoryLabelRu: z.string().nullable().optional(),
  categoryLabelEn: z.string().nullable().optional(),
  settlementAsset: z.string().nullable().optional(),
  feeBps: z.number().nullable().optional(),
  liquidityB: z.number().nullable().optional(),
  priceYes: z.number(),
  priceNo: z.number(),
  volume: z.number(),
  chance: z.number().nullable().optional(),
  creatorName: z.string().nullable().optional(),
  creatorAvatarUrl: z.string().nullable().optional(),
});

const marketBookmarkOutput = z.object({
  marketId: z.string(),
  createdAt: z.string(),
});

const priceCandleOutput = z.object({
  bucket: z.string(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  outcomeColor: z.string().nullable().optional(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  tradesCount: z.number(),
});

const publicTradeOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["YES", "NO"]).nullable(),
  outcomeId: z.string().nullable().optional(),
  outcomeTitle: z.string().nullable().optional(),
  collateralGross: z.number(),
  sharesDelta: z.number(),
  priceBefore: z.number(),
  priceAfter: z.number(),
  createdAt: z.string(),
});

const marketCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  userId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  authorName: z.string(),
  authorUsername: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  likesCount: z.number(),
  likedByMe: z.boolean(),
});

const myCommentOutput = z.object({
  id: z.string(),
  marketId: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  marketTitleRu: z.string(),
  marketTitleEn: z.string(),
  likesCount: z.number(),
});

const marketContextOutput = z.object({
  marketId: z.string(),
  context: z.string(),
  sources: z.array(z.string()),
  updatedAt: z.string(),
  generated: z.boolean(),
});

const tradeAccessOutput = z.object({
  status: z.enum(["ALLOWED", "BLOCKED_REGION", "UNKNOWN_TEMP_ERROR"]),
  allowed: z.boolean(),
  reasonCode: z.string().nullable(),
  message: z.string().nullable(),
  checkedAt: z.string(),
});

const relaySignedOrderInput = z.object({
  signedOrder: z.record(z.string(), z.unknown()),
  orderType: z.enum(["FOK", "GTC"]),
  apiCreds: z.object({
    key: z.string().min(1).max(512),
    secret: z.string().min(1).max(1024),
    passphrase: z.string().min(1).max(1024),
  }),
});

const relaySignedOrderOutput = z.object({
  success: z.boolean(),
  status: z.number(),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

const DEFAULT_CATEGORIES = [
  { id: "all", labelRu: "Все", labelEn: "All" },
  { id: "politics", labelRu: "Политика", labelEn: "Politics" },
  { id: "crypto", labelRu: "Крипто", labelEn: "Crypto" },
  { id: "sports", labelRu: "Спорт", labelEn: "Sports" },
  { id: "culture", labelRu: "Культура", labelEn: "Culture" },
] as const;

const t = (ru: string, en: string) => ({ ru, en });
const categoryLabelMap = new Map([
  ["politics", t("Политика", "Politics")],
  ["crypto", t("Крипто", "Crypto")],
  ["sports", t("Спорт", "Sports")],
  ["culture", t("Культура", "Culture")],
  ["business", t("Бизнес", "Business")],
]);

const mapPolymarketMarket = (market: Awaited<ReturnType<typeof getPolymarketMarketById>> extends infer T ? Exclude<T, null> : never) => {
  const outcomes = market.outcomes.map((o) => ({
    id: o.id,
    marketId: market.id,
    tokenId: o.tokenId ?? null,
    slug: o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    title: o.title,
    iconUrl: null,
    chartColor: null,
    sortOrder: o.sortOrder,
    isActive: true,
    probability: o.probability,
    price: o.price,
  }));
  const yes = outcomes[0];
  const no = outcomes[1];
  const categoryKey = (market.category || "all").toLowerCase();
  const labels = categoryLabelMap.get(categoryKey) ?? t("Разное", "General");

  let resolved: "YES" | "NO" | null = null;
  let resolvedOutcomeId: string | null = null;
  if (market.state === "resolved" && market.resolvedOutcomeTitle) {
    const normalized = market.resolvedOutcomeTitle.toLowerCase();
    if (normalized.includes("yes")) resolved = "YES";
    if (normalized.includes("no")) resolved = "NO";
    const matched = outcomes.find((o) => o.title.toLowerCase() === normalized);
    resolvedOutcomeId = matched?.id ?? null;
  }

  return {
    id: market.id,
    titleRu: market.title,
    titleEn: market.title,
    description: market.description,
    source: market.sourceUrl,
    imageUrl: market.imageUrl ?? "",
    state: market.state,
    createdAt: market.createdAt,
    closesAt: market.closesAt,
    expiresAt: market.expiresAt,
    marketType: outcomes.length > 2 ? ("multi_choice" as const) : ("binary" as const),
    resolvedOutcomeId,
    outcomes,
    outcome: resolved,
    createdBy: null,
    categoryId: categoryKey,
    categoryLabelRu: labels.ru,
    categoryLabelEn: labels.en,
    settlementAsset: "USD",
    feeBps: null,
    liquidityB: null,
    priceYes: yes ? yes.price : 0.5,
    priceNo: no ? no.price : 0.5,
    volume: market.volume,
    chance: yes ? yes.probability * 100 : 50,
    creatorName: null,
    creatorAvatarUrl: null,
  };
};

const MARKET_MIRROR_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.POLYMARKET_MARKET_STALE_AFTER_MS ?? 60_000)
);
const MARKET_MIRROR_FRESHNESS_CACHE_MS = 15_000;
let mirrorFreshnessSnapshot: { checkedAt: number; isFresh: boolean } | null = null;

const isMirrorFresh = async (supabaseService: unknown): Promise<boolean> => {
  if (!supabaseService) return false;
  const now = Date.now();
  if (
    mirrorFreshnessSnapshot &&
    now - mirrorFreshnessSnapshot.checkedAt < MARKET_MIRROR_FRESHNESS_CACHE_MS
  ) {
    return mirrorFreshnessSnapshot.isFresh;
  }

  try {
    const { data, error } = await (supabaseService as any)
      .from("polymarket_market_cache")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.last_synced_at) {
      mirrorFreshnessSnapshot = { checkedAt: now, isFresh: false };
      return false;
    }

    const lastSyncedAt = Date.parse(String(data.last_synced_at));
    const isFresh = Number.isFinite(lastSyncedAt) && now - lastSyncedAt <= MARKET_MIRROR_STALE_AFTER_MS;
    mirrorFreshnessSnapshot = { checkedAt: now, isFresh };
    return isFresh;
  } catch {
    mirrorFreshnessSnapshot = { checkedAt: now, isFresh: false };
    return false;
  }
};

const getMarketFromMirrorOrLive = async (
  supabaseService: unknown,
  marketId: string
): Promise<PolymarketMarket | null> => {
  try {
    const mirrored = await getMirroredPolymarketMarketById(supabaseService, marketId);
    if (mirrored) return mirrored;
  } catch (err) {
    console.warn("Mirror getMarket failed, falling back to Polymarket API", err);
  }

  const live = await getPolymarketMarketById(marketId);
  if (live) {
    try {
      await upsertMirroredPolymarketMarkets(supabaseService, [live]);
    } catch (err) {
      console.warn("Mirror upsert after live getMarket failed", err);
    }
  }
  return live;
};

const listMarketsFromMirrorOrLive = async (
  supabaseService: unknown,
  params: { onlyOpen: boolean; limit: number }
): Promise<PolymarketMarket[]> => {
  let mirrored: PolymarketMarket[] = [];
  let hadMirrorRows = false;

  try {
    mirrored = await listMirroredPolymarketMarkets(supabaseService, {
      onlyOpen: params.onlyOpen,
      limit: params.limit,
    });
    hadMirrorRows = mirrored.length > 0;
    if (hadMirrorRows) {
      const fresh = await isMirrorFresh(supabaseService);
      if (fresh) return mirrored;
    }
  } catch (err) {
    console.warn("Mirror listMarkets failed, falling back to Polymarket API", err);
  }

  try {
    const live = await listPolymarketMarkets(params.limit);
    if (live.length > 0) {
      try {
        await upsertMirroredPolymarketMarkets(supabaseService, live);
      } catch (err) {
        console.warn("Mirror upsert after live listMarkets failed", err);
      }
    }
    return params.onlyOpen ? live.filter((m) => m.state === "open") : live;
  } catch (err) {
    if (hadMirrorRows) {
      console.warn("Live listMarkets failed, serving stale mirrored markets", err);
      return params.onlyOpen ? mirrored.filter((m) => m.state === "open") : mirrored;
    }
    throw err;
  }
};

const getClobBaseUrl = () =>
  (
    process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL ||
    process.env.POLYMARKET_CLOB_API_BASE_URL ||
    "https://clob.polymarket.com"
  ).replace(/\/+$/, "");

const toErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "UNKNOWN_ERROR";
  }
};

type TradeAccessStatus = {
  status: "ALLOWED" | "BLOCKED_REGION" | "UNKNOWN_TEMP_ERROR";
  allowed: boolean;
  reasonCode: string | null;
  message: string | null;
  checkedAt: string;
};

const accessStatusCache = new Map<string, { expiresAt: number; value: TradeAccessStatus }>();
const relayRateLimitMap = new Map<string, { count: number; resetAt: number }>();

const normalizeAccessStatus = (payload: unknown): TradeAccessStatus => {
  const nowIso = new Date().toISOString();
  const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const values: unknown[] = Object.values(rec);
  const containsAllowedKeyword = values.some(
    (v) => typeof v === "string" && /(allow|approved|pass|ok|eligible)/i.test(v)
  );
  const containsBlockedKeyword = values.some(
    (v) => typeof v === "string" && /(block|forbid|deny|restricted|unavailable|geo)/i.test(v)
  );

  const explicitBoolean =
    typeof rec.allowed === "boolean"
      ? rec.allowed
      : typeof rec.canTrade === "boolean"
        ? rec.canTrade
        : typeof rec.tradingAllowed === "boolean"
          ? rec.tradingAllowed
          : null;

  const rawStatus = typeof rec.status === "string" ? rec.status : typeof rec.result === "string" ? rec.result : "";
  const reasonCode =
    typeof rec.reasonCode === "string"
      ? rec.reasonCode
      : typeof rec.reason === "string"
        ? rec.reason
        : typeof rec.error === "string"
          ? rec.error
          : null;
  const message = typeof rec.message === "string" ? rec.message : null;

  if (
    explicitBoolean === true ||
    /allow|approved|pass|ok|eligible/i.test(rawStatus) ||
    (containsAllowedKeyword && !containsBlockedKeyword)
  ) {
    return { status: "ALLOWED", allowed: true, reasonCode, message, checkedAt: nowIso };
  }

  if (
    explicitBoolean === false ||
    /block|forbid|deny|restrict|geo/i.test(rawStatus) ||
    containsBlockedKeyword
  ) {
    return { status: "BLOCKED_REGION", allowed: false, reasonCode, message, checkedAt: nowIso };
  }

  return {
    status: "UNKNOWN_TEMP_ERROR",
    allowed: false,
    reasonCode: reasonCode ?? "ACCESS_STATUS_UNKNOWN",
    message: message ?? "Could not verify regional access at this time.",
    checkedAt: nowIso,
  };
};

const getClientIpFromRequest = (req: Request): string | null => {
  const headerCandidates = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("true-client-ip"),
    req.headers.get("fly-client-ip"),
  ];
  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    const first = candidate.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
};

const getTradeAccessStatus = async (cacheKey: string, clientIp?: string | null): Promise<TradeAccessStatus> => {
  const ttlMs = Math.max(1000, Number(process.env.POLYMARKET_ACCESS_STATUS_TTL_MS ?? 60000));
  const now = Date.now();
  const cached = accessStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (clientIp) {
    headers["x-forwarded-for"] = clientIp;
    headers["x-real-ip"] = clientIp;
    headers["cf-connecting-ip"] = clientIp;
  }

  try {
    // Official geocheck endpoint: https://polymarket.com/api/geoblock
    const geoResponse = await fetch("https://polymarket.com/api/geoblock", {
      cache: "no-store",
      headers,
    });
    if (geoResponse.ok) {
      const geoPayload = await geoResponse.json().catch(() => null);
      const geoRec =
        geoPayload && typeof geoPayload === "object"
          ? (geoPayload as Record<string, unknown>)
          : {};
      const blocked =
        typeof geoRec.blocked === "boolean"
          ? geoRec.blocked
          : typeof geoRec.isBlocked === "boolean"
            ? geoRec.isBlocked
            : null;
      if (blocked === true) {
        const blockedValue: TradeAccessStatus = {
          status: "BLOCKED_REGION",
          allowed: false,
          reasonCode:
            typeof geoRec.reason === "string"
              ? geoRec.reason
              : typeof geoRec.country === "string"
                ? `COUNTRY_${geoRec.country}`
                : "GEO_BLOCKED",
          message:
            typeof geoRec.message === "string"
              ? geoRec.message
              : "Trading is unavailable in your jurisdiction.",
          checkedAt: new Date().toISOString(),
        };
        accessStatusCache.set(cacheKey, { value: blockedValue, expiresAt: now + ttlMs });
        return blockedValue;
      }
      if (blocked === false) {
        const allowedValue: TradeAccessStatus = {
          status: "ALLOWED",
          allowed: true,
          reasonCode: null,
          message: null,
          checkedAt: new Date().toISOString(),
        };
        accessStatusCache.set(cacheKey, { value: allowedValue, expiresAt: now + ttlMs });
        return allowedValue;
      }
    }

    // Backward-compatible fallback for CLOB access check
    const clobResponse = await fetch(`${getClobBaseUrl()}/auth/access-status`, {
      cache: "no-store",
      headers,
    });
    if (!clobResponse.ok) {
      const fallback: TradeAccessStatus = {
        status: "UNKNOWN_TEMP_ERROR",
        allowed: false,
        reasonCode: `HTTP_${clobResponse.status}`,
        message: "Could not verify regional access at this time.",
        checkedAt: new Date().toISOString(),
      };
      accessStatusCache.set(cacheKey, { value: fallback, expiresAt: now + 3000 });
      return fallback;
    }
    const payload = await clobResponse.json();
    const normalized = normalizeAccessStatus(payload);
    accessStatusCache.set(cacheKey, { value: normalized, expiresAt: now + ttlMs });
    return normalized;
  } catch {
    const fallback: TradeAccessStatus = {
      status: "UNKNOWN_TEMP_ERROR",
      allowed: false,
      reasonCode: "ACCESS_STATUS_FETCH_FAILED",
      message: "Could not verify regional access at this time.",
      checkedAt: new Date().toISOString(),
    };
    accessStatusCache.set(cacheKey, { value: fallback, expiresAt: now + 3000 });
    return fallback;
  }
};

const applyRelayRateLimit = (userId: string) => {
  const windowMs = 60_000;
  const maxPerWindow = 25;
  const now = Date.now();
  const entry = relayRateLimitMap.get(userId);
  if (!entry || entry.resetAt <= now) {
    relayRateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= maxPerWindow) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "ORDER_RELAY_RATE_LIMITED" });
  }
  entry.count += 1;
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

export const marketRouter = router({
  listCategories: publicProcedure.output(z.array(marketCategoryOutput)).query(async () => {
    return DEFAULT_CATEGORIES.map((c) => ({ id: c.id, labelRu: c.labelRu, labelEn: c.labelEn }));
  }),

  listMarkets: publicProcedure
    .input(z.object({ onlyOpen: z.boolean().optional() }).optional())
    .output(z.array(marketOutput))
    .query(async ({ ctx, input }) => {
      const onlyOpen = input?.onlyOpen ?? false;
      const rows = await listMarketsFromMirrorOrLive(ctx.supabaseService, {
        onlyOpen,
        limit: onlyOpen ? 600 : 1200,
      });
      const mapped = rows.map(mapPolymarketMarket);
      return onlyOpen ? mapped.filter((m) => m.state === "open") : mapped;
    }),

  getMarket: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketOutput)
    .query(async ({ ctx, input }) => {
      const row = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }
      return mapPolymarketMarket(row);
    }),

  checkTradeAccess: publicProcedure.output(tradeAccessOutput).query(async ({ ctx }) => {
    ctx.responseHeaders["cache-control"] = "no-store, max-age=0";
    const ip = getClientIpFromRequest(ctx.req);
    const cacheKey = `access:${ip ?? "unknown"}`;
    return getTradeAccessStatus(cacheKey, ip);
  }),

  relaySignedOrder: publicProcedure
    .input(relaySignedOrderInput)
    .output(relaySignedOrderOutput)
    .mutation(async ({ ctx, input }) => {
      const { authUser } = ctx;
      if (!authUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      ctx.responseHeaders["cache-control"] = "no-store, max-age=0";

      applyRelayRateLimit(authUser.id);
      const ip = getClientIpFromRequest(ctx.req);
      const cacheKey = `relay:${authUser.id}:${ip ?? "unknown"}`;
      const access = await getTradeAccessStatus(cacheKey, ip);
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: access.reasonCode ?? "TRADE_ACCESS_BLOCKED",
        });
      }

      const makerAddress = (input.signedOrder as Record<string, unknown>).maker;
      if (typeof makerAddress !== "string" || makerAddress.trim().length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SIGNED_ORDER_MAKER_MISSING" });
      }

      const orderPayload = {
        order: input.signedOrder,
        owner: input.apiCreds.key,
        orderType: input.orderType,
      };
      const orderBody = JSON.stringify(orderPayload);
      if (orderBody.length > 16 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "SIGNED_ORDER_TOO_LARGE" });
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const requestPath = "/order";
      const signature = buildL2Signature(
        input.apiCreds.secret,
        timestamp,
        "POST",
        requestPath,
        orderBody
      );

      const timeoutMs = Math.max(2000, Number(process.env.POLYMARKET_RELAY_TIMEOUT_MS ?? 10000));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${getClobBaseUrl()}/order`, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "POLY_ADDRESS": makerAddress,
            "POLY_SIGNATURE": signature,
            "POLY_TIMESTAMP": String(timestamp),
            "POLY_API_KEY": input.apiCreds.key,
            "POLY_PASSPHRASE": input.apiCreds.passphrase,
            ...(ip
              ? {
                  "x-forwarded-for": ip,
                  "x-real-ip": ip,
                  "cf-connecting-ip": ip,
                }
              : {}),
          },
          body: orderBody,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const payloadError =
            payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string"
              ? String((payload as Record<string, unknown>).error)
              : `ORDER_RELAY_HTTP_${response.status}`;
          return {
            success: false,
            status: response.status,
            error: payloadError,
            payload: payload ?? undefined,
          };
        }
        return {
          success: true,
          status: response.status,
          payload: payload ?? undefined,
        };
      } catch (err) {
        const msg = toErrorMessage(err);
        return {
          success: false,
          status: 0,
          error: msg.includes("aborted") ? "ORDER_RELAY_TIMEOUT" : msg,
        };
      } finally {
        clearTimeout(timeout);
      }
    }),

  generateMarketContext: publicProcedure
    .input(z.object({ marketId: z.string().min(1) }))
    .output(marketContextOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService } = ctx;
      const market = await getMarketFromMirrorOrLive(supabaseService, input.marketId);
      if (!market) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Market not found" });
      }

      const existing = await (supabaseService as any)
        .from("market_context")
        .select("market_id, context, sources, updated_at")
        .eq("market_id", input.marketId)
        .maybeSingle();
      if (!existing.error && existing.data?.context) {
        const src = Array.isArray(existing.data.sources) ? existing.data.sources.map(String) : [];
        return {
          marketId: String(existing.data.market_id),
          context: String(existing.data.context),
          sources: src,
          updatedAt: String(existing.data.updated_at),
          generated: false,
        };
      }

      const generated = await generateMarketContext({
        marketId: input.marketId,
        title: market.title,
        description: market.description,
        source: market.sourceUrl,
      });
      const updatedAt = new Date().toISOString();
      const upsert = await (supabaseService as any).from("market_context").upsert(
        {
          market_id: input.marketId,
          context: generated.context,
          sources: generated.sources,
          updated_at: updatedAt,
        },
        { onConflict: "market_id" }
      );
      if (upsert.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: upsert.error.message });
      }
      return {
        marketId: input.marketId,
        context: generated.context,
        sources: generated.sources,
        updatedAt,
        generated: true,
      };
    }),

  myBookmarks: publicProcedure
    .output(z.array(marketBookmarkOutput))
    .query(async ({ ctx }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const { data, error } = await (supabaseService as any)
        .from("market_bookmarks")
        .select("market_id, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []).map((r: any) => ({
        marketId: String(r.market_id),
        createdAt: new Date(String(r.created_at)).toISOString(),
      }));
    }),

  setBookmark: publicProcedure
    .input(z.object({ marketId: z.string().min(1), bookmarked: z.boolean() }))
    .output(z.object({ marketId: z.string(), bookmarked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      if (input.bookmarked) {
        const ins = await (supabaseService as any).from("market_bookmarks").insert({
          user_id: authUser.id,
          market_id: input.marketId,
        });
        if (ins.error && !String(ins.error.message).toLowerCase().includes("duplicate")) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
        }
      } else {
        const del = await (supabaseService as any)
          .from("market_bookmarks")
          .delete()
          .eq("user_id", authUser.id)
          .eq("market_id", input.marketId);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }
      return { marketId: input.marketId, bookmarked: input.bookmarked };
    }),

  getPriceCandles: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(1000).optional() }))
    .output(z.array(priceCandleOutput))
    .query(async ({ ctx, input }) => {
      const market = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!market) return [];
      const limit = input.limit ?? 200;
      const withToken = market.outcomes.filter((o) => Boolean(o.tokenId));
      if (withToken.length === 0) {
        const fallback = market.outcomes[0]?.price ?? 0.5;
        return [
          {
            bucket: new Date().toISOString(),
            outcomeId: market.outcomes[0]?.id ?? null,
            outcomeTitle: market.outcomes[0]?.title ?? null,
            outcomeColor: null,
            open: fallback,
            high: fallback,
            low: fallback,
            close: fallback,
            volume: market.volume,
            tradesCount: 0,
          },
        ];
      }

      const isBinary = market.outcomes.length <= 2;
      const yesOutcome =
        market.outcomes.find((o) => o.title.trim().toLowerCase() === "yes") ??
        market.outcomes.find((o) => o.sortOrder === 0) ??
        market.outcomes[0] ??
        null;
      const targetOutcomes = isBinary
        ? withToken.filter((o) => o.id === yesOutcome?.id)
        : withToken;

      const histories = await Promise.all(
        targetOutcomes.map(async (o) => ({
          outcome: o,
          history: await getPolymarketPriceHistory(String(o.tokenId)),
        }))
      );

      const candles = histories
        .flatMap(({ outcome, history }) => {
          const deduped = history
            .slice()
            .sort((a, b) => a.ts - b.ts)
            .filter((point, idx, arr) => idx === arr.length - 1 || point.ts !== arr[idx + 1]?.ts);

          return deduped.map((point, idx) => {
            const prev = deduped[idx - 1] ?? point;
            const open = prev.price;
            const close = point.price;
            return {
              bucket: new Date(point.ts * 1000).toISOString(),
              outcomeId: outcome.id,
              outcomeTitle: outcome.title,
              outcomeColor: null,
              open,
              high: Math.max(open, close),
              low: Math.min(open, close),
              close,
              volume: 0,
              tradesCount: 0,
            };
          });
        })
        .sort((a, b) => Date.parse(a.bucket) - Date.parse(b.bucket));
      if (candles.length === 0) return [];
      return candles.slice(Math.max(0, candles.length - limit));
    }),

  getPublicTrades: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(publicTradeOutput))
    .query(async ({ ctx, input }) => {
      const market = await getMarketFromMirrorOrLive(ctx.supabaseService, input.marketId);
      if (!market) return [];
      const rows = await getPolymarketPublicTrades(market.conditionId, input.limit ?? 50);
      const outcomesByTitle = new Map(
        market.outcomes.map((o) => [o.title.trim().toLowerCase(), o] as const)
      );
      return rows.map((t) => {
        const normalizedOutcome = (t.outcome ?? "").trim().toLowerCase();
        const outcome = outcomesByTitle.get(normalizedOutcome);
        const action = t.side === "SELL" ? "sell" : "buy";
        const yn =
          normalizedOutcome === "yes"
            ? ("YES" as const)
            : normalizedOutcome === "no"
              ? ("NO" as const)
              : null;
        return {
          id: t.id,
          marketId: market.id,
          action,
          outcome: yn,
          outcomeId: outcome?.id ?? null,
          outcomeTitle: outcome?.title ?? (t.outcome ?? null),
          collateralGross: t.size * t.price,
          sharesDelta: t.size,
          priceBefore: t.price,
          priceAfter: t.price,
          createdAt: new Date(t.timestamp * 1000).toISOString(),
        };
      });
    }),

  getMarketComments: publicProcedure
    .input(z.object({ marketId: z.string().min(1), limit: z.number().int().positive().max(200).optional() }))
    .output(z.array(marketCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      const { data: comments, error } = await (supabaseService as any)
        .from("market_comments")
        .select("id, market_id, user_id, parent_id, body, created_at")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: true })
        .limit(input.limit ?? 100);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const commentRows = (comments ?? []) as any[];
      const userIds = Array.from(new Set(commentRows.map((c) => String(c.user_id))));
      const [{ data: users }, { data: likes }] = await Promise.all([
        userIds.length > 0
          ? (supabaseService as any)
              .from("users")
              .select("id, display_name, username, avatar_url, telegram_photo_url")
              .in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        commentRows.length > 0
          ? (supabaseService as any)
              .from("market_comment_likes")
              .select("comment_id, user_id")
              .in("comment_id", commentRows.map((c) => String(c.id)))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const usersById = new Map((users ?? []).map((u: any) => [String(u.id), u]));
      const likesByComment = new Map<string, Set<string>>();
      for (const like of likes ?? []) {
        const commentId = String((like as any).comment_id);
        const userId = String((like as any).user_id);
        const set = likesByComment.get(commentId) ?? new Set<string>();
        set.add(userId);
        likesByComment.set(commentId, set);
      }

      return commentRows.map((c) => {
        const author = usersById.get(String(c.user_id)) as any;
        const likeSet = likesByComment.get(String(c.id)) ?? new Set<string>();
        return {
          id: String(c.id),
          marketId: String(c.market_id),
          userId: String(c.user_id),
          parentId: c.parent_id ? String(c.parent_id) : null,
          body: String(c.body ?? ""),
          createdAt: new Date(String(c.created_at)).toISOString(),
          authorName: String(author?.display_name ?? author?.username ?? "User"),
          authorUsername: author?.username ? String(author.username) : null,
          authorAvatarUrl: (author?.avatar_url ?? author?.telegram_photo_url ?? null) as string | null,
          likesCount: likeSet.size,
          likedByMe: authUser ? likeSet.has(authUser.id) : false,
        };
      });
    }),

  postMarketComment: publicProcedure
    .input(z.object({ marketId: z.string().min(1), body: z.string().min(1).max(2000), parentId: z.string().nullable().optional() }))
    .output(marketCommentOutput)
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const body = input.body.trim();
      if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Comment body is required" });

      const inserted = await (supabaseService as any)
        .from("market_comments")
        .insert({
          market_id: input.marketId,
          user_id: authUser.id,
          parent_id: input.parentId ?? null,
          body,
        })
        .select("id, market_id, user_id, parent_id, body, created_at")
        .single();
      if (inserted.error || !inserted.data) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: inserted.error?.message ?? "Failed to post comment" });
      }

      const profile = await (supabaseService as any)
        .from("users")
        .select("display_name, username, avatar_url, telegram_photo_url")
        .eq("id", authUser.id)
        .maybeSingle();
      const p = profile.data ?? {};
      return {
        id: String(inserted.data.id),
        marketId: String(inserted.data.market_id),
        userId: String(inserted.data.user_id),
        parentId: inserted.data.parent_id ? String(inserted.data.parent_id) : null,
        body: String(inserted.data.body ?? body),
        createdAt: new Date(String(inserted.data.created_at)).toISOString(),
        authorName: String(p.display_name ?? p.username ?? authUser.username ?? "User"),
        authorUsername: p.username ? String(p.username) : null,
        authorAvatarUrl: (p.avatar_url ?? p.telegram_photo_url ?? null) as string | null,
        likesCount: 0,
        likedByMe: false,
      };
    }),

  toggleMarketCommentLike: publicProcedure
    .input(z.object({ commentId: z.string().min(1) }))
    .output(z.object({ commentId: z.string(), liked: z.boolean(), likesCount: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const existing = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id, user_id")
        .eq("comment_id", input.commentId)
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (existing.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: existing.error.message });

      const liked = !existing.data;
      if (liked) {
        const ins = await (supabaseService as any).from("market_comment_likes").insert({
          comment_id: input.commentId,
          user_id: authUser.id,
        });
        if (ins.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ins.error.message });
      } else {
        const del = await (supabaseService as any)
          .from("market_comment_likes")
          .delete()
          .eq("comment_id", input.commentId)
          .eq("user_id", authUser.id);
        if (del.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: del.error.message });
      }

      const countRes = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id", { count: "exact", head: true })
        .eq("comment_id", input.commentId);
      return {
        commentId: input.commentId,
        liked,
        likesCount: Number(countRes.count ?? 0),
      };
    }),

  myComments: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(500).optional() }).optional())
    .output(z.array(myCommentOutput))
    .query(async ({ ctx, input }) => {
      const { supabaseService, authUser } = ctx;
      if (!authUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      const limit = input?.limit ?? 100;
      const { data, error } = await (supabaseService as any)
        .from("market_comments")
        .select("id, market_id, parent_id, body, created_at")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => String(r.market_id))));
      const markets = await Promise.all(
        ids.map(async (id) => [id, await getMarketFromMirrorOrLive(supabaseService, id)] as const)
      );
      const marketsById = new Map(markets);

      const likeCountsRes = await (supabaseService as any)
        .from("market_comment_likes")
        .select("comment_id")
        .in("comment_id", rows.map((r) => String(r.id)));
      const likesByComment = new Map<string, number>();
      for (const like of likeCountsRes.data ?? []) {
        const key = String((like as any).comment_id);
        likesByComment.set(key, (likesByComment.get(key) ?? 0) + 1);
      }

      return rows.map((r) => {
        const market = marketsById.get(String(r.market_id));
        const title = market?.title ?? "Market";
        return {
          id: String(r.id),
          marketId: String(r.market_id),
          parentId: r.parent_id ? String(r.parent_id) : null,
          body: String(r.body ?? ""),
          createdAt: new Date(String(r.created_at)).toISOString(),
          marketTitleRu: title,
          marketTitleEn: title,
          likesCount: likesByComment.get(String(r.id)) ?? 0,
        };
      });
    }),

});
