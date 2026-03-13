import type { PriceCandle, PublicTrade, LiveActivityTick, Comment as MarketComment } from "@/types";
import type { ViewType } from "@/components/BottomMenu";

export type ProviderFilter = "all" | "polymarket" | "limitless";

export type MarketApiRow = {
  id: string;
  provider?: "polymarket" | "limitless";
  providerMarketId?: string;
  canonicalMarketId?: string;
  marketRefId?: string | null;
  titleRu: string;
  titleEn: string;
  description?: string | null;
  source?: string | null;
  imageUrl?: string;
  state: string;
  createdAt: string;
  closesAt: string;
  expiresAt: string;
  marketType?: "binary" | "multi_choice";
  resolvedOutcomeId?: string | null;
  outcomes?: Array<{
    id: string;
    marketId: string;
    tokenId?: string | null;
    slug: string;
    title: string;
    iconUrl: string | null;
    chartColor?: string | null;
    sortOrder: number;
    isActive: boolean;
    probability: number;
    price: number;
  }>;
  outcome: "YES" | "NO" | null;
  createdBy?: string | null;
  categoryId?: string | null;
  categoryLabelRu?: string | null;
  categoryLabelEn?: string | null;
  settlementAsset?: string | null;
  feeBps?: number | null;
  liquidityB?: number | null;
  priceYes: number;
  priceNo: number;
  volume: number;
  totalVolumeUsd: number;
  isFastMarket: boolean;
  catalogBucket: "main" | "fast";
  snapshotId?: number | null;
  liveSeq?: number | null;
  compareGroupId?: string | null;
  compareGroup?: {
    id: string;
    marketCount: number;
    providerCount: number;
    totalVolumeUsd: number;
    category?: string | null;
    normalizedClosesAt?: string | null;
  } | null;
  chance?: number | null;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  mid?: number | null;
  lastTradePrice?: number | null;
  lastTradeSize?: number | null;
  rolling24hVolume?: number | null;
  openInterest?: number | null;
  liveUpdatedAt?: string | null;
  freshness?: {
    sourceTs: string | null;
    stale: boolean;
  } | null;
  orderbookFreshness?: {
    updatedAt: string | null;
    depthAvailable: number;
    stale: boolean;
  } | null;
  capabilities?: {
    supportsTrading: boolean;
    supportsCandles: boolean;
    supportsPublicTrades: boolean;
    chainId: number | null;
  } | null;
  tradeMeta?: {
    limitless?: {
      marketSlug: string;
      exchangeAddress: string;
      adapterAddress: string | null;
      collateralTokenAddress: string;
      collateralTokenDecimals: number;
      minOrderSize: number | null;
      positionIds: [string, string];
    } | null;
  } | null;
};

export type CatalogPageScope = "main" | "fast";

export type CatalogBootstrapEntry = {
  cacheKey: string;
  providerFilter: ProviderFilter;
  page: number;
  sortBy: "newest" | "volume";
  catalogBucket: CatalogPageScope;
  rows: MarketApiRow[];
  hasMore: boolean;
  snapshotId?: number | null;
  pageScope?: string;
  source?: "redis" | "supabase";
  stale?: boolean;
  updatedAt: number;
};

export type InitialCatalogBootstrap = {
  fetchedAt: number;
  enabledProviders: Array<"polymarket" | "limitless">;
  entries: CatalogBootstrapEntry[];
};

export type HomePageInitialData = {
  initialView?: ViewType;
  initialProviderFilter?: ProviderFilter;
  initialSelectedMarketId?: string | null;
  initialCatalogBootstrap?: InitialCatalogBootstrap | null;
  initialSelectedMarket?: MarketApiRow | null;
  initialCatalogError?: string | null;
  initialMarketCandles?: PriceCandle[];
  initialMarketPublicTrades?: PublicTrade[];
  initialMarketLiveActivityTicks?: LiveActivityTick[];
  initialMarketComments?: MarketComment[];
  initialEnabledProviders?: Array<"polymarket" | "limitless">;
};
