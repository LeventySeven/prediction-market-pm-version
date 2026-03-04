'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import ProfileSetupModal, { type ProfileSetupSubmitPayload } from "@/components/ProfileSetupModal";
import BetConfirmModal from "@/components/BetConfirmModal";
import ProfilePage from "@/components/ProfilePage";
import PublicUserProfileModal from "@/components/PublicUserProfileModal";
import Button from "@/components/Button";
import type {
  Market,
  User,
  Bet,
  Position,
  Trade,
  PriceCandle,
  PublicTrade,
  LeaderboardUser,
  Comment as MarketComment,
  LiveActivityTick,
} from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search, Filter, X } from "lucide-react";
import BottomMenu, { type ViewType } from "@/components/BottomMenu";
import FriendsPage from "@/components/FriendsPage";
import { leaderboardUsersSchema } from "@/src/schemas/leaderboard";
import { liveActivityTicksSchema, priceCandlesSchema, publicTradesSchema } from "@/src/schemas/marketInsights";
import { marketCommentsSchema } from "@/src/schemas/comments";
import { marketCategoriesSchema } from "@/src/schemas/marketCategories";
import { myCommentsSchema } from "@/src/schemas/myComments";
import { marketBookmarksSchema } from "@/src/schemas/bookmarks";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { buildSignedBuyOrder, type EphemeralApiCreds, type PrivyWalletLike } from "@/src/lib/polymarket/tradingClient";
import { getBrowserSupabaseClient } from "@/src/utils/supabase/browser";
import type { Database } from "@/src/types/database";
import {
  buildAvatarPaletteFromSeed,
  extractAvatarPaletteFromFile,
  extractAvatarPaletteFromImageSource,
  sanitizeAvatarPalette,
} from "@/src/lib/avatarPalette";

// VCOIN decimals for display
const VCOIN_DECIMALS = 6;
const CATALOG_PAGE_SIZE = 50;
const MARKET_CANDLE_LIMIT = 5000;
const ENABLE_UPSTASH_STREAM = process.env.NEXT_PUBLIC_ENABLE_UPSTASH_STREAM === "true";
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

type MarketApiRow = {
  id: string;
  provider?: "polymarket" | "limitless";
  providerMarketId?: string;
  canonicalMarketId?: string;
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
  capabilities?: {
    supportsTrading: boolean;
    supportsCandles: boolean;
    supportsPublicTrades: boolean;
    chainId: number | null;
  } | null;
};

type MarketLiveRow = Database["public"]["Tables"]["polymarket_market_live"]["Row"];
type CandleRow = Database["public"]["Tables"]["polymarket_candles_1m"]["Row"];
type TickRow = Database["public"]["Tables"]["polymarket_market_ticks"]["Row"];
type MarketLivePatch = {
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  lastTradePrice: number | null;
  lastTradeSize: number | null;
  rolling24hVolume: number | null;
  openInterest: number | null;
  liveUpdatedAt: string | null;
};
type MergedMarketCacheEntry = {
  base: Market;
  patch: MarketLivePatch | undefined;
  merged: Market;
};
type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initDataUnsafe?: { start_param?: string } } };
};

const trimTrailingZeros = (value: string): string => value.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

const formatUsdVolume = (value: number): string => {
  const numeric = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (numeric >= 1_000_000_000) {
    const compact = numeric >= 10_000_000_000 ? numeric / 1_000_000_000 : Number((numeric / 1_000_000_000).toFixed(1));
    return `$${trimTrailingZeros(String(compact))}b`;
  }
  if (numeric >= 1_000_000) {
    const compact = numeric >= 10_000_000 ? numeric / 1_000_000 : Number((numeric / 1_000_000).toFixed(1));
    return `$${trimTrailingZeros(String(compact))}m`;
  }
  if (numeric >= 1_000) {
    return `$${Math.round(numeric / 1_000)}k`;
  }
  return `$${Math.round(numeric).toLocaleString("en-US")}`;
};

const parseUsdVolume = (value: string): number => {
  const normalized = String(value).trim().toLowerCase().replace(/\$/g, "").replace(/,/g, "");
  const compactMatch = normalized.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/);
  if (compactMatch) {
    const base = Number(compactMatch[1]);
    const suffix = compactMatch[2];
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    const out = base * multiplier;
    return Number.isFinite(out) ? out : 0;
  }
  const parsed = Number(normalized.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const detectCandleResolutionMs = (candles: PriceCandle[]): number => {
  if (candles.length < 2) return 60_000;
  const times = candles
    .map((c) => Date.parse(c.bucket))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (times.length < 2) return 60_000;
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const prev = times[i - 1];
    const next = times[i];
    if (prev === undefined || next === undefined) continue;
    const delta = next - prev;
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 60_000;
  const minDelta = Math.min(...deltas);
  if (minDelta >= 24 * 60 * 60 * 1000) return 24 * 60 * 60 * 1000;
  if (minDelta >= 60 * 60 * 1000) return 60 * 60 * 1000;
  return 60_000;
};

const alignBucketToResolution = (bucketMs: number, resolutionMs: number): number => {
  const safeResolution = Math.max(60_000, resolutionMs);
  if (safeResolution <= 60_000) return bucketMs;
  return Math.floor(bucketMs / safeResolution) * safeResolution;
};

const mapMarketApiToMarket = (m: MarketApiRow, lang: "RU" | "EN"): Market => {
  const title = lang === "RU" ? m.titleRu : m.titleEn;
  const chanceSource = typeof m.chance === "number" ? m.chance : Math.round(m.priceYes * 100);
  const chance = Number.isFinite(chanceSource) ? Math.round(chanceSource) : 50;
  const volumeRaw = Number.isFinite(Number(m.volume)) ? Math.max(0, Number(m.volume)) : 0;
  return {
    id: String(m.id),
    provider: m.provider ?? "polymarket",
    providerMarketId: m.providerMarketId ?? String(m.id),
    canonicalMarketId:
      m.canonicalMarketId ?? `${m.provider ?? "polymarket"}:${m.providerMarketId ?? String(m.id)}`,
    title,
    titleRu: m.titleRu,
    titleEn: m.titleEn,
    state: m.state as Market["state"],
    marketType: m.marketType ?? "binary",
    resolvedOutcomeId: m.resolvedOutcomeId ?? null,
    outcomes: Array.isArray(m.outcomes) ? m.outcomes : [],
    outcome: m.outcome,
    createdBy: m.createdBy ?? null,
    creatorName: m.creatorName ?? null,
    creatorAvatarUrl: m.creatorAvatarUrl ?? null,
    createdAt: m.createdAt,
    categoryId: m.categoryId ?? null,
    categoryLabelRu: m.categoryLabelRu ?? null,
    categoryLabelEn: m.categoryLabelEn ?? null,
    imageUrl: (m.imageUrl ?? "").trim() || buildInitialsAvatarDataUrl(title, { bg: "#111111", fg: "#ffffff" }),
    volume: formatUsdVolume(volumeRaw),
    volumeRaw,
    closesAt: m.closesAt,
    expiresAt: m.expiresAt,
    yesPrice: Number(m.priceYes),
    noPrice: Number(m.priceNo),
    chance,
    description: m.description ?? (lang === "RU" ? "Описание будет добавлено." : "Description coming soon."),
    source: normalizeExternalMarketUrl(m.source, m.provider ?? "polymarket") ?? (m.source ?? null),
    history: [],
    comments: [],
    liquidityB: m.liquidityB ?? undefined,
    feeBps: m.feeBps ?? undefined,
    settlementAsset: m.settlementAsset ?? undefined,
    bestBid: m.bestBid ?? null,
    bestAsk: m.bestAsk ?? null,
    mid: m.mid ?? null,
    lastTradePrice: m.lastTradePrice ?? null,
    lastTradeSize: m.lastTradeSize ?? null,
    rolling24hVolume: m.rolling24hVolume ?? null,
    openInterest: m.openInterest ?? null,
    liveUpdatedAt: m.liveUpdatedAt ?? null,
    capabilities: m.capabilities ?? null,
  };
};

const asNumber = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const MATERIAL_CHANGE_EPS = 0.0001;
const hasMaterialNumberChange = (prev: number | null | undefined, next: number | null | undefined) => {
  const a = typeof prev === "number" && Number.isFinite(prev) ? prev : null;
  const b = typeof next === "number" && Number.isFinite(next) ? next : null;
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return Math.abs(a - b) > MATERIAL_CHANGE_EPS;
};

const hasMaterialPatchChange = (prev: MarketLivePatch | undefined, next: MarketLivePatch) => {
  if (!prev) return true;
  return (
    hasMaterialNumberChange(prev.bestBid, next.bestBid) ||
    hasMaterialNumberChange(prev.bestAsk, next.bestAsk) ||
    hasMaterialNumberChange(prev.mid, next.mid) ||
    hasMaterialNumberChange(prev.lastTradePrice, next.lastTradePrice) ||
    hasMaterialNumberChange(prev.lastTradeSize, next.lastTradeSize) ||
    hasMaterialNumberChange(prev.rolling24hVolume, next.rolling24hVolume) ||
    hasMaterialNumberChange(prev.openInterest, next.openInterest) ||
    prev.liveUpdatedAt !== next.liveUpdatedAt
  );
};

const applyLivePatchToMarket = (market: Market, patch?: MarketLivePatch): Market => {
  if (!patch) return market;
  const isBinary = (market.marketType ?? "binary") === "binary";
  const useMid = isBinary && typeof patch.mid === "number" && patch.mid >= 0 && patch.mid <= 1;
  const yesPrice = useMid ? patch.mid : market.yesPrice;
  const noPrice = useMid ? Math.max(0, Math.min(1, 1 - yesPrice)) : market.noPrice;
  const chance = useMid ? Math.round(yesPrice * 100) : market.chance;

  return {
    ...market,
    yesPrice,
    noPrice,
    chance,
    bestBid: patch.bestBid,
    bestAsk: patch.bestAsk,
    mid: patch.mid,
    lastTradePrice: patch.lastTradePrice,
    lastTradeSize: patch.lastTradeSize,
    rolling24hVolume: patch.rolling24hVolume,
    openInterest: patch.openInterest,
    liveUpdatedAt: patch.liveUpdatedAt,
  };
};

type ClientMetricStore = {
  counters: Record<string, number>;
  timings: Record<string, number[]>;
  marks: Record<string, number>;
};

type WindowWithRealtimeMetrics = Window & {
  __realtimePerfMetrics?: ClientMetricStore;
};

const getClientMetricStore = (): ClientMetricStore | null => {
  if (typeof window === "undefined") return null;
  const target = window as WindowWithRealtimeMetrics;
  if (!target.__realtimePerfMetrics) {
    target.__realtimePerfMetrics = {
      counters: {},
      timings: {},
      marks: {},
    };
  }
  return target.__realtimePerfMetrics;
};

const incrementClientCounter = (name: string, by = 1) => {
  const store = getClientMetricStore();
  if (!store) return;
  store.counters[name] = (store.counters[name] ?? 0) + by;
};

const observeClientTiming = (name: string, durationMs: number) => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const store = getClientMetricStore();
  if (!store) return;
  const rows = store.timings[name] ?? [];
  rows.push(durationMs);
  if (rows.length > 240) rows.splice(0, rows.length - 240);
  store.timings[name] = rows;
};

const setClientMark = (name: string) => {
  const store = getClientMetricStore();
  if (!store) return;
  store.marks[name] = Date.now();
};

const consumeClientMark = (name: string): number | null => {
  const store = getClientMetricStore();
  if (!store) return null;
  const value = store.marks[name];
  if (!Number.isFinite(value)) return null;
  delete store.marks[name];
  return value;
};

const createSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sess_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

const MARKET_ID_REGEX = /^[A-Za-z0-9:_-]{6,}$/;
const HAS_PRIVY_PROVIDER = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const POLYMARKET_CLOB_URL = (process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL || "https://clob.polymarket.com").replace(/\/+$/, "");
const POLYMARKET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || "137");
const POLYMARKET_SITE_URL = "https://polymarket.com";
const LIMITLESS_SITE_URL = "https://limitless.exchange";

const usePrivySession = HAS_PRIVY_PROVIDER
  ? () => usePrivy()
  : () => ({
      ready: true,
      authenticated: false,
      login: () => undefined,
      logout: async () => undefined,
    });

const usePrivyWalletList = HAS_PRIVY_PROVIDER
  ? () => useWallets()
  : () => ({
      wallets: [] as PrivyWalletLike[],
    });

const slugifyTitle = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const defaultExternalMarketUrl = (provider?: Market["provider"]): string =>
  provider === "limitless" ? LIMITLESS_SITE_URL : POLYMARKET_SITE_URL;

