'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthModal, { type AuthMode } from "@/components/AuthModal";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import BetConfirmModal from "@/components/BetConfirmModal";
import AdminMarketModal from "@/components/AdminMarketModal";
import ProfilePage from "@/components/ProfilePage";
import type { Market, User, Bet, Position, Trade, PriceCandle, PublicTrade, LeaderboardUser, Comment as MarketComment } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search, Plus } from "lucide-react";
import BottomMenu, { type ViewType } from "@/components/BottomMenu";
import FriendsPage from "@/components/FriendsPage";
import { leaderboardUsersSchema } from "@/src/schemas/leaderboard";
import { positionsSchema, tradesSchema } from "@/src/schemas/portfolio";
import { priceCandlesSchema, publicTradesSchema } from "@/src/schemas/marketInsights";
import { marketCommentsSchema } from "@/src/schemas/comments";
import { marketCategoriesSchema } from "@/src/schemas/marketCategories";
import { myCommentsSchema } from "@/src/schemas/myComments";
import { buildInitialsAvatarDataUrl } from "@/lib/avatar";

// VCOIN decimals for display
const VCOIN_DECIMALS = 6;
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

export default function HomePage() {
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("SIGN_IN");
  type PostAuthAction =
    | { type: "OPEN_CREATE_MARKET" }
    | { type: "PLACE_BET"; marketId: string; side: "YES" | "NO"; amount: number; marketTitle: string }
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
  const [currentView, setCurrentView] = useState<ViewType>("EVENTS");

  const [myPositions, setMyPositions] = useState<Position[]>([]);
  const [myTrades, setMyTrades] = useState<Trade[]>([]);
  const [marketsLoadingMessage, setMarketsLoadingMessage] = useState<string | null>(null);
  const [betConfirm, setBetConfirm] = useState<{
    open: boolean;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number;
    newBalance?: number;
    errorMessage?: string | null;
  }>({ open: false, marketTitle: "", side: "YES", amount: 0, newBalance: undefined, errorMessage: null });
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [marketCandles, setMarketCandles] = useState<PriceCandle[]>([]);
  const [marketPublicTrades, setMarketPublicTrades] = useState<PublicTrade[]>([]);
  const [marketComments, setMarketComments] = useState<MarketComment[]>([]);
  const [marketInsightsLoading, setMarketInsightsLoading] = useState(false);
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
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

  const formatBetError = (msg?: string) => {
    if (!msg) return lang === "RU" ? "Не удалось поставить ставку" : "Failed to place bet";
    const upper = msg.toUpperCase();
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

  const loadLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const usersRaw = await trpcClient.user.leaderboard.query({ limit: 25 });
      const users: LeaderboardUser[] = leaderboardUsersSchema.parse(usersRaw);
      setLeaderboardUsers(users);
    } catch (err) {
      console.error("Failed to load leaderboard", err);
      setLeaderboardError(lang === "RU" ? "Не удалось загрузить лидерборд" : "Failed to load leaderboard");
      // Keep the previous list if we have one; avoid flashing "No data yet" on transient errors.
      setLeaderboardUsers((prev) => prev);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

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
  };

  const handleTelegramLogin = useCallback(async (initData: string) => {
    const res = await trpcClient.auth.telegramLogin.mutate({ initData });
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
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await trpcClient.auth.me.query();
      if (me) {
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
  }, []);

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
      setCurrentView("EVENTS");
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
    try {
      const [positionsRaw, tradesRaw] = await Promise.all([
        trpcClient.market.myPositions.query(),
        trpcClient.market.myTrades.query(),
      ]);

      const positionsParsed = positionsSchema.parse(positionsRaw);
      const tradesParsed = tradesSchema.parse(tradesRaw);

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
    } catch (err) {
      console.error("Failed to load positions/trades", err);
    }
  }, [user]);

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
          categoryId: m.categoryId ?? null,
          categoryLabelRu: m.categoryLabelRu ?? null,
          categoryLabelEn: m.categoryLabelEn ?? null,
          imageUrl: buildInitialsAvatarDataUrl(title, { bg: "#111111", fg: "#ffffff" }),
          volume: `$${m.volume.toFixed(2)}`,
          closesAt: m.closesAt,
          expiresAt: m.expiresAt,
          yesPrice: Number(m.priceYes.toFixed(4)),
          noPrice: Number(m.priceNo.toFixed(4)),
          chance,
          description: m.description ?? (lang === "RU" ? "Описание будет добавлено." : "Description coming soon."),
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
      setMarketsLoadingMessage(lang === "RU" ? "Не удалось загрузить рынки, попробуйте позже." : "Failed to load markets.");
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
    }
  }, [user]);
  useEffect(() => {
    if (!user) {
      setMyPositions([]);
      setMyTrades([]);
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

  const realizedPnl = useMemo(
    () => soldTrades.reduce((acc, trade) => acc + Number(trade.realizedPnl ?? 0), 0),
    [soldTrades]
  );

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

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId),
    [selectedMarketId, markets]
  );

  useEffect(() => {
    if (!selectedMarketId) {
      setMarketCandles([]);
      setMarketPublicTrades([]);
      setMarketComments([]);
      setMarketInsightsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchInsights = async () => {
      setMarketInsightsLoading(true);
      try {
        const [candlesRaw, tradesRaw, commentsRaw] = await Promise.all([
          trpcClient.market.getPriceCandles.query({ marketId: selectedMarketId, limit: 200 }),
          trpcClient.market.getPublicTrades.query({ marketId: selectedMarketId, limit: 50 }),
          trpcClient.market.getMarketComments.query({ marketId: selectedMarketId, limit: 50 }),
        ]);
        if (cancelled) return;
        const candlesParsed = priceCandlesSchema.parse(candlesRaw);
        const tradesParsed = publicTradesSchema.parse(tradesRaw);
        const commentsParsed = marketCommentsSchema.parse(commentsRaw);

        const candles: PriceCandle[] = candlesParsed.map((c) => ({
          bucket: requireValue(c.bucket, "CANDLE_BUCKET_MISSING"),
          open: requireValue(c.open, "CANDLE_OPEN_MISSING"),
          high: requireValue(c.high, "CANDLE_HIGH_MISSING"),
          low: requireValue(c.low, "CANDLE_LOW_MISSING"),
          close: requireValue(c.close, "CANDLE_CLOSE_MISSING"),
          volume: requireValue(c.volume, "CANDLE_VOLUME_MISSING"),
          tradesCount: requireValue(c.tradesCount, "CANDLE_TRADES_COUNT_MISSING"),
        }));

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

        setMarketCandles(candles);
        setMarketPublicTrades(trades);
        setMarketComments(uiComments);
      } catch (err) {
        console.error("Failed to load market insights", err);
        if (!cancelled) {
          setMarketCandles([]);
          setMarketPublicTrades([]);
          setMarketComments([]);
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
      if (!user) {
        openAuth("SIGN_IN");
        setBetConfirm({
          open: true,
          marketTitle,
          side,
          amount,
          newBalance: undefined,
          errorMessage: lang === "RU" ? "Войдите, чтобы сделать ставку." : "Please log in to place a bet.",
        });
        return;
      }

      const res = await trpcClient.market.placeBet.mutate({
        amount,
        marketId,
        side,
      });

      // Update user balance from response (minor units -> major)
      const newBalanceMajor = toMajorUnits(res.newBalanceMinor);
      setUser((prev) =>
        prev ? { ...prev, balance: newBalanceMajor } : prev
      );

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
      });
    }
  };

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
      const res = await trpcClient.market.sellPosition.mutate({
        marketId,
        side,
        shares,
      });

      const newBalanceMajor = toMajorUnits(res.newBalanceMinor);
      setUser((prev) =>
        prev ? { ...prev, balance: newBalanceMajor } : prev
      );

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

  const handlePostMarketComment = useCallback(
    async (params: { marketId: string; text: string; parentId?: string | null }) => {
      const created = await trpcClient.market.postMarketComment.mutate({
        marketId: params.marketId,
        body: params.text,
        parentId: params.parentId ?? null,
      });
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
    [lang]
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
      if (previous) {
        setMarketComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, likes: previous.likes, likedByMe: previous.likedByMe } : c))
        );
      }
      throw err;
    }
  }, []);

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
              setCurrentView("EVENTS");
            }}
            lang={lang}
            onToggleLang={handleToggleLang}
          />
          <main className="pb-24">
            <MarketPage
              market={selectedMarket}
              user={user}
              onBack={() => setSelectedMarketId(null)}
              onLogin={() => openAuth("SIGN_IN")}
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
                user && selectedMarket.createdBy && selectedMarket.createdBy === user.id ? resolveMarketOutcome : undefined
              }
              onPlaceBet={handlePlaceBet}
              onSellPosition={handleSellPosition}
              comments={marketComments}
              onPostComment={handlePostMarketComment}
              onToggleCommentLike={handleToggleMarketCommentLike}
              userPositions={myPositions.filter((p) => p.marketId === selectedMarket.id)}
              priceCandles={marketCandles}
              publicTrades={marketPublicTrades}
              insightsLoading={marketInsightsLoading}
            />
          </main>
          <BottomMenu
            currentView={currentView}
            lang={lang}
            user={user}
            onLoginRequest={() => openAuth("SIGN_IN")}
            onChange={(view) => {
              // Bottom nav always navigates back to the main shell
              setSelectedMarketId(null);

              setCurrentView(view);
              if (view === "PROFILE") {
                void loadMyBets();
                void loadMyComments();
              }
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
              setSelectedMarketId(null);
              setCurrentView("EVENTS");
            }}
            lang={lang}
            onToggleLang={handleToggleLang}
          />

          <main className="mx-auto w-full max-w-7xl pb-24">
            {currentView === "EVENTS" && (
              <>
                {/* Mobile search (desktop search is in Header) */}
                <div className="px-4 pt-4 pb-3 md:hidden">
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
                  <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    <button
                      type="button"
                      onClick={() => setActiveCategoryId("all")}
                      className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider transition ${
                        activeCategoryId === "all"
                          ? "border-[#BEFF1D] bg-[rgba(190,255,29,0.10)] text-[#BEFF1D]"
                          : "border-zinc-900 bg-black text-zinc-400 hover:text-white hover:border-zinc-700"
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
                              ? "border-[#BEFF1D] bg-[rgba(190,255,29,0.10)] text-[#BEFF1D]"
                              : "border-zinc-900 bg-black text-zinc-400 hover:text-white hover:border-zinc-700"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-4 pt-4">
                  {loadingMarkets ? (
                    <div className="text-center py-10 text-zinc-500">
                      {marketsLoadingMessage || (lang === "RU" ? "Загрузка рынков..." : "Loading markets...")}
                    </div>
                  ) : filteredMarkets.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4">
                      {filteredMarkets.map((market) => (
                        <MarketCard
                          key={market.id}
                          market={market}
                          onClick={() => setSelectedMarketId(market.id)}
                          lang={lang}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20 text-zinc-500 px-4">
                      <p className="text-lg mb-2">{lang === "RU" ? "Ничего не найдено" : "Nothing found"}</p>
                      <p className="text-sm">{lang === "RU" ? "Попробуйте другой запрос" : "Try a different search"}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {currentView === "FRIENDS" && (
              <FriendsPage
                lang={lang}
                user={user}
                leaderboardUsers={leaderboardUsers}
                leaderboardLoading={loadingLeaderboard}
                leaderboardError={leaderboardError}
                onLogin={() => openAuth("SIGN_IN")}
                onCreateReferralLink={handleCreateReferralLink}
              />
            )}

            {currentView === "PROFILE" && (
              <ProfilePage
                user={user}
                lang={lang}
                onLogin={() => openAuth("SIGN_IN")}
                onLogout={handleLogout}
                onUpdateDisplayName={handleUpdateDisplayName}
                onUpdateAvatarUrl={handleUpdateAvatarUrl}
                balanceMajor={user?.balance ?? 0}
                pnlMajor={realizedPnl}
                bets={legacyBets}
                soldTrades={soldTrades}
                comments={myComments}
                onMarketClick={(marketId) => setSelectedMarketId(marketId)}
              />
            )}
          </main>

          <BottomMenu
            currentView={currentView}
            lang={lang}
            user={user}
            onLoginRequest={() => openAuth("SIGN_IN")}
            onChange={(view) => {
              setCurrentView(view);
              if (view === "PROFILE") {
                void loadMyBets();
                void loadMyComments();
              }
              if (view === "FRIENDS") {
                void loadLeaderboard();
              }
            }}
          />

          {currentView === "EVENTS" && (
            <button
              type="button"
              onClick={() => {
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
              }}
              className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-black border border-[#BEFF1D] text-[#BEFF1D] flex items-center justify-center shadow-xl shadow-black/30 ring-1 ring-white/10 hover:bg-[rgba(190,255,29,0.08)] active:scale-[0.98] transition"
              aria-label={lang === "RU" ? "Создать рынок" : "Create market"}
              title={lang === "RU" ? "Создать рынок" : "Create market"}
            >
              <Plus size={22} />
            </button>
          )}
        </>
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
    </div>
  );
}
