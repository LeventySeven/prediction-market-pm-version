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
import { CATEGORIES, MOCK_MARKETS, generateHistory } from "@/constants";
import type { Category, Market, User, Bet } from "@/types";
import { trpcClient } from "@/src/utils/trpcClient";
import { Search } from "lucide-react";

const buildHistoryFromPools = (poolYes: number, poolNo: number) => {
  const total = poolYes + poolNo;
  const priceYes = total === 0 ? 0.5 : poolNo / total;
  const chance = Math.round(priceYes * 100);
  // Simple two-point history to reflect current price; can be extended when real history is available.
  return [
    { date: "T-1", value: chance },
    { date: "Now", value: chance },
  ];
};

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<Category>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [lang, setLang] = useState<"RU" | "EN">("RU");
  const [user, setUser] = useState<User | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>(MOCK_MARKETS);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [myBets, setMyBets] = useState<Bet[]>([]);
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

  const handleToggleLang = () => {
    setLang((prev) => (prev === "RU" ? "EN" : "RU"));
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

  const loadMyBets = useCallback(async () => {
    if (!user) return;
    setLoadingBets(true);
    try {
      const bets = await trpcClient.market.myBets.query();
      const normalized: Bet[] = (bets || [])
        .filter((b): b is NonNullable<typeof b> => !!b && b.id !== undefined)
        .map((b) => {
          const titleRu = b.marketTitleRu ?? "—";
          const titleEn = b.marketTitleEn ?? titleRu;
          return {
            id: String(b.id),
            marketId: String(b.marketId),
            marketTitle: lang === "RU" ? titleRu : titleEn,
            marketTitleRu: titleRu,
            marketTitleEn: titleEn,
            side: b.side,
            amount: Number(b.amount ?? 0),
            status: b.status ?? "open",
            payout: b.payout !== null && b.payout !== undefined ? Number(b.payout) : null,
            createdAt: b.createdAt ?? new Date().toISOString(),
            marketOutcome: b.marketOutcome ?? null,
            expiresAt: b.expiresAt ?? null,
            priceYes: b.priceYes ?? null,
            priceNo: b.priceNo ?? null,
          };
        });
      setMyBets(normalized);
    } catch (err: unknown) {
      console.error("Failed to load bets", err);
    } finally {
      setLoadingBets(false);
    }
  }, [user, lang]);

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
      const mapped: Market[] =
        response?.map((m) => ({
          id: String(m.id),
          title: lang === "RU" ? m.titleRu : m.titleEn,
          titleRu: m.titleRu,
          titleEn: m.titleEn,
          category: "ALL",
          imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
            lang === "RU" ? m.titleRu : m.titleEn
          )}&background=random&color=fff&size=128`,
          volume: `$${(Number(m.poolYes) + Number(m.poolNo)).toFixed(2)}`,
          endDate: new Date(m.expiresAt).toISOString(),
          yesPrice: Number(m.priceYes.toFixed(2)),
          noPrice: Number(m.priceNo.toFixed(2)),
          chance: Math.round(m.priceYes * 100),
          description: m.description ?? "Описание будет добавлено.",
          poolYes: Number(m.poolYes),
          poolNo: Number(m.poolNo),
          history: buildHistoryFromPools(Number(m.poolYes), Number(m.poolNo)),
          comments: [],
        })) ?? [];
      setMarkets(mapped);
      if (user) {
        await loadMyBets();
      }
    } catch (err: unknown) {
      console.error("Failed to load markets", err);
      setMarketsLoadingMessage("Не удалось загрузить рынки, попробуйте позже.");
      setMarkets([]);
    } finally {
      setLoadingMarkets(false);
      setMarketsLoadingMessage(null);
    }
  }, [user, loadMyBets, lang]);

  useEffect(() => {
    void loadMarkets();
  }, [loadMarkets]);

  // Refresh bets periodically while profile is open
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
        const targetTitle =
          lang === "RU" ? market.titleRu : market.titleEn;
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
            onPlaceBet={async ({ amount, marketId, side, marketTitle }) => {
              try {
                if (!user) {
                  setShowAuth(true);
                  setBetConfirm({
                    open: true,
                    marketTitle,
                    side,
                    amount,
                    newBalance: user?.balance,
                    errorMessage: "Войдите, чтобы сделать ставку.",
                  });
                  return;
                }

                const res = await trpcClient.market.placeBet.mutate({
                  amount,
                  marketId,
                  side,
                });

                setUser((prev) =>
                  prev
                    ? { ...prev, balance: res.newBalance }
                    : { id: String(res.userId), balance: res.newBalance }
                );

                await loadMarkets();
                await refreshUser();
                await loadMyBets();

                setBetConfirm({
                  open: true,
                  marketTitle,
                  side,
                  amount,
                  newBalance: res.newBalance,
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
                  errorMessage: friendly || "Не удалось поставить ставку",
                });
              }
            }}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
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
                    lang={lang}
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
        bets={myBets}
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

