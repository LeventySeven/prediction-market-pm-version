import "server-only";

import type { ViewType } from "@/components/BottomMenu";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { getChartRangeRequest } from "@/src/lib/chartRanges";
import type {
  CatalogBootstrapEntry,
  HomePageInitialData,
  InitialCatalogBootstrap,
  MarketApiRow,
  ProviderFilter,
} from "@/src/lib/homePageInitialData";
import type { Comment as MarketComment, LiveActivityTick, PriceCandle, PublicTrade } from "@/types";
import { createContext } from "../trpc/context";
import { createCaller } from "../trpc/router";
import {
  getCanonicalMarket,
  getCanonicalPriceCandles,
  getPublicEnabledProviders,
  isCatalogReadError,
  listCanonicalMarkets,
} from "./readService";

const CATALOG_BOOTSTRAP_PAGE_SIZE = 60;
const INTERNAL_REQUEST_URL = "http://localhost/internal";
const DEFAULT_CATALOG_BOOTSTRAP_SORT: "newest" | "volume" = "volume";
let hasLoggedRouteBootstrapFallback = false;
let hasLoggedMarketBootstrapFallback = false;

const logFallbackOnce = (kind: "route" | "market", error: unknown) => {
  if (kind === "route") {
    if (hasLoggedRouteBootstrapFallback) return;
    hasLoggedRouteBootstrapFallback = true;
  } else {
    if (hasLoggedMarketBootstrapFallback) return;
    hasLoggedMarketBootstrapFallback = true;
  }
  console.warn(
    kind === "route"
      ? "Falling back to client-side bootstrap for route shell."
      : "Falling back to client-side market bootstrap.",
    error
  );
};

const resolveProviderFilter = (
  providerFilter: ProviderFilter | undefined,
  enabledProviders: Array<"polymarket" | "limitless">
): ProviderFilter => {
  if (!providerFilter || providerFilter === "all") return "all";
  return enabledProviders.includes(providerFilter) ? providerFilter : "all";
};

const buildCatalogCacheKey = (
  providerFilter: ProviderFilter,
  page = 1,
  sortBy: "newest" | "volume" = DEFAULT_CATALOG_BOOTSTRAP_SORT
) =>
  `provider:${providerFilter}:page:${page}:sort:${sortBy}:bucket:main`;

const buildCatalogBootstrapEntry = async (
  providerFilter: ProviderFilter,
  enabledProviders: Array<"polymarket" | "limitless">
): Promise<CatalogBootstrapEntry> => {
  const selectedProviders =
    providerFilter === "all" ? enabledProviders : enabledProviders.includes(providerFilter) ? [providerFilter] : enabledProviders;
  const result = await listCanonicalMarkets({
    onlyOpen: false,
    page: 1,
    pageSize: CATALOG_BOOTSTRAP_PAGE_SIZE + 1,
    sortBy: DEFAULT_CATALOG_BOOTSTRAP_SORT,
    catalogBucket: "main",
    providerFilter,
    providers: selectedProviders,
  });
  const rows = result.items as MarketApiRow[];

  return {
    cacheKey: buildCatalogCacheKey(providerFilter, 1, DEFAULT_CATALOG_BOOTSTRAP_SORT),
    providerFilter,
    page: 1,
    sortBy: DEFAULT_CATALOG_BOOTSTRAP_SORT,
    catalogBucket: "main",
    rows: rows.slice(0, CATALOG_BOOTSTRAP_PAGE_SIZE),
    hasMore: result.hasMore,
    snapshotId: result.snapshotId,
    pageScope: result.pageScope,
    source: result.source,
    stale: result.stale,
    updatedAt: Date.now(),
  };
};

const buildInitialCatalogBootstrap = async (
  providerFilter: ProviderFilter,
  enabledProviders: Array<"polymarket" | "limitless">
): Promise<InitialCatalogBootstrap> => ({
  fetchedAt: Date.now(),
  enabledProviders,
  entries: [await buildCatalogBootstrapEntry(providerFilter, enabledProviders)],
});

const createPublicCaller = async () => {
  const ctx = await createContext({
    req: new Request(INTERNAL_REQUEST_URL),
  });
  return createCaller(ctx);
};