const normalizeExternalMarketUrl = (
  raw: string | null | undefined,
  provider?: Market["provider"]
): string | null => {
  const value = (raw ?? "").trim();
  const fallbackBase = defaultExternalMarketUrl(provider);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/\//.test(value)) return `https:${value}`;
  if (value.startsWith("/")) return `${fallbackBase}${value}`;
  if (/^event\//i.test(value)) return `${fallbackBase}/${value}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(value)) return `https://${value}`;
  return null;
};

const getExternalMarketUrl = (market: Market | null | undefined): string => {
  const normalized = normalizeExternalMarketUrl(market?.source, market?.provider);
  return normalized ?? defaultExternalMarketUrl(market?.provider);
};

const buildMarketPath = (marketId: string, title?: string | null) => {
  const query = title ? `?title=${encodeURIComponent(slugifyTitle(title))}` : "";
  return `/market/${encodeURIComponent(marketId)}${query}`;
};

const getPathForView = (view: ViewType) => {
  switch (view) {
    case "FRIENDS":
      return "/leaderboard";
    case "FEED":
      return "/mybets";
    case "PROFILE":
      return "/profile";
    case "CATALOG":
    default:
      return "/catalog";
  }
};

const getViewFromLocation = (): ViewType => {
  if (typeof window === "undefined") return "CATALOG";
  const path = window.location.pathname.toLowerCase();
  if (path === "/" || path.startsWith("/catalog")) return "CATALOG";
  if (path.startsWith("/leaderboard") || path.startsWith("/friends")) return "FRIENDS";
  if (path.startsWith("/mybets") || path.startsWith("/feed")) return "FEED";
  if (path.startsWith("/profile")) return "PROFILE";
  if (path.startsWith("/market/")) return "CATALOG";
  return "CATALOG";
};

const getMarketIdFromLocation = () => {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const fromQuery = (url.searchParams.get("marketId") || url.searchParams.get("m") || "").trim();
    if (fromQuery && MARKET_ID_REGEX.test(fromQuery)) return fromQuery;

    const path = url.pathname || "";
    const match = path.match(/^\/market\/([^/?#]+)/i);
    const candidate = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
    if (candidate && MARKET_ID_REGEX.test(candidate)) return candidate;
  } catch {
    // ignore
  }
  return null;
};

export default function HomePage() {
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [semanticSearchScores, setSemanticSearchScores] = useState<Record<string, number>>({});
  const [semanticSearchIds, setSemanticSearchIds] = useState<string[]>([]);
  const [semanticSearchLoading, setSemanticSearchLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileSetupSaving, setProfileSetupSaving] = useState(false);
  const [profileSetupError, setProfileSetupError] = useState<string | null>(null);
  const [reloginRequired, setReloginRequired] = useState(false);
  type CatalogSort =
    | "ENDING_SOON"
    | "CREATED_DESC"
    | "CREATED_ASC"
    | "VOLUME_DESC"
    | "VOLUME_ASC"
    | "CATEGORY_ASC"
    | "CATEGORY_DESC";
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("CREATED_DESC");
  type CatalogStatus = "ALL" | "ONGOING" | "ENDED";
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("ALL");
  type CatalogTimeFilter = "ANY" | "HOUR" | "DAY" | "WEEK";
  const [catalogTimeFilter, setCatalogTimeFilter] = useState<CatalogTimeFilter>("ANY");
  type ProviderFilter = "all" | "polymarket" | "limitless";
  const [activeProviderFilter, setActiveProviderFilter] = useState<ProviderFilter>("all");
  const [catalogPage, setCatalogPage] = useState(1);
  const [hasNextCatalogPage, setHasNextCatalogPage] = useState(false);
  const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
  type LeaderboardSort = "PNL" | "BETS";
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>("PNL");
  const [leaderboardSortOpen, setLeaderboardSortOpen] = useState(false);
  type PostAuthAction =
    | { type: "PLACE_BET"; marketId: string; side?: "YES" | "NO"; outcomeId?: string; amount: number; marketTitle: string }
    | { type: "OPEN_MARKET_BET"; marketId: string; side: "YES" | "NO" }
    | null;
  const [postAuthAction, setPostAuthAction] = useState<PostAuthAction>(null);
  const [lang, setLang] = useState<"RU" | "EN">(() => {
    if (typeof window === "undefined") return "EN";
    try {
      const stored = localStorage.getItem("lang");
      return stored === "RU" || stored === "EN" ? stored : "EN";
    } catch {
      return "EN";
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const { ready: privyReady, authenticated: privyAuthenticated, login: privyLogin, logout: privyLogout } = usePrivySession();
  const { wallets: privyWallets } = usePrivyWalletList();
  const clobApiCredsRef = useRef<EphemeralApiCreds | null>(null);
  const [tradeAccessState, setTradeAccessState] = useState<{
    status: "ALLOWED" | "BLOCKED_REGION" | "UNKNOWN_TEMP_ERROR";
    allowed: boolean;
    reasonCode: string | null;
    message: string | null;
    checkedAt: string;
  } | null>(null);
  const [tradeAccessLoading, setTradeAccessLoading] = useState(false);
  const sessionIdRef = useRef<string>(createSessionId());
  const ensuredMarketIdsRef = useRef<Set<string>>(new Set());
  const mergedMarketCacheRef = useRef<Map<string, MergedMarketCacheEntry>>(new Map());
  const marketOpenStartedAtRef = useRef<number | null>(null);
  const chartFirstPaintRecordedForMarketRef = useRef<string | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const pendingDeepLinkMarketIdRef = useRef<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketLivePatchById, setMarketLivePatchById] = useState<Record<string, MarketLivePatch>>({});
  const [visibleCatalogMarketIds, setVisibleCatalogMarketIds] = useState<string[]>([]);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);

  const getMarketIdFromUrl = () => getMarketIdFromLocation();

  // Deep link: open a market by URL (?marketId=...).
  useEffect(() => {
    const marketIdFromUrl = getMarketIdFromUrl();
    const telegramUnsafe = (window as TelegramWindow).Telegram?.WebApp?.initDataUnsafe;
    const startParamRaw =
      typeof window !== "undefined" ? telegramUnsafe?.start_param : undefined;
    const startParam = String(startParamRaw ?? "").trim();
    const marketIdFromStartParam = (() => {
      if (!startParam) return null;
      const v = startParam.startsWith("m_") ? startParam.slice(2) : startParam;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      return isUuid ? v : null;
    })();
    const marketId = marketIdFromUrl ?? marketIdFromStartParam;
    if (!marketId) return;
    pendingDeepLinkMarketIdRef.current = marketId;
    try {
      localStorage.setItem("pending_market_id", marketId);
    } catch {
      // ignore
    }
    setSelectedMarketId(marketId);
    setCurrentView("CATALOG");
  }, []);
  const [currentView, setCurrentView] = useState<ViewType>(() => getViewFromLocation());
  const navigateToMarketUrl = useCallback((marketId: string, title?: string | null) => {
    if (typeof window === "undefined") return;
    const next = buildMarketPath(marketId, title);
    if (window.location.pathname + window.location.search === next) return;
    window.history.pushState({ marketId }, "", next);
  }, []);
  const navigateToCatalogUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/" && !window.location.search) return;
    window.history.pushState({}, "", "/");
  }, []);
  const navigateToViewUrl = useCallback((view: ViewType) => {
    if (typeof window === "undefined") return;
    const next = getPathForView(view);
    if (window.location.pathname === next && !window.location.search) return;
    window.history.pushState({ view }, "", next);
  }, []);

  // Keep UI synced with browser back/forward when market URL is in history.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => {
      const marketId = getMarketIdFromLocation();
      setSelectedMarketId(marketId);
      setCurrentView(getViewFromLocation());
      if (marketId) setCurrentView("CATALOG");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncVisibility = () => {
      setDocumentVisible(!document.hidden);
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  const shellSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const [myPositions, setMyPositions] = useState<Position[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [myBetsLoading, setMyBetsLoading] = useState(false);
  const [myBetsError, setMyBetsError] = useState<string | null>(null);
  const myBetsLoadingRef = useRef(false);
  const [myCommentsLoading, setMyCommentsLoading] = useState(false);
  const [myCommentsError, setMyCommentsError] = useState<string | null>(null);
  const [profilePnlMajor, setProfilePnlMajor] = useState<number | null>(null);
  type MarketBookmark = { marketId: string; createdAt: string };
  const [myBookmarks, setMyBookmarks] = useState<MarketBookmark[]>([]);
  const [marketsLoadingMessage, setMarketsLoadingMessage] = useState<string | null>(null);
  const [marketsError, setMarketsError] = useState<string | null>(null);
  const [betConfirm, setBetConfirm] = useState<{
    open: boolean;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number;
    newBalance?: number;
    errorMessage?: string | null;
    isLoading?: boolean;
  }>({ open: false, marketTitle: "", side: "YES", amount: 0, newBalance: undefined, errorMessage: null });
  type MarketBetIntent = { marketId: string; side?: "YES" | "NO"; outcomeId?: string; nonce: number } | null;
  const [marketBetIntent, setMarketBetIntent] = useState<MarketBetIntent>(null);
  const [marketCandles, setMarketCandles] = useState<PriceCandle[]>([]);
  const [marketPublicTrades, setMarketPublicTrades] = useState<PublicTrade[]>([]);
  const [marketLiveActivityTicks, setMarketLiveActivityTicks] = useState<LiveActivityTick[]>([]);
  type MarketContextPayload = { context: string; sources: string[]; updatedAt: string };
  const [marketContextById, setMarketContextById] = useState<Record<string, MarketContextPayload>>({});
  const [marketContextLoadingId, setMarketContextLoadingId] = useState<string | null>(null);
  const [marketContextErrorById, setMarketContextErrorById] = useState<Record<string, string | null>>({});
  const [walletBalanceMajor, setWalletBalanceMajor] = useState<number | null>(null);
  type MyMarket = Market & { hasBets: boolean };
  const [myCreatedMarkets, setMyCreatedMarkets] = useState<MyMarket[]>([]);
  const [marketComments, setMarketComments] = useState<MarketComment[]>([]);
  const [marketInsightsLoading, setMarketInsightsLoading] = useState(false);
  const [marketInsightsError, setMarketInsightsError] = useState<string | null>(null);
  const [marketCommentsError, setMarketCommentsError] = useState<string | null>(null);
  const [marketActivityError, setMarketActivityError] = useState<string | null>(null);
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  type PublicProfileUser = {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    telegramPhotoUrl: string | null;
  };
  type PublicProfileBet = {
    marketId: string;
    outcome: "YES" | "NO" | null;
    lastBetAt: string;
    isActive: boolean;
  };
  type PublicProfileComment = {
    id: string;
    marketId: string;
    parentId: string | null;
    body: string;
    createdAt: string;
    likesCount: number;
  };
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [publicProfileError, setPublicProfileError] = useState<string | null>(null);
  const [publicProfileUser, setPublicProfileUser] = useState<PublicProfileUser | null>(null);
  const [publicProfilePnl, setPublicProfilePnl] = useState(0);
  const [publicProfileComments, setPublicProfileComments] = useState<PublicProfileComment[]>([]);
  const [publicProfileBets, setPublicProfileBets] = useState<PublicProfileBet[]>([]);
  const publicProfileRequestIdRef = useRef(0);
  type MarketCategoryStrict = { id: string; labelRu: string; labelEn: string };
  const [marketCategories, setMarketCategories] = useState<MarketCategoryStrict[]>([]);
  const [loadingMarketCategories, setLoadingMarketCategories] = useState(false);
  const [myComments, setMyComments] = useState<Array<{
    id: string;
    marketId: string;
    parentId: string | null;
    body: string;
    createdAt: string;
    marketTitleRu: string;
    marketTitleEn: string;
    likesCount: number;
  }>>([]);

  const requireValue = <T,>(v: T | null | undefined, code: string): T => {
    if (v === null || v === undefined) {
      throw new Error(code);
    }
    return v;
  };

  type ErrorLike =
    | string
    | Error
    | {
        message?: string;
        data?: { message?: string };
      }
    | null
    | undefined;

  const getErrorMessage = (error: ErrorLike): string | undefined => {
    if (!error) return undefined;
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (typeof error.message === "string") return error.message;
    if (error.data && typeof error.data.message === "string") return error.data.message;
    return undefined;
  };

  const isAuthErrorMessage = (msg?: string) => {
    const upper = String(msg ?? "").toUpperCase();
    return (
      upper.includes("UNAUTHORIZED") ||
      upper.includes("NOT AUTHENTICATED") ||
      upper.includes("NOT_AUTHENTICATED") ||
      (upper.includes("JWT") && upper.includes("EXPIRED"))
    );
  };

  const mergedMarkets = useMemo(() => {
    const previousCache = mergedMarketCacheRef.current;
    const nextCache = new Map<string, MergedMarketCacheEntry>();

    const merged = markets.map((market) => {
      const patch = marketLivePatchById[market.id];
      const cached = previousCache.get(market.id);
      if (cached && cached.base === market && cached.patch === patch) {
        nextCache.set(market.id, cached);
        return cached.merged;
      }
      const nextMerged = applyLivePatchToMarket(market, patch);
      nextCache.set(market.id, {
        base: market,
        patch,
        merged: nextMerged,
      });
      return nextMerged;
    });

    mergedMarketCacheRef.current = nextCache;
    return merged;
  }, [markets, marketLivePatchById]);

  const loadLeaderboard = useCallback(async (sortBy: LeaderboardSort = leaderboardSort) => {
    setLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const usersRaw = await trpcClient.user.leaderboard.query({
        limit: 100,
        sortBy: sortBy === "PNL" ? "pnl" : "bets",
      });
      const users: LeaderboardUser[] = leaderboardUsersSchema.parse(usersRaw);
      setLeaderboardUsers(users);
    } catch (err) {
      console.error("Failed to load leaderboard", err);
      const base = lang === "RU" ? "Не удалось загрузить лидерборд" : "Failed to load leaderboard";
      setLeaderboardError(`${base}: ${getErrorMessage(err)}`);
      // Keep the previous list if we have one; avoid flashing "No data yet" on transient errors.
      setLeaderboardUsers((prev) => prev);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [lang, leaderboardSort]);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem("hasSeenOnboarding");
    if (!hasSeenOnboarding) {
      const timeout = setTimeout(() => setShowOnboarding(true), 800);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, []);

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("hasSeenOnboarding", "true");
  };

  const handleToggleLang = () => {
    setLang((prev) => {
      const next = prev === "RU" ? "EN" : "RU";
      try {
        localStorage.setItem("lang", next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  const openAuth = useCallback((_mode?: "SIGN_IN" | "SIGN_UP") => {
    if (privyReady) {
      void privyLogin();
    }
  }, [privyLogin, privyReady]);

  const applyPublicUser = useCallback((me: {
    id: string;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
    createdAt?: string | null;
    avatarUrl?: string | null;
    profileDescription?: string | null;
    avatarPalette?: { primary: string; secondary: string } | null;
    needsProfileSetup?: boolean | null;
    telegramPhotoUrl?: string | null;
    balance: number;
    isAdmin?: boolean | null;
    referralCode?: string | null;
    referralCommissionRate?: number | null;
    referralEnabled?: boolean | null;
    privyUserId?: string | null;
    walletAddress?: string | null;
  }) => {
    setUser({
      id: String(me.id),
      email: me.email ?? undefined,
      username: me.username ?? undefined,
      name: me.displayName ?? me.username ?? undefined,
      createdAt: me.createdAt ?? undefined,
      avatarUrl: me.avatarUrl ?? null,
      profileDescription: me.profileDescription ?? null,
      avatarPalette: sanitizeAvatarPalette(me.avatarPalette),
      needsProfileSetup: Boolean(me.needsProfileSetup),
      telegramPhotoUrl: me.telegramPhotoUrl ?? null,
      avatar: me.avatarUrl ?? me.telegramPhotoUrl ?? undefined,
      balance: me.balance,
      isAdmin: Boolean(me.isAdmin),
      referralCode: me.referralCode ?? null,
      referralCommissionRate: me.referralCommissionRate ?? null,
      referralEnabled: me.referralEnabled ?? null,
      privyUserId: me.privyUserId ?? null,
      walletAddress: me.walletAddress ?? null,
    });
  }, []);

  const clearRelogin = useCallback(() => {
    setReloginRequired(false);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await trpcClient.auth.me.query();
      if (me) {
        clearRelogin();
        applyPublicUser(me);
        return me;
      }
    } catch (err) {
      console.error("Failed to refresh session user", err);
    }
    return null;
  }, [applyPublicUser, clearRelogin]);

  useEffect(() => {
    if (!HAS_PRIVY_PROVIDER) return;
    const handlePrivyBridge = () => {
      void refreshUser();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("privy-session-bridged", handlePrivyBridge as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("privy-session-bridged", handlePrivyBridge as EventListener);
      }
    };
  }, [refreshUser]);

  useEffect(() => {
    if (!HAS_PRIVY_PROVIDER) return;
    if (!privyReady) return;
    if (privyAuthenticated) {
      void refreshUser();
      return;
    }
    setUser(null);
  }, [privyReady, privyAuthenticated, refreshUser]);

  useEffect(() => {
    if (user?.needsProfileSetup) return;
    setProfileSetupSaving(false);
    setProfileSetupError(null);
  }, [user?.needsProfileSetup]);

  const attemptSilentRefresh = useCallback(async () => {
    if (privyReady && privyAuthenticated) {
      const me = await refreshUser();
      if (me) return true;
    }
    setReloginRequired(true);
    setUser(null);
    openAuth("SIGN_IN");
    return false;
  }, [openAuth, privyAuthenticated, privyReady, refreshUser]);

  const triggerRelogin = useCallback(() => {
    void attemptSilentRefresh();
  }, [attemptSilentRefresh]);

  const maybeRequireRelogin = useCallback(
    (err: ErrorLike) => {
      const msg = getErrorMessage(err);
      if (isAuthErrorMessage(msg)) {
        triggerRelogin();
        return true;
      }
      return false;
    },
    [triggerRelogin]
  );

  // If auth expires while the UI still thinks we have a user, prompt re-login as soon as they enter a market.
  useEffect(() => {
    if (!selectedMarketId) return;
    if (!user) return;
    if (reloginRequired) return;
    void (async () => {
      const me = await refreshUser();
      if (!me) {
        await attemptSilentRefresh();
      }
    })();
  }, [selectedMarketId, user, reloginRequired, refreshUser, attemptSilentRefresh]);

  const handleUpdateDisplayName = useCallback(
    async (nextDisplayName: string) => {
      const updated = await trpcClient.user.updateDisplayName.mutate({
        displayName: nextDisplayName,
      });
      setUser((prev) =>
        prev
          ? {
              ...prev,
              name: updated.displayName ?? updated.username,
            }
          : prev
      );
    },
    []
  );

  const handleUpdateAvatarUrl = useCallback(
    async (nextAvatarUrl: string | null, nextAvatarPalette?: { primary: string; secondary: string } | null) => {
      const updated = await trpcClient.user.updateAvatarUrl.mutate({
        avatarUrl: nextAvatarUrl,
        avatarPalette: nextAvatarPalette === undefined ? undefined : nextAvatarPalette,
      });
      const normalizedPalette = sanitizeAvatarPalette(updated.avatarPalette);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              avatarUrl: updated.avatarUrl ?? null,
              avatarPalette: normalizedPalette,
              needsProfileSetup: updated.needsProfileSetup ?? prev.needsProfileSetup,
              telegramPhotoUrl: updated.telegramPhotoUrl ?? null,
              avatar: updated.avatarUrl ?? updated.telegramPhotoUrl ?? undefined,
            }
          : prev
      );
    },
    []
  );

  const handleCompleteProfileSetup = useCallback(
    async (payload: ProfileSetupSubmitPayload) => {
      if (!user) return;
      setProfileSetupError(null);
      setProfileSetupSaving(true);
      const paletteSeed = String(user.id || user.username || payload.displayName || "user");

      try {
        let avatarUrl: string | null | undefined;
        let avatarPalette: { primary: string; secondary: string } | null | undefined;

        if (payload.avatarMode === "upload") {
          if (!payload.avatarFile) {
            throw new Error("MISSING_AVATAR_FILE");
          }

          avatarPalette = await extractAvatarPaletteFromFile(payload.avatarFile, paletteSeed);
          const formData = new FormData();
          formData.append("file", payload.avatarFile);
          const uploadResponse = await fetch("/api/avatar/upload", { method: "POST", body: formData });
          const uploadPayload = (await uploadResponse.json()) as { avatarUrl?: string; error?: string };
          if (!uploadResponse.ok || !uploadPayload.avatarUrl) {
            throw new Error(uploadPayload.error || "UPLOAD_FAILED");
          }
          avatarUrl = uploadPayload.avatarUrl;
        } else if (payload.avatarMode === "import_telegram") {
          if (!user.telegramPhotoUrl) {
            throw new Error("NO_TELEGRAM_AVATAR");
          }
          avatarUrl = user.telegramPhotoUrl;
          avatarPalette = await extractAvatarPaletteFromImageSource(user.telegramPhotoUrl, paletteSeed);
        } else if (payload.avatarMode === "clear") {
          avatarUrl = null;
          avatarPalette = null;
        } else {
          avatarUrl = undefined;
          avatarPalette = undefined;
        }

        const normalizedPalette =
          avatarPalette === undefined
            ? undefined
            : sanitizeAvatarPalette(avatarPalette) ?? buildAvatarPaletteFromSeed(paletteSeed);

        const updated = await trpcClient.user.completeProfileSetup.mutate({
          displayName: payload.displayName.trim(),
          email: payload.email.trim().length > 0 ? payload.email.trim() : undefined,
          profileDescription:
            payload.profileDescription.trim().length > 0 ? payload.profileDescription.trim() : null,
          avatarUrl,
          avatarPalette: normalizedPalette,
        });

        if (!updated || typeof updated.id !== "string") {
          throw new Error("PROFILE_SETUP_INVALID_RESPONSE");
        }
        applyPublicUser({
          id: updated.id,
          email: updated.email,
          username: updated.username,
          displayName: updated.displayName,
          createdAt: updated.createdAt,
          avatarUrl: updated.avatarUrl,
          profileDescription: updated.profileDescription,
          avatarPalette: sanitizeAvatarPalette(updated.avatarPalette),
          needsProfileSetup: updated.needsProfileSetup,
          telegramPhotoUrl: updated.telegramPhotoUrl,
          balance: typeof updated.balance === "number" ? updated.balance : user.balance,
          isAdmin: updated.isAdmin,
          referralCode: updated.referralCode,
          referralCommissionRate: updated.referralCommissionRate,
          referralEnabled: updated.referralEnabled,
        });
        setProfileSetupError(null);
      } catch (err) {
        const msg = String(getErrorMessage(err) ?? "").toUpperCase();
        if (msg.includes("EMAIL_ALREADY_IN_USE") || msg.includes("CONFLICT")) {
          setProfileSetupError(lang === "RU" ? "Этот email уже используется." : "This email is already in use.");
        } else if (msg.includes("INVALID_FILE_TYPE")) {
          setProfileSetupError(lang === "RU" ? "Неверный формат аватара." : "Invalid avatar file type.");
        } else if (msg.includes("FILE_TOO_LARGE")) {
          setProfileSetupError(lang === "RU" ? "Файл аватара слишком большой." : "Avatar file is too large.");
        } else if (msg.includes("NO_TELEGRAM_AVATAR")) {
          setProfileSetupError(lang === "RU" ? "В Telegram нет аватара." : "No Telegram avatar found.");
        } else {
          setProfileSetupError(lang === "RU" ? "Не удалось сохранить профиль." : "Failed to save profile.");
        }
      } finally {
        setProfileSetupSaving(false);
      }
    },
    [applyPublicUser, lang, user]
  );

  const handleCreateReferralLink = useCallback(async () => {
    const { referralCode, referralCommissionRate, referralEnabled } =
      await trpcClient.user.createReferralLink.mutate();

    setUser((prev) =>
      prev
        ? {
            ...prev,
            referralCode,
            referralCommissionRate,
            referralEnabled,
          }
        : prev
    );

    return { referralCode, referralCommissionRate, referralEnabled };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await trpcClient.auth.privyLogout.mutate();
      await privyLogout();
    } catch (err) {
      console.error("logout failed", err);
    } finally {
      setUser(null);
      setMyPositions([]);
      setMyTrades([]);
      setCurrentView("CATALOG");
      setMarketBetIntent(null);
      setSelectedMarketId(null);
      navigateToCatalogUrl();
    }
  }, [navigateToCatalogUrl, privyLogout]);

  const deriveLegacyBets = useCallback(
    (positions: Position[]): Bet[] =>
      positions.map((p, idx) => {
        const market = mergedMarkets.find((m) => m.id === p.marketId);
        const priceYes = market?.yesPrice ?? 0.5;
        const priceNo = market?.noPrice ?? 0.5;
        const selectedOutcomePrice = p.outcomeId
          ? Number(market?.outcomes?.find((o) => o.id === p.outcomeId)?.price ?? Number.NaN)
          : Number.NaN;
        const currentPrice = p.outcome === "YES"
          ? priceYes
          : p.outcome === "NO"
            ? priceNo
            : (Number.isFinite(selectedOutcomePrice) ? selectedOutcomePrice : (p.avgEntryPrice ?? 0));

        let status: Bet["status"] = "open";
        if (p.marketState === "resolved") {
          if (p.outcomeId && p.marketResolvedOutcomeId) {
            status = p.marketResolvedOutcomeId === p.outcomeId ? "won" : "lost";
          } else if (p.outcome && p.marketOutcome) {
            status = p.marketOutcome === p.outcome ? "won" : "lost";
          }
        }

        const avgPrice = p.avgEntryPrice ?? currentPrice;
        const amount = p.shares * avgPrice;
        const payout = status === "won" ? p.shares : status === "lost" ? 0 : null;

        return {
          id: `${p.marketId}-${p.outcome}-${idx}`,
          marketId: p.marketId,
          marketTitle: lang === "RU" ? p.marketTitleRu : p.marketTitleEn,
          marketTitleRu: p.marketTitleRu,
          marketTitleEn: p.marketTitleEn,
          side: p.outcome ?? "YES",
          outcomeId: p.outcomeId ?? null,
          outcomeTitle: p.outcomeTitle ?? null,
          currentPrice,
          amount,
          status,
          payout,
          createdAt: new Date().toISOString(),
          marketOutcome: p.marketOutcome,
          expiresAt: p.expiresAt,
          priceYes,
          priceNo,
          priceAtBet: avgPrice,
          shares: p.shares,
        };
      }),
    [mergedMarkets, lang]
  );

  /**
   * Load user positions and trades
   */
  const loadMyBets = useCallback(async () => {
    if (!user) return;
    // Prevent concurrent loads - if already loading, skip
    if (myBetsLoadingRef.current) return;
    myBetsLoadingRef.current = true;
    setMyBetsLoading(true);
    setMyBetsError(null);
    try {
      const [bookmarksRaw] = await Promise.all([
        trpcClient.market.myBookmarks.query(),
      ]);

      const bookmarksParsed = marketBookmarksSchema.parse(bookmarksRaw);

      // Wrapper mode: portfolio/trades are executed on Polymarket, not stored locally.
      setMyPositions([]);
      setMyTrades([]);
      setMyBookmarks(bookmarksParsed.map((b) => ({ marketId: b.marketId, createdAt: b.createdAt })));
      setMyCreatedMarkets([]);
      setWalletBalanceMajor(null);
      try {
        const stats = await trpcClient.user.publicUserStats.query({ userId: user.id });
        if (stats && typeof stats.pnlMajor === "number") {
          setProfilePnlMajor(Number(stats.pnlMajor));
        }
      } catch (err) {
        console.warn("Failed to refresh profile pnl", err);
      }
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error("Failed to load positions/trades", { error: errorMsg, err, userId: user?.id });
      // If it's an auth error, show re-login warning
      if (errorMsg?.toUpperCase().includes("UNAUTHORIZED") || errorMsg?.toUpperCase().includes("NOT AUTHENTICATED")) {
        const refreshed = await attemptSilentRefresh();
        if (refreshed) {
          myBetsLoadingRef.current = false;
          setMyBetsLoading(false);
          await loadMyBets();
          return;
        }
        setMyBetsError(lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.");
      } else {
        setMyBetsError(lang === "RU" ? "Не удалось загрузить ставки." : "Failed to load bets.");
      }
    }
    finally {
      myBetsLoadingRef.current = false;
      setMyBetsLoading(false);
    }
  }, [user, lang, attemptSilentRefresh]);

  // NOTE: wallet_transactions loading was removed from the UI (wallet now focuses on bets + PnL).

  // Fetch session user via auth.me
  useEffect(() => {
    const loadUser = async () => {
      setLoadingUser(true);
      const me = await refreshUser();
      if (!me && privyReady && privyAuthenticated) {
        await attemptSilentRefresh();
      }
      setLoadingUser(false);
    };

    void loadUser();
  }, [attemptSilentRefresh, privyAuthenticated, privyReady, refreshUser]);

  const loadMarkets = useCallback(async () => {
    const startedAt = Date.now();
    incrementClientCounter("catalog.loadMarkets.calls");
    setLoadingMarkets(true);
    setMarketsError(null);
    setMarketsLoadingMessage(lang === "RU" ? "Загрузка рынков..." : "Loading markets...");
    try {
      const fetchSize = CATALOG_PAGE_SIZE + 1;
      const backendSortBy = catalogSort === "VOLUME_ASC" || catalogSort === "VOLUME_DESC" ? "volume" : "newest";
      const response = await trpcClient.market.listMarkets.query({
        onlyOpen: false,
        page: catalogPage,
        pageSize: fetchSize,
        sortBy: backendSortBy,
        providerFilter: activeProviderFilter,
        providers:
          activeProviderFilter === "all"
            ? ["polymarket", "limitless"]
            : [activeProviderFilter],
      });

      const hasMore = (response?.length ?? 0) > CATALOG_PAGE_SIZE;
      setHasNextCatalogPage(hasMore);
      const mapped: Market[] = (response ?? [])
        .slice(0, CATALOG_PAGE_SIZE)
        .map((m) => mapMarketApiToMarket(m as MarketApiRow, lang));
      setMarkets(mapped);
      setMarketLivePatchById({});
    } catch (err) {
      console.error("Failed to load markets", err);
      setMarketsError(
        lang === "RU" ? "Не удалось загрузить рынки, попробуйте позже." : "Failed to load markets."
      );
      setMarkets([]);
      setHasNextCatalogPage(false);
    } finally {
      setLoadingMarkets(false);
      setMarketsLoadingMessage(null);
      observeClientTiming("catalog.loadMarkets.ms", Date.now() - startedAt);
    }
  }, [activeProviderFilter, catalogPage, catalogSort, lang]);
  const loadMarketsRef = useRef(loadMarkets);
  useEffect(() => {
    loadMarketsRef.current = loadMarkets;
  }, [loadMarkets]);

  const loadMarketCategories = useCallback(async () => {
    setLoadingMarketCategories(true);
    try {
      const rowsRaw = await trpcClient.market.listCategories.query();
      const rowsParsed = marketCategoriesSchema.parse(rowsRaw);
      const rows: MarketCategoryStrict[] = rowsParsed.map((c) => ({
        id: requireValue(c.id, "CATEGORY_ID_MISSING"),
        labelRu: requireValue(c.labelRu, "CATEGORY_LABEL_RU_MISSING"),
        labelEn: requireValue(c.labelEn, "CATEGORY_LABEL_EN_MISSING"),
      }));
      setMarketCategories(rows);
    } catch (err) {
      console.error("Failed to load market categories", err);
      setMarketCategories([]);
    } finally {
      setLoadingMarketCategories(false);
    }
  }, []);

  const loadMyComments = useCallback(async () => {
    if (!user) return;
    setMyCommentsLoading(true);
    setMyCommentsError(null);
    try {
      const raw = await trpcClient.market.myComments.query({ limit: 100 });
      const parsed = myCommentsSchema.parse(raw);
      const rows = parsed.map((c) => ({
        id: requireValue(c.id, "MY_COMMENT_ID_MISSING"),
        marketId: requireValue(c.marketId, "MY_COMMENT_MARKET_ID_MISSING"),
        parentId: c.parentId ?? null,
        body: requireValue(c.body, "MY_COMMENT_BODY_MISSING"),
        createdAt: requireValue(c.createdAt, "MY_COMMENT_CREATED_AT_MISSING"),
        marketTitleRu: requireValue(c.marketTitleRu, "MY_COMMENT_TITLE_RU_MISSING"),
        marketTitleEn: requireValue(c.marketTitleEn, "MY_COMMENT_TITLE_EN_MISSING"),
        likesCount: requireValue(c.likesCount, "MY_COMMENT_LIKES_COUNT_MISSING"),
      }));
      setMyComments(rows);
    } catch (err) {
      console.error("Failed to load my comments", err);
      setMyComments([]);
      const errorMsg = getErrorMessage(err);
      // If it's an auth error, show re-login warning
      if (errorMsg?.toUpperCase().includes("UNAUTHORIZED") || errorMsg?.toUpperCase().includes("NOT AUTHENTICATED")) {
        const refreshed = await attemptSilentRefresh();
        if (refreshed) {
          await loadMyComments();
          return;
        }
        setMyCommentsError(lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.");
      } else {
        setMyCommentsError(lang === "RU" ? "Не удалось загрузить комментарии." : "Failed to load comments.");
      }
    }
    finally {
      setMyCommentsLoading(false);
    }
  }, [user, lang, attemptSilentRefresh]);
  useEffect(() => {
    if (!user) {
      setMyPositions([]);
      setMyTrades([]);
      setMyBookmarks([]);
      setMyCreatedMarkets([]);
      setWalletBalanceMajor(null);
      setProfilePnlMajor(null);
      return;
    }
    void loadMyBets();
  }, [user, loadMyBets]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  useEffect(() => {
    if (marketCategories.length === 0 && !loadingMarketCategories) {
      void loadMarketCategories();
    }
  }, [loadMarketCategories, marketCategories.length, loadingMarketCategories]);

  useEffect(() => {
    if (selectedMarketId || currentView !== "CATALOG") return;
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void loadMarkets();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [loadMarkets, selectedMarketId, currentView]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (currentView !== "CATALOG" || selectedMarketId || !documentVisible) {
      setVisibleCatalogMarketIds([]);
      return;
    }

    const visible = new Set<string>();
    const readFallbackIds = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-market-card-id]"))
        .map((el) => (el.dataset.marketCardId ?? "").trim())
        .filter(Boolean)
        .slice(0, 40);

    let rafId: number | null = null;
    const syncVisibleIds = () => {
      rafId = null;
      const next = (visible.size > 0 ? Array.from(visible) : readFallbackIds()).slice(0, 80);
      setVisibleCatalogMarketIds((prev) => {
        if (prev.length === next.length && prev.every((value, idx) => value === next[idx])) return prev;
        return next;
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const marketId = (target.dataset.marketCardId ?? "").trim();
          if (!marketId) continue;
          if (entry.isIntersecting) visible.add(marketId);
          else visible.delete(marketId);
        }
        if (rafId === null) {
          rafId = window.requestAnimationFrame(syncVisibleIds);
        }
      },
      {
        root: null,
        rootMargin: "240px 0px",
        threshold: 0.01,
      }
    );

    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-market-card-id]"));
    for (const element of elements) observer.observe(element);
    syncVisibleIds();

    return () => {
      observer.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [
    currentView,
    selectedMarketId,
    documentVisible,
    catalogPage,
    searchQuery,
    activeCategoryId,
    activeProviderFilter,
    catalogSort,
    catalogStatus,
    catalogTimeFilter,
  ]);

  useEffect(() => {
    if (currentView !== "CATALOG" || selectedMarketId || !documentVisible) return;
    const targetIds = Array.from(new Set(visibleCatalogMarketIds.filter(Boolean))).slice(0, 80);
    if (targetIds.length === 0) return;

    const startSupabaseVisibleSubscription = () => {
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return () => undefined;

      const pendingRows = new Map<string, MarketLiveRow>();
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let fallbackTriggered = false;

      const flushLiveRows = () => {
        flushTimer = null;
        if (pendingRows.size === 0) return;
        const batch = Array.from(pendingRows.values());
        pendingRows.clear();
        incrementClientCounter("catalog.realtime.flushes");
        incrementClientCounter("catalog.realtime.rowsApplied", batch.length);

        setMarketLivePatchById((prev) => {
          let changed = false;
          const next = { ...prev };

          for (const row of batch) {
            const marketId = row.market_id.trim();
            if (!marketId) continue;
            const patch: MarketLivePatch = {
              bestBid: asNumber(row.best_bid),
              bestAsk: asNumber(row.best_ask),
              mid: asNumber(row.mid),
              lastTradePrice: asNumber(row.last_trade_price),
              lastTradeSize: asNumber(row.last_trade_size),
              rolling24hVolume: asNumber(row.rolling_24h_volume),
              openInterest: asNumber(row.open_interest),
              liveUpdatedAt: typeof row.source_ts === "string" ? row.source_ts : null,
            };
            if (!hasMaterialPatchChange(prev[marketId], patch)) continue;
            next[marketId] = patch;
            changed = true;
          }

          return changed ? next : prev;
        });
      };

      const queueLiveRow = (row: MarketLiveRow) => {
        const marketId = row.market_id.trim();
        if (!marketId) return;
        pendingRows.set(marketId, row);
        incrementClientCounter("catalog.realtime.rowsReceived");
        if (!flushTimer) {
          flushTimer = setTimeout(flushLiveRows, 250);
        }
      };

      const channel = supabase.channel(`markets-live-visible-${targetIds.length}`);
      for (const marketId of targetIds) {
        channel.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "polymarket_market_live", filter: `market_id=eq.${marketId}` },
          (payload) => {
            if (payload.new && typeof payload.new === "object") {
              queueLiveRow(payload.new as MarketLiveRow);
            }
          }
        );
        channel.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "polymarket_market_live", filter: `market_id=eq.${marketId}` },
          (payload) => {
            if (payload.new && typeof payload.new === "object") {
              queueLiveRow(payload.new as MarketLiveRow);
            }
          }
        );
      }

      channel.subscribe((status) => {
        if (
          !fallbackTriggered &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
        ) {
          fallbackTriggered = true;
          incrementClientCounter("catalog.realtime.channelRecovery");
          void loadMarketsRef.current();
        }
      });

      return () => {
        if (flushTimer) clearTimeout(flushTimer);
        pendingRows.clear();
        void supabase.removeChannel(channel);
      };
    };

    if (ENABLE_UPSTASH_STREAM) {
      const pendingPatches = new Map<string, MarketLivePatch>();
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let fallbackTriggered = false;
      let stopSupabaseFallback: (() => void) | null = null;

      const flushLivePatches = () => {
        flushTimer = null;
        if (pendingPatches.size === 0) return;
        const batch = Array.from(pendingPatches.entries());
        pendingPatches.clear();
        incrementClientCounter("catalog.realtime.flushes");
        incrementClientCounter("catalog.realtime.rowsApplied", batch.length);

        setMarketLivePatchById((prev) => {
          let changed = false;
          const next = { ...prev };

          for (const [marketId, patch] of batch) {
            if (!hasMaterialPatchChange(prev[marketId], patch)) continue;
            next[marketId] = patch;
            changed = true;
          }

          return changed ? next : prev;
        });
      };

      const queuePatch = (marketId: string, patch: MarketLivePatch) => {
        const cleanMarketId = marketId.trim();
        if (!cleanMarketId) return;
        pendingPatches.set(cleanMarketId, patch);
        incrementClientCounter("catalog.realtime.rowsReceived");
        if (!flushTimer) {
          flushTimer = setTimeout(flushLivePatches, 120);
        }
      };

      const streamUrl = `/api/stream/markets?ids=${encodeURIComponent(targetIds.join(","))}`;
      const stream = new EventSource(streamUrl);

      const activateSupabaseFallback = () => {
        if (stopSupabaseFallback) return;
        stopSupabaseFallback = startSupabaseVisibleSubscription();
      };

      stream.addEventListener("live", (evt) => {
        const payloadRaw = "data" in evt ? String((evt as MessageEvent).data ?? "") : "";
        if (!payloadRaw) return;
        try {
          const payload = JSON.parse(payloadRaw) as {
            patches?: Array<{
              marketId?: string;
              bestBid?: number | null;
              bestAsk?: number | null;
              mid?: number | null;
              lastTradePrice?: number | null;
              lastTradeSize?: number | null;
              rolling24hVolume?: number | null;
              openInterest?: number | null;
              sourceTs?: string | null;
            }>;
          };
          const patches = Array.isArray(payload.patches) ? payload.patches : [];
          for (const patchRow of patches) {
            const marketId = String(patchRow.marketId ?? "").trim();
            if (!marketId) continue;
            queuePatch(marketId, {
              bestBid: asNumber(patchRow.bestBid),
              bestAsk: asNumber(patchRow.bestAsk),
              mid: asNumber(patchRow.mid),
              lastTradePrice: asNumber(patchRow.lastTradePrice),
              lastTradeSize: asNumber(patchRow.lastTradeSize),
              rolling24hVolume: asNumber(patchRow.rolling24hVolume),
              openInterest: asNumber(patchRow.openInterest),
              liveUpdatedAt: typeof patchRow.sourceTs === "string" ? patchRow.sourceTs : null,
            });
          }
        } catch {
          // Ignore malformed stream payloads and keep listening.
        }
      });

      stream.onerror = () => {
        if (!fallbackTriggered) {
          fallbackTriggered = true;
          incrementClientCounter("catalog.realtime.channelRecovery");
          activateSupabaseFallback();
          void loadMarketsRef.current();
        }
      };

      return () => {
        if (flushTimer) clearTimeout(flushTimer);
        pendingPatches.clear();
        stream.close();
        if (stopSupabaseFallback) {
          stopSupabaseFallback();
          stopSupabaseFallback = null;
        }
      };
    }

    return startSupabaseVisibleSubscription();
  }, [currentView, selectedMarketId, documentVisible, visibleCatalogMarketIds]);

  const legacyBets = useMemo(
    () => deriveLegacyBets(myPositions),
    [deriveLegacyBets, myPositions]
  );

  const soldTrades = useMemo(() => {
    if (myTrades.length === 0) return [];

    type Lot = { shares: number; price: number };
    const lotsByKey = new Map<string, Lot[]>();

    const sorted = [...myTrades].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const sells: typeof myTrades = [];
    const PRICE_EPS = 1e-9;

    sorted.forEach((trade) => {
      const key = `${trade.marketId}:${trade.outcomeId ?? trade.outcome ?? "UNKNOWN"}`;
      if (!lotsByKey.has(key)) {
        lotsByKey.set(key, []);
      }
      const lots = lotsByKey.get(key)!;
      const shares = Math.abs(trade.sharesDelta);

      if (shares < PRICE_EPS) {
        if (trade.action === "sell") {
          sells.push({ ...trade, avgEntryPrice: null, avgExitPrice: null, realizedPnl: null });
        }
        return;
      }

      const gross = Math.abs(trade.collateralGross);
      const unitPrice = shares > 0 ? gross / shares : null;

      if (trade.action === "buy") {
        if (unitPrice !== null && Number.isFinite(unitPrice)) {
          lots.push({ shares, price: unitPrice });
        }
        return;
      }

      let remaining = shares;
      let matchedShares = 0;
      let matchedCost = 0;

      while (remaining > PRICE_EPS && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(lot.shares, remaining);
        matchedCost += take * lot.price;
        matchedShares += take;
        lot.shares -= take;
        remaining -= take;
        if (lot.shares <= PRICE_EPS) {
          lots.shift();
        }
      }

      const avgEntryPrice = matchedShares > 0 ? matchedCost / matchedShares : null;
      const avgExitPrice = unitPrice;
      const realizedPnl =
        avgEntryPrice !== null && avgExitPrice !== null
          ? (avgExitPrice - avgEntryPrice) * matchedShares
          : null;

      sells.push({
        ...trade,
        avgEntryPrice,
        avgExitPrice,
        realizedPnl,
      });
    });

    return sells
      .filter((trade) => trade.action === "sell")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myTrades]);

  // We load profile bets on navigation and after mutations; no periodic polling needed.

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSemanticSearchScores({});
      setSemanticSearchIds([]);
      setSemanticSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setSemanticSearchLoading(true);
        let rows: Array<{ market?: { id?: string }; score?: number }> = [];
        try {
          const semantic = await trpcClient.market.searchSemantic.query({
            query: q,
            limit: 50,
            onlyOpen: false,
            providerFilter: activeProviderFilter,
            providers:
              activeProviderFilter === "all"
                ? ["polymarket", "limitless"]
                : [activeProviderFilter],
          });
          rows = (semantic.items ?? []).map((item) => ({
            market: { id: item.market.id },
            score: item.score,
          }));
        } catch (semanticErr) {
          console.warn("market.searchSemantic failed, falling back to /api/recs", semanticErr);
          const res = await fetch("/api/recs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: q, limit: 50 }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`RECS_HTTP_${res.status}`);
          rows = (await res.json()) as Array<{ market?: { id?: string }; score?: number }>;
        }
        const next: Record<string, number> = {};
        const ids: string[] = [];
        for (const row of rows ?? []) {
          const id = String(row.market?.id ?? "");
          const score = Number(row.score ?? 0);
          if (id) {
            next[id] = Number.isFinite(score) ? score : 0;
            ids.push(id);
          }
        }
        setSemanticSearchScores(next);
        setSemanticSearchIds(ids);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn("semantic search failed", err);
          setSemanticSearchScores({});
          setSemanticSearchIds([]);
        }
      } finally {
        if (!controller.signal.aborted) setSemanticSearchLoading(false);
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeProviderFilter, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length < 2 || semanticSearchIds.length === 0) return;
    const existing = new Set(mergedMarkets.map((m) => m.id));
    const missing = semanticSearchIds.filter((id) => !existing.has(id)).slice(0, 12);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const rows = await Promise.all(
        missing.map((marketId) =>
          trpcClient.market.getMarket.query({ marketId }).catch(() => null)
        )
      );
      if (cancelled) return;
      const additions = rows
        .filter((v): v is MarketApiRow => Boolean(v))
        .map((m) => mapMarketApiToMarket(m, lang));
      if (additions.length === 0) return;
      setMarkets((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const row of additions) byId.set(row.id, row);
        return Array.from(byId.values());
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [semanticSearchIds, searchQuery, mergedMarkets, lang]);

  useEffect(() => {
    if (!selectedMarketId) return;
    if (mergedMarkets.some((market) => market.id === selectedMarketId)) {
      ensuredMarketIdsRef.current.add(selectedMarketId);
      return;
    }
    if (ensuredMarketIdsRef.current.has(selectedMarketId)) return;
    ensuredMarketIdsRef.current.add(selectedMarketId);

    let cancelled = false;
    void (async () => {
      const row = await trpcClient.market.getMarket.query({ marketId: selectedMarketId }).catch(() => null);
      if (!row || cancelled) return;
      const mapped = mapMarketApiToMarket(row as MarketApiRow, lang);
      setMarkets((prev) => {
        if (prev.some((market) => market.id === mapped.id)) return prev;
        return [mapped, ...prev];
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [lang, mergedMarkets, selectedMarketId]);

  const filteredMarkets = useMemo(
    () =>
      mergedMarkets.filter((market) => {
        const matchesProvider =
          activeProviderFilter === "all" || (market.provider ?? "polymarket") === activeProviderFilter;
        const matchesCategory =
          activeCategoryId === "all" || (market.categoryId ?? "") === activeCategoryId;
        const targetTitle = lang === "RU" ? market.titleRu : market.titleEn;
        const semanticMatch = Boolean(semanticSearchScores[market.id]);
        const matchesSearch = semanticMatch || targetTitle
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        return matchesProvider && matchesCategory && matchesSearch;
      }),
    [activeCategoryId, activeProviderFilter, searchQuery, mergedMarkets, lang, semanticSearchScores]
  );

  const catalogMarkets = useMemo(() => {
    const parseVol = (m: Market) =>
      typeof m.volumeRaw === "number" && Number.isFinite(m.volumeRaw)
        ? m.volumeRaw
        : parseUsdVolume(m.volume);
    const categoryLabel = (m: Market) => {
      const raw =
        lang === "RU"
          ? (m.categoryLabelRu ?? m.categoryLabelEn ?? "")
          : (m.categoryLabelEn ?? m.categoryLabelRu ?? "");
      const label = raw.trim();
      return label.length > 0 ? label : "\uFFFF";
    };
    const ts = (iso?: string | null) => {
      if (!iso) return Number.POSITIVE_INFINITY;
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };

    const now = Date.now();
    const endTs = (m: Market) => ts(m.closesAt ?? m.expiresAt);
    const isEnded = (m: Market) => {
      if (m.state === "resolved" || Boolean(m.outcome)) return true;
      const t = endTs(m);
      return Number.isFinite(t) && t <= now;
    };

    // Apply status filter first.
    const base =
      catalogStatus === "ONGOING"
        ? filteredMarkets.filter((m) => !isEnded(m))
        : catalogStatus === "ENDED"
        ? filteredMarkets.filter((m) => isEnded(m))
        : filteredMarkets;

    // Apply time-to-end filter (only makes sense for ongoing markets).
    // Keep the rest of the logic the same (sorting + ended-at-bottom).
    const applyTimeFilter = (arr: Market[]) => {
      if (catalogTimeFilter === "ANY") return arr;
      const cutoff =
        catalogTimeFilter === "HOUR"
          ? now + 60 * 60 * 1000
          : catalogTimeFilter === "DAY"
            ? now + 24 * 60 * 60 * 1000
            : now + 7 * 24 * 60 * 60 * 1000;
      return arr.filter((m) => {
        if (isEnded(m)) return false;
        const t = endTs(m);
        return Number.isFinite(t) && t > now && t <= cutoff;
      });
    };

    const baseWithTime =
      catalogStatus === "ENDED" ? base : applyTimeFilter(base);

    // If showing ALL, keep ongoing first and ended at bottom.
    const ongoing = baseWithTime.filter((m) => !isEnded(m));
    const ended = baseWithTime.filter((m) => isEnded(m));

    const sortGroup = (arr: Market[]) => {
      const sorted = [...arr];
      if (searchQuery.trim().length >= 2 && Object.keys(semanticSearchScores).length > 0) {
        sorted.sort((a, b) => {
          const aScore = semanticSearchScores[a.id] ?? 0;
          const bScore = semanticSearchScores[b.id] ?? 0;
          if (Math.abs(aScore - bScore) > 0.0001) return bScore - aScore;
          return ts(b.createdAt) - ts(a.createdAt);
        });
        return sorted;
      }
      switch (catalogSort) {
        case "ENDING_SOON":
          sorted.sort((a, b) => endTs(a) - endTs(b));
          break;
        case "CREATED_ASC":
          sorted.sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
          break;
        case "CREATED_DESC":
          sorted.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
          break;
        case "VOLUME_ASC":
          sorted.sort((a, b) => parseVol(a) - parseVol(b));
          break;
        case "VOLUME_DESC":
          sorted.sort((a, b) => parseVol(b) - parseVol(a));
          break;
        case "CATEGORY_ASC":
          sorted.sort((a, b) => {
            const cmp = categoryLabel(a).localeCompare(
              categoryLabel(b),
              lang === "RU" ? "ru" : "en",
              { sensitivity: "base" }
            );
            if (cmp !== 0) return cmp;
            return ts(b.createdAt) - ts(a.createdAt);
          });
          break;
        case "CATEGORY_DESC":
          sorted.sort((a, b) => {
            const cmp = categoryLabel(b).localeCompare(
              categoryLabel(a),
              lang === "RU" ? "ru" : "en",
              { sensitivity: "base" }
            );
            if (cmp !== 0) return cmp;
            return ts(b.createdAt) - ts(a.createdAt);
          });
          break;
        default:
          break;
      }
      return sorted;
    };

    // For ENDING_SOON, ended should always be at bottom (even when status=ALL).
    // For other sorts, also keep ended at bottom when status=ALL for UX consistency.
    if (catalogStatus === "ENDED") {
      // Ended-only view: sort within ended group (descending end time for "ending soon" feels more natural)
      const sortedEnded = [...ended].sort((a, b) => endTs(b) - endTs(a));
      return catalogSort === "ENDING_SOON" ? sortedEnded : sortGroup(sortedEnded);
    }

    const sortedOngoing = sortGroup(ongoing);
    const sortedEnded =
      catalogSort === "ENDING_SOON"
        ? [...ended].sort((a, b) => endTs(b) - endTs(a))
        : sortGroup(ended);
    return catalogStatus === "ALL" ? [...sortedOngoing, ...sortedEnded] : sortedOngoing;
  }, [filteredMarkets, catalogSort, catalogStatus, catalogTimeFilter, searchQuery, semanticSearchScores, lang]);

  // Feed: markets where the user currently has bets (positions).
  const myBetMarketIds = useMemo(() => {
    // NOTE: positions are per-outcome; dedupe by marketId.
    return new Set(
      myPositions
        .filter((p) => Number(p.shares ?? 0) > 0)
        .map((p) => String(p.marketId))
    );
  }, [myPositions]);

  const feedMarkets = useMemo(() => {
    if (!user) return [];
    const q = searchQuery.trim().toLowerCase();
    const base = mergedMarkets.filter((m) => myBetMarketIds.has(m.id));
    const filtered = !q
      ? base
      : base.filter((market) => {
          const targetTitle = (lang === "RU" ? market.titleRu : market.titleEn) ?? market.title;
          return targetTitle.toLowerCase().includes(q);
        });

    // Open markets first, then soonest closing/ending.
    const sortTs = (iso?: string | null) => {
      if (!iso) return Number.POSITIVE_INFINITY;
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };

    return [...filtered].sort((a, b) => {
      const aClosed = a.state === "resolved";
      const bClosed = b.state === "resolved";
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      const at = sortTs(a.closesAt ?? a.expiresAt);
      const bt = sortTs(b.closesAt ?? b.expiresAt);
      return at - bt;
    });
  }, [user, mergedMarkets, myBetMarketIds, searchQuery, lang]);

  const bookmarkedMarketIds = useMemo(() => new Set(myBookmarks.map((b) => b.marketId)), [myBookmarks]);
  const bookmarkedMarkets = useMemo(() => {
    return mergedMarkets.filter((m) => bookmarkedMarketIds.has(m.id));
  }, [mergedMarkets, bookmarkedMarketIds]);

  useEffect(() => {
    const knownIds = new Set(mergedMarkets.map((market) => market.id));
    const missing = Array.from(new Set([...Array.from(myBetMarketIds), ...Array.from(bookmarkedMarketIds)]))
      .filter((marketId) => !knownIds.has(marketId))
      .filter((marketId) => !ensuredMarketIdsRef.current.has(marketId))
      .slice(0, 40);
    if (missing.length === 0) return;
    for (const marketId of missing) ensuredMarketIdsRef.current.add(marketId);

    let cancelled = false;
    void (async () => {
      const rows = await Promise.all(
        missing.map((marketId) => trpcClient.market.getMarket.query({ marketId }).catch(() => null))
      );
      if (cancelled) return;
      const additions = rows
        .filter((value): value is MarketApiRow => Boolean(value))
        .map((row) => mapMarketApiToMarket(row, lang));
      if (additions.length === 0) return;
      setMarkets((prev) => {
        const byId = new Map(prev.map((market) => [market.id, market] as const));
        for (const market of additions) {
          byId.set(market.id, market);
        }
        return Array.from(byId.values());
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [bookmarkedMarketIds, lang, mergedMarkets, myBetMarketIds]);

  const selectedMarket = useMemo(
    () => mergedMarkets.find((market) => market.id === selectedMarketId),
    [selectedMarketId, mergedMarkets]
  );
  const selectedProvider = useMemo<"polymarket" | "limitless" | undefined>(() => {
    if (selectedMarket?.provider) return selectedMarket.provider;
    if (selectedMarketId?.startsWith("limitless:")) return "limitless";
    if (selectedMarketId?.startsWith("polymarket:")) return "polymarket";
    return undefined;
  }, [selectedMarket?.provider, selectedMarketId]);

  const tradeBlockedMessage = useMemo(() => {
    if (!HAS_PRIVY_PROVIDER || !selectedMarketId) return null;
    if (tradeAccessLoading && !tradeAccessState) {
      return lang === "RU" ? "Проверяем региональный доступ..." : "Checking regional access...";
    }
    if (!tradeAccessState) return null;
    if (tradeAccessState.allowed) return null;
    if (tradeAccessState.status === "BLOCKED_REGION") {
      return tradeAccessState.message ??
        (lang === "RU"
          ? "Торговля недоступна в вашей юрисдикции."
          : "Trading is unavailable in your jurisdiction.");
    }
    return tradeAccessState.message ??
      (lang === "RU"
        ? "Временно не удалось проверить доступ к торговле."
        : "Temporarily unable to verify trading access.");
  }, [lang, selectedMarketId, tradeAccessLoading, tradeAccessState]);

  useEffect(() => {
    if (!selectedMarketId) return;

    const streamMarketId = (selectedMarket?.id ?? selectedMarketId).trim();
    if (!streamMarketId) return;

    const pendingPatches = new Map<string, MarketLivePatch>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPatches = () => {
      flushTimer = null;
      if (pendingPatches.size === 0) return;
      const batch = Array.from(pendingPatches.entries());
      pendingPatches.clear();
      incrementClientCounter("market.realtime.selected.rowsApplied", batch.length);

      setMarketLivePatchById((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const [marketId, patch] of batch) {
          if (!hasMaterialPatchChange(prev[marketId], patch)) continue;
          next[marketId] = patch;
          changed = true;
        }

        return changed ? next : prev;
      });
    };

    const queuePatch = (marketId: string, patch: MarketLivePatch) => {
      const cleanMarketId = marketId.trim();
      if (!cleanMarketId) return;
      pendingPatches.set(cleanMarketId, patch);
      incrementClientCounter("market.realtime.selected.rowsReceived");
      if (!flushTimer) {
        flushTimer = setTimeout(flushPatches, 120);
      }
    };

    const startPolymarketSupabaseFallback = () => {
      if (selectedProvider !== "polymarket") return () => undefined;
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return () => undefined;

      const polymarketMarketId = streamMarketId.startsWith("polymarket:")
        ? streamMarketId.slice("polymarket:".length)
        : streamMarketId;

      const channel = supabase.channel(`market-live-selected-${polymarketMarketId}`);
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "polymarket_market_live",
          filter: `market_id=eq.${polymarketMarketId}`,
        },
        (payload) => {
          if (!payload.new || typeof payload.new !== "object") return;
          const row = payload.new as MarketLiveRow;
          queuePatch(streamMarketId, {
            bestBid: asNumber(row.best_bid),
            bestAsk: asNumber(row.best_ask),
            mid: asNumber(row.mid),
            lastTradePrice: asNumber(row.last_trade_price),
            lastTradeSize: asNumber(row.last_trade_size),
            rolling24hVolume: asNumber(row.rolling_24h_volume),
            openInterest: asNumber(row.open_interest),
            liveUpdatedAt: typeof row.source_ts === "string" ? row.source_ts : null,
          });
        }
      );
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "polymarket_market_live",
          filter: `market_id=eq.${polymarketMarketId}`,
        },
        (payload) => {
          if (!payload.new || typeof payload.new !== "object") return;
          const row = payload.new as MarketLiveRow;
          queuePatch(streamMarketId, {
            bestBid: asNumber(row.best_bid),
            bestAsk: asNumber(row.best_ask),
            mid: asNumber(row.mid),
            lastTradePrice: asNumber(row.last_trade_price),
            lastTradeSize: asNumber(row.last_trade_size),
            rolling24hVolume: asNumber(row.rolling_24h_volume),
            openInterest: asNumber(row.open_interest),
            liveUpdatedAt: typeof row.source_ts === "string" ? row.source_ts : null,
          });
        }
      );
      channel.subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    };

    if (ENABLE_UPSTASH_STREAM) {
      let fallbackActive = false;
      let stopSupabaseFallback: (() => void) | null = null;
      const stream = new EventSource(`/api/stream/markets?ids=${encodeURIComponent(streamMarketId)}`);

      stream.addEventListener("live", (evt) => {
        const payloadRaw = "data" in evt ? String((evt as MessageEvent).data ?? "") : "";
        if (!payloadRaw) return;
        try {
          const payload = JSON.parse(payloadRaw) as {
            patches?: Array<{
              marketId?: string;
              bestBid?: number | null;
              bestAsk?: number | null;
              mid?: number | null;
              lastTradePrice?: number | null;
              lastTradeSize?: number | null;
              rolling24hVolume?: number | null;
              openInterest?: number | null;
              sourceTs?: string | null;
            }>;
          };
          const patches = Array.isArray(payload.patches) ? payload.patches : [];
          for (const patchRow of patches) {
            const marketId = String(patchRow.marketId ?? "").trim();
            if (!marketId) continue;
            queuePatch(marketId, {
              bestBid: asNumber(patchRow.bestBid),
              bestAsk: asNumber(patchRow.bestAsk),
              mid: asNumber(patchRow.mid),
              lastTradePrice: asNumber(patchRow.lastTradePrice),
              lastTradeSize: asNumber(patchRow.lastTradeSize),
              rolling24hVolume: asNumber(patchRow.rolling24hVolume),
              openInterest: asNumber(patchRow.openInterest),
              liveUpdatedAt: typeof patchRow.sourceTs === "string" ? patchRow.sourceTs : null,
            });
          }
        } catch {
          // Ignore malformed stream payloads and keep listening.
        }
      });

      stream.onerror = () => {
        if (fallbackActive) return;
        fallbackActive = true;
        incrementClientCounter("market.realtime.selected.channelRecovery");
        stopSupabaseFallback = startPolymarketSupabaseFallback();
      };

      return () => {
        if (flushTimer) clearTimeout(flushTimer);
        pendingPatches.clear();
        stream.close();
        if (stopSupabaseFallback) stopSupabaseFallback();
      };
    }

    const stopSupabaseFallback = startPolymarketSupabaseFallback();
    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      pendingPatches.clear();
      stopSupabaseFallback();
    };
  }, [selectedMarketId, selectedMarket?.id, selectedProvider]);

  const goToView = useCallback(
    (view: ViewType) => {
      // UX: when switching tabs (bottom nav or swipe), always start at the top.
      if (typeof window !== "undefined") {
        const scrollToTop = () => {
          // Body is non-scrollable in Telegram; our scroll container is `.tg-scroll`.
          const scroller = document.querySelector(".tg-scroll");
          if (scroller instanceof HTMLElement) {
            scroller.scrollTo({ top: 0, left: 0, behavior: "auto" });
          } else {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          }
        };
        // Do it immediately and again after the view swap has been applied.
        scrollToTop();
        setTimeout(scrollToTop, 0);
      }
      setMarketBetIntent(null);
      setCatalogFiltersOpen(false);
      setCurrentView(view);
      navigateToViewUrl(view);
      if (view === "FRIENDS") {
        void loadLeaderboard();
      } else if (view === "FEED" || view === "CATALOG") {
        // Refresh markets when returning to feed or catalog to show updated percentages
        void loadMarkets();
      }
    },
    [loadLeaderboard, loadMarkets, navigateToViewUrl]
  );

  const handleShellTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const rawTarget = e.target;
    if (rawTarget instanceof HTMLElement && rawTarget.closest('[data-swipe-ignore="true"]')) {
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    shellSwipeStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleShellTouchEnd = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const start = shellSwipeStartRef.current;
    shellSwipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Only treat as page swipe if mostly horizontal and large enough.
    if (absX < 60 || absX < absY * 1.2) return;

    const order: ViewType[] = ["FRIENDS", "CATALOG", "FEED", "PROFILE"];
    const idx = Math.max(0, order.indexOf(currentView));
    const nextIdx = dx < 0 ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
    const next = order[nextIdx] ?? currentView;
    if (next !== currentView) {
      goToView(next);
    }
  }, [currentView, goToView]);

  useEffect(() => {
    if (!selectedMarketId) {
      setMarketCandles([]);
      setMarketPublicTrades([]);
      setMarketLiveActivityTicks([]);
      setMarketComments([]);
      setMarketInsightsLoading(false);
      setMarketInsightsError(null);
      setMarketCommentsError(null);
      setMarketActivityError(null);
      return;
    }

    let cancelled = false;
    const activeMarketId = selectedMarketId;
    void trpcClient.events.track
      .mutate({
        sessionId: sessionIdRef.current,
        marketId: activeMarketId,
        eventType: "view",
      })
      .catch(() => {
        // best effort analytics event
      });

    const pendingCandleRows = new Map<string, CandleRow>();
    const pendingTickRows = new Map<string, TickRow>();
    let candleFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let tickFlushTimer: ReturnType<typeof setTimeout> | null = null;
    let candleFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPendingCandleRows = () => {
      candleFlushTimer = null;
      if (cancelled || pendingCandleRows.size === 0) return;
      const rows = Array.from(pendingCandleRows.values());
      pendingCandleRows.clear();

      setMarketCandles((prev) => {
        const byBucket = new Map(prev.map((item) => [item.bucket, item]));
        const resolutionMs = detectCandleResolutionMs(prev);
        for (const row of rows) {
          if (row.market_id !== activeMarketId) continue;
          const bucketMs = Date.parse(row.bucket_start);
          if (!Number.isFinite(bucketMs)) continue;
          const alignedBucketMs = alignBucketToResolution(bucketMs, resolutionMs);
          const bucket = new Date(alignedBucketMs).toISOString();
          const nextOpen = asNumber(row.open) ?? 0;
          const nextHigh = asNumber(row.high) ?? 0;
          const nextLow = asNumber(row.low) ?? 0;
          const nextClose = asNumber(row.close) ?? 0;
          const nextVolume = asNumber(row.volume) ?? 0;
          const nextTrades = Math.max(0, Math.floor(asNumber(row.trades_count) ?? 0));
          const existing = byBucket.get(bucket);

          if (!existing) {
            byBucket.set(bucket, {
              bucket,
              outcomeId: null,
              outcomeTitle: null,
              outcomeColor: null,
              open: nextOpen,
              high: nextHigh,
              low: nextLow,
              close: nextClose,
              volume: nextVolume,
              tradesCount: nextTrades,
            });
            continue;
          }

          byBucket.set(bucket, {
            ...existing,
            high: Math.max(existing.high, nextHigh),
            low: Math.min(existing.low, nextLow),
            close: nextClose,
            volume: Math.max(0, existing.volume + nextVolume),
            tradesCount: Math.max(0, existing.tradesCount + nextTrades),
          });
        }
        return Array.from(byBucket.values()).sort(
          (a, b) => Date.parse(a.bucket) - Date.parse(b.bucket)
        );
      });
    };

    const queueCandleRow = (row: CandleRow) => {
      if (row.market_id !== activeMarketId) return;
      const key = `${row.market_id}:${row.bucket_start}`;
      pendingCandleRows.set(key, row);
      incrementClientCounter("market.candles.rowsReceived");
      if (!candleFlushTimer) {
        candleFlushTimer = setTimeout(flushPendingCandleRows, 250);
      }
    };

    const flushPendingTickRows = () => {
      tickFlushTimer = null;
      if (cancelled || pendingTickRows.size === 0) return;
      const rows = Array.from(pendingTickRows.values());
      pendingTickRows.clear();
      incrementClientCounter("market.activity.rowsApplied", rows.length);
      setMarketLiveActivityTicks((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item] as const));
        for (const row of rows) {
          if (row.market_id !== activeMarketId) continue;
          const id = String(row.id);
          const sideRaw = typeof row.side === "string" ? row.side.toUpperCase() : "UNKNOWN";
          const side: LiveActivityTick["side"] =
            sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : "UNKNOWN";
          const price = Number(row.price ?? 0);
          const size = Number(row.size ?? 0);
          const notional = Number(row.notional ?? price * size);
          if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(notional)) continue;
          byId.set(id, {
            id,
            marketId: row.market_id,
            tradeId: row.trade_id ?? null,
            side,
            outcome: row.outcome ?? null,
            price,
            size,
            notional,
            sourceTs: row.source_ts,
            createdAt: row.created_at,
          });
        }
        return Array.from(byId.values())
          .sort((a, b) => Date.parse(b.sourceTs) - Date.parse(a.sourceTs))
          .slice(0, 120);
      });
    };

    const queueTickRow = (row: TickRow) => {
      if (row.market_id !== activeMarketId) return;
      pendingTickRows.set(String(row.id), row);
      incrementClientCounter("market.activity.rowsReceived");
      if (!tickFlushTimer) {
        tickFlushTimer = setTimeout(flushPendingTickRows, 250);
      }
    };

    const supabase = getBrowserSupabaseClient();
    const candleChannel = supabase
      ? supabase
          .channel(`market-candles-${activeMarketId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "polymarket_candles_1m",
              filter: `market_id=eq.${activeMarketId}`,
            },
            (payload) => {
              if (payload.new && typeof payload.new === "object") {
                queueCandleRow(payload.new as CandleRow);
              }
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "polymarket_candles_1m",
              filter: `market_id=eq.${activeMarketId}`,
            },
            (payload) => {
              if (payload.new && typeof payload.new === "object") {
                queueCandleRow(payload.new as CandleRow);
              }
            }
          )
          .subscribe((status) => {
            if (
              (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") &&
              !candleFallbackTimer
            ) {
              candleFallbackTimer = setTimeout(() => {
                candleFallbackTimer = null;
                if (!cancelled) {
                  void fetchCandles();
                }
              }, 400);
            }
          })
      : null;

    const tickChannel = supabase
      ? supabase
          .channel(`market-ticks-${activeMarketId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "polymarket_market_ticks",
              filter: `market_id=eq.${activeMarketId}`,
            },
            (payload) => {
              if (payload.new && typeof payload.new === "object") {
                queueTickRow(payload.new as TickRow);
              }
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              incrementClientCounter("market.activity.channelRecovery");
            }
          })
      : null;

    async function fetchCandles() {
      setMarketInsightsLoading(true);
      setMarketInsightsError(null);
      try {
        const candlesRaw = await trpcClient.market.getPriceCandles.query({
          marketId: activeMarketId,
          provider: selectedProvider,
          limit: MARKET_CANDLE_LIMIT,
        });
        if (cancelled) return;
        const candlesParsed = priceCandlesSchema.parse(candlesRaw);
        const candles: PriceCandle[] = candlesParsed.map((c) => ({
          bucket: requireValue(c.bucket, "CANDLE_BUCKET_MISSING"),
          outcomeId: c.outcomeId ?? null,
          outcomeTitle: c.outcomeTitle ?? null,
          outcomeColor: c.outcomeColor ?? null,
          open: requireValue(c.open, "CANDLE_OPEN_MISSING"),
          high: requireValue(c.high, "CANDLE_HIGH_MISSING"),
          low: requireValue(c.low, "CANDLE_LOW_MISSING"),
          close: requireValue(c.close, "CANDLE_CLOSE_MISSING"),
          volume: requireValue(c.volume, "CANDLE_VOLUME_MISSING"),
          tradesCount: requireValue(c.tradesCount, "CANDLE_TRADES_COUNT_MISSING"),
        }));
        setMarketCandles(candles);
        if (candles.length > 0 && chartFirstPaintRecordedForMarketRef.current !== activeMarketId) {
          chartFirstPaintRecordedForMarketRef.current = activeMarketId;
          const openedAt = consumeClientMark(`market-open:${activeMarketId}`) ?? marketOpenStartedAtRef.current;
          if (openedAt) {
            observeClientTiming("market.open.toChartMs", Date.now() - openedAt);
          }
          incrementClientCounter("market.chart.firstPaint");
        }
      } catch (err) {
        console.error("Failed to load price candles", err);
        if (!cancelled) {
          maybeRequireRelogin(err);
          setMarketInsightsError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setMarketInsightsLoading(false);
        }
      }
    }

    async function fetchActivity() {
      setMarketActivityError(null);
      try {
        const [ticksRes, tradesRes] = await Promise.allSettled([
          trpcClient.market.getLiveActivity.query({
            marketId: activeMarketId,
            provider: selectedProvider,
            limit: 80,
          }),
          trpcClient.market.getPublicTrades.query({
            marketId: activeMarketId,
            provider: selectedProvider,
            limit: 50,
          }),
        ]);
        if (cancelled) return;

        if (ticksRes.status === "fulfilled") {
          const ticks = liveActivityTicksSchema.parse(ticksRes.value) as LiveActivityTick[];
          setMarketLiveActivityTicks(
            [...ticks].sort((a, b) => Date.parse(b.sourceTs) - Date.parse(a.sourceTs)).slice(0, 120)
          );
        } else {
          maybeRequireRelogin(ticksRes.reason);
        }

        if (tradesRes.status === "fulfilled") {
          const tradesParsed = publicTradesSchema.parse(tradesRes.value);
          const trades: PublicTrade[] = tradesParsed.map((t) => ({
            id: requireValue(t.id, "PUBLIC_TRADE_ID_MISSING"),
            marketId: requireValue(t.marketId, "PUBLIC_TRADE_MARKET_ID_MISSING"),
            action: requireValue(t.action, "PUBLIC_TRADE_ACTION_MISSING"),
            outcome: t.outcome ?? null,
            outcomeId: t.outcomeId ?? null,
            outcomeTitle: t.outcomeTitle ?? null,
            collateralGross: requireValue(t.collateralGross, "PUBLIC_TRADE_GROSS_MISSING"),
            sharesDelta: requireValue(t.sharesDelta, "PUBLIC_TRADE_SHARES_MISSING"),
            priceBefore: requireValue(t.priceBefore, "PUBLIC_TRADE_PRICE_BEFORE_MISSING"),
            priceAfter: requireValue(t.priceAfter, "PUBLIC_TRADE_PRICE_AFTER_MISSING"),
            createdAt: requireValue(t.createdAt, "PUBLIC_TRADE_CREATED_AT_MISSING"),
          }));
          setMarketPublicTrades(trades);
        } else {
          console.error("Failed to load public trades", tradesRes.reason);
          maybeRequireRelogin(tradesRes.reason);
          setMarketActivityError(getErrorMessage(tradesRes.reason));
        }
      } catch (err) {
        if (!cancelled) {
          maybeRequireRelogin(err);
          setMarketActivityError(getErrorMessage(err));
        }
      }
    }

    async function fetchComments() {
      setMarketCommentsError(null);
      try {
        const commentsRaw = await trpcClient.market.getMarketComments.query({ marketId: activeMarketId, limit: 50 });
        if (cancelled) return;
        const commentsParsed = marketCommentsSchema.parse(commentsRaw);
        const uiComments: MarketComment[] = commentsParsed.map((c) => {
          const userLabel = c.authorUsername ? `${c.authorName} (@${c.authorUsername})` : c.authorName;
          const avatar = c.authorAvatarUrl || buildInitialsAvatarDataUrl(c.authorName, { bg: "#333333", fg: "#ffffff" });
          const timestamp = new Date(c.createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
          return {
            id: c.id,
            userId: c.userId,
            username: c.authorUsername ?? null,
            user: userLabel,
            avatar,
            text: c.body,
            createdAt: c.createdAt,
            timestamp,
            likes: c.likesCount ?? 0,
            likedByMe: c.likedByMe ?? false,
            parentId: c.parentId ?? null,
          };
        });
        setMarketComments(uiComments);
      } catch (err) {
        if (!cancelled) {
          maybeRequireRelogin(err);
          setMarketCommentsError(getErrorMessage(err));
        }
      }
    }

    void fetchCandles();
    void fetchActivity();
    void fetchComments();

    return () => {
      cancelled = true;
      if (candleFlushTimer) clearTimeout(candleFlushTimer);
      if (tickFlushTimer) clearTimeout(tickFlushTimer);
      if (candleFallbackTimer) clearTimeout(candleFallbackTimer);
      pendingCandleRows.clear();
      pendingTickRows.clear();
      if (supabase && candleChannel) {
        void supabase.removeChannel(candleChannel);
      }
      if (supabase && tickChannel) {
        void supabase.removeChannel(tickChannel);
      }
    };
  }, [selectedMarketId, selectedProvider, lang, maybeRequireRelogin]);

  useEffect(() => {
    if (!HAS_PRIVY_PROVIDER || !selectedMarketId) {
      setTradeAccessState(null);
      setTradeAccessLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAccess = async () => {
      setTradeAccessLoading(true);
      try {
        const access = await trpcClient.market.checkTradeAccess.query({
          provider: selectedProvider,
        });
        if (!cancelled) {
          setTradeAccessState({
            status: access.status ?? "UNKNOWN_TEMP_ERROR",
            allowed: Boolean(access.allowed),
            reasonCode: access.reasonCode ?? null,
            message: access.message ?? null,
            checkedAt: access.checkedAt ?? new Date().toISOString(),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setTradeAccessState({
            status: "UNKNOWN_TEMP_ERROR",
            allowed: false,
            reasonCode: "ACCESS_STATUS_FETCH_FAILED",
            message: getErrorMessage(err),
            checkedAt: new Date().toISOString(),
          });
        }
      } finally {
        if (!cancelled) setTradeAccessLoading(false);
      }
    };

    void fetchAccess();
    const timer = setInterval(() => {
      void fetchAccess();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedMarketId, selectedProvider]);

  /**
   * Handle placing a bet (buying shares)
   */
  const handlePlaceBet = async ({
    amount,
    marketId,
    side,
    outcomeId,
    marketTitle,
  }: {
    amount: number;
    marketId: string;
    side?: "YES" | "NO";
    outcomeId?: string;
    marketTitle: string;
  }) => {
    const safeSide: "YES" | "NO" = side ?? "YES";
    const market =
      selectedMarket && selectedMarket.id === marketId
        ? selectedMarket
        : mergedMarkets.find((m) => m.id === marketId) ?? null;

    if (!HAS_PRIVY_PROVIDER) {
      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage:
          lang === "RU"
            ? "Privy не настроен. Установите NEXT_PUBLIC_PRIVY_APP_ID."
            : "Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID.",
        isLoading: false,
      });
      return;
    }

    if (!privyReady || !privyAuthenticated || !user) {
      openAuth("SIGN_IN");
      return;
    }

    const tradeAccess = await trpcClient.market.checkTradeAccess
      .query({ provider: market?.provider ?? undefined })
      .catch(() => null);
    if (!tradeAccess?.allowed) {
      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage:
          tradeAccess?.message ??
          (lang === "RU"
            ? "Торговля недоступна в вашей юрисдикции."
            : "Trading is unavailable in your jurisdiction."),
        isLoading: false,
      });
      return;
    }

    void trpcClient.events.track
      .mutate({
        sessionId: sessionIdRef.current,
        marketId,
        provider: market?.provider ?? undefined,
        eventType: "trade_intent",
        value: amount,
      })
      .catch(() => {
        // best effort analytics event
      });

    const wallet =
      privyWallets.find((w) => (w as { walletClientType?: string }).walletClientType === "privy") ??
      privyWallets[0] ??
      null;

    if (!market || !wallet) {
      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage:
          lang === "RU"
            ? "Не удалось подготовить сделку. Проверьте кошелёк и обновите страницу."
            : "Unable to prepare trade. Check your wallet and refresh the page.",
        isLoading: false,
      });
      return;
    }

    if ((market.provider ?? "polymarket") === "limitless") {
      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage:
          lang === "RU"
            ? "Подпись ордеров Limitless на клиенте пока не настроена в этом билде."
            : "Client-side Limitless order signing is not configured in this build yet.",
        isLoading: false,
      });
      return;
    }

    const normalizeOutcome = (title?: string | null) => String(title ?? "").trim().toLowerCase();
    const outcomes = market.outcomes ?? [];
    const yesOutcome =
      outcomes.find((o) => normalizeOutcome(o.title) === "yes") ??
      outcomes.find((o) => o.sortOrder === 0) ??
      outcomes[0] ??
      null;
    const noOutcome =
      outcomes.find((o) => normalizeOutcome(o.title) === "no") ??
      outcomes.find((o) => o.sortOrder === 1) ??
      outcomes[1] ??
      null;
    const selectedOutcome =
      (outcomeId ? outcomes.find((o) => o.id === outcomeId) : null) ??
      (safeSide === "NO" ? noOutcome : yesOutcome);

    const tokenId = selectedOutcome?.tokenId ?? null;
    const price =
      typeof selectedOutcome?.price === "number" && Number.isFinite(selectedOutcome.price)
        ? selectedOutcome.price
        : safeSide === "NO"
          ? market.noPrice
          : market.yesPrice;

    if (!tokenId || !Number.isFinite(price) || price <= 0) {
      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage:
          lang === "RU"
            ? "Для выбранного исхода нет доступного tokenId в CLOB."
            : "No tradable CLOB tokenId available for the selected outcome.",
        isLoading: false,
      });
      return;
    }

    setBetConfirm({
      open: true,
      marketTitle,
      side: safeSide,
      amount,
      newBalance: user?.balance,
      errorMessage: null,
      isLoading: true,
    });

    try {
      const built = await buildSignedBuyOrder({
        wallet: wallet as PrivyWalletLike,
        tokenId,
        amountUsd: amount,
        limitPrice: price,
        chainId: Number.isFinite(POLYMARKET_CHAIN_ID) ? POLYMARKET_CHAIN_ID : 137,
        clobUrl: POLYMARKET_CLOB_URL,
        apiCreds: clobApiCredsRef.current,
        orderType: "FOK",
      });
      clobApiCredsRef.current = built.apiCreds;

      const relay = await trpcClient.market.relaySignedOrder.mutate({
        provider: market.provider ?? "polymarket",
        marketId: market.id,
        signedOrder: built.signedOrder,
        orderType: built.orderType,
        idempotencyKey:
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2)}`),
        clientOrderId: `ui_${Date.now()}`,
        apiCreds: built.apiCreds,
      });

      if (!relay.success) {
        throw new Error(relay.error ?? "ORDER_RELAY_FAILED");
      }

      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage: null,
        isLoading: false,
      });
    } catch (err) {
      const message = getErrorMessage(err);
      const mapped = (() => {
        const upper = message.toUpperCase();
        if (upper.includes("ORDER_RELAY_TIMEOUT")) {
          return lang === "RU" ? "Таймаут при отправке ордера в CLOB." : "Timed out while relaying order to CLOB.";
        }
        if (upper.includes("BLOCKED") || upper.includes("ACCESS")) {
          return lang === "RU"
            ? "Торговля недоступна в вашей юрисдикции."
            : "Trading is unavailable in your jurisdiction.";
        }
        if (upper.includes("INSUFFICIENT")) {
          return lang === "RU"
            ? "Недостаточно средств или не выполнен allowance."
            : "Insufficient balance or allowance.";
        }
        return message || (lang === "RU" ? "Не удалось разместить ставку." : "Failed to place bet.");
      })();

      setBetConfirm({
        open: true,
        marketTitle,
        side: safeSide,
        amount,
        newBalance: user?.balance,
        errorMessage: mapped,
        isLoading: false,
      });
    }
  };

  const handleOpenMarketBet = useCallback(
    async (market: Market, side: "YES" | "NO") => {
      if (!user) {
        setPostAuthAction({ type: "OPEN_MARKET_BET", marketId: market.id, side });
        openAuth("SIGN_UP");
        return;
      }
      if (reloginRequired) {
        setPostAuthAction({ type: "OPEN_MARKET_BET", marketId: market.id, side });
        const refreshed = await attemptSilentRefresh();
        if (!refreshed) return;
      }
      const me = await refreshUser();
      if (!me) {
        setPostAuthAction({ type: "OPEN_MARKET_BET", marketId: market.id, side });
        const refreshed = await attemptSilentRefresh();
        if (!refreshed) return;
      }
      marketOpenStartedAtRef.current = Date.now();
      setClientMark(`market-open:${market.id}`);
      incrementClientCounter("market.open.calls");
      setMarketBetIntent({ marketId: market.id, side, nonce: Date.now() });
      setSelectedMarketId(market.id);
      navigateToMarketUrl(market.id, market.titleEn ?? market.titleRu ?? market.title);
    },
    [openAuth, user, reloginRequired, refreshUser, attemptSilentRefresh, navigateToMarketUrl]
  );

  const openMarketWithAuthCheck = useCallback(
    async (market: Market) => {
      const marketId = market.id;
      marketOpenStartedAtRef.current = Date.now();
      setClientMark(`market-open:${marketId}`);
      incrementClientCounter("market.open.calls");
      setSelectedMarketId(marketId);
      navigateToMarketUrl(marketId, market.titleEn ?? market.titleRu ?? market.title);

      if (!user) return;

      void (async () => {
        if (reloginRequired) {
          try {
            localStorage.setItem("pending_market_id", marketId);
          } catch {
            // ignore
          }
          await attemptSilentRefresh();
        }
        await refreshUser();
      })();
    },
    [user, reloginRequired, refreshUser, attemptSilentRefresh, navigateToMarketUrl]
  );

  const creatorHasBets = useMemo(() => {
    if (!selectedMarketId || !user) return false;
    if (!selectedMarket?.createdBy || selectedMarket.createdBy !== user.id) return false;
    const entry = myCreatedMarkets.find((m) => m.id === selectedMarketId);
    return entry ? entry.hasBets : false;
  }, [selectedMarketId, selectedMarket?.createdBy, user, myCreatedMarkets]);

  const handleOpenCreateMarket = useCallback(() => {
    const target = process.env.NEXT_PUBLIC_POLYMARKET_CREATE_URL || "https://polymarket.com";
    if (typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleSetBookmarked = useCallback(
    async (marketId: string, bookmarked: boolean) => {
      if (!user) {
        openAuth("SIGN_UP");
        return;
      }

      let previous: { marketId: string; createdAt: string }[] | null = null;
      const nowIso = new Date().toISOString();
      setMyBookmarks((curr) => {
        previous = curr;
        if (bookmarked) {
          if (curr.some((b) => b.marketId === marketId)) return curr;
          return [{ marketId, createdAt: nowIso }, ...curr];
        }
        return curr.filter((b) => b.marketId !== marketId);
      });

      try {
        const marketProvider =
          mergedMarkets.find((market) => market.id === marketId)?.provider ??
          (marketId.startsWith("limitless:") ? "limitless" : undefined);
        await trpcClient.market.setBookmark.mutate({
          marketId,
          provider: marketProvider,
          bookmarked,
        });
        void trpcClient.events.track
          .mutate({
            sessionId: sessionIdRef.current,
            marketId,
            provider: marketProvider,
            eventType: "bookmark",
            value: bookmarked ? 1 : 0,
          })
          .catch(() => {
            // best effort analytics event
          });
      } catch (err) {
        console.error("setBookmark failed", err);
        if (previous) setMyBookmarks(previous);
        throw err;
      }
    },
    [mergedMarkets, openAuth, user]
  );

  const openPublicProfile = useCallback(
    async (userId: string) => {
      setPublicProfileOpen(true);
      setPublicProfileLoading(true);
      setPublicProfileError(null);
      setPublicProfileUser(null);
      setPublicProfilePnl(0);
      setPublicProfileComments([]);
      setPublicProfileBets([]);
      publicProfileRequestIdRef.current += 1;
      const requestId = publicProfileRequestIdRef.current;

      try {
        const [u, stats, comments, bets] = await Promise.all([
          trpcClient.user.publicUser.query({ userId }),
          trpcClient.user.publicUserStats.query({ userId }),
          trpcClient.user.publicUserComments.query({ userId, limit: 50 }),
          trpcClient.user.publicUserVotes.query({ userId, limit: 200 }),
        ]);
        if (requestId !== publicProfileRequestIdRef.current) return;

        setPublicProfileUser({
          id: requireValue(u.id, "PUBLIC_USER_ID_MISSING"),
          username: requireValue(u.username, "PUBLIC_USER_USERNAME_MISSING"),
          displayName: u.displayName ?? null,
          avatarUrl: u.avatarUrl ?? null,
          telegramPhotoUrl: u.telegramPhotoUrl ?? null,
        });
        setPublicProfilePnl(Number(stats.pnlMajor ?? 0));
        setPublicProfileComments(
          (comments ?? []).map((c) => ({
            id: requireValue(c.id, "PUBLIC_COMMENT_ID_MISSING"),
            marketId: requireValue(c.marketId, "PUBLIC_COMMENT_MARKET_ID_MISSING"),
            parentId: c.parentId ?? null,
            body: requireValue(c.body, "PUBLIC_COMMENT_BODY_MISSING"),
            createdAt: requireValue(c.createdAt, "PUBLIC_COMMENT_CREATED_MISSING"),
            likesCount: Number(c.likesCount ?? 0),
          }))
        );
        setPublicProfileBets(
          (bets ?? []).map((b) => ({
            marketId: requireValue(b.marketId, "PUBLIC_BET_MARKET_ID_MISSING"),
            outcome: b.outcome ?? null,
            lastBetAt: requireValue(b.lastBetAt, "PUBLIC_BET_LAST_BET_AT_MISSING"),
            isActive: Boolean(b.isActive),
          }))
        );
      } catch (err) {
        if (requestId !== publicProfileRequestIdRef.current) return;
        console.error("openPublicProfile failed", err);
        setPublicProfileError(lang === "RU" ? "Не удалось загрузить профиль" : "Failed to load profile");
      } finally {
        if (requestId !== publicProfileRequestIdRef.current) return;
        setPublicProfileLoading(false);
      }
    },
    [lang]
  );

  const closePublicProfile = useCallback(() => {
    setPublicProfileOpen(false);
  }, []);

  // Post-auth actions (run only after user becomes available).
  useEffect(() => {
    if (!user || !postAuthAction) return;
    if (postAuthAction.type === "OPEN_MARKET_BET") {
      const action = postAuthAction;
      setPostAuthAction(null);
      marketOpenStartedAtRef.current = Date.now();
      setClientMark(`market-open:${action.marketId}`);
      incrementClientCounter("market.open.calls");
      setSelectedMarketId(action.marketId);
      const market = mergedMarkets.find((m) => m.id === action.marketId);
      navigateToMarketUrl(action.marketId, market?.titleEn ?? market?.titleRu ?? market?.title);
      setMarketBetIntent({ marketId: action.marketId, side: action.side, nonce: Date.now() });
      return;
    }
    if (postAuthAction.type === "PLACE_BET") {
      const action = postAuthAction;
      setPostAuthAction(null);
      setSelectedMarketId(action.marketId);
      navigateToMarketUrl(action.marketId, action.marketTitle);
      void handlePlaceBet({
        amount: action.amount,
        marketId: action.marketId,
        side: action.side,
        outcomeId: action.outcomeId,
        marketTitle: action.marketTitle,
      });
    }
  }, [user, postAuthAction, mergedMarkets, navigateToMarketUrl]);

  /**
   * Handle selling a position (cash out)
   */
  const handleSellPosition = async ({
    marketId,
  }: {
    marketId: string;
    side?: "YES" | "NO";
    outcomeId?: string;
    shares: number;
  }) => {
    const market =
      selectedMarket && selectedMarket.id === marketId
        ? selectedMarket
        : mergedMarkets.find((m) => m.id === marketId) ?? null;
    const target = getExternalMarketUrl(market);
    if (typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  const handleClaimWinnings = async ({
    marketId,
  }: {
    marketId: string;
    assetCode: "USDC" | "USDT";
  }) => {
    const market =
      selectedMarket && selectedMarket.id === marketId
        ? selectedMarket
        : mergedMarkets.find((m) => m.id === marketId) ?? null;
    const target = getExternalMarketUrl(market);
    if (typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  };

  const handlePostMarketComment = useCallback(
    async (params: {
      marketId: string;
      provider?: "polymarket" | "limitless";
      text: string;
      parentId?: string | null;
    }) => {
      let created: Awaited<ReturnType<typeof trpcClient.market.postMarketComment.mutate>>;
      try {
        created = await trpcClient.market.postMarketComment.mutate({
          marketId: params.marketId,
          provider: params.provider,
          body: params.text,
          parentId: params.parentId ?? null,
        });
      } catch (err) {
        maybeRequireRelogin(err);
        throw err;
      }
      const parsed = marketCommentsSchema.parse([created])[0];
      const userLabel = parsed.authorUsername ? `${parsed.authorName} (@${parsed.authorUsername})` : parsed.authorName;
      const avatar = parsed.authorAvatarUrl || buildInitialsAvatarDataUrl(parsed.authorName, { bg: "#333333", fg: "#ffffff" });
      const timestamp = new Date(parsed.createdAt).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      const ui: MarketComment = {
        id: parsed.id,
        userId: parsed.userId,
        username: parsed.authorUsername ?? null,
        user: userLabel,
        avatar,
        text: parsed.body,
        createdAt: parsed.createdAt,
        timestamp,
        likes: parsed.likesCount ?? 0,
        likedByMe: parsed.likedByMe ?? false,
        parentId: parsed.parentId ?? null,
      };
      setMarketComments((prev) => [ui, ...prev]);
    },
    [lang, maybeRequireRelogin]
  );

  const handleToggleMarketCommentLike = useCallback(async (commentId: string) => {
    // Optimistic UI update for instant feedback.
    let previous: { likes: number; likedByMe: boolean } | null = null;
    setMarketComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const likedByMe = Boolean(c.likedByMe);
        previous = { likes: c.likes, likedByMe };
        const nextLiked = !likedByMe;
        const delta = nextLiked ? 1 : -1;
        return { ...c, likedByMe: nextLiked, likes: Math.max(0, c.likes + delta) };
      })
    );

    try {
      const res = await trpcClient.market.toggleMarketCommentLike.mutate({ commentId });
      setMarketComments((prev) =>
        prev.map((c) => (c.id === res.commentId ? { ...c, likes: res.likesCount, likedByMe: res.liked } : c))
      );
    } catch (err) {
      console.error("toggleMarketCommentLike failed", err);
      maybeRequireRelogin(err);
      if (previous) {
        setMarketComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, likes: previous.likes, likedByMe: previous.likedByMe } : c))
        );
      }
      throw err;
    }
  }, [maybeRequireRelogin]);

  const handleFetchMarketContext = useCallback(async (marketId: string) => {
    if (!marketId || marketContextLoadingId === marketId) return;
    setMarketContextErrorById((prev) => ({ ...prev, [marketId]: null }));
    setMarketContextLoadingId(marketId);
    try {
      const result = await trpcClient.market.generateMarketContext.mutate({ marketId });
      setMarketContextById((prev) => ({
        ...prev,
        [marketId]: {
          context: result.context,
          sources: result.sources,
          updatedAt: result.updatedAt,
        },
      }));
    } catch (err) {
      console.error("generateMarketContext failed", err);
      setMarketContextErrorById((prev) => ({ ...prev, [marketId]: getErrorMessage(err) }));
    } finally {
      setMarketContextLoadingId((prev) => (prev === marketId ? null : prev));
    }
  }, [marketContextLoadingId]);

  const shellViewIndex = (() => {
    switch (currentView) {
      case "FRIENDS":
        return 0;
      case "CATALOG":
        return 1;
      case "FEED":
        return 2;
      case "PROFILE":
        return 3;
      default:
        return 1;
    }
  })();


  return (
    <div className="tg-scroll bg-black text-zinc-100 font-sans">
      {selectedMarket ? (
        <>
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            user={user}
            onAuthClick={() => openAuth("SIGN_UP")}
            onHelpClick={() => setShowOnboarding(true)}
            onLogoClick={() => {
              setSelectedMarketId(null);
              setCurrentView("CATALOG");
              navigateToCatalogUrl();
              void loadMarkets();
            }}
            lang={lang}
            onToggleLang={handleToggleLang}
          />
          <main className="pb-32 pb-safe">
            <MarketPage
              market={selectedMarket}
              user={user}
              bookmarked={bookmarkedMarketIds.has(selectedMarket.id)}
              onToggleBookmark={({ marketId, bookmarked }) => void handleSetBookmarked(marketId, bookmarked)}
              onBack={() => {
                setMarketBetIntent(null);
                setSelectedMarketId(null);
                navigateToCatalogUrl();
                void loadMarkets();
              }}
              onLogin={() => openAuth("SIGN_IN")}
              betIntent={
                marketBetIntent && marketBetIntent.marketId === selectedMarket.id ? marketBetIntent : null
              }
              onRequireBetAuth={(params) => {
                setPostAuthAction({
                  type: "PLACE_BET",
                  marketId: params.marketId,
                  side: params.side,
                  outcomeId: params.outcomeId,
                  amount: params.amount,
                  marketTitle: params.marketTitle,
                });
                openAuth("SIGN_UP");
              }}
              lang={lang}
              onPlaceBet={handlePlaceBet}
              onSellPosition={handleSellPosition}
              onClaimWinnings={handleClaimWinnings}
              comments={marketComments}
                onOpenUserProfile={(userId) => void openPublicProfile(userId)}
              onPostComment={handlePostMarketComment}
              onToggleCommentLike={handleToggleMarketCommentLike}
              userPositions={myPositions.filter((p) => p.marketId === selectedMarket.id)}
              priceCandles={marketCandles}
              publicTrades={marketPublicTrades}
              liveActivityTicks={marketLiveActivityTicks}
              insightsLoading={marketInsightsLoading}
              insightsError={marketInsightsError}
              commentsError={marketCommentsError}
              activityError={marketActivityError}
              marketContext={marketContextById[selectedMarket.id]?.context ?? null}
              marketContextSources={marketContextById[selectedMarket.id]?.sources ?? []}
              marketContextLoading={marketContextLoadingId === selectedMarket.id}
              marketContextError={marketContextErrorById[selectedMarket.id] ?? null}
              onFetchMarketContext={handleFetchMarketContext}
              creatorHasBets={creatorHasBets}
              tradeBlockedMessage={tradeBlockedMessage}
              onOpenExternalTrade={(marketId) => {
                const market = mergedMarkets.find((m) => m.id === marketId) ?? null;
                const target = getExternalMarketUrl(market);
                if (typeof window !== "undefined") {
                  window.open(target, "_blank", "noopener,noreferrer");
                }
              }}
            />
          </main>
          <BottomMenu
            currentView={currentView}
            lang={lang}
            user={user}
            onLoginRequest={() => openAuth("SIGN_IN")}
            onCreateMarket={handleOpenCreateMarket}
            onChange={(view) => {
              // Bottom nav always navigates back to the main shell
              setMarketBetIntent(null);
              if (selectedMarketId !== null) {
                setSelectedMarketId(null);
                navigateToCatalogUrl();
                void loadMarkets();
              }
              goToView(view);
            }}
          />
        </>
      ) : (
        <>
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            user={user}
            onAuthClick={() => openAuth("SIGN_UP")}
            onHelpClick={() => setShowOnboarding(true)}
            onLogoClick={() => {
              setMarketBetIntent(null);
              setSelectedMarketId(null);
              setCurrentView("CATALOG");
              navigateToCatalogUrl();
            }}
            lang={lang}
            onToggleLang={handleToggleLang}
          />

          <main
            className="mx-auto w-full max-w-7xl pb-32 pb-safe"
            onTouchStart={handleShellTouchStart}
            onTouchEnd={handleShellTouchEnd}
          >
            <div className="overflow-x-hidden">
              <div
                className="flex w-[400%] transition-transform duration-200 ease-out will-change-transform"
                style={{ transform: `translateX(-${shellViewIndex * 25}%)` }}
              >
                {/* FRIENDS */}
                <div className="w-1/4">
                  <FriendsPage
                    lang={lang}
                    user={user}
                    leaderboardUsers={leaderboardUsers}
                    leaderboardLoading={loadingLeaderboard}
                    leaderboardError={leaderboardError}
                    onLogin={() => openAuth("SIGN_IN")}
                    onUserClick={(u) => void openPublicProfile(u.id)}
                    onCreateReferralLink={handleCreateReferralLink}
                    leaderboardSort={leaderboardSort}
                    onLeaderboardSortChange={(next) => {
                      setLeaderboardSort(next);
                      void loadLeaderboard(next);
                    }}
                    onOpenLeaderboardSort={() => setLeaderboardSortOpen(true)}
                  />
                </div>

                {/* CATALOG */}
                <div className="w-1/4">
                  <div>
                    {/* Mobile search (desktop search is in Header) */}
                    <div className="px-4 pt-2 pb-3 md:hidden">
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={lang === "RU" ? "Поиск..." : "Search..."}
                          className="w-full h-10 rounded-full bg-zinc-950 border border-zinc-900 px-4 pl-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
                        />
                        <Search size={16} className="absolute left-3.5 top-3 text-zinc-600" />
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="px-4 pb-3 border-b border-zinc-900">
                      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1" data-swipe-ignore="true">
                        <button
                          type="button"
                          onClick={() => setActiveCategoryId("all")}
                          className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition ${
                            activeCategoryId === "all"
                              ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,1)] text-white shadow-[0_10px_30px_rgba(245,68,166,0.12)] hover:opacity-90"
                              : "border-zinc-900 bg-black text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/40"
                          }`}
                        >
                          {lang === "RU" ? "Все" : "All"}
                        </button>
                        {marketCategories.map((c) => {
                          const label = lang === "RU" ? c.labelRu : c.labelEn;
                          const selected = activeCategoryId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setActiveCategoryId(c.id)}
                              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition ${
                                selected
                                  ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,1)] text-white shadow-[0_10px_30px_rgba(245,68,166,0.12)] hover:opacity-90"
                                  : "border-zinc-900 bg-black text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/40"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Providers */}
                    <div className="px-4 pt-3 border-b border-zinc-900">
                      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1" data-swipe-ignore="true">
                        {[
                          { id: "all" as const, labelRu: "Все площадки", labelEn: "All venues" },
                          { id: "polymarket" as const, labelRu: "Polymarket", labelEn: "Polymarket" },
                          { id: "limitless" as const, labelRu: "Limitless", labelEn: "Limitless" },
                        ].map((provider) => {
                          const selected = activeProviderFilter === provider.id;
                          const label = lang === "RU" ? provider.labelRu : provider.labelEn;
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => {
                                setCatalogPage(1);
                                setActiveProviderFilter(provider.id);
                              }}
                              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition ${
                                selected
                                  ? "border-[rgba(190,255,29,1)] bg-[rgba(190,255,29,1)] text-black shadow-[0_10px_30px_rgba(190,255,29,0.15)]"
                                  : "border-zinc-900 bg-black text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/40"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sort / filter */}
                    <div className="px-4 pt-3" data-swipe-ignore="true">
                      {semanticSearchLoading && searchQuery.trim().length >= 2 ? (
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          {lang === "RU" ? "AI-поиск ранжирует рынки..." : "AI ranking markets..."}
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          {lang === "RU" ? "Фильтры" : "Filters"}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCatalogFiltersOpen(true)}
                          className="h-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/70 px-3 text-xs font-semibold text-zinc-200 hover:text-white transition-colors inline-flex items-center gap-2"
                        >
                          <Filter size={14} className="text-zinc-300" />
                          <span>{lang === "RU" ? "Фильтр" : "Filter"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="px-4 pt-3">
                      {loadingMarkets ? (
                        <div className="text-center py-10 text-zinc-500">
                          {marketsLoadingMessage || (lang === "RU" ? "Загрузка рынков..." : "Loading markets...")}
                        </div>
                      ) : catalogMarkets.length > 0 ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4">
                            {catalogMarkets.map((market) => (
                              <div key={market.id} data-market-card-id={market.id}>
                                <MarketCard
                                  market={market}
                                  bookmarked={bookmarkedMarketIds.has(market.id)}
                                  onClick={() => {
                                    setMarketBetIntent(null);
                                    void openMarketWithAuthCheck(market);
                                  }}
                                  onQuickBet={(side) => handleOpenMarketBet(market, side)}
                                  lang={lang}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="pb-8 flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setCatalogPage((prev) => Math.max(1, prev - 1))}
                              disabled={loadingMarkets || catalogPage <= 1}
                              className="h-9 px-3 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/70 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-zinc-200"
                            >
                              {lang === "RU" ? "Назад" : "Prev"}
                            </button>
                            <div className="text-xs text-zinc-400 min-w-[100px] text-center">
                              {(lang === "RU" ? "Страница" : "Page") + ` ${catalogPage}`}
                            </div>
                            <button
                              type="button"
                              onClick={() => setCatalogPage((prev) => prev + 1)}
                              disabled={loadingMarkets || !hasNextCatalogPage}
                              className="h-9 px-3 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/70 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-zinc-200"
                            >
                              {lang === "RU" ? "Далее" : "Next"}
                            </button>
                          </div>
                        </>
                      ) : marketsError ? (
                        <div className="text-center py-20 text-zinc-500 px-4">
                          <p className="text-sm">{marketsError}</p>
                        </div>
                      ) : (
                        <div className="text-center py-20 text-zinc-500 px-4">
                          <p className="text-lg mb-2">{lang === "RU" ? "Ничего не найдено" : "Nothing found"}</p>
                          <p className="text-sm">{lang === "RU" ? "Попробуйте другой запрос" : "Try a different search"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* MY BETS (formerly FEED) */}
                <div className="w-1/4">
                  <div>
                    {user && bookmarkedMarkets.length > 0 && (
                      <>
                        <div className="px-4 pt-3 pb-2">
                          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                            {lang === "RU" ? "Закладки" : "Bookmarks"}
                          </div>
                        </div>
                        <div className="px-4 pt-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-8">
                            {bookmarkedMarkets.map((market) => (
                              <MarketCard
                                key={`bm-${market.id}`}
                                market={market}
                                bookmarked
                                onClick={() => {
                                  setMarketBetIntent(null);
                                  void openMarketWithAuthCheck(market);
                                }}
                                onQuickBet={(side) => handleOpenMarketBet(market, side)}
                                lang={lang}
                              />
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="px-4 pt-3 pb-2">
                      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        {lang === "RU" ? "Мои ставки" : "My bets"}
                      </div>
                    </div>

                    <div className="px-4 pt-2">
                      {loadingMarkets ? (
                        <div className="text-center py-10 text-zinc-500">
                          {marketsLoadingMessage || (lang === "RU" ? "Загрузка рынков..." : "Loading markets...")}
                        </div>
                      ) : !user ? (
                        <div className="text-center py-20 text-zinc-500 px-4">
                          <p className="text-lg mb-2">{lang === "RU" ? "Войдите, чтобы увидеть ваши ставки" : "Log in to see your bets"}</p>
                          <p className="text-sm">
                            {lang === "RU" ? "Каталог доступен без входа." : "The catalog is available without logging in."}
                          </p>
                        </div>
                      ) : feedMarkets.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-8">
                          {feedMarkets.map((market) => (
                            <MarketCard
                              key={market.id}
                              market={market}
                              bookmarked={bookmarkedMarketIds.has(market.id)}
                              onClick={() => {
                                setMarketBetIntent(null);
                                void openMarketWithAuthCheck(market);
                              }}
                              onQuickBet={(side) => handleOpenMarketBet(market, side)}
                              lang={lang}
                            />
                          ))}
                        </div>
                      ) : marketsError ? (
                        <div className="text-center py-20 text-zinc-500 px-4">
                          <p className="text-sm">{marketsError}</p>
                        </div>
                      ) : (
                        <div className="text-center py-20 text-zinc-500 px-4">
                          <p className="text-lg mb-2">{lang === "RU" ? "У вас пока нет ставок" : "No bets yet"}</p>
                          <p className="text-sm">
                            {lang === "RU" ? "Откройте рынок в каталоге, чтобы сделать ставку." : "Open a market in the catalog to place a bet."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* PROFILE */}
                <div className="w-1/4">
                  <ProfilePage
                    key={`profile-${user?.id ?? "anon"}`}
                    user={user}
                    lang={lang}
                    onLogin={() => openAuth("SIGN_IN")}
                    onLogout={handleLogout}
                    onUpdateDisplayName={handleUpdateDisplayName}
                    onUpdateAvatarUrl={handleUpdateAvatarUrl}
                    balanceMajor={walletBalanceMajor ?? user?.balance ?? 0}
                    pnlMajor={profilePnlMajor ?? 0}
                    bets={legacyBets}
                    betsLoading={myBetsLoading}
                    betsError={myBetsError}
                    soldTrades={soldTrades}
                    comments={myComments}
                    commentsLoading={myCommentsLoading}
                    commentsError={myCommentsError}
                    bookmarks={bookmarkedMarkets}
                    myMarkets={myCreatedMarkets}
                    onSellPosition={handleSellPosition}
                    onLoadBets={() => void loadMyBets()}
                    onLoadComments={() => void loadMyComments()}
                    onMarketClick={(marketId) => {
                      setMarketBetIntent(null); // Clear bet intent when clicking from profile
                      const market = mergedMarkets.find((m) => m.id === marketId);
                      if (market) {
                        void openMarketWithAuthCheck(market);
                        return;
                      }
                      // Fallback for stale profile lists where market cache has not refreshed yet.
                      setSelectedMarketId(marketId);
                      navigateToMarketUrl(marketId);
                    }}
                  />
                </div>
              </div>
            </div>
          </main>

          <BottomMenu
            currentView={currentView}
            lang={lang}
            user={user}
            onLoginRequest={() => openAuth("SIGN_IN")}
            onCreateMarket={handleOpenCreateMarket}
            onChange={(view) => {
              setMarketBetIntent(null);
              goToView(view);
            }}
          />
        </>
      )}

      {/* Catalog filters modal (rendered outside swipe/transform container) */}
      {catalogFiltersOpen && currentView === "CATALOG" && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4" data-swipe-ignore="true">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setCatalogFiltersOpen(false)}
          />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-semibold text-zinc-100">
                {lang === "RU" ? "Фильтры каталога" : "Catalog filters"}
              </div>
              <button
                type="button"
                onClick={() => setCatalogFiltersOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={lang === "RU" ? "Закрыть" : "Close"}
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              {lang === "RU" ? "Статус" : "Status"}
            </div>
            <div role="radiogroup" className="space-y-2 mb-4">
              {([
                { id: "ALL" as const, labelRu: "Все", labelEn: "All" },
                { id: "ONGOING" as const, labelRu: "Текущие", labelEn: "Ongoing" },
                { id: "ENDED" as const, labelRu: "Завершённые", labelEn: "Ended" },
              ]).map((opt) => {
                const selected = catalogStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCatalogStatus(opt.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                        : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              {lang === "RU" ? "Время" : "Time"}
            </div>
            <div role="radiogroup" className="space-y-2 mb-4">
              {([
                { id: "ANY" as const, labelRu: "Любое", labelEn: "Any" },
                { id: "HOUR" as const, labelRu: "Закончится за 1 час", labelEn: "Ends in 1 hour" },
                { id: "DAY" as const, labelRu: "Закончится за 24 часа", labelEn: "Ends in 24 hours" },
                { id: "WEEK" as const, labelRu: "Закончится за 7 дней", labelEn: "Ends in 7 days" },
              ]).map((opt) => {
                const selected = catalogTimeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCatalogTimeFilter(opt.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                        : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              {lang === "RU" ? "Сортировка" : "Sort"}
            </div>

            <div role="radiogroup" className="space-y-2">
              {([
                { id: "CREATED_DESC" as const, labelRu: "Новые события", labelEn: "New events first" },
                { id: "CREATED_ASC" as const, labelRu: "Старые события", labelEn: "Old events first" },
                { id: "ENDING_SOON" as const, labelRu: "Скоро закончится", labelEn: "Will end soon" },
                { id: "VOLUME_DESC" as const, labelRu: "Объём: по убыванию", labelEn: "Volume: descending" },
                { id: "VOLUME_ASC" as const, labelRu: "Объём: по возрастанию", labelEn: "Volume: ascending" },
                { id: "CATEGORY_ASC" as const, labelRu: "Категория: A → Z", labelEn: "Category: A → Z" },
                { id: "CATEGORY_DESC" as const, labelRu: "Категория: Z → A", labelEn: "Category: Z → A" },
              ]).map((opt) => {
                const selected = catalogSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setCatalogPage(1);
                      setCatalogSort(opt.id);
                    }}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                        : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setCatalogStatus("ALL");
                setCatalogTimeFilter("ANY");
                setCatalogSort("CREATED_DESC");
                setCatalogPage(1);
              }}
              className="mt-3 w-full h-10 rounded-full border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-950/60 text-zinc-200 text-sm font-semibold transition-colors"
            >
              {lang === "RU" ? "Сбросить фильтры" : "Reset filters"}
            </button>

            <button
              type="button"
              onClick={() => setCatalogFiltersOpen(false)}
              className="mt-4 w-full h-11 rounded-full bg-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.90)] text-white font-semibold transition-colors"
            >
              {lang === "RU" ? "Готово" : "Done"}
            </button>
          </div>
        </div>
      )}

      {leaderboardSortOpen && currentView === "FRIENDS" && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4" data-swipe-ignore="true">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setLeaderboardSortOpen(false)}
          />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-semibold text-zinc-100">
                {lang === "RU" ? "Сортировка" : "Sort"}
              </div>
              <button
                type="button"
                onClick={() => setLeaderboardSortOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={lang === "RU" ? "Закрыть" : "Close"}
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              {lang === "RU" ? "Сортировка" : "Sort"}
            </div>
            <div role="radiogroup" className="space-y-2">
              {([
                { id: "PNL" as const, labelRu: "PnL", labelEn: "PnL" },
                { id: "BETS" as const, labelRu: "Ставки", labelEn: "Bets" },
              ]).map((opt) => {
                const selected = leaderboardSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setLeaderboardSort(opt.id);
                      setLeaderboardSortOpen(false);
                      void loadLeaderboard(opt.id);
                    }}
                    className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                      selected
                        ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                        : "border-zinc-900 bg-zinc-950/30 text-zinc-300 hover:bg-zinc-950/50"
                    }`}
                  >
                    <div className="text-sm font-semibold">{lang === "RU" ? opt.labelRu : opt.labelEn}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ProfileSetupModal
        isOpen={Boolean(user?.needsProfileSetup)}
        user={user}
        lang={lang}
        saving={profileSetupSaving}
        error={profileSetupError}
        onSubmit={handleCompleteProfileSetup}
      />
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
        lang={lang}
        onToggleLang={handleToggleLang}
      />
      <BetConfirmModal
        isOpen={betConfirm.open}
        onClose={() => setBetConfirm((prev) => ({ ...prev, open: false }))}
        marketTitle={betConfirm.marketTitle}
        side={betConfirm.side}
        amount={betConfirm.amount}
        newBalance={betConfirm.newBalance}
        errorMessage={betConfirm.errorMessage}
        isLoading={Boolean(betConfirm.isLoading)}
      />
      <PublicUserProfileModal
        isOpen={publicProfileOpen}
        onClose={closePublicProfile}
        lang={lang}
        loading={publicProfileLoading}
        error={publicProfileError}
        user={publicProfileUser}
        pnlMajor={publicProfilePnl}
        bets={publicProfileBets}
        comments={publicProfileComments}
        markets={mergedMarkets}
        onMarketClick={(marketId) => {
          closePublicProfile();
          setMarketBetIntent(null);
          const market = mergedMarkets.find((m) => m.id === marketId);
          if (market) {
            void openMarketWithAuthCheck(market);
          } else {
            setSelectedMarketId(marketId);
            navigateToMarketUrl(marketId);
          }
          setCurrentView("CATALOG");
        }}
      />
    </div>
  );
}
