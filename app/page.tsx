'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/AuthModal";
import Header from "@/components/Header";
import MarketCard from "@/components/MarketCard";
import MarketPage from "@/components/MarketPage";
import OnboardingModal from "@/components/OnboardingModal";
import { CATEGORIES, MOCK_MARKETS, generateHistory } from "@/constants";
import type { Category, Market, User } from "@/types";
import useTelegramWebApp from "@/hooks/useTelegramWebApp";
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
  const { themeParams, isTelegram } = useTelegramWebApp();
  const [marketsLoadingMessage, setMarketsLoadingMessage] = useState<
    string | null
  >(null);
  const [betMessage, setBetMessage] = useState<string | null>(null);
  const [telegramNotice, setTelegramNotice] = useState<string | null>(null);

  const getTelegramUser = () =>
    typeof window !== "undefined"
      ? (window.Telegram?.WebApp?.initDataUnsafe as any)?.user ?? null
      : null;

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

  // Sync Telegram theme colors when inside a Telegram Mini App.
  useEffect(() => {
    if (!isTelegram || !themeParams) return;
    const root = document.documentElement;
    const defaults = {
      background: "#0a0a0a",
      foreground: "#ffffff",
      accent: "#BEFF1D",
      accentText: "#000000",
    };

    root.style.setProperty(
      "--background",
      themeParams.bg_color ?? defaults.background
    );
    root.style.setProperty(
      "--foreground",
      themeParams.text_color ?? defaults.foreground
    );
    root.style.setProperty(
      "--accent-color",
      themeParams.button_color ?? defaults.accent
    );
    root.style.setProperty(
      "--accent-text-color",
      themeParams.button_text_color ?? defaults.accentText
    );

    return () => {
      root.style.setProperty("--background", defaults.background);
      root.style.setProperty("--foreground", defaults.foreground);
      root.style.setProperty("--accent-color", defaults.accent);
      root.style.setProperty("--accent-text-color", defaults.accentText);
    };
  }, [isTelegram, themeParams]);

  const handleAuthSubmit = async (payload: {
    username?: string;
    displayName?: string;
  }) => {
    const tgUser = getTelegramUser();

    if (!tgUser?.id) {
      setTelegramNotice(
        "Telegram ID не найден. Откройте миниапп из Telegram, затем попробуйте снова."
      );
      throw new Error("Telegram ID не найден. Откройте миниапп из Telegram.");
    }

    const me = await trpcClient.user.registerUser.mutate({
      telegramId: Number(tgUser.id),
      username: payload.username ?? tgUser.username ?? undefined,
      displayName:
        payload.displayName ??
        tgUser.first_name ??
        tgUser.last_name ??
        undefined,
    });
    setUser({
      id: String(me.id),
      email: me.username ?? undefined,
      balance: me.balance,
    });
    setShowAuth(false);
  };

  // Register or fetch user from Supabase via tRPC using Telegram id when available.
  useEffect(() => {
    const loadUser = async () => {
      setLoadingUser(true);
      try {
        const tgUser = getTelegramUser();

        if (!tgUser?.id) return;

        const me = await trpcClient.user.registerUser.mutate({
          telegramId: Number(tgUser.id),
          username: tgUser.username ?? undefined,
          displayName: tgUser.first_name ?? tgUser.last_name ?? undefined,
        });

        setUser({
          id: String(me.id),
          email: me.username ?? undefined,
          balance: me.balance,
        });
      } catch (err) {
        console.error("Failed to load/register user", err);
      } finally {
        setLoadingUser(false);
      }
    };

    void loadUser();
  }, []);

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
      />

      {telegramNotice && (
        <div className="bg-red-500/10 text-red-200 border border-red-500/30 px-4 py-2 text-sm text-center">
          {telegramNotice}
        </div>
      )}

      <main>
        {selectedMarket ? (
          <MarketPage
            market={selectedMarket}
            user={user}
            onBack={() => setSelectedMarketId(null)}
        onLogin={() => setShowAuth(true)}
        onPlaceBet={async ({ amount, marketId, side }) => {
          try {
            setBetMessage(null);
            const tgUser = getTelegramUser();

            if (!tgUser?.id) {
              setShowAuth(true);
              setBetMessage("Откройте приложение через Telegram, чтобы сделать ставку.");
              return;
            }

            const res = await trpcClient.market.placeBet.mutate({
              amount,
              marketId: Number(marketId),
              side,
              telegramId: Number(tgUser.id),
            });

            setUser((prev) =>
              prev
                ? { ...prev, balance: res.newBalance }
                : { id: String(res.userId), balance: res.newBalance }
            );
            setBetMessage("Ставка принята");
            await loadMarkets();
          } catch (err: any) {
            console.error("placeBet failed", err);
            setBetMessage(err?.message || "Не удалось поставить ставку");
          }
        }}
          />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
              <div className="flex overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto scrollbar-hide">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap border
                        ${
                          activeCategory === cat.id
                            ? "bg-[#BEFF1D] text-black border-[#BEFF1D]"
                            : "bg-transparent text-neutral-400 border-transparent hover:bg-neutral-900 hover:text-white"
                        }`}
                  >
                    <span>{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>

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
        onLogin={handleAuthSubmit}
      />
    </div>
  );
}

