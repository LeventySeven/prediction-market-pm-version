import React, { useEffect, useRef, useState } from 'react';
import { Market } from '../types';
import { Clock } from 'lucide-react';
import { formatTimeRemaining, getTimeRemainingInfo } from '../lib/time';
import { formatPercent, roundPercentValue } from '../src/lib/marketPresentation';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  onQuickBet?: (side: 'YES' | 'NO') => void;
  bookmarked?: boolean;
  lang?: 'RU' | 'EN';
  highlightState?: "new" | "updated" | null;
}

const MarketCardBase: React.FC<MarketCardProps> = ({
  market,
  onClick,
  onQuickBet,
  bookmarked = false,
  lang = 'EN',
  highlightState = null,
}) => {
  const localizedTitle =
    lang === 'RU'
      ? market.titleRu ?? market.titleEn ?? market.title
      : market.titleEn ?? market.titleRu ?? market.title;
  const isResolved = Boolean(market.outcome);
  const isMulti = market.marketType === "multi_choice" && Array.isArray(market.outcomes) && market.outcomes.length > 0;
  const sortedOutcomes = isMulti
    ? [...(market.outcomes ?? [])].sort((a, b) => b.probability - a.probability)
    : [];
  const winningYes = market.outcome === 'YES';
  const displayChance = isMulti
    ? roundPercentValue(sortedOutcomes[0]?.probability ?? 0)
    : (isResolved ? (winningYes ? 100 : 0) : market.chance);
  const isAboveMidpoint = displayChance > 50;
  const yesLabel = lang === 'RU' ? 'Да' : 'Yes';
  const noLabel = lang === 'RU' ? 'Нет' : 'No';
  const chanceLabel = lang === 'RU' ? 'Вероятность' : 'Chance';
  const volLabel = lang === 'RU' ? 'Объем' : 'Vol';
  const volumeBase = market.volume;
  const categoryLabel =
    lang === "RU"
      ? (market.primaryTagLabelRu ?? market.categoryLabelRu ?? market.categoryLabelEn)
      : (market.primaryTagLabelEn ?? market.categoryLabelEn ?? market.categoryLabelRu);
  const providerAlt = market.provider === "limitless" ? "Limitless" : "Polymarket";
  const providerLogoSrc = market.provider === "limitless" ? "/venues/limitless.svg" : "/venues/polymarket.svg";
  const highlightClass =
    highlightState === "new"
      ? "market-card-highlight-new"
      : highlightState === "updated"
        ? "market-card-highlight-updated"
        : "";

  // Use closesAt for trading deadline, fall back to expiresAt
  const deadline = market.closesAt || market.expiresAt;
  const tradingClosed = (() => {
    if (!deadline) return false;
    const now = Date.now();
    const parsed = Date.parse(deadline);
    return Number.isFinite(parsed) && parsed < now;
  })();
  const isExpired = isResolved || tradingClosed;
  const remaining = deadline ? getTimeRemainingInfo(deadline) : null;
  const isUrgentCountdown = !isResolved && !tradingClosed && Boolean(remaining?.isUnderHour);
  const timeLeft = isResolved
    ? (lang === 'RU' ? 'Завершено' : 'Resolved')
    : (deadline ? formatTimeRemaining(deadline, isUrgentCountdown ? 'minutes' : 'hours', lang) : '—');
  const prevChanceRef = useRef(displayChance);
  const [chanceBump, setChanceBump] = useState(false);

  useEffect(() => {
    if (prevChanceRef.current !== displayChance) {
      prevChanceRef.current = displayChance;
      setChanceBump(true);
      const timer = setTimeout(() => setChanceBump(false), 260);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [displayChance]);

  return (
    <div 
        onClick={() => onClick?.()}
        className={`group relative rounded-2xl border bg-black hover:bg-zinc-950/60 transition-all flex flex-col h-full cursor-pointer overflow-hidden p-4 ${highlightClass} ${
          bookmarked ? 'border-[rgba(245,68,166,0.55)]' : 'border-zinc-900'
        }`}
    >
      {/* NEW Badge - Subtle Outline */}
      {market.isNew && (
          <div className="absolute top-3 left-3 border border-zinc-800 text-zinc-200 text-[9px] font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wider z-10">
              NEW
          </div>
      )}
      {isResolved && !isMulti && (
          <div
            className="absolute top-3 right-3 border border-zinc-800 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider text-zinc-200 bg-black/60"
          >
              {lang === 'RU' ? `Исход: ${winningYes ? 'ДА' : 'НЕТ'}` : `Outcome: ${winningYes ? 'YES' : 'NO'}`}
          </div>
      )}

      {/* Header: Icon + Title */}
      <div className="flex items-start gap-3 mb-3 mt-0.5">
        <img 
          src={market.imageUrl} 
          alt={localizedTitle} 
          className="w-10 h-10 rounded-full bg-zinc-950 object-cover flex-shrink-0 border border-zinc-900"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-zinc-100 leading-snug line-clamp-3">
            {localizedTitle}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/50 p-1">
              <img
                src={providerLogoSrc}
                alt={providerAlt}
                className="h-4 w-4 rounded object-contain"
              />
            </span>
            {categoryLabel && (
              <>
                <span className="shrink-0 rounded-full border border-zinc-900 bg-zinc-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                  {categoryLabel}
                </span>
                <span className="text-zinc-700">•</span>
              </>
            )}
            <span className="uppercase tracking-wider">{volLabel}</span>
            <span className="text-zinc-400">{volumeBase}</span>
            <span className="ml-auto flex items-center gap-1">
              {isUrgentCountdown ? (
                <span className="relative inline-flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/80" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)]" />
                </span>
              ) : (
                <Clock size={12} />
              )}
              <span className={isUrgentCountdown ? "text-red-400 font-semibold" : "text-zinc-400"}>
                {timeLeft}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Stats: Chance Bar */}
      <div className="mt-auto">
        <div className="flex items-end justify-between mb-2">
          <span
            className={`text-2xl font-bold text-zinc-100 leading-none tracking-tight tabular-nums transition-transform duration-200 ${
              chanceBump ? "scale-105" : "scale-100"
            }`}
          >
            {displayChance}%
          </span>
          <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">
            {chanceLabel}
          </span>
        </div>

        {/* Probability color follows market tilt: >50% YES is green */}
        <div className="w-full h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
          <div
            className={`${isAboveMidpoint ? "h-full bg-[rgba(190,255,29,1)]" : "h-full bg-[rgba(245,68,166,0.85)]"} transition-[width] duration-300 ease-out`}
            style={{ width: `${displayChance}%` }}
          />
        </div>

        {isMulti && sortedOutcomes.length > 0 && (
          <div className="space-y-1.5">
            {sortedOutcomes.slice(0, 3).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs text-zinc-300">
                <span className="flex items-center gap-2 min-w-0">
                  {o.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.iconUrl} alt={o.title} className="w-4 h-4 rounded-full object-cover border border-zinc-800" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700" />
                  )}
                  <span className="truncate">{o.title}</span>
                </span>
                <span className="font-mono text-zinc-400">{formatPercent(o.probability)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quick bet buttons - only show if market is active */}
        {!isExpired && !isMulti && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBet?.("YES");
              }}
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[rgba(190,255,29,1)] hover:text-white active:border-[rgba(190,255,29,1)] active:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${yesLabel} ${Math.round(displayChance)}%`}
            >
              <span>{yesLabel}</span>
              <span className="font-mono">{Math.round(displayChance)}%</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBet?.("NO");
              }}
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[rgba(245,68,166,1)] hover:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${noLabel} ${Math.round(100 - displayChance)}%`}
            >
              <span>{noLabel}</span>
              <span className="font-mono">{Math.round(100 - displayChance)}%</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const MarketCard = React.memo(
  MarketCardBase,
  (prev, next) =>
    prev.market === next.market &&
    prev.bookmarked === next.bookmarked &&
    prev.lang === next.lang &&
    prev.highlightState === next.highlightState
);

export default MarketCard;