const mapCommentToUi = (
  comment: {
    id?: string;
    userId?: string;
    authorName?: string;
    authorUsername?: string | null;
    authorAvatarUrl?: string | null;
    body?: string;
    createdAt?: string;
    likesCount?: number;
    likedByMe?: boolean;
    parentId?: string | null;
  },
  lang: "RU" | "EN"
): MarketComment => {
  const authorName = String(comment.authorName ?? "User");
  const createdAt = String(comment.createdAt ?? new Date().toISOString());
  const userLabel = comment.authorUsername ? `${authorName} (@${comment.authorUsername})` : authorName;
  return {
    id: String(comment.id ?? ""),
    userId: String(comment.userId ?? ""),
    username: comment.authorUsername ?? null,
    user: userLabel,
    avatar:
      comment.authorAvatarUrl ||
      buildInitialsAvatarDataUrl(authorName, { bg: "#333333", fg: "#ffffff" }),
    text: String(comment.body ?? ""),
    createdAt,
    timestamp: new Date(createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
    likes: comment.likesCount ?? 0,
    likedByMe: comment.likedByMe ?? false,
    parentId: comment.parentId ?? null,
  };
};

const inferProviderFilterFromMarketId = (marketId: string): ProviderFilter => {
  const cleanMarketId = marketId.trim();
  if (cleanMarketId.startsWith("limitless:")) return "limitless";
  if (cleanMarketId.startsWith("polymarket:")) return "polymarket";
  return "all";
};

const getMarketDetailData = async (
  market: MarketApiRow,
  lang: "RU" | "EN"
): Promise<{
  initialMarketCandles: PriceCandle[];
  initialMarketPublicTrades: PublicTrade[];
  initialMarketLiveActivityTicks: LiveActivityTick[];
  initialMarketComments: MarketComment[];
}> => {
  const chartRequest = getChartRangeRequest("1M");
  const caller = await createPublicCaller();
  const [candlesResult, publicTradesResult, liveActivityResult, commentsResult] = await Promise.allSettled([
    getCanonicalPriceCandles({
      marketId: market.id,
      provider: market.provider,
      interval: chartRequest.interval,
      limit: chartRequest.limit,
      range: "1M",
    }) as Promise<PriceCandle[]>,
    caller.market.getPublicTrades({
      marketId: market.id,
      provider: market.provider,
      limit: 50,
    }) as Promise<PublicTrade[]>,
    caller.market.getLiveActivity({
      marketId: market.id,
      provider: market.provider,
      limit: 80,
    }) as Promise<LiveActivityTick[]>,
    caller.market.getMarketComments({
      marketId: market.id,
      limit: 50,
    }),
  ]);

  return {
    initialMarketCandles: candlesResult.status === "fulfilled" ? candlesResult.value : [],
    initialMarketPublicTrades: publicTradesResult.status === "fulfilled" ? publicTradesResult.value : [],
    initialMarketLiveActivityTicks: liveActivityResult.status === "fulfilled" ? liveActivityResult.value : [],
    initialMarketComments:
      commentsResult.status === "fulfilled"
        ? commentsResult.value.map((comment) => mapCommentToUi(comment, lang))
        : [],
  };
};

export const getHomePageInitialData = async (params?: {
  initialView?: ViewType;
  providerFilter?: ProviderFilter;
}): Promise<HomePageInitialData> => {
  const enabledProviders = getPublicEnabledProviders();
  const providerFilter = resolveProviderFilter(params?.providerFilter, enabledProviders);

  try {
    return {
      initialView: params?.initialView ?? "CATALOG",
      initialProviderFilter: providerFilter,
      initialCatalogBootstrap: await buildInitialCatalogBootstrap(providerFilter, enabledProviders),
      initialEnabledProviders: enabledProviders,
      initialCatalogError: null,
    };
  } catch (error) {
    logFallbackOnce("route", error);
    return {
      initialView: params?.initialView ?? "CATALOG",
      initialProviderFilter: providerFilter,
      initialCatalogBootstrap: null,
      initialEnabledProviders: enabledProviders,
      initialCatalogError: isCatalogReadError(error) ? error.code : null,
    };
  }
};

export const getMarketRouteInitialData = async (
  marketId: string,
  params?: { lang?: "RU" | "EN" }
): Promise<HomePageInitialData> => {
  const enabledProviders = getPublicEnabledProviders();
  const providerFilter = resolveProviderFilter(
    inferProviderFilterFromMarketId(marketId),
    enabledProviders
  );

  try {
    const market = (await getCanonicalMarket({ marketId })) as MarketApiRow | null;
    const resolvedProviderFilter = resolveProviderFilter(
      market?.provider ?? providerFilter,
      enabledProviders
    );
    const initialCatalogBootstrap = await buildInitialCatalogBootstrap(resolvedProviderFilter, enabledProviders);

    if (!market) {
      return {
        initialView: "CATALOG",
        initialProviderFilter: resolvedProviderFilter,
        initialSelectedMarketId: marketId,
        initialCatalogBootstrap,
        initialEnabledProviders: enabledProviders,
        initialCatalogError: null,
      };
    }

    const detailData = await getMarketDetailData(market, params?.lang ?? "EN");
    return {
      initialView: "CATALOG",
      initialProviderFilter: resolvedProviderFilter,
      initialSelectedMarketId: market.id,
      initialCatalogBootstrap,
      initialSelectedMarket: market,
      initialEnabledProviders: enabledProviders,
      initialCatalogError: null,
      ...detailData,
    };
  } catch (error) {
    logFallbackOnce("market", error);
    return {
      initialView: "CATALOG",
      initialProviderFilter: providerFilter,
      initialSelectedMarketId: marketId,
      initialCatalogBootstrap: null,
      initialEnabledProviders: enabledProviders,
      initialCatalogError: isCatalogReadError(error) ? error.code : null,
    };
  }
};
