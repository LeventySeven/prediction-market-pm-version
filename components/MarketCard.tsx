import React, { useState } from 'react';
import { Market } from '../types';
import { Bookmark, Clock } from 'lucide-react';
import { formatTimeRemaining } from '../lib/time';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  onQuickBet?: (side: 'YES' | 'NO') => void;
  bookmarked?: boolean;
  onSetBookmarked?: (marketId: string, bookmarked: boolean) => void;
  lang?: 'RU' | 'EN';
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick, onQuickBet, bookmarked = false, onSetBookmarked, lang = 'RU' }) => {
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

  const [swipeAnim, setSwipeAnim] = useState<null | { dir: 'LEFT' | 'RIGHT'; ts: number }>(null);

  // Swipe gesture (mini-app): swipe right to bookmark, left to unbookmark.
  const swipeStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const didSwipeRef = React.useRef(false);
  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!t) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
    didSwipeRef.current = false;
  };
  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX < 70 || absX < absY * 1.2) return;
    didSwipeRef.current = true;

    const dir: 'LEFT' | 'RIGHT' = dx > 0 ? 'RIGHT' : 'LEFT';
    setSwipeAnim({ dir, ts: Date.now() });
    window.setTimeout(() => setSwipeAnim(null), 180);

    // Bookmark toggle: swipe left OR right toggles bookmark.
    onSetBookmarked?.(market.id, !bookmarked);
  };

  return (
    <div 
        onClick={() => {
          if (didSwipeRef.current) {
            didSwipeRef.current = false;
            return;
          }
          onClick?.();
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        data-events-swipe-ignore="true"
        className={`group relative rounded-2xl border border-zinc-900 bg-black hover:bg-zinc-950/60 transition-all flex flex-col h-full cursor-pointer overflow-hidden p-4 ${
          swipeAnim?.dir === 'RIGHT' ? 'translate-x-1' : swipeAnim?.dir === 'LEFT' ? '-translate-x-1' : ''
        }`}
    >
      {swipeAnim && (
        <div className="absolute inset-0 pointer-events-none">
          <div
            className={`absolute inset-0 ${
              bookmarked ? 'bg-zinc-950/10' : 'bg-[rgba(245,68,166,0.06)]'
            }`}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${
              swipeAnim.dir === 'RIGHT' ? 'left-4' : 'right-4'
            } inline-flex items-center gap-2 rounded-full border border-[rgba(245,68,166,1)] bg-black/70 px-3 py-1 text-xs font-semibold text-[rgba(245,68,166,1)]`}
          >
            <Bookmark size={14} />
            {bookmarked ? (lang === 'RU' ? 'Удалено' : 'Removed') : (lang === 'RU' ? 'Сохранено' : 'Saved')}
          </div>
        </div>
      )}
      
      {/* NEW Badge - Subtle Outline */}
      {market.isNew && (
          <div className="absolute top-3 left-3 border border-zinc-800 text-zinc-200 text-[9px] font-semibold px-1.5 py-0.5 rounded-sm uppercase tracking-wider z-10">
              NEW
          </div>
      )}
      {bookmarked && (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-[rgba(245,68,166,1)] bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(245,68,166,1)]">
          <Bookmark size={12} />
          {lang === 'RU' ? 'Сохранено' : 'Saved'}
        </div>
      )}
      {isResolved && (
          <div className={`absolute top-3 ${bookmarked ? "right-3 mt-7" : "right-3"} border border-zinc-800 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider text-zinc-200 bg-black/60`}>
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
          <div className="h-full bg-[rgba(245,68,166,0.85)]" style={{ width: `${displayChance}%` }} />
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
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[rgba(245,68,166,1)] hover:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${yesLabel} ${market.chance}%`}
            >
              <span>{yesLabel}</span>
              <span className="font-mono">{market.chance}%</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBet?.("NO");
              }}
              className="h-10 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 text-sm font-semibold text-zinc-200 hover:border-[rgba(245,68,166,1)] hover:text-white transition-colors flex items-center justify-between tabular-nums"
              aria-label={`${noLabel} ${100 - market.chance}%`}
            >
              <span>{noLabel}</span>
              <span className="font-mono">{100 - market.chance}%</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketCard;