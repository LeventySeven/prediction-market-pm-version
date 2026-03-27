'use client';

import { useState, useRef, type RefObject } from "react";
import MarketCard from "@/components/MarketCard";
import { Search, Info, Filter } from "lucide-react";
import type { Market } from "@/types";

type CatalogSort =
  | "ENDING_SOON"
  | "CREATED_DESC"
  | "CREATED_ASC"
  | "VOLUME_DESC"
  | "VOLUME_ASC"
  | "CATEGORY_ASC"
  | "CATEGORY_DESC";

type CatalogStatus = "ALL" | "ONGOING" | "ENDED";
type CatalogTimeFilter = "ANY" | "HOUR" | "DAY" | "WEEK";

type MarketHighlightKind = "new" | "updated";

type CategoryOption = {
  id: string;
  labelRu: string;
  labelEn: string;
};

type ProviderOption = {
  id: "all" | "polymarket" | "limitless";
  labelRu: string;
  labelEn: string;
  ariaLabel?: string;
  logoSrc?: string;
};

export type CatalogViewProps = {
  lang: "RU" | "EN";
  searchQuery: string;
  onSearchChange: (query: string) => void;
  semanticSearchLoading: boolean;
  activeCategoryId: string;
  onCategoryChange: (id: string) => void;
  activeProviderFilter: "all" | "polymarket" | "limitless";
  onProviderFilterChange: (provider: "all" | "polymarket" | "limitless") => void;
  providerOptions: ProviderOption[];
  marketCategories: CategoryOption[];
  catalogMarkets: Market[];
  marketHighlightById: Record<string, { kind: MarketHighlightKind } | undefined>;
  bookmarkedMarketIds: Set<string>;
  onMarketClick: (market: Market) => void;
  onQuickBet: (market: Market, side: "YES" | "NO") => void;
  onInfoClick: () => void;
  onFiltersClick: () => void;
  loadingMarkets: boolean;
  marketsError: string | null;
  hasLoadedActiveCatalogKey: boolean;
  catalogPage: number;
  hasNextCatalogPage: boolean;
  onLoadMore: () => void;
  marketsLoadingMessage: string | null;
  catalogLoadMoreSentinelRef: RefObject<HTMLDivElement | null>;
};

export default function CatalogView({
  lang,
  searchQuery,
  onSearchChange,
  semanticSearchLoading,
  activeCategoryId,
  onCategoryChange,
  activeProviderFilter,
  onProviderFilterChange,
  providerOptions,
  marketCategories,
  catalogMarkets,
  marketHighlightById,
  bookmarkedMarketIds,
  onMarketClick,
  onQuickBet,
  onInfoClick,
  onFiltersClick,
  loadingMarkets,
  marketsError,
  hasLoadedActiveCatalogKey,
  catalogPage,
  hasNextCatalogPage,
  onLoadMore,
  marketsLoadingMessage,
  catalogLoadMoreSentinelRef,
}: CatalogViewProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {/* Mobile expanded search (desktop search is in Header) */}
      {mobileSearchOpen && (
        <div className="px-4 pt-2 pb-3 md:hidden">
          <div className="relative">
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={lang === "RU" ? "Поиск..." : "Search..."}
              autoFocus
              className="h-11 w-full rounded-[20px] border border-zinc-800 bg-zinc-950/80 px-4 pl-11 pr-10 text-sm text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
            />
            <Search size={16} className="absolute left-4 top-3.5 text-zinc-600" />
            <button
              type="button"
              onClick={() => {
                setMobileSearchOpen(false);
                onSearchChange("");
              }}
              className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
              aria-label={lang === "RU" ? "Закрыть поиск" : "Close search"}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="px-4 pb-3 border-b border-zinc-900">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1" data-swipe-ignore="true">
          <button
            type="button"
            onClick={() => onCategoryChange("all")}
            className={`shrink-0 min-h-[40px] rounded-full border px-4 text-xs font-semibold uppercase tracking-wider transition ${
              activeCategoryId === "all"
                ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,1)] text-white shadow-[0_10px_30px_rgba(245,68,166,0.12)] hover:opacity-90"
                : "border-zinc-900 bg-black/70 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/60"
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
                onClick={() => onCategoryChange(c.id)}
                className={`shrink-0 min-h-[40px] rounded-full border px-4 text-xs font-semibold uppercase tracking-wider transition ${
                  selected
                    ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,1)] text-white shadow-[0_10px_30px_rgba(245,68,166,0.12)] hover:opacity-90"
                    : "border-zinc-900 bg-black/70 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/60"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3 border-b border-zinc-900">
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1" data-swipe-ignore="true">
          {providerOptions.map((provider) => {

            const selected = activeProviderFilter === provider.id;
            const label = lang === "RU" ? provider.labelRu : provider.labelEn;
            return (
              <button
                key={provider.id}
                type="button"
                aria-label={provider.ariaLabel ?? label}
                title={provider.ariaLabel ?? label}
                onClick={() => onProviderFilterChange(provider.id)}
                className={`shrink-0 rounded-full border text-xs font-semibold uppercase tracking-wider transition ${
                  provider.id === "all"
                    ? "min-h-[40px] px-4"
                    : "inline-flex h-10 w-10 items-center justify-center p-0"
                } ${
                  selected
                    ? "border-[rgba(190,255,29,1)] bg-[rgba(190,255,29,1)] text-black shadow-[0_10px_30px_rgba(190,255,29,0.15)]"
                    : "border-zinc-900 bg-black/70 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/60"
                }`}
              >
                {provider.id === "all" || !provider.logoSrc ? (
                  label
                ) : (
                  <img
                    src={provider.logoSrc}
                    alt={provider.ariaLabel ?? label}
                    className="h-5 w-5 rounded-md object-contain"
                  />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              if (!mobileSearchOpen) {
                setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
              } else {
                onSearchChange("");
              }
            }}
            className={`ml-auto shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border transition md:hidden ${
              mobileSearchOpen || searchQuery
                ? "border-[rgba(190,255,29,1)] bg-[rgba(190,255,29,0.1)] text-[rgba(190,255,29,1)]"
                : "border-zinc-900 bg-black/70 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-950/60"
            }`}
            aria-label={lang === "RU" ? "Поиск" : "Search"}
            title={lang === "RU" ? "Поиск" : "Search"}
          >
            <Search size={16} />
          </button>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onInfoClick}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-950/50 text-zinc-300 transition-colors hover:bg-zinc-950/80 hover:text-white"
              aria-label={lang === "RU" ? "Важное уведомление" : "Important notice"}
              title={lang === "RU" ? "Важное уведомление" : "Important notice"}
            >
              <Info size={14} />
            </button>
            <button
              type="button"
              onClick={onFiltersClick}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-950/50 px-4 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-950/80 hover:text-white"
            >
              <Filter size={14} className="text-zinc-300" />
              <span>{lang === "RU" ? "Фильтр" : "Filter"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        {catalogMarkets.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-4">
              {catalogMarkets.map((market) => (
                <div
                  key={market.id}
                  data-market-card-id={market.id}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "252px" }}
                >
                  <MarketCard
                    market={market}
                    highlightState={marketHighlightById[market.id]?.kind ?? null}
                    bookmarked={bookmarkedMarketIds.has(market.id)}
                    onClick={() => onMarketClick(market)}
                    onQuickBet={(side) => onQuickBet(market, side)}
                    lang={lang}
                  />
                </div>
              ))}
            </div>
            <div className="pb-8">
              <div ref={catalogLoadMoreSentinelRef} className="h-4 w-full" aria-hidden="true" />
              <div className="flex items-center justify-center gap-3">
                <div className="text-xs text-zinc-500">
                  {(lang === "RU" ? "Загружено страниц" : "Loaded pages") + ` ${catalogPage}`}
                </div>
                {loadingMarkets && catalogPage > 1 ? (
                  <div className="text-xs text-zinc-400">
                    {lang === "RU" ? "Подгружаем еще рынки..." : "Loading more markets..."}
                  </div>
                ) : null}
                {!loadingMarkets && hasNextCatalogPage ? (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="h-10 rounded-full border border-zinc-900 bg-zinc-950/50 px-4 text-xs font-semibold text-zinc-200 hover:bg-zinc-950/80"
                  >
                    {lang === "RU" ? "Загрузить еще" : "Load more"}
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : marketsError ? (
          <div className="text-center py-20 text-zinc-500 px-4">
            <p className="text-sm">{marketsError}</p>
          </div>
        ) : !hasLoadedActiveCatalogKey ? (
          <div className="pb-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={`catalog-skeleton-${idx}`}
                  className="h-[252px] rounded-2xl border border-zinc-900 bg-zinc-950/50 animate-pulse"
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-zinc-500 px-4">
            <p className="text-lg mb-2">{lang === "RU" ? "Ничего не найдено" : "Nothing found"}</p>
            <p className="text-sm">{lang === "RU" ? "Попробуйте другой запрос" : "Try a different search"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
