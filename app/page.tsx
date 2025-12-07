'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import ProfileModal from "@/components/ProfileModal";
import BetConfirmModal from "@/components/BetConfirmModal";
import { CATEGORIES, MOCK_MARKETS, generateHistory } from "@/constants";
import type { Category, Market, User } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search } from "lucide-react";

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>(MOCK_MARKETS);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  type BetItem = {
    id: number;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number;
    status: string;
    payout: number | null;
    createdAt: string;
    marketOutcome: "YES" | "NO" | null;
  };

  const [myBets, setMyBets] = useState<BetItem[]>([]);
  const [loadingBets, setLoadingBets] = useState(false);
  const [marketsLoadingMessage, setMarketsLoadingMessage] = useState<
    string | null
  >(null);
  const [betMessage, setBetMessage] = useState<string | null>(null);
  const [betConfirm, setBetConfirm] = useState<{
    open: boolean;
    marketTitle: string;
    side: "YES" | "NO";
    amount: number;
    newBalance?: number;
  }>({ open: false, marketTitle: "", side: "YES", amount: 0, newBalance: undefined });

  const formatBetError = (msg?: string) => {
    if (!msg) return "Не удалось поставить ставку";
    if (msg.includes("MARKET_EXPIRED") || msg.toLowerCase().includes("expired")) {
      return "Событие завершено, ставки закрыты.";
    }
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      return "Недостаточно средств на балансе.";
    }
    if (msg.includes("MARKET_RESOLVED")) {
      return "Событие уже разрешено.";
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

  const handleLogin = () => {
    setShowAuth(true);
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
        });
      }
    } catch (err) {
      console.error("Failed to refresh session user", err);
    }
  }, []);

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
    setMarketsLoadingMessage("Загрузка рынков...");
    try {
      const response = await trpcClient.market.listMarkets.query({
        onlyOpen: false,
      });
      if (response && response.length > 0) {
        const mapped: Market[] = response.map((m) => ({
          id: String(m.id),
          title: m.title,
          category: "ALL",
          imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
            m.title
          )}&background=random&color=fff&size=128`,
          volume: `$${(Number(m.poolYes) + Number(m.poolNo)).toFixed(2)}`,
          endDate: new Date(m.expiresAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          yesPrice: Number(m.priceYes.toFixed(2)),
          noPrice: Number(m.priceNo.toFixed(2)),
          chance: Math.round(m.priceYes * 100),
          description: m.description ?? "Описание будет добавлено.",
          history: generateHistory(
            Math.max(5, Math.round(m.priceYes * 100)),
            Math.round(m.priceYes * 100)
          ),
          comments: [],
        }));
        setMarkets(mapped);
      } else {
        setMarkets(MOCK_MARKETS);
      }
    } catch (err) {
      console.error("Failed to load markets; fallback to mocks", err);
      setMarketsLoadingMessage("Не удалось загрузить рынки, показаны демо данные.");
      setMarkets(MOCK_MARKETS);
    } finally {
      setLoadingMarkets(false);
      setMarketsLoadingMessage(null);
    }
  }, []);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  const loadMyBets = useCallback(async () => {
    if (!user) return;
    setLoadingBets(true);
    try {
      const bets = await trpcClient.market.myBets.query();
      const normalized: BetItem[] = (bets || [])
        .filter((b): b is NonNullable<typeof b> => !!b && b.id !== undefined)
        .map((b) => ({
          id: Number(b.id),
          marketTitle: b.marketTitle ?? "—",
          side: b.side,
          amount: Number(b.amount ?? 0),
          status: b.status ?? "open",
          payout: b.payout !== null && b.payout !== undefined ? Number(b.payout) : null,
          createdAt: b.createdAt ?? new Date().toISOString(),
          marketOutcome: b.marketOutcome ?? null,
        }));
      setMyBets(normalized);
    } catch (err) {
      console.error("Failed to load bets", err);
    } finally {
      setLoadingBets(false);
    }
  }, [user]);

  const filteredMarkets = useMemo(
    () =>
      markets.filter((market) => {
        const matchesCategory =
          activeCategory === "ALL" || market.category === activeCategory;
        const matchesSearch = market.title
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      }),
    [activeCategory, searchQuery, markets]
  );

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId),
    [selectedMarketId, markets]
  );

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
      />

      <main>
        {selectedMarket ? (
          <MarketPage
            market={selectedMarket}
            user={user}
            onBack={() => setSelectedMarketId(null)}
            onLogin={() => setShowAuth(true)}
            onPlaceBet={async ({ amount, marketId, side, marketTitle }) => {
              try {
                setBetMessage(null);
                if (!user) {
                  setShowAuth(true);
                  setBetMessage("Войдите, чтобы сделать ставку.");
                  return;
                }

                const res = await trpcClient.market.placeBet.mutate({
                  amount,
                  marketId: Number(marketId),
                  side,
                });

                // Update local balance optimistically
                setUser((prev) =>
                  prev
                    ? { ...prev, balance: res.newBalance }
                    : { id: String(res.userId), balance: res.newBalance }
                );

                // Refresh data from backend to ensure pools and balances are in sync
                await loadMarkets();
                await refreshUser();
                await loadMyBets();

                setBetMessage(null);
                setBetConfirm({
                  open: true,
                  marketTitle,
                  side,
                  amount,
                  newBalance: res.newBalance,
                });
              } catch (err: any) {
                console.error("placeBet failed", err);
                const friendly = formatBetError(err?.message || err?.data?.message);
                setBetMessage(friendly || "Не удалось поставить ставку");
                // Even on error, refresh to keep UI consistent with backend state
                await loadMarkets();
                await refreshUser();
                await loadMyBets();
              }
            }}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            {betMessage && (
              <div className="mb-4 text-sm text-center text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg py-2 px-3">
                {betMessage}
              </div>
            )}
            <div className="mb-8">
              <div className="relative w-full md:hidden">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск..."
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
                  {marketsLoadingMessage || "Загрузка рынков..."}
                </div>
              ) : filteredMarkets.length > 0 ? (
                filteredMarkets.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    onClick={() => setSelectedMarketId(market.id)}
                  />
                ))
              ) : (
                <div className="col-span-full text-center py-20 text-neutral-500">
                  <p className="text-lg mb-2">Ничего не найдено</p>
                  <p className="text-sm">Попробуйте другой запрос</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSignUp={handleSignUp}
        onLogin={handleLoginSubmit}
      />
      <ProfileModal
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        email={user?.email}
        username={user?.username}
        balance={user?.balance}
        bets={myBets}
        loadingBets={loadingBets}
        onLogout={async () => {
          try {
            await trpcClient.auth.logout.mutate();
          } catch (err) {
            console.error("logout failed", err);
          } finally {
            setUser(null);
            setMyBets([]);
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
      />
    </div>
  );
}

