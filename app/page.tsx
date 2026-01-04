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
import type { Category, Market, User, Bet, Position, Trade, PriceCandle, PublicTrade, LeaderboardUser } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search, Plus } from "lucide-react";
import BottomMenu, { type ViewType } from "@/components/BottomMenu";
import FriendsPage from "@/components/FriendsPage";
import { leaderboardUsersSchema } from "@/src/schemas/leaderboard";

// VCOIN decimals for display
const VCOIN_DECIMALS = 6;
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("SIGN_IN");
  const [lang, setLang] = useState<"RU" | "EN">("RU");
  const [user, setUser] = useState<User | null>(null);
  const [pendingReferralCode, setPendingReferralCode] = useState<string | null>(null);
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
    const w = window as unknown as {
      Telegram?: { WebApp?: { initData?: unknown } };
    };
    const initData = w.Telegram?.WebApp?.initData;
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
  const [marketInsightsLoading, setMarketInsightsLoading] = useState(false);
  const [leaderboardUsers, setLeaderboardUsers] = useState<LeaderboardUser[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const getUnknownErrorMessage = (error: unknown): string | undefined => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (isRecord(error)) {
      if (typeof error.message === "string") {
        return error.message;
      }
      const data = error.data;
      if (isRecord(data) && typeof data.message === "string") {
        return data.message;
      }
    }
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
    try {
      const usersRaw = await trpcClient.user.leaderboard.query({ limit: 25 });
      const users: LeaderboardUser[] = leaderboardUsersSchema.parse(usersRaw);
      setLeaderboardUsers(users);
    } catch (err) {
      console.error("Failed to load leaderboard", err);
      setLeaderboardUsers([]);
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

  // Capture referral code from URL (e.g. ?ref=CODE) and keep it until signup completes.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("ref") || params.get("invite") || params.get("r");
      const stored = localStorage.getItem("pending_referral_code");
      const next = (fromUrl || stored || "").trim();
      if (next) {
        setPendingReferralCode(next);
        localStorage.setItem("pending_referral_code", next);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem("hasSeenOnboarding", "true");
  };

  const handleToggleLang = () => {
    setLang((prev) => (prev === "RU" ? "EN" : "RU"));
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
          balance: me.balance,
          isAdmin: me.isAdmin,
          referralCode: me.referralCode,
          referralCommissionRate: me.referralCommissionRate,
          referralEnabled: me.referralEnabled,
        });
        return me;
      }
    } catch (err: unknown) {
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

  const handleCreateReferralLink = useCallback(async () => {
    const res = await trpcClient.user.createReferralLink.mutate();

    const isReferralLinkResult = (
      value: unknown
    ): value is { referralCode: string; referralCommissionRate: number; referralEnabled: boolean } => {
      if (!isRecord(value)) return false;
      return (
        typeof value.referralCode === "string" &&
        value.referralCode.length > 0 &&
        typeof value.referralCommissionRate === "number" &&
        Number.isFinite(value.referralCommissionRate) &&
        typeof value.referralEnabled === "boolean"
      );
    };

    if (!isReferralLinkResult(res)) {
      throw new Error("INVALID_REFERRAL_RESPONSE");
    }

    const { referralCode, referralCommissionRate, referralEnabled } = res;

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
    } catch (err: unknown) {
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
      const [positions, trades] = await Promise.all([
        trpcClient.market.myPositions.query(),
        trpcClient.market.myTrades.query(),
      ]);

      setMyPositions(positions as Position[]);
      setMyTrades(trades as Trade[]);
    } catch (err: unknown) {
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
          } catch (err: unknown) {
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

        // Build simple history from current price
        const history = [
          { date: "T-1", value: 50 },
          { date: "Now", value: chance },
        ];

        return {
          id: String(m.id),
          title,
          titleRu: m.titleRu,
          titleEn: m.titleEn,
          state: m.state as Market["state"],
          outcome: m.outcome,
          category: "ALL" as Category,
          imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random&color=fff&size=128`,
          volume: `$${m.volume.toFixed(2)}`,
          closesAt: m.closesAt,
          expiresAt: m.expiresAt,
          yesPrice: Number(m.priceYes.toFixed(4)),
          noPrice: Number(m.priceNo.toFixed(4)),
          chance,
          description: m.description ?? (lang === "RU" ? "Описание будет добавлено." : "Description coming soon."),
          history,
          comments: [],
          liquidityB: m.liquidityB,
          feeBps: m.feeBps,
          settlementAsset: m.settlementAsset,
        };
      }) ?? [];
      setMarkets(mapped);
    } catch (err: unknown) {
      console.error("Failed to load markets", err);
      setMarketsLoadingMessage(lang === "RU" ? "Не удалось загрузить рынки, попробуйте позже." : "Failed to load markets.");
      setMarkets([]);
    } finally {
      setLoadingMarkets(false);
      setMarketsLoadingMessage(null);
    }
  }, [lang]);
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
  }, [loadMarkets]);

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
      if (!user || !user.isAdmin) {
        throw new Error("UNAUTHORIZED");
      }
      await trpcClient.market.resolveMarket.mutate({ marketId, outcome });
      await loadMarkets();
      await loadMyBets();
      await refreshUser();
    },
    [user, loadMarkets, loadMyBets, refreshUser]
  );

  // Refresh positions/trades periodically while Profile screen is open (it contains bet history now)
  useEffect(() => {
    if (currentView !== "PROFILE" || !user) return;
    void loadMyBets();
    const id = setInterval(() => {
      void loadMyBets();
    }, 15000);
    return () => clearInterval(id);
  }, [currentView, user, loadMyBets]);

  const filteredMarkets = useMemo(
    () =>
      markets.filter((market) => {
        const matchesCategory =
          activeCategory === "ALL" || market.category === activeCategory;
        const targetTitle = lang === "RU" ? market.titleRu : market.titleEn;
        const matchesSearch = targetTitle
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [activeCategory, searchQuery, markets, lang]
  );

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId),
    [selectedMarketId, markets]
  );

  useEffect(() => {
    if (!selectedMarketId) {
      setMarketCandles([]);
      setMarketPublicTrades([]);
      setMarketInsightsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchInsights = async () => {
      setMarketInsightsLoading(true);
      try {
        const [candles, trades] = await Promise.all([
          trpcClient.market.getPriceCandles.query({ marketId: selectedMarketId, limit: 200 }),
          trpcClient.market.getPublicTrades.query({ marketId: selectedMarketId, limit: 50 }),
        ]);
        if (cancelled) return;
        setMarketCandles(candles as PriceCandle[]);
        setMarketPublicTrades(trades as PublicTrade[]);
      } catch (err: unknown) {
        console.error("Failed to load market insights", err);
        if (!cancelled) {
          setMarketCandles([]);
          setMarketPublicTrades([]);
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
    } catch (err: unknown) {
      console.error("placeBet failed", err);
      const friendly = formatBetError(getUnknownErrorMessage(err));
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
    } catch (err: unknown) {
      console.error("sellPosition failed", err);
      await loadMarkets();
      await refreshUser();
      await loadMyBets();
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
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
          <main>
            <MarketPage
              market={selectedMarket}
              user={user}
              onBack={() => setSelectedMarketId(null)}
              onLogin={() => openAuth("SIGN_IN")}
              lang={lang}
              onResolveOutcome={user?.isAdmin ? resolveMarketOutcome : undefined}
              onPlaceBet={handlePlaceBet}
              onSellPosition={handleSellPosition}
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

                <div className="border-t border-zinc-900 px-4 pt-4">
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
                balanceMajor={user?.balance ?? 0}
                pnlMajor={realizedPnl}
                bets={legacyBets}
                soldTrades={soldTrades}
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
              }
              if (view === "FRIENDS") {
                void loadLeaderboard();
              }
            }}
          />

          {user?.isAdmin && currentView === "EVENTS" && (
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="fixed bottom-16 right-4 h-12 w-12 rounded-full bg-zinc-100 text-black flex items-center justify-center shadow-lg shadow-black/30"
              aria-label={lang === "RU" ? "Создать рынок" : "Create market"}
              title={lang === "RU" ? "Создать рынок" : "Create market"}
            >
              <Plus size={20} />
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
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
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
        onCreate={async (payload) => {
          try {
            await trpcClient.market.createMarket.mutate(payload);
            await loadMarkets();
            setShowAdminModal(false);
          } catch (err: unknown) {
            console.error("Failed to create market", err);
            throw err;
          }
        }}
      />
    </div>
  );
}
