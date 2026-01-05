import React from 'react';
import { Market } from '../types';
import { Clock } from 'lucide-react';
import { formatTimeRemaining } from '../lib/time';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  onQuickBet?: (side: 'YES' | 'NO') => void;
  lang?: 'RU' | 'EN';
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick, onQuickBet, lang = 'RU' }) => {
  const localizedTitle =
    lang === 'RU'
      ? market.titleRu ?? market.titleEn ?? market.title
      : market.titleEn ?? market.titleRu ?? market.title;
  const isResolved = Boolean(market.outcome);
  const winningYes = market.outcome === 'YES';
  const displayChance = isResolved ? (winningYes ? 100 : 0) : market.chance;
  const yesLabel = lang === 'RU' ? 'Да' : 'Yes';
  const noLabel = lang === 'RU' ? 'Нет' : 'No';
  const chanceLabel = lang === 'RU' ? 'Вероятность' : 'Chance';
  const volLabel = lang === 'RU' ? 'Объем' : 'Vol';
  const categoryLabel =
    lang === "RU"
      ? market.categoryLabelRu ?? market.categoryLabelEn
      : market.categoryLabelEn ?? market.categoryLabelRu;

  // Use closesAt for trading deadline, fall back to expiresAt
  const deadline = market.closesAt || market.expiresAt;
  const tradingClosed = (() => {
    if (!deadline) return false;
    const now = Date.now();
    const parsed = Date.parse(deadline);
    return Number.isFinite(parsed) && parsed < now;
  })();
  const isExpired = isResolved || tradingClosed;
  const timeLeft = isResolved
    ? (lang === 'RU' ? 'Завершено' : 'Resolved')
    : (deadline ? formatTimeRemaining(deadline, 'hours', lang) : '—');

  return (
    <div 
        onClick={onClick}
        className="group relative rounded-2xl border border-zinc-900 bg-black hover:bg-zinc-950/60 transition-colors flex flex-col h-full cursor-pointer overflow-hidden p-4"
    >
      
      {/* NEW Badge - Subtle Outline */}
      {market.isNew && (
          <div className="absolute top-3 left-3 border border-zinc-800 text-zinc-200 text-[9px] font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wider z-10">
              NEW
          </div>
      )}
      {isResolved && (
          <div className="absolute top-3 right-3 border border-zinc-800 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider text-zinc-200 bg-black/60">
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
            {categoryLabel && (
              <>
                <span className="shrink-0 rounded-full border border-zinc-900 bg-zinc-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                  {categoryLabel}
                </span>
                <span className="text-zinc-700">•</span>
              </>
            )}
            <span className="uppercase tracking-wider">{volLabel}</span>
            <span className="text-zinc-400">{market.volume}</span>
            <span className="ml-auto flex items-center gap-1">
              <Clock size={12} />
              <span className="text-zinc-400">{timeLeft}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Stats: Chance Bar */}
      <div className="mt-auto">
        <div className="flex items-end justify-between mb-2">
          <span className="text-2xl font-bold text-zinc-100 leading-none tracking-tight tabular-nums">
            {displayChance}%
          </span>
          <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">
            {chanceLabel}
          </span>
        </div>

        {/* Minimalist probability line (white); colors are reserved for YES/NO labels + prices */}
        <div className="w-full h-1.5 bg-white/10 rounded-full mb-3 overflow-hidden">
          <div className="h-full bg-[rgba(231,0,36,0.85)]" style={{ width: `${displayChance}%` }} />
        </div>

        {/* Quick bet buttons - only show if market is active */}
        {!isExpired && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBet?.("YES");
              }}
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[#E70024] hover:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${yesLabel} $${market.yesPrice}`}
            >
              <span>{yesLabel}</span>
              <span className="font-mono">${market.yesPrice}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBet?.("NO");
              }}
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[#E70024] hover:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${noLabel} $${market.noPrice}`}
            >
              <span>{noLabel}</span>
              <span className="font-mono">${market.noPrice}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketCard;