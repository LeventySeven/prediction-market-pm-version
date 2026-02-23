import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { Market } from '../types';
import { formatTimeRemaining } from '../lib/time';

interface MarketFeedItemProps {
  market: Market;
  onClick?: () => void;
  lang?: 'RU' | 'EN';
}

const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.1) return value.toFixed(2);
  return value.toFixed(3);
};

const MarketFeedItem: React.FC<MarketFeedItemProps> = ({ market, onClick, lang = 'EN' }) => {
  const localizedTitle = useMemo(
    () => (lang === 'RU' ? market.titleRu ?? market.titleEn ?? market.title : market.titleEn ?? market.titleRu ?? market.title),
    [lang, market.title, market.titleEn, market.titleRu]
  );

  const isResolved = Boolean(market.outcome) || market.state === 'resolved';
  const isMulti = market.marketType === "multi_choice" && Array.isArray(market.outcomes) && market.outcomes.length > 0;
  const sortedOutcomes = isMulti ? [...(market.outcomes ?? [])].sort((a, b) => b.probability - a.probability) : [];
  const winningYes = market.outcome === 'YES';
  const displayChance = isMulti
    ? Math.round((sortedOutcomes[0]?.probability ?? 0) * 100)
    : (isResolved ? (winningYes ? 100 : 0) : market.chance);

  const yesLabel = lang === 'RU' ? 'Да' : 'Yes';
  const noLabel = lang === 'RU' ? 'Нет' : 'No';
  const volumeLabel = lang === 'RU' ? 'Объем' : 'Volume';

  const deadline = market.closesAt || market.expiresAt;
  const timeLeft = isResolved
    ? (lang === 'RU' ? 'Завершено' : 'Resolved')
    : (deadline ? formatTimeRemaining(deadline, 'hours', lang) : '—');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 border-b border-zinc-900 hover:bg-zinc-950/60 transition-colors"
    >
      <div className="flex gap-3">
        <img
          src={market.imageUrl}
          alt={localizedTitle}
          className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-900 object-cover flex-shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-zinc-100 leading-snug line-clamp-2">
                {localizedTitle}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>
                  {volumeLabel} {market.volume}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {timeLeft}
                </span>
                {isResolved && !isMulti && (
                  <span className="text-zinc-600">
                    {lang === 'RU'
                      ? `Исход: ${winningYes ? 'ДА' : 'НЕТ'}`
                      : `Outcome: ${winningYes ? 'YES' : 'NO'}`}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end flex-shrink-0">
              <div className="text-sm font-semibold text-zinc-200 tabular-nums">{displayChance}%</div>
              <div className="mt-1 h-1 w-20 bg-zinc-900 rounded-full overflow-hidden">
                <div className="h-full bg-zinc-200/70" style={{ width: `${displayChance}%` }} />
              </div>
            </div>
          </div>

          {isMulti ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              {sortedOutcomes.slice(0, 3).map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-900 px-2 py-0.5">
                  {o.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.iconUrl} alt={o.title} className="w-3.5 h-3.5 rounded-full object-cover" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-zinc-800" />
                  )}
                  <span className="truncate max-w-[100px]">{o.title}</span>
                  <span className="font-mono">{(o.probability * 100).toFixed(1)}%</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400 tabular-nums">
              <span>
                {yesLabel} ${formatPrice(market.yesPrice)}
              </span>
              <span>
                {noLabel} ${formatPrice(market.noPrice)}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

export default MarketFeedItem;


