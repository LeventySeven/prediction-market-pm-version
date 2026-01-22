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

export default function HomePage() {
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("SIGN_IN");
  const [showReloginWarning, setShowReloginWarning] = useState(false);
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
  const reloginPromptShownRef = useRef(false);
  // Wallet state (Solana Wallet Adapter)
  const { publicKey, connected: isWalletConnected, sendTransaction } = useWallet();
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

  useEffect(() => {
    if (!user) return;

    // Solana pubkeys are base58 (case-sensitive) - do NOT lowercase them
    const walletPubkey = connectedWalletAddress ?? null;
    const dbPubkey = user.solanaWalletAddress ? String(user.solanaWalletAddress) : null;
    const dbCluster = user.solanaCluster ? String(user.solanaCluster).toLowerCase() : null;

    const syncKey = `${user.id}:${walletPubkey ?? "none"}:${solanaCluster}:${isWalletConnected ? "1" : "0"}`;
    if (walletSyncInFlight.current) return;
    if (lastWalletSyncKey.current === syncKey) return;

    // If wallet is disconnected, unlink (best effort).
    if (!isWalletConnected || !walletPubkey) {
      if (!dbPubkey) {
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
            const linked = await trpcClient.user.linkWallet.mutate({
              solanaWalletAddress: walletPubkey,
              solanaCluster,
            });
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
            await trpcClient.user.updateWalletChain.mutate({ solanaCluster });
            setUser((prev) => (prev ? { ...prev, solanaCluster } : prev));
          }
        } catch (err) {
          console.warn("wallet sync failed (ignored)", err);
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

  const getTelegramInitDataFromUrl = () => {
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
  };

  const getTelegramInitData = () => {
    if (typeof window === "undefined") return null;
    const initData = window.Telegram?.WebApp?.initData;
    if (typeof initData === "string" && initData.trim().length > 0) return initData;
    return getTelegramInitDataFromUrl();
  };

  const getMarketIdFromUrl = () => {
    if (typeof window === "undefined") return null;
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get("marketId") || url.searchParams.get("m");
      if (!id) return null;
      const v = id.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      return isUuid ? v : null;
    } catch {
      return null;
    }
  };

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
  const [currentView, setCurrentView] = useState<ViewType>("CATALOG");
  const shellSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const [myPositions, setMyPositions] = useState<Position[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [myBetsLoading, setMyBetsLoading] = useState(false);
  const [myBetsError, setMyBetsError] = useState<string | null>(null);
  const myBetsLoadingRef = useRef(false);
  const [myCommentsLoading, setMyCommentsLoading] = useState(false);
  const [myCommentsError, setMyCommentsError] = useState<string | null>(null);
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

  const triggerRelogin = useCallback(() => {
    setReloginRequired(true);
    // Only show the warning modal once until auth succeeds again.
    if (!reloginPromptShownRef.current) {
      reloginPromptShownRef.current = true;
      setShowReloginWarning(true);
    }
  }, []);

  const clearRelogin = useCallback(() => {
    setReloginRequired(false);
    reloginPromptShownRef.current = false;
  }, []);

  const formatBetError = (msg?: string) => {
    if (!msg) return lang === "RU" ? "Не удалось поставить ставку" : "Failed to place bet";
    const upper = msg.toUpperCase();
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
    if (upper.includes("ASSET_DISABLED")) {
      return lang === "RU" ? "Этот актив сейчас недоступен." : "Settlement asset is disabled.";
    }
    return msg;
  };

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
    setUser({
      id: String(me.user.id),
      email: me.user.email,
      username: me.user.username,
      name: me.user.displayName ?? me.user.username,
      createdAt: me.user.createdAt,
      avatarUrl: me.user.avatarUrl ?? null,
      telegramPhotoUrl: me.user.telegramPhotoUrl ?? null,
      avatar: me.user.avatarUrl ?? me.user.telegramPhotoUrl ?? undefined,
      balance: me.user.balance,
      isAdmin: me.user.isAdmin,
      referralCode: me.user.referralCode,
      referralCommissionRate: me.user.referralCommissionRate,
      referralEnabled: me.user.referralEnabled,
    });

    // If user came from a deep link, keep them on that market after signup.
    try {
      const pendingMarketId = localStorage.getItem("pending_market_id");
      if (pendingMarketId) {
        setSelectedMarketId(pendingMarketId);
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
    setUser({
      id: String(me.user.id),
      email: me.user.email,
      username: me.user.username,
      name: me.user.displayName ?? me.user.username,
      createdAt: me.user.createdAt,
      avatarUrl: me.user.avatarUrl ?? null,
      telegramPhotoUrl: me.user.telegramPhotoUrl ?? null,
      avatar: me.user.avatarUrl ?? me.user.telegramPhotoUrl ?? undefined,
      balance: me.user.balance,
      isAdmin: me.user.isAdmin,
      referralCode: me.user.referralCode,
      referralCommissionRate: me.user.referralCommissionRate,
      referralEnabled: me.user.referralEnabled,
    });

    // If user came from a deep link, keep them on that market after login.
    try {
      const pendingMarketId = localStorage.getItem("pending_market_id");
      if (pendingMarketId) {
        setSelectedMarketId(pendingMarketId);
        setCurrentView("CATALOG");
        localStorage.removeItem("pending_market_id");
      }
    } catch {
      // ignore
    }
  };

  const handleTelegramLogin = useCallback(async (initData: string) => {
    const res = await trpcClient.auth.telegramLogin.mutate({ initData });
    clearRelogin();
    setUser({
      id: String(res.user.id),
      email: res.user.email,
      username: res.user.username,
      name: res.user.displayName ?? res.user.username,
      createdAt: res.user.createdAt,
      avatarUrl: res.user.avatarUrl ?? null,
      telegramPhotoUrl: res.user.telegramPhotoUrl ?? null,
      avatar: res.user.avatarUrl ?? res.user.telegramPhotoUrl ?? undefined,
      balance: res.user.balance,
      isAdmin: res.user.isAdmin,
      referralCode: res.user.referralCode,
      referralCommissionRate: res.user.referralCommissionRate,
      referralEnabled: res.user.referralEnabled,
    });
  }, [clearRelogin]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await trpcClient.auth.me.query();
      if (me) {
        clearRelogin();
        setUser({
          id: String(me.id),
          email: me.email,
          username: me.username,
          name: me.displayName ?? me.username,
          createdAt: me.createdAt,
          avatarUrl: me.avatarUrl ?? null,
          telegramPhotoUrl: me.telegramPhotoUrl ?? null,
          avatar: me.avatarUrl ?? me.telegramPhotoUrl ?? undefined,
          balance: me.balance,
          isAdmin: me.isAdmin,
          referralCode: me.referralCode,
          referralCommissionRate: me.referralCommissionRate,
          referralEnabled: me.referralEnabled,
        });
        return me;
      }
    } catch (err) {
      console.error("Failed to refresh session user", err);
    }
    return null;
  }, [clearRelogin]);

  // If auth expires while the UI still thinks we have a user, prompt re-login as soon as they enter a market.
  useEffect(() => {
    if (!selectedMarketId) return;
    if (!user) return;
    if (reloginRequired) return;
    void (async () => {
      const me = await refreshUser();
      if (!me) {
        triggerRelogin();
        setUser(null);
      }
    })();
  }, [selectedMarketId, user, reloginRequired, refreshUser, triggerRelogin]);

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
    }
  }, []);

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
      const [positionsRaw, tradesRaw, bookmarksRaw] = await Promise.all([
        trpcClient.market.myPositions.query(),
        trpcClient.market.myTrades.query(),
        trpcClient.market.myBookmarks.query(),
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
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error("Failed to load positions/trades", { error: errorMsg, err, userId: user?.id });
      // If it's an auth error, show re-login warning
      if (errorMsg?.toUpperCase().includes("UNAUTHORIZED") || errorMsg?.toUpperCase().includes("NOT AUTHENTICATED")) {
        triggerRelogin();
        setUser(null);
        setMyBetsError(lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.");
      } else {
        setMyBetsError(lang === "RU" ? "Не удалось загрузить ставки." : "Failed to load bets.");
      }
    }
    finally {
      myBetsLoadingRef.current = false;
      setMyBetsLoading(false);
    }
  }, [user, lang]);

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

      const mapped: Market[] = response?.map((m) => {
        const title = lang === "RU" ? m.titleRu : m.titleEn;
        const chance = Math.round(m.priceYes * 100);

        return {
          id: String(m.id),
          title,
          titleRu: m.titleRu,
          titleEn: m.titleEn,
          state: m.state as Market["state"],
          outcome: m.outcome,
          createdBy: m.createdBy ?? null,
          createdAt: m.createdAt,
          categoryId: m.categoryId ?? null,
          categoryLabelRu: m.categoryLabelRu ?? null,
          categoryLabelEn: m.categoryLabelEn ?? null,
          imageUrl: (m as { imageUrl?: string }).imageUrl?.trim() || buildInitialsAvatarDataUrl(title, { bg: "#111111", fg: "#ffffff" }),
          volume: `$${m.volume.toFixed(2)}`,
          closesAt: m.closesAt,
          expiresAt: m.expiresAt,
          yesPrice: Number(m.priceYes.toFixed(4)),
          noPrice: Number(m.priceNo.toFixed(4)),
          chance,
          description: m.description ?? (lang === "RU" ? "Описание будет добавлено." : "Description coming soon."),
          source: (m as { source?: string | null }).source ?? null,
          history: [],
          comments: [],
          liquidityB: m.liquidityB,
          feeBps: m.feeBps,
          settlementAsset: m.settlementAsset,
        };
      }) ?? [];
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
        triggerRelogin();
        setUser(null);
        setMyCommentsError(lang === "RU" ? "Требуется повторная авторизация." : "Re-authentication required.");
      } else {
        setMyCommentsError(lang === "RU" ? "Не удалось загрузить комментарии." : "Failed to load comments.");
      }
    }
    finally {
      setMyCommentsLoading(false);
    }
  }, [user, lang]);
  useEffect(() => {
    if (!user) {
      setMyPositions([]);
      setMyTrades([]);
      setMyBookmarks([]);
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

  // Calculate total PNL from all transactions
  const totalPnl = useMemo(() => {
    // Realized PNL from sold trades
    const realizedFromSells = soldTrades.reduce((acc, trade) => acc + Number(trade.realizedPnl ?? 0), 0);
    
    // Calculate cost basis from all buy trades
    const totalSpent = myTrades
      .filter(t => t.action === 'buy')
      .reduce((acc, trade) => acc + Math.abs(trade.collateralGross) + trade.fee, 0);
    
    // Calculate proceeds from all sell trades
    const totalReceived = myTrades
      .filter(t => t.action === 'sell')
      .reduce((acc, trade) => acc + Math.abs(trade.collateralNet), 0);
    
    // Calculate value of resolved positions (if won, shares * $1)
    const resolvedPositionsValue = myPositions
      .filter(p => p.marketState === 'resolved' && p.marketOutcome === p.outcome)
      .reduce((acc, pos) => acc + pos.shares, 0);
    
    // Total PNL = (received + resolved value) - spent
    return totalReceived + resolvedPositionsValue - totalSpent;
  }, [soldTrades, myTrades, myPositions]);

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
      if (view === "FRIENDS") {
        void loadLeaderboard();
      } else if (view === "FEED" || view === "CATALOG") {
        // Refresh markets when returning to feed or catalog to show updated percentages
        void loadMarkets();
      }
    },
    [loadLeaderboard, loadMarkets]
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
        triggerRelogin();
        setUser(null);
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

      if (isOnChain) {
        // During Solana migration we intentionally disable EVM on-chain flows here.
        // These will be re-enabled once the Solana program + tx-prep endpoints are implemented.
        setBetConfirm({
          open: true,
          marketTitle,
          side,
          amount,
          newBalance: undefined,
          errorMessage:
            lang === "RU"
              ? "Ончейн рынки (USDC/USDT) временно недоступны: переносим их на Solana."
              : "On-chain USDC/USDT markets are temporarily unavailable while migrating to Solana.",
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
      await refreshUser();
      await loadMyBets();
      setBetConfirm({
        open: true,
        marketTitle,
        side,
        amount,
        newBalance: user?.balance,
        errorMessage: friendly,
        isLoading: false,
      });
    }
  };

  const handleOpenMarketBet = useCallback(
    (market: Market, side: "YES" | "NO") => {
      setMarketBetIntent({ marketId: market.id, side, nonce: Date.now() });
      setSelectedMarketId(market.id);
      if (!user) {
        setPostAuthAction({ type: "OPEN_MARKET_BET", marketId: market.id, side });
        openAuth("SIGN_UP");
      }
    },
    [openAuth, user]
  );

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
      setMarketBetIntent({ marketId: action.marketId, side: action.side, nonce: Date.now() });
      return;
    }
    if (postAuthAction.type === "PLACE_BET") {
      const action = postAuthAction;
      setPostAuthAction(null);
      setSelectedMarketId(action.marketId);
      void handlePlaceBet({
        amount: action.amount,
        marketId: action.marketId,
        side: action.side,
        marketTitle: action.marketTitle,
      });
    }
  }, [user, postAuthAction, marketCategories.length, loadingMarketCategories, loadMarketCategories]);

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
        throw new Error("SOLANA_ONCHAIN_TEMP_DISABLED");
      }

      const res = await trpcClient.market.sellPosition.mutate({
        marketId,
        side,
        shares,
      });

      const newBalanceMajor = toMajorUnits(res.newBalanceMinor);
      setUser((prev) => (prev ? { ...prev, balance: newBalanceMajor } : prev));

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
    throw new Error("SOLANA_ONCHAIN_TEMP_DISABLED");
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
                                setSelectedMarketId(market.id);
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
                                  setSelectedMarketId(market.id);
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
                                setSelectedMarketId(market.id);
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
                    balanceMajor={user?.balance ?? 0}
                    pnlMajor={totalPnl}
                    bets={legacyBets}
                    betsLoading={myBetsLoading}
                    betsError={myBetsError}
                    soldTrades={soldTrades}
                    comments={myComments}
                    commentsLoading={myCommentsLoading}
                    commentsError={myCommentsError}
                    bookmarks={bookmarkedMarkets}
                    onSellPosition={handleSellPosition}
                    onLoadBets={() => void loadMyBets()}
                    onLoadComments={() => void loadMyComments()}
                    onMarketClick={(marketId) => {
                      setMarketBetIntent(null); // Clear bet intent when clicking from profile
                      setSelectedMarketId(marketId);
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" data-swipe-ignore="true">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setCatalogFiltersOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
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
                { id: "ENDING_SOON" as const, labelRu: "Скоро закончится", labelEn: "Ending soon" },
                { id: "CREATED_DESC" as const, labelRu: "Сначала новые", labelEn: "Newest" },
                { id: "CREATED_ASC" as const, labelRu: "Сначала старые", labelEn: "Oldest" },
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
          setSelectedMarketId(marketId);
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
      {/* Re-login warning modal */}
      {showReloginWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowReloginWarning(false)} />
          <div className="relative bg-black border border-zinc-900 w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in-up">
            <button
              onClick={() => setShowReloginWarning(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-yellow-400" size={24} />
              <h2 className="text-xl font-bold text-white">
                {lang === "RU" ? "Требуется повторная авторизация" : "Re-authentication Required"}
              </h2>
            </div>
            <p className="text-sm text-zinc-300 mb-6">
              {lang === "RU"
                ? "По соображениям безопасности необходимо войти в систему снова. Пожалуйста, войдите в свой аккаунт."
                : "For security reasons, you need to log in again. Please sign in to your account."}
            </p>
            <button
              onClick={() => {
                setShowReloginWarning(false);
                openAuth("SIGN_IN");
              }}
              className="w-full px-4 py-2.5 text-sm font-semibold text-black bg-[rgba(190,255,29,1)] hover:bg-[rgba(190,255,29,0.90)] rounded-lg transition-colors"
            >
              {lang === "RU" ? "ОК" : "OK"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
