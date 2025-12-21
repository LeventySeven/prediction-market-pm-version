'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import UserProfileModal from "@/components/UserProfileModal";
import BetConfirmModal from "@/components/BetConfirmModal";
import AdminMarketModal from "@/components/AdminMarketModal";
import type { Category, Market, User, Bet, Position, Trade } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search } from "lucide-react";

// VCOIN decimals for display
const VCOIN_DECIMALS = 6;
const toMajorUnits = (minor: number) => minor / Math.pow(10, VCOIN_DECIMALS);

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [lang, setLang] = useState<"RU" | "EN">("RU");
  const [user, setUser] = useState<User | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
    if (msg.includes("MARKET_EXPIRED") || msg.includes("MARKET_CLOSED") || msg.includes("MARKET_NOT_OPEN")) {
      return lang === "RU" ? "Событие завершено, ставки закрыты." : "Market closed for trading.";
    }
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      return lang === "RU" ? "Недостаточно средств на балансе." : "Insufficient balance.";
    }
    if (msg.includes("MARKET_RESOLVED")) {
      return lang === "RU" ? "Событие уже разрешено." : "Market already resolved.";
    }
    return msg;
  };

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
    setLang((prev) => (prev === "RU" ? "EN" : "RU"));
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
    });
    setUser({
      id: String(me.user.id),
      email: me.user.email,
      username: me.user.username,
      balance: me.user.balance,
      isAdmin: me.user.isAdmin,
    });
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
      balance: me.user.balance,
      isAdmin: me.user.isAdmin,
    });
  };

  const refreshUser = useCallback(async () => {
    try {
      const me = await trpcClient.auth.me.query();
      if (me) {
        setUser({
          id: String(me.id),
          email: me.email,
          username: me.username,
          balance: me.balance,
          isAdmin: me.isAdmin,
        });
      }
    } catch (err: unknown) {
      console.error("Failed to refresh session user", err);
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

  // Fetch session user via auth.me
  useEffect(() => {
    const loadUser = async () => {
      setLoadingUser(true);
      await refreshUser();
      setLoadingUser(false);
    };

    void loadUser();
  }, [refreshUser]);

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

  // Refresh positions periodically while profile is open
  useEffect(() => {
    if (!showProfile || !user) return;
    void loadMyBets();
    const id = setInterval(() => {
      void loadMyBets();
    }, 15000);
    return () => clearInterval(id);
  }, [showProfile, user, loadMyBets]);

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
        setShowAuth(true);
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
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <Header
        onLoginClick={() => setShowAuth(true)}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onProfileClick={() => {
          setShowProfile(true);
          void loadMyBets();
        }}
        onAdminClick={user?.isAdmin ? () => setShowAdminModal(true) : undefined}
        onHelpClick={() => setShowOnboarding(true)}
        lang={lang}
        onToggleLang={handleToggleLang}
      />

      <main>
        {selectedMarket ? (
          <MarketPage
            market={selectedMarket}
            user={user}
            onBack={() => setSelectedMarketId(null)}
            onLogin={() => setShowAuth(true)}
            lang={lang}
            onResolveOutcome={user?.isAdmin ? resolveMarketOutcome : undefined}
            onPlaceBet={handlePlaceBet}
            onSellPosition={handleSellPosition}
            userPositions={myPositions.filter((p) => p.marketId === selectedMarket.id)}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="mb-8">
              <div className="relative w-full md:hidden">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === "RU" ? "Поиск..." : "Search..."}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-[#BEFF1D] focus:outline-none"
                />
                <Search
                  size={16}
                  className="absolute left-3.5 top-2.5 text-neutral-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {loadingMarkets ? (
                <div className="col-span-full text-center py-10 text-neutral-500">
                  {marketsLoadingMessage || (lang === "RU" ? "Загрузка рынков..." : "Loading markets...")}
                </div>
              ) : filteredMarkets.length > 0 ? (
                filteredMarkets.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    onClick={() => setSelectedMarketId(market.id)}
                    lang={lang}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-20 text-neutral-500">
                  <p className="text-lg mb-2">{lang === "RU" ? "Ничего не найдено" : "Nothing found"}</p>
                  <p className="text-sm">{lang === "RU" ? "Попробуйте другой запрос" : "Try a different search"}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

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
        lang={lang}
      />
      <UserProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        user={user}
        bets={legacyBets}
        lang={lang}
        onMarketClick={(id) => {
          setSelectedMarketId(id);
          setShowProfile(false);
        }}
        onLogout={async () => {
          try {
            await trpcClient.auth.logout.mutate();
          } catch (err: unknown) {
            console.error("logout failed", err);
          } finally {
            setUser(null);
            setMyPositions([]);
            setMyTrades([]);
            setShowProfile(false);
          }
        }}
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
