'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import AuthModal, { type AuthMode } from "@/components/AuthModal";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import BetConfirmModal from "@/components/BetConfirmModal";
import AdminMarketModal from "@/components/AdminMarketModal";
import ProfilePage from "@/components/ProfilePage";
import PublicUserProfileModal from "@/components/PublicUserProfileModal";
import Button from "@/components/Button";
import type { Market, User, Bet, Position, Trade, PriceCandle, PublicTrade, LeaderboardUser, Comment as MarketComment } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search, X, AlertCircle, Filter } from "lucide-react";
import BottomMenu, { type ViewType } from "@/components/BottomMenu";
import FriendsPage from "@/components/FriendsPage";
import { leaderboardUsersSchema } from "@/src/schemas/leaderboard";
import { positionsSchema, tradesSchema } from "@/src/schemas/portfolio";
import { priceCandlesSchema, publicTradesSchema } from "@/src/schemas/marketInsights";
import { marketCommentsSchema } from "@/src/schemas/comments";
import { marketCategoriesSchema } from "@/src/schemas/marketCategories";
import { myCommentsSchema } from "@/src/schemas/myComments";
import { marketBookmarksSchema } from "@/src/schemas/bookmarks";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { runDiagnostics } from "@/lib/debug/walletDiagnostics";

// Expose diagnostics in development for easy console access
if (typeof window !== "undefined") {
  (window as unknown as { runWalletDiagnostics?: typeof runDiagnostics }).runWalletDiagnostics = runDiagnostics;
}

// VCOIN decimals for display
const VCOIN_DECIMALS = 6;
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

type ErrorLike = string | Error | { message?: string; data?: { message?: string } } | null | undefined;
const getErrorMessage = (error: ErrorLike): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = error.message;
    if (typeof msg === "string") return msg;
  }
  if (error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "message" in error.data) {
    const dataMsg = error.data.message;
    if (typeof dataMsg === "string") return dataMsg;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};


type MarketApiRow = {
  id: string;
  titleRu: string;
  titleEn: string;
  description?: string | null;
  source?: string | null;
  imageUrl?: string;
  state: string;
  createdAt: string;
  closesAt: string;
  expiresAt: string;
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
};
type MyMarketApiRow = MarketApiRow & { hasBets: boolean };

const mapMarketApiToMarket = (m: MarketApiRow, lang: "RU" | "EN"): Market => {
  const title = lang === "RU" ? m.titleRu : m.titleEn;
  const chanceSource = typeof m.chance === "number" ? m.chance : Math.round(m.priceYes * 100);
  const chance = Number.isFinite(chanceSource) ? Math.round(chanceSource) : 50;
  return {
    id: String(m.id),
    title,
    titleRu: m.titleRu,
    titleEn: m.titleEn,
    state: m.state as Market["state"],
    outcome: m.outcome,
    createdBy: m.createdBy ?? null,
    creatorName: m.creatorName ?? null,
    creatorAvatarUrl: m.creatorAvatarUrl ?? null,
    createdAt: m.createdAt,
    categoryId: m.categoryId ?? null,
    categoryLabelRu: m.categoryLabelRu ?? null,
    categoryLabelEn: m.categoryLabelEn ?? null,
    imageUrl: (m.imageUrl ?? "").trim() || buildInitialsAvatarDataUrl(title, { bg: "#111111", fg: "#ffffff" }),
    volume: `$${Number(m.volume).toFixed(2)}`,
    closesAt: m.closesAt,
    expiresAt: m.expiresAt,
    yesPrice: Number(m.priceYes),
    noPrice: Number(m.priceNo),
    chance,
    description: m.description ?? (lang === "RU" ? "Описание будет добавлено." : "Description coming soon."),
    source: m.source ?? null,
    history: [],
    comments: [],
    liquidityB: m.liquidityB ?? undefined,
    feeBps: m.feeBps ?? undefined,
    settlementAsset: m.settlementAsset ?? undefined,
  };
};

const toLocalDateTimeInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const MARKET_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const slugifyTitle = (raw: string) =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("SIGN_IN");
  const [reloginRequired, setReloginRequired] = useState(false);
  type CatalogSort = "ENDING_SOON" | "CREATED_DESC" | "CREATED_ASC" | "VOLUME_DESC" | "VOLUME_ASC";
  const [catalogSort, setCatalogSort] = useState<CatalogSort>("CREATED_DESC");
  type CatalogStatus = "ALL" | "ONGOING" | "ENDED";
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("ALL");
  type CatalogTimeFilter = "ANY" | "HOUR" | "DAY";
  const [catalogTimeFilter, setCatalogTimeFilter] = useState<CatalogTimeFilter>("ANY");
  const [catalogFiltersOpen, setCatalogFiltersOpen] = useState(false);
  type LeaderboardSort = "PNL" | "BETS";
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>("PNL");
  const [leaderboardSortOpen, setLeaderboardSortOpen] = useState(false);
  type PostAuthAction =
    | { type: "OPEN_CREATE_MARKET" }
    | { type: "PLACE_BET"; marketId: string; side: "YES" | "NO"; amount: number; marketTitle: string }
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
  const silentRefreshInFlightRef = useRef<Promise<boolean> | null>(null);
  // Wallet state (Solana Wallet Adapter)
  const { publicKey, connected: isWalletConnected, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const connectedWalletAddress = publicKey ? publicKey.toBase58() : null;
  type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";
  const normalizeSolanaCluster = (value: string): SolanaCluster => {
    const v = value.trim().toLowerCase();
    if (v === "devnet" || v === "testnet" || v === "mainnet-beta") return v;
    return "devnet";
  };
  const solanaCluster: SolanaCluster = normalizeSolanaCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet");

  // Keep DB wallet link in sync with actual connected wallet/chain.
  const walletSyncInFlight = useRef(false);
  const lastWalletSyncKey = useRef<string>("");
  const hadWalletConnectionRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    // Solana pubkeys are base58 (case-sensitive) - do NOT lowercase them
    const walletPubkey = connectedWalletAddress ?? null;
    const dbPubkey = user.solanaWalletAddress ? String(user.solanaWalletAddress) : null;
    const dbCluster = user.solanaCluster ? String(user.solanaCluster).toLowerCase() : null;

    const syncKey = `${user.id}:${walletPubkey ?? "none"}:${solanaCluster}:${isWalletConnected ? "1" : "0"}`;
    if (walletSyncInFlight.current) return;
    if (lastWalletSyncKey.current === syncKey) return;

    if (isWalletConnected && walletPubkey) {
      hadWalletConnectionRef.current = true;
    }

    // If wallet is disconnected, unlink only if it was connected in this session.
    if (!isWalletConnected || !walletPubkey) {
      if (!dbPubkey) {
        lastWalletSyncKey.current = syncKey;
        return;
      }
      if (!hadWalletConnectionRef.current) {
        lastWalletSyncKey.current = syncKey;
        return;
      }
      walletSyncInFlight.current = true;
      void (async () => {
        try {
          await trpcClient.user.unlinkWallet.mutate();
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  solanaWalletAddress: null,
                  solanaCluster: null,
                  solanaWalletConnectedAt: null,
                }
              : prev
          );
        } catch (err) {
          console.warn("unlinkWallet failed (ignored)", err);
        } finally {
          lastWalletSyncKey.current = syncKey;
          walletSyncInFlight.current = false;
        }
      })();
      return;
    }

    // If wallet is connected, link or update chain.
    if (walletPubkey && isWalletConnected) {
      const needsLink = !dbPubkey || dbPubkey !== walletPubkey;
      const needsChainUpdate = dbCluster !== solanaCluster;

      if (!needsLink && !needsChainUpdate) {
        lastWalletSyncKey.current = syncKey;
        return;
      }

      walletSyncInFlight.current = true;
      void (async () => {
        try {
          if (needsLink) {
            console.log("[wallet-sync] Linking wallet:", walletPubkey, "cluster:", solanaCluster);
            const linked = await trpcClient.user.linkWallet.mutate({
              solanaWalletAddress: walletPubkey,
              solanaCluster,
            });
            console.log("[wallet-sync] Wallet linked successfully:", linked);
            setUser((prev) =>
              prev
                ? {
                    ...prev,
                    solanaWalletAddress: linked.solanaWalletAddress ?? walletPubkey,
                    solanaCluster: linked.solanaCluster ?? solanaCluster,
                    solanaWalletConnectedAt: linked.solanaWalletConnectedAt ?? null,
                  }
                : prev
            );
          } else if (needsChainUpdate) {
            console.log("[wallet-sync] Updating cluster to:", solanaCluster);
            await trpcClient.user.updateWalletChain.mutate({ solanaCluster });
            setUser((prev) => (prev ? { ...prev, solanaCluster } : prev));
            console.log("[wallet-sync] Cluster updated successfully");
          }
        } catch (err) {
          const errMsg = getErrorMessage(err);
          console.error("[wallet-sync] linkWallet failed:", errMsg, err);
          // Surface specific errors to help debugging
          if (errMsg.includes("WALLET_ALREADY_LINKED")) {
            console.error("[wallet-sync] This wallet is already linked to a different user account. Clear it in DB or use a different wallet.");
          } else if (errMsg.includes("UNAUTHORIZED")) {
            console.error("[wallet-sync] User not authenticated - login required before linking wallet");
          } else if (errMsg.includes("CONFLICT")) {
            console.error("[wallet-sync] Conflict - wallet may be linked to another user");
          }
        } finally {
          lastWalletSyncKey.current = syncKey;
          walletSyncInFlight.current = false;
        }
      })();
    }
  }, [user, connectedWalletAddress, solanaCluster, isWalletConnected]);
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("ref") || params.get("invite") || params.get("r");
      const stored = localStorage.getItem("pending_referral_code");
      const next = (fromUrl || stored || "").trim();
      if (next) {
        try {
          localStorage.setItem("pending_referral_code", next);
        } catch {
          // ignore
        }
        return next;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const pendingDeepLinkMarketIdRef = useRef<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const telegramAutoLoginAttemptedRef = useRef(false);

  const getTelegramInitDataFromUrl = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const fromHash = new URLSearchParams(hash).get("tgWebAppData");
      const fromSearch = new URLSearchParams(window.location.search).get("tgWebAppData");
      const raw = (fromHash || fromSearch || "").trim();
      if (!raw) return null;
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  }, []);

  const getTelegramInitData = useCallback(() => {
    if (typeof window === "undefined") return null;
    const initData = window.Telegram?.WebApp?.initData;
    if (typeof initData === "string" && initData.trim().length > 0) return initData;
    return getTelegramInitDataFromUrl();
  }, [getTelegramInitDataFromUrl]);

  const getMarketIdFromUrl = () => getMarketIdFromLocation();

  // Deep link: open a market by URL (?marketId=...).
  useEffect(() => {
    const marketIdFromUrl = getMarketIdFromUrl();
    const startParamRaw =
      typeof window !== "undefined" ? (window.Telegram?.WebApp?.initDataUnsafe as { start_param?: string } | undefined)?.start_param : undefined;
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
  type MarketBetIntent = { marketId: string; side: "YES" | "NO"; nonce: number } | null;
  const [marketBetIntent, setMarketBetIntent] = useState<MarketBetIntent>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [marketCandles, setMarketCandles] = useState<PriceCandle[]>([]);
  const [marketPublicTrades, setMarketPublicTrades] = useState<PublicTrade[]>([]);
  type MarketContextPayload = { context: string; sources: string[]; updatedAt: string };
  const [marketContextById, setMarketContextById] = useState<Record<string, MarketContextPayload>>({});
  const [marketContextLoadingId, setMarketContextLoadingId] = useState<string | null>(null);
  const [marketContextErrorById, setMarketContextErrorById] = useState<Record<string, string | null>>({});
  const [walletBalanceMajor, setWalletBalanceMajor] = useState<number | null>(null);
  const [editMarketOpen, setEditMarketOpen] = useState(false);
  const [editMarketTarget, setEditMarketTarget] = useState<Market | null>(null);
  const [deleteMarketOpen, setDeleteMarketOpen] = useState(false);
  const [deleteMarketError, setDeleteMarketError] = useState<string | null>(null);
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
    outcome: "YES" | "NO";
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
  const [lastOnchainTxBase64, setLastOnchainTxBase64] = useState<string | null>(null);
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

  const loadLeaderboard = useCallback(async (sortBy: LeaderboardSort = leaderboardSort) => {
    setLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const usersRaw = await trpcClient.user.leaderboard.query({ limit: 100, sortBy });
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

  // pendingReferralCode is captured once on mount (initializer) and cleared after signup completes.

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

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthInitialMode(mode);
    setShowAuth(true);
  }, []);

  const applyPublicUser = useCallback((me: {
    id: string;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
    createdAt?: string | null;
    avatarUrl?: string | null;
    telegramPhotoUrl?: string | null;
    balance: number;
    isAdmin?: boolean | null;
    referralCode?: string | null;
    referralCommissionRate?: number | null;
    referralEnabled?: boolean | null;
    solanaWalletAddress?: string | null;
    solanaCluster?: string | null;
    solanaWalletConnectedAt?: string | null;
  }) => {
    setUser({
      id: String(me.id),
      email: me.email ?? undefined,
      username: me.username ?? undefined,
      name: me.displayName ?? me.username ?? undefined,
      createdAt: me.createdAt ?? undefined,
      avatarUrl: me.avatarUrl ?? null,
      telegramPhotoUrl: me.telegramPhotoUrl ?? null,
      avatar: me.avatarUrl ?? me.telegramPhotoUrl ?? undefined,
      balance: me.balance,
      isAdmin: Boolean(me.isAdmin),
      referralCode: me.referralCode ?? null,
      referralCommissionRate: me.referralCommissionRate ?? null,
      referralEnabled: me.referralEnabled ?? null,
      solanaWalletAddress: me.solanaWalletAddress ?? null,
      solanaCluster: me.solanaCluster ?? null,
      solanaWalletConnectedAt: me.solanaWalletConnectedAt ?? null,
    });
  }, []);

  const clearRelogin = useCallback(() => {
    setReloginRequired(false);
  }, []);

  const debugOnchainTx = useCallback(
    async (txBase64?: string) => {
      const base64 = (txBase64 || lastOnchainTxBase64 || "").trim();
      if (!base64) {
        console.warn("[debugOnchainTx] No transaction available. Place a USDC bet first.");
        return null;
      }
      let tx: Transaction;
      try {
        tx = Transaction.from(Buffer.from(base64, "base64"));
      } catch (err) {
        console.error("[debugOnchainTx] Failed to parse txBase64", err);
        return null;
      }

      console.log("\n========================================");
      console.log("🔍 ONCHAIN TX DEBUG");
      console.log("========================================\n");
      console.log("Base64 length:", base64.length);
      console.log("Fee payer:", tx.feePayer?.toBase58() || "N/A");
      console.log("Recent blockhash:", tx.recentBlockhash || "N/A");
      console.log("Instruction count:", tx.instructions.length);
      console.log(
        "Signatures:",
        tx.signatures.map((s) => ({
          pubkey: s.publicKey.toBase58(),
          hasSignature: Boolean(s.signature),
        }))
      );

      if (typeof signTransaction === "function") {
        console.log("\nAttempting wallet signature (will prompt wallet)...");
        try {
          const preservedSignatures = tx.signatures
            .filter((sig) => sig.signature)
            .map((sig) => ({ publicKey: sig.publicKey, signature: sig.signature as Buffer }));
          const signed: Transaction = await signTransaction(tx);
          for (const preserved of preservedSignatures) {
            const existing = signed.signatures.find((sig) => sig.publicKey.equals(preserved.publicKey))?.signature;
            if (!existing) {
              signed.addSignature(preserved.publicKey, preserved.signature);
            }
          }
          const walletSigned = publicKey
            ? Boolean(signed.signatures.find((sig) => sig.publicKey.equals(publicKey))?.signature)
            : false;
          console.log("Wallet signature present:", walletSigned);
          console.log(
            "Signed signatures:",
            signed.signatures.map((s) => ({
              pubkey: s.publicKey.toBase58(),
              hasSignature: Boolean(s.signature),
            }))
          );
        } catch (err) {
          console.error("[debugOnchainTx] Wallet signing failed", err);
        }
      } else {
        console.warn("[debugOnchainTx] signTransaction not available on this wallet adapter.");
      }
      console.log("\n========================================\n");

      return tx;
    },
    [lastOnchainTxBase64, publicKey, signTransaction]
  );

  const sendOnchainTransaction = useCallback(
    async (tx: Transaction) => {
      const preservedSignatures = tx.signatures
        .filter((sig) => sig.signature)
        .map((sig) => ({ publicKey: sig.publicKey, signature: sig.signature as Buffer }));

      if (typeof signTransaction === "function") {
        const signed: Transaction = await signTransaction(tx);
        for (const preserved of preservedSignatures) {
          const existing = signed.signatures.find((sig) => sig.publicKey.equals(preserved.publicKey))?.signature;
          if (!existing) {
            signed.addSignature(preserved.publicKey, preserved.signature);
          }
        }
        if (publicKey) {
          const walletSignature = signed.signatures.find((sig) => sig.publicKey.equals(publicKey))?.signature;
          if (!walletSignature) {
            throw new Error("WALLET_SIGNATURE_MISSING");
          }
        }
        const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        if (!signature) {
          throw new Error("SIGNATURE_EMPTY");
        }
        return signature;
      }

      const signature = await sendTransaction(tx, connection, { skipPreflight: true });
      if (!signature) {
        throw new Error("SIGNATURE_EMPTY");
      }
      return signature;
    },
    [connection, publicKey, sendTransaction, signTransaction]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { debugOnchainTx?: typeof debugOnchainTx }).debugOnchainTx = debugOnchainTx;
  }, [debugOnchainTx]);

  const handleTelegramLogin = useCallback(async (initData: string) => {
    const res = await trpcClient.auth.telegramLogin.mutate({ initData });
    clearRelogin();
    applyPublicUser(res.user);
  }, [applyPublicUser, clearRelogin]);

  const formatBetError = (msg?: string) => {
    if (!msg) return lang === "RU" ? "Не удалось поставить ставку" : "Failed to place bet";
    const upper = msg.toUpperCase();
    const simPrefix = "SOLANA_SIMULATION_FAILED:";
    const simIdx = upper.indexOf(simPrefix);
    const simDetails = simIdx >= 0 ? msg.slice(simIdx + simPrefix.length).trim() : null;
    // Check for authentication errors first
    if (upper.includes("UNAUTHORIZED") || upper.includes("NOT AUTHENTICATED") || upper.includes("NOT_AUTHENTICATED")) {
      triggerRelogin();
      return lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.";
    }
    if (upper.includes("MARKET_EXPIRED") || upper.includes("MARKET_CLOSED") || upper.includes("MARKET_NOT_OPEN")) {
      return lang === "RU" ? "Событие завершено, ставки закрыты." : "Market closed for trading.";
    }
    if (upper.includes("INSUFFICIENT_BALANCE")) {
      return lang === "RU" ? "Недостаточно средств на балансе." : "Insufficient balance.";
    }
    if (upper.includes("INSUFFICIENT_SOL_FOR_FEES") || upper.includes("NOT ENOUGH SOL")) {
      return lang === "RU"
        ? "Недостаточно SOL для комиссии сети и создания нужных аккаунтов."
        : "Not enough SOL for network fees and required account creation.";
    }
    if (upper.includes("INSUFFICIENT_USDC_ONCHAIN")) {
      return lang === "RU"
        ? "Недостаточно USDC нужного mint в подключенном кошельке. Проверьте, что токен совпадает с USDC mint приложения."
        : "Insufficient USDC for the required mint in the connected wallet. Verify the token mint matches app USDC mint.";
    }
    if (upper.includes("MARKET_RESOLVED")) {
      return lang === "RU" ? "Событие уже разрешено." : "Market already resolved.";
    }
    if (upper.includes("AMOUNT_TOO_SMALL") || upper.includes("INVALID_AMOUNT")) {
      return lang === "RU" ? "Сумма слишком мала." : "Amount is too small.";
    }
    if (upper.includes("AMOUNT_TOO_LARGE") || upper.includes("VALUE OUT OF RANGE")) {
      return lang === "RU" ? "Слишком большая ставка, попробуйте меньше." : "Bet amount is too large, try a smaller size.";
    }
    if (upper.includes("BET_TOO_LARGE")) {
      return lang === "RU" ? "Достигнут лимит максимальной ставки." : "Maximum bet limit reached.";
    }
    if (upper.includes("INVALID_LIQUIDITY")) {
      return lang === "RU" ? "У рынка нет ликвидности для торговли." : "Market liquidity is invalid.";
    }
    if (upper.includes("DECLAREDPROGRAMIDMISMATCH") || upper.includes("CUSTOM\":4100")) {
      return lang === "RU"
        ? "Версия смарт-контракта не совпадает с настройками приложения. Обновите приложение и повторите попытку."
        : "Smart contract version does not match app configuration. Refresh/update the app and try again.";
    }
    if (upper.includes("ACCOUNTNOTINITIALIZED") || upper.includes("CUSTOM\":3012")) {
      return lang === "RU"
        ? "Ончейн-конфиг не инициализирован для текущего Program ID. Выполните initialize_config и повторите."
        : "On-chain config is not initialized for the current Program ID. Run initialize_config and retry.";
    }
    if (upper.includes("RATE_LIMIT_EXCEEDED")) {
      return lang === "RU"
        ? "Лимит создания рынков: до 3 новых рынков за 30 минут."
        : "Market creation limit reached: up to 3 new markets per 30 minutes.";
    }
    if (upper.includes("TX_FAILED_ONCHAIN")) {
      return lang === "RU"
        ? "Транзакция в сети Solana не прошла. Проверьте баланс USDC и попробуйте снова."
        : "On-chain Solana transaction failed. Check your USDC balance and try again.";
    }
    if (upper.includes("CUSTOM\":1")) {
      return lang === "RU"
        ? "Транзакция отклонена: недостаточно токенов или слишком маленькая сумма."
        : "Transaction rejected: insufficient tokens or amount too small.";
    }
    if (simDetails) {
      return lang === "RU"
        ? `Ошибка симуляции транзакции: ${simDetails}`
        : `Transaction simulation failed: ${simDetails}`;
    }
    if (upper.includes("SOLANA_WALLET_MISMATCH")) {
      return lang === "RU"
        ? "Кошелёк не привязан к аккаунту. Переподключите кошелёк."
        : "Wallet not linked to your account. Please reconnect your wallet.";
    }
    if (upper.includes("ADMIN_ONLY_ONCHAIN") || upper.includes("ONCHAIN_UNAVAILABLE")) {
      return lang === "RU"
        ? "Ончейн-ставки временно недоступны."
        : "On-chain bets are temporarily unavailable.";
    }
    if (upper.includes("WALLET_SIGNATURE_MISSING")) {
      return lang === "RU"
        ? "Кошелёк не подписал транзакцию. Подтвердите подпись в кошельке и попробуйте снова."
        : "Wallet did not sign the transaction. Approve the signature in your wallet and try again.";
    }
    if (upper.includes("SIGNATURE_EMPTY") || upper.includes("!SIGNATURE")) {
      return lang === "RU"
        ? "Кошелёк не вернул подпись транзакции. Переподключите кошелёк и попробуйте снова."
        : "Wallet did not return a transaction signature. Reconnect your wallet and try again.";
    }
    if (upper.includes("WALLET_ALREADY_LINKED")) {
      return lang === "RU"
        ? "Этот кошелёк уже привязан к другому аккаунту."
        : "This wallet is already linked to another account.";
    }
    if (upper.includes("ASSET_DISABLED")) {
      return lang === "RU" ? "Этот актив сейчас недоступен." : "Settlement asset is disabled.";
    }
    if (upper.includes("UNEXPECTED TOKEN") && upper.includes("JSON")) {
      return lang === "RU"
        ? "Ошибка конфигурации Solana на сервере. Проверьте SOLANA_QUOTE_AUTHORITY_KEYPAIR."
        : "Solana server config error. Check SOLANA_QUOTE_AUTHORITY_KEYPAIR.";
    }
    return msg;
  };

  const handleSignUp = async (payload: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
  }) => {
    const me = await trpcClient.auth.signUp.mutate({
      email: payload.email,
      username: payload.username,
      password: payload.password,
      displayName: payload.displayName,
      referralCode: pendingReferralCode ?? undefined,
    });
    clearRelogin();
    applyPublicUser(me.user);

    // If user came from a deep link, keep them on that market after signup.
    try {
      const pendingMarketId = localStorage.getItem("pending_market_id");
      if (pendingMarketId) {
        setSelectedMarketId(pendingMarketId);
        navigateToMarketUrl(pendingMarketId);
        setCurrentView("CATALOG");
        localStorage.removeItem("pending_market_id");
      }
    } catch {
      // ignore
    }

    setPendingReferralCode(null);
    try {
      localStorage.removeItem("pending_referral_code");
    } catch {
      // ignore
    }
  };

  const handleLoginSubmit = async (payload: {
    emailOrUsername: string;
    password: string;
  }) => {
    const me = await trpcClient.auth.login.mutate({
      emailOrUsername: payload.emailOrUsername,
      password: payload.password,
    });
    clearRelogin();
    applyPublicUser(me.user);

    // If user came from a deep link, keep them on that market after login.
    try {
      const pendingMarketId = localStorage.getItem("pending_market_id");
      if (pendingMarketId) {
        setSelectedMarketId(pendingMarketId);
        navigateToMarketUrl(pendingMarketId);
        setCurrentView("CATALOG");
        localStorage.removeItem("pending_market_id");
      }
    } catch {
      // ignore
    }
  };

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

  const attemptSilentRefresh = useCallback(async () => {
    if (silentRefreshInFlightRef.current) {
      return silentRefreshInFlightRef.current;
    }

    const task = (async () => {
      try {
        const refreshed = await trpcClient.auth.refreshSession.mutate();
        if (refreshed?.user) {
          applyPublicUser(refreshed.user);
        }
        clearRelogin();
        return true;
      } catch (err) {
        console.warn("Silent session refresh failed", err);
        const initData = getTelegramInitData();
        if (initData) {
          try {
            await handleTelegramLogin(initData);
            await new Promise((resolve) => setTimeout(resolve, 200));
            const me = await refreshUser();
            if (me) {
              clearRelogin();
              return true;
            }
          } catch (telegramErr) {
            console.warn("Telegram re-auth failed", telegramErr);
          }
        }
        setReloginRequired(true);
        setUser(null);
        openAuth("SIGN_IN");
        return false;
      } finally {
        silentRefreshInFlightRef.current = null;
      }
    })();

    silentRefreshInFlightRef.current = task;
    return task;
  }, [applyPublicUser, clearRelogin, handleTelegramLogin, openAuth, refreshUser, getTelegramInitData]);

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

  const handleUpdateAvatarUrl = useCallback(async (nextAvatarUrl: string | null) => {
    const updated = await trpcClient.user.updateAvatarUrl.mutate({
      avatarUrl: nextAvatarUrl,
    });
    setUser((prev) =>
      prev
        ? {
            ...prev,
            avatarUrl: updated.avatarUrl ?? null,
            telegramPhotoUrl: updated.telegramPhotoUrl ?? null,
            avatar: updated.avatarUrl ?? updated.telegramPhotoUrl ?? undefined,
          }
        : prev
    );
  }, []);

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
      await trpcClient.auth.logout.mutate();
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
  }, [navigateToCatalogUrl]);

  const deriveLegacyBets = useCallback(
    (positions: Position[]): Bet[] =>
      positions.map((p, idx) => {
        const market = markets.find((m) => m.id === p.marketId);
        const priceYes = market?.yesPrice ?? 0.5;
        const priceNo = market?.noPrice ?? 0.5;
        const currentPrice = p.outcome === "YES" ? priceYes : priceNo;

        let status: Bet["status"] = "open";
        if (p.marketState === "resolved") {
          status = p.marketOutcome === p.outcome ? "won" : "lost";
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
          side: p.outcome,
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
    [markets, lang]
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
      const [positionsRaw, tradesRaw, bookmarksRaw, walletBalanceRaw, myMarketsRaw] = await Promise.all([
        trpcClient.market.myPositions.query(),
        trpcClient.market.myTrades.query(),
        trpcClient.market.myBookmarks.query(),
        trpcClient.market.myWalletBalance.query().catch(() => null),
        trpcClient.market.myMarkets.query().catch(() => []),
      ]);

      const positionsParsed = positionsSchema.parse(positionsRaw);
      const tradesParsed = tradesSchema.parse(tradesRaw);
      const bookmarksParsed = marketBookmarksSchema.parse(bookmarksRaw);

      const positions: Position[] = positionsParsed.map((p) => ({
        marketId: requireValue(p.marketId, "POSITION_MARKET_ID_MISSING"),
        outcome: requireValue(p.outcome, "POSITION_OUTCOME_MISSING"),
        shares: requireValue(p.shares, "POSITION_SHARES_MISSING"),
        avgEntryPrice: p.avgEntryPrice ?? null,
        marketTitleRu: requireValue(p.marketTitleRu, "POSITION_TITLE_RU_MISSING"),
        marketTitleEn: requireValue(p.marketTitleEn, "POSITION_TITLE_EN_MISSING"),
        marketState: requireValue(p.marketState, "POSITION_STATE_MISSING"),
        marketOutcome: p.marketOutcome ?? null,
        closesAt: p.closesAt ?? null,
        expiresAt: p.expiresAt ?? null,
      }));

      const trades: Trade[] = tradesParsed.map((t) => ({
        id: requireValue(t.id, "TRADE_ID_MISSING"),
        marketId: requireValue(t.marketId, "TRADE_MARKET_ID_MISSING"),
        action: requireValue(t.action, "TRADE_ACTION_MISSING"),
        outcome: requireValue(t.outcome, "TRADE_OUTCOME_MISSING"),
        collateralGross: requireValue(t.collateralGross, "TRADE_GROSS_MISSING"),
        fee: requireValue(t.fee, "TRADE_FEE_MISSING"),
        collateralNet: requireValue(t.collateralNet, "TRADE_NET_MISSING"),
        sharesDelta: requireValue(t.sharesDelta, "TRADE_SHARES_MISSING"),
        priceBefore: requireValue(t.priceBefore, "TRADE_PRICE_BEFORE_MISSING"),
        priceAfter: requireValue(t.priceAfter, "TRADE_PRICE_AFTER_MISSING"),
        createdAt: requireValue(t.createdAt, "TRADE_CREATED_AT_MISSING"),
        marketTitleRu: requireValue(t.marketTitleRu, "TRADE_TITLE_RU_MISSING"),
        marketTitleEn: requireValue(t.marketTitleEn, "TRADE_TITLE_EN_MISSING"),
        marketState: requireValue(t.marketState, "TRADE_STATE_MISSING"),
        marketOutcome: t.marketOutcome ?? null,
        avgEntryPrice: t.avgEntryPrice ?? null,
        avgExitPrice: t.avgExitPrice ?? null,
        realizedPnl: t.realizedPnl ?? null,
      }));

      setMyPositions(positions);
      setMyTrades(trades);
      setMyBookmarks(bookmarksParsed.map((b) => ({ marketId: b.marketId, createdAt: b.createdAt })));
      const myMarkets = (myMarketsRaw ?? []).map((m) => {
        const row = m as MyMarketApiRow;
        return {
          ...mapMarketApiToMarket(row, lang),
          hasBets: Boolean(row.hasBets),
        };
      });
      setMyCreatedMarkets(myMarkets);
      if (walletBalanceRaw && typeof walletBalanceRaw.balanceMajor === "number") {
        setWalletBalanceMajor(walletBalanceRaw.balanceMajor);
      }
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

      // Telegram Mini App: one-click login if no session exists.
      if (!me && !telegramAutoLoginAttemptedRef.current) {
        telegramAutoLoginAttemptedRef.current = true;
        const initData = getTelegramInitData();
        if (initData) {
          try {
            await handleTelegramLogin(initData);
            // After Telegram login, wait briefly for cookies to be set by the browser, then verify
            await new Promise((resolve) => setTimeout(resolve, 200));
            await refreshUser();
          } catch (err) {
            console.error("Telegram auto-login failed", err);
          }
        }
      }
      setLoadingUser(false);
    };

    void loadUser();
  }, [refreshUser, handleTelegramLogin]);

  const loadMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    setMarketsError(null);
    setMarketsLoadingMessage(lang === "RU" ? "Загрузка рынков..." : "Loading markets...");
    try {
      const response = await trpcClient.market.listMarkets.query({
        onlyOpen: false,
      });

      const mapped: Market[] = (response ?? []).map((m) =>
        mapMarketApiToMarket(m as MarketApiRow, lang)
      );
      setMarkets(mapped);
    } catch (err) {
      console.error("Failed to load markets", err);
      setMarketsError(
        lang === "RU" ? "Не удалось загрузить рынки, попробуйте позже." : "Failed to load markets."
      );
      setMarkets([]);
    } finally {
      setLoadingMarkets(false);
      setMarketsLoadingMessage(null);
    }
  }, [lang]);

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
    if (marketCategories.length === 0 && !loadingMarketCategories) {
      void loadMarketCategories();
    }
  }, [loadMarkets, loadMarketCategories, marketCategories.length, loadingMarketCategories]);

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
      const key = `${trade.marketId}:${trade.outcome}`;
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

  const resolveMarketOutcome = useCallback(
    async ({ marketId, outcome }: { marketId: string; outcome: "YES" | "NO" }) => {
      if (!user) throw new Error("UNAUTHORIZED");
      const market = markets.find((m) => m.id === marketId);
      if (!market || !market.createdBy || market.createdBy !== user.id) {
        throw new Error("FORBIDDEN");
      }
      await trpcClient.market.resolveMarket.mutate({ marketId, outcome });
      await loadMarkets();
      await loadMyBets();
      await refreshUser();
    },
    [user, markets, loadMarkets, loadMyBets, refreshUser]
  );

  // We load profile bets on navigation and after mutations; no periodic polling needed.

  const filteredMarkets = useMemo(
    () =>
      markets.filter((market) => {
        const matchesCategory =
          activeCategoryId === "all" || (market.categoryId ?? "") === activeCategoryId;
        const targetTitle = lang === "RU" ? market.titleRu : market.titleEn;
        const matchesSearch = targetTitle
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [activeCategoryId, searchQuery, markets, lang]
  );

  const catalogMarkets = useMemo(() => {
    const parseVol = (v: string) => {
      const n = Number(String(v).replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(n) ? n : 0;
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
          : now + 24 * 60 * 60 * 1000;
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
          sorted.sort((a, b) => parseVol(a.volume) - parseVol(b.volume));
          break;
        case "VOLUME_DESC":
          sorted.sort((a, b) => parseVol(b.volume) - parseVol(a.volume));
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
  }, [filteredMarkets, catalogSort, catalogStatus, catalogTimeFilter]);

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
    const base = markets.filter((m) => myBetMarketIds.has(m.id));
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
  }, [user, markets, myBetMarketIds, searchQuery, lang]);

  const bookmarkedMarketIds = useMemo(() => new Set(myBookmarks.map((b) => b.marketId)), [myBookmarks]);
  const bookmarkedMarkets = useMemo(() => {
    return markets.filter((m) => bookmarkedMarketIds.has(m.id));
  }, [markets, bookmarkedMarketIds]);

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId),
    [selectedMarketId, markets]
  );

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
      setMarketComments([]);
      setMarketInsightsLoading(false);
      setMarketInsightsError(null);
      setMarketCommentsError(null);
      setMarketActivityError(null);
      return;
    }

    let cancelled = false;

    const fetchInsights = async () => {
      setMarketInsightsLoading(true);
      setMarketInsightsError(null);
      setMarketCommentsError(null);
      setMarketActivityError(null);
      try {
        // Fetch independently so one failing endpoint doesn't wipe the others.
        const [candlesRes, tradesRes, commentsRes] = await Promise.allSettled([
          trpcClient.market.getPriceCandles.query({ marketId: selectedMarketId, limit: 200 }),
          trpcClient.market.getPublicTrades.query({ marketId: selectedMarketId, limit: 50 }),
          trpcClient.market.getMarketComments.query({ marketId: selectedMarketId, limit: 50 }),
        ]);

        if (cancelled) return;

        // Candles (chart)
        if (candlesRes.status === "fulfilled") {
          const candlesParsed = priceCandlesSchema.parse(candlesRes.value);
          const candles: PriceCandle[] = candlesParsed.map((c) => ({
            bucket: requireValue(c.bucket, "CANDLE_BUCKET_MISSING"),
            open: requireValue(c.open, "CANDLE_OPEN_MISSING"),
            high: requireValue(c.high, "CANDLE_HIGH_MISSING"),
            low: requireValue(c.low, "CANDLE_LOW_MISSING"),
            close: requireValue(c.close, "CANDLE_CLOSE_MISSING"),
            volume: requireValue(c.volume, "CANDLE_VOLUME_MISSING"),
            tradesCount: requireValue(c.tradesCount, "CANDLE_TRADES_COUNT_MISSING"),
          }));
          setMarketCandles(candles);
        } else {
          console.error("Failed to load price candles", candlesRes.reason);
          // keep previous candles for this market (or empty if first load)
        }

        // Trades (activity)
        if (tradesRes.status === "fulfilled") {
          const tradesParsed = publicTradesSchema.parse(tradesRes.value);
          const trades: PublicTrade[] = tradesParsed.map((t) => ({
            id: requireValue(t.id, "PUBLIC_TRADE_ID_MISSING"),
            marketId: requireValue(t.marketId, "PUBLIC_TRADE_MARKET_ID_MISSING"),
            action: requireValue(t.action, "PUBLIC_TRADE_ACTION_MISSING"),
            outcome: requireValue(t.outcome, "PUBLIC_TRADE_OUTCOME_MISSING"),
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

        // Comments
        if (commentsRes.status === "fulfilled") {
          const commentsParsed = marketCommentsSchema.parse(commentsRes.value);
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
        } else {
          console.error("Failed to load market comments", commentsRes.reason);
          maybeRequireRelogin(commentsRes.reason);
          setMarketCommentsError(getErrorMessage(commentsRes.reason));
        }
      } catch (err) {
        console.error("Failed to load market insights", err);
        if (!cancelled) {
          maybeRequireRelogin(err);
          setMarketInsightsError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setMarketInsightsLoading(false);
        }
      }
    };

    void fetchInsights();
    const interval = setInterval(() => {
      void fetchInsights();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedMarketId]);

  /**
   * Handle placing a bet (buying shares)
   */
  const handlePlaceBet = async ({
    amount,
    marketId,
    side,
    marketTitle,
  }: {
    amount: number;
    marketId: string;
    side: "YES" | "NO";
    marketTitle: string;
  }) => {
    try {
      // Open the modal immediately so UX is snappy; we’ll flip it to success/error when done.
      setBetConfirm({
        open: true,
        marketTitle,
        side,
        amount,
        newBalance: undefined,
        errorMessage: null,
        isLoading: true,
      });

      if (!user) {
        openAuth("SIGN_IN");
        setBetConfirm({
          open: true,
          marketTitle,
          side,
          amount,
          newBalance: undefined,
          errorMessage: lang === "RU" ? "Войдите, чтобы сделать ставку." : "Please log in to place a bet.",
          isLoading: false,
        });
        return;
      }

      const marketForAsset =
        selectedMarket && selectedMarket.id === marketId
          ? selectedMarket
          : feedMarkets.find((m) => m.id === marketId) || filteredMarkets.find((m) => m.id === marketId) || null;
      const settlementAsset = String(marketForAsset?.settlementAsset || "VCOIN").toUpperCase();
      const isOnChain = settlementAsset === "USDC" || settlementAsset === "USDT";

      // Verify auth is still valid before placing bet (in case cookies expired or weren't set)
      const authCheck = await refreshUser();
      if (!authCheck) {
        const refreshed = await attemptSilentRefresh();
        if (!refreshed) {
          setBetConfirm({
            open: true,
            marketTitle,
            side,
            amount,
            newBalance: undefined,
            errorMessage: lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.",
            isLoading: false,
          });
          return;
        }
      }

      if (isOnChain) {
        if (!user.isAdmin) {
          setBetConfirm({
            open: true,
            marketTitle,
            side,
            amount,
            newBalance: undefined,
            errorMessage:
              lang === "RU"
                ? "Ончейн-ставки временно недоступны."
                : "On-chain bets are temporarily unavailable.",
            isLoading: false,
          });
          return;
        }

        if (settlementAsset !== "USDC") {
          setBetConfirm({
            open: true,
            marketTitle,
            side,
            amount,
            newBalance: undefined,
            errorMessage:
              lang === "RU"
                ? "USDT-ончейн ставки пока не включены."
                : "USDT on-chain bets are not enabled yet.",
            isLoading: false,
          });
          return;
        }

        if (!isWalletConnected || !publicKey) {
          const hasLinkedWallet = Boolean(user.solanaWalletAddress);
          setBetConfirm({
            open: true,
            marketTitle,
            side,
            amount,
            newBalance: undefined,
            errorMessage: hasLinkedWallet
              ? lang === "RU"
                ? "Кошелёк привязан в профиле, но не подключен сейчас. Нажмите Connect."
                : "Wallet is linked in your profile, but not connected right now. Tap Connect to sign."
              : lang === "RU"
                ? "Подключите Solana-кошелёк."
                : "Connect your Solana wallet.",
            isLoading: false,
          });
          return;
        }

      const res = await trpcClient.market.prepareBet.mutate({
          marketId,
          side,
          amount,
          assetCode: "USDC",
          userPubkey: publicKey.toBase58(),
        });
      setLastOnchainTxBase64(res.txBase64);

        const tx = Transaction.from(Buffer.from(res.txBase64, "base64"));
        const signature = await sendOnchainTransaction(tx);
        if (!signature) {
          throw new Error("SIGNATURE_EMPTY");
        }
        await connection.confirmTransaction(signature, "confirmed");

        const finalized = await trpcClient.market.finalizeBet.mutate({
          marketId,
          signature,
        });
        const newBalanceMajor = toMajorUnits(finalized.newBalanceMinor);
        setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));
        setWalletBalanceMajor(newBalanceMajor);

        await loadMarkets();
        await refreshUser();
        await loadMyBets();

        setBetConfirm({
          open: true,
          marketTitle,
          side,
          amount,
          newBalance: newBalanceMajor,
          errorMessage: null,
          isLoading: false,
        });
        return;
      }

      // Legacy VCOIN flow (unchanged)
      const res = await trpcClient.market.placeBet.mutate({
        amount,
        marketId,
        side,
      });

      // Update user balance from response (minor units -> major)
      const newBalanceMajor = toMajorUnits(res.newBalanceMinor);
      setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));
      setWalletBalanceMajor(newBalanceMajor);

      await loadMarkets();
      await refreshUser();
      await loadMyBets();

      setBetConfirm({
        open: true,
        marketTitle,
        side,
        amount,
        newBalance: newBalanceMajor,
        errorMessage: null,
        isLoading: false,
      });
    } catch (err) {
      console.error("placeBet failed", err);
      const friendly = formatBetError(getErrorMessage(err));
      await loadMarkets();
      const refreshedUser = await refreshUser();
      await loadMyBets();
      setBetConfirm({
        open: true,
        marketTitle,
        side,
        amount,
        newBalance: refreshedUser?.balance ?? user?.balance,
        errorMessage: friendly,
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
      setMarketBetIntent({ marketId: market.id, side, nonce: Date.now() });
      setSelectedMarketId(market.id);
      navigateToMarketUrl(market.id, market.titleEn ?? market.titleRu ?? market.title);
    },
    [openAuth, user, reloginRequired, refreshUser, attemptSilentRefresh, navigateToMarketUrl]
  );

  const openMarketWithAuthCheck = useCallback(
    async (market: Market) => {
      const marketId = market.id;
      if (!user) {
        setSelectedMarketId(marketId);
        navigateToMarketUrl(marketId, market.titleEn ?? market.titleRu ?? market.title);
        return;
      }
      if (reloginRequired) {
        try {
          localStorage.setItem("pending_market_id", marketId);
        } catch {
          // ignore
        }
        const refreshed = await attemptSilentRefresh();
        if (!refreshed) return;
      }
      const me = await refreshUser();
      if (!me) {
        try {
          localStorage.setItem("pending_market_id", marketId);
        } catch {
          // ignore
        }
        const refreshed = await attemptSilentRefresh();
        if (!refreshed) return;
      }
      setSelectedMarketId(marketId);
      navigateToMarketUrl(marketId, market.titleEn ?? market.titleRu ?? market.title);
    },
    [user, reloginRequired, refreshUser, attemptSilentRefresh, navigateToMarketUrl]
  );

  const creatorHasBets = useMemo(() => {
    if (!selectedMarketId || !user) return false;
    if (!selectedMarket?.createdBy || selectedMarket.createdBy !== user.id) return false;
    const entry = myCreatedMarkets.find((m) => m.id === selectedMarketId);
    return entry ? entry.hasBets : false;
  }, [selectedMarketId, selectedMarket?.createdBy, user, myCreatedMarkets]);

  const handleUpdateMarket = useCallback(async (payload: {
    marketId: string;
    titleEn: string;
    description?: string | null;
    source?: string | null;
    closesAt?: string | null;
    expiresAt: string;
    categoryId: string;
    imageUrl?: string | null;
  }) => {
    try {
      await trpcClient.market.updateMarket.mutate(payload);
      await loadMarkets();
      setEditMarketOpen(false);
      setEditMarketTarget(null);
    } catch (err) {
      console.error("updateMarket failed", err);
      throw err;
    }
  }, [loadMarkets]);

  const handleDeleteMarket = useCallback(async () => {
    if (!editMarketTarget) return;
    setDeleteMarketError(null);
    try {
      await trpcClient.market.deleteMarket.mutate({ marketId: editMarketTarget.id });
      setDeleteMarketOpen(false);
      setEditMarketTarget(null);
      setSelectedMarketId(null);
      navigateToCatalogUrl();
      await loadMarkets();
    } catch (err) {
      console.error("deleteMarket failed", err);
      setDeleteMarketError(getErrorMessage(err));
    }
  }, [editMarketTarget, loadMarkets, navigateToCatalogUrl]);

  const handleOpenCreateMarket = useCallback(() => {
    if (!user) {
      setPostAuthAction({ type: "OPEN_CREATE_MARKET" });
      if (marketCategories.length === 0 && !loadingMarketCategories) {
        void loadMarketCategories();
      }
      openAuth("SIGN_IN");
      return;
    }
    if (marketCategories.length === 0 && !loadingMarketCategories) {
      void loadMarketCategories();
    }
    setShowAdminModal(true);
  }, [user, marketCategories.length, loadingMarketCategories, loadMarketCategories, openAuth]);

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
        await trpcClient.market.setBookmark.mutate({ marketId, bookmarked });
      } catch (err) {
        console.error("setBookmark failed", err);
        if (previous) setMyBookmarks(previous);
        throw err;
      }
    },
    [openAuth, user]
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

      try {
        const [u, stats, comments, bets] = await Promise.all([
          trpcClient.user.publicUser.query({ userId }),
          trpcClient.user.publicUserStats.query({ userId }),
          trpcClient.user.publicUserComments.query({ userId, limit: 50 }),
          trpcClient.user.publicUserVotes.query({ userId, limit: 200 }),
        ]);

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
            outcome: requireValue(b.outcome, "PUBLIC_BET_OUTCOME_MISSING"),
            lastBetAt: requireValue(b.lastBetAt, "PUBLIC_BET_LAST_BET_AT_MISSING"),
            isActive: Boolean(b.isActive),
          }))
        );
      } catch (err) {
        console.error("openPublicProfile failed", err);
        setPublicProfileError(lang === "RU" ? "Не удалось загрузить профиль" : "Failed to load profile");
      } finally {
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
    if (postAuthAction.type === "OPEN_CREATE_MARKET") {
      setPostAuthAction(null);
      if (marketCategories.length === 0 && !loadingMarketCategories) {
        void loadMarketCategories();
      }
      setShowAdminModal(true);
      return;
    }
    if (postAuthAction.type === "OPEN_MARKET_BET") {
      const action = postAuthAction;
      setPostAuthAction(null);
      setSelectedMarketId(action.marketId);
      const market = markets.find((m) => m.id === action.marketId);
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
        marketTitle: action.marketTitle,
      });
    }
  }, [user, postAuthAction, marketCategories.length, loadingMarketCategories, loadMarketCategories, markets, navigateToMarketUrl]);

  /**
   * Handle selling a position (cash out)
   */
  const handleSellPosition = async ({
    marketId,
    side,
    shares,
  }: {
    marketId: string;
    side: "YES" | "NO";
    shares: number;
  }) => {
    if (!user) return;

    try {
      const marketForAsset =
        selectedMarket && selectedMarket.id === marketId
          ? selectedMarket
          : feedMarkets.find((m) => m.id === marketId) || filteredMarkets.find((m) => m.id === marketId) || null;
      const settlementAsset = String(marketForAsset?.settlementAsset || "VCOIN").toUpperCase();
      const isOnChain = settlementAsset === "USDC" || settlementAsset === "USDT";

      if (isOnChain) {
        if (!user.isAdmin) {
          throw new Error("ONCHAIN_UNAVAILABLE");
        }
        if (!isWalletConnected || !publicKey) {
          throw new Error("WALLET_NOT_CONNECTED");
        }
        const res = await trpcClient.market.prepareSell.mutate({
          marketId,
          side,
          shares,
          assetCode: "USDC",
          userPubkey: publicKey.toBase58(),
        });
        setLastOnchainTxBase64(res.txBase64);
        const tx = Transaction.from(Buffer.from(res.txBase64, "base64"));
        const signature = await sendOnchainTransaction(tx);
        await connection.confirmTransaction(signature, "confirmed");

        const finalized = await trpcClient.market.finalizeSell.mutate({
          marketId,
          signature,
        });
        const newBalanceMajor = toMajorUnits(finalized.newBalanceMinor);
        setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));
        setWalletBalanceMajor(newBalanceMajor);

        await loadMarkets();
        await refreshUser();
        await loadMyBets();
        return;
      }

      const res = await trpcClient.market.sellPosition.mutate({
        marketId,
        side,
        shares,
      });

      const newBalanceMajor = toMajorUnits(res.newBalanceMinor);
      setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));
      setWalletBalanceMajor(newBalanceMajor);

      await loadMarkets();
      await refreshUser();
      await loadMyBets();
    } catch (err) {
      console.error("sellPosition failed", err);
      await loadMarkets();
      await refreshUser();
      await loadMyBets();
      throw err;
    }
  };

  const handleClaimWinnings = async ({
    marketId,
    assetCode,
  }: {
    marketId: string;
    assetCode: "USDC" | "USDT";
  }) => {
    if (!user) return;
    if (!user.isAdmin) {
      throw new Error("ONCHAIN_UNAVAILABLE");
    }
    if (!isWalletConnected || !publicKey) {
      throw new Error("WALLET_NOT_CONNECTED");
    }
    const res = await trpcClient.market.prepareClaim.mutate({
      marketId,
      assetCode: "USDC",
      userPubkey: publicKey.toBase58(),
    });
    setLastOnchainTxBase64(res.txBase64);
    const tx = Transaction.from(Buffer.from(res.txBase64, "base64"));
    const signature = await sendOnchainTransaction(tx);
    await connection.confirmTransaction(signature, "confirmed");

    const finalized = await trpcClient.market.finalizeClaim.mutate({
      marketId,
      signature,
    });
    const newBalanceMajor = toMajorUnits(finalized.newBalanceMinor);
    setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));
    setWalletBalanceMajor(newBalanceMajor);

    await loadMarkets();
    await refreshUser();
    await loadMyBets();
  };

  const handlePostMarketComment = useCallback(
    async (params: { marketId: string; text: string; parentId?: string | null }) => {
      let created: Awaited<ReturnType<typeof trpcClient.market.postMarketComment.mutate>>;
      try {
        created = await trpcClient.market.postMarketComment.mutate({
          marketId: params.marketId,
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
        prev.map((c) => (c.id === res.commentId ? { ...c, likes: res.likesCount, likedByMe: res.likedByMe } : c))
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
                  amount: params.amount,
                  marketTitle: params.marketTitle,
                });
                openAuth("SIGN_UP");
              }}
              lang={lang}
              onResolveOutcome={
                user &&
                selectedMarket.createdBy &&
                selectedMarket.createdBy === user.id &&
                Number.isFinite(Date.parse(selectedMarket.expiresAt)) &&
                Date.now() >= Date.parse(selectedMarket.expiresAt)
                  ? resolveMarketOutcome
                  : undefined
              }
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
              onEditMarket={() => {
                setEditMarketTarget(selectedMarket);
                setEditMarketOpen(true);
              }}
              onDeleteMarket={() => {
                setEditMarketTarget(selectedMarket);
                setDeleteMarketOpen(true);
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

                    {/* Sort / filter */}
                    <div className="px-4 pt-3" data-swipe-ignore="true">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-8">
                          {catalogMarkets.map((market) => (
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
                      const market = markets.find((m) => m.id === marketId);
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
                { id: "HOUR" as const, labelRu: "Закончится в течение часа", labelEn: "Ends within an hour" },
                { id: "DAY" as const, labelRu: "Закончится в течение дня", labelEn: "Ends within a day" },
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
                { id: "CREATED_DESC" as const, labelRu: "Дата создания ↓", labelEn: "Creation date ↓" },
                { id: "CREATED_ASC" as const, labelRu: "Дата создания ↑", labelEn: "Creation date ↑" },
                { id: "ENDING_SOON" as const, labelRu: "Скоро закончится", labelEn: "Ending soon" },
                { id: "VOLUME_DESC" as const, labelRu: "Объём ↓", labelEn: "Volume ↓" },
                { id: "VOLUME_ASC" as const, labelRu: "Объём ↑", labelEn: "Volume ↑" },
              ]).map((opt) => {
                const selected = catalogSort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setCatalogSort(opt.id)}
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

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
        lang={lang}
        onToggleLang={handleToggleLang}
      />
      <AuthModal
        key={`${showAuth ? "open" : "closed"}:${authInitialMode}`}
        isOpen={showAuth}
        onClose={() => {
          setShowAuth(false);
          // If user dismissed auth without logging in, clear deferred actions.
          if (!user) {
            setPostAuthAction(null);
          }
        }}
        onSignUp={handleSignUp}
        onLogin={handleLoginSubmit}
        onTelegramLogin={handleTelegramLogin}
        lang={lang}
        initialMode={authInitialMode}
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
        markets={markets}
        onMarketClick={(marketId) => {
          closePublicProfile();
          setMarketBetIntent(null);
          const market = markets.find((m) => m.id === marketId);
          if (market) {
            void openMarketWithAuthCheck(market);
          } else {
            setSelectedMarketId(marketId);
            navigateToMarketUrl(marketId);
          }
          setCurrentView("CATALOG");
        }}
      />
      <AdminMarketModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        lang={lang}
        categories={marketCategories}
        categoriesLoading={loadingMarketCategories}
        onReloadCategories={loadMarketCategories}
        isAdmin={Boolean(user?.isAdmin)}
        onCreate={async (payload) => {
          try {
            await trpcClient.market.createMarket.mutate(payload);
            await loadMarkets();
            setShowAdminModal(false);
          } catch (err) {
            console.error("Failed to create market", err);
            throw err;
          }
        }}
      />
      <AdminMarketModal
        isOpen={editMarketOpen}
        onClose={() => {
          setEditMarketOpen(false);
          setEditMarketTarget(null);
        }}
        lang={lang}
        categories={marketCategories}
        categoriesLoading={loadingMarketCategories}
        onReloadCategories={loadMarketCategories}
        isAdmin={Boolean(user?.isAdmin)}
        mode="edit"
        marketId={editMarketTarget?.id}
        initialValues={
          editMarketTarget
            ? {
                titleEn: editMarketTarget.titleEn ?? editMarketTarget.title,
                description: editMarketTarget.description ?? null,
                source: editMarketTarget.source ?? null,
                closesAt: toLocalDateTimeInput(editMarketTarget.closesAt),
                expiresAt: toLocalDateTimeInput(editMarketTarget.expiresAt),
                categoryId: editMarketTarget.categoryId ?? "",
                imageUrl: editMarketTarget.imageUrl ?? null,
              }
            : undefined
        }
        onCreate={async () => undefined}
        onUpdate={handleUpdateMarket}
      />
      {deleteMarketOpen && editMarketTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteMarketOpen(false)} />
          <div className="relative bg-black border border-zinc-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
            <button
              onClick={() => setDeleteMarketOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-red-400" size={24} />
              <h2 className="text-xl font-bold text-white">
                {lang === "RU" ? "Удалить рынок?" : "Delete market?"}
              </h2>
            </div>
            <p className="text-sm text-zinc-300 mb-6">
              {lang === "RU"
                ? "Рынок будет удален без возможности восстановления. Это возможно только если ставок еще нет."
                : "This will permanently delete the market. This is only possible if there are no bets yet."}
            </p>
            {deleteMarketError && (
              <div className="mb-4 text-xs text-red-400">{deleteMarketError}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => setDeleteMarketOpen(false)}>
                {lang === "RU" ? "Отмена" : "Cancel"}
              </Button>
              <Button variant="destructive" onClick={handleDeleteMarket}>
                {lang === "RU" ? "Удалить" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
