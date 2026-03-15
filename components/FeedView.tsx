'use client';

import MarketCard from "@/components/MarketCard";
import MarketPulseBoard from "@/components/MarketPulseBoard";
import type { Market, User } from "@/types";

export type FeedViewProps = {
  lang: "RU" | "EN";
  user: User | null;
  marketPulseRows: Market[];
  topMarketPreviewLoading: boolean;
  bookmarkedMarkets: Market[];
  bookmarkedMarketIds: Set<string>;
  feedMarkets: Market[];
  loadingMarkets: boolean;
  marketsLoadingMessage: string | null;
  marketsError: string | null;
  onMarketClick: (market: Market) => void;
  onQuickBet: (market: Market, side: "YES" | "NO") => void;
};

export default function FeedView({
  lang,
  user,
  marketPulseRows,
  topMarketPreviewLoading,
  bookmarkedMarkets,
  bookmarkedMarketIds,
  feedMarkets,
  loadingMarkets,
  marketsLoadingMessage,
  marketsError,
  onMarketClick,
  onQuickBet,
}: FeedViewProps) {
  return (
    <div>
      <MarketPulseBoard
        markets={marketPulseRows}
        loading={topMarketPreviewLoading && marketPulseRows.length === 0}
        lang={lang}
        onMarketClick={onMarketClick}
      />

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
                  onClick={() => onMarketClick(market)}
                  onQuickBet={(side) => onQuickBet(market, side)}
                  lang={lang}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="px-4 pt-3 pb-2">
        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          {lang === "RU" ? "Ваши ставки" : "Your bets"}
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
                onClick={() => onMarketClick(market)}
                onQuickBet={(side) => onQuickBet(market, side)}
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
  );
}
