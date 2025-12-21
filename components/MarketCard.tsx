import React, { useState, useEffect } from 'react';
import { Market } from '../types';
import { Clock } from 'lucide-react';
import { formatTimeRemaining } from '../lib/time';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  lang?: 'RU' | 'EN';
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick, lang = 'RU' }) => {
  const [timeLeft, setTimeLeft] = useState('');
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
  const investedLabel = lang === 'RU' ? 'Инвестировано' : 'Invested';
  const volLabel = lang === 'RU' ? 'Объем' : 'Vol';

  // Use closesAt for trading deadline, fall back to expiresAt
  const deadline = market.closesAt || market.expiresAt;

  useEffect(() => {
    const update = () => {
      if (isResolved) {
        setTimeLeft(lang === 'RU' ? 'Завершено' : 'Resolved');
        return;
      }
      setTimeLeft(formatTimeRemaining(deadline, 'hours', lang));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [deadline, lang, isResolved]);

  return (
    <div 
        onClick={onClick}
        className="group relative rounded-xl border border-zinc-800 bg-[#09090b] text-card-foreground shadow hover:border-zinc-700 transition-all duration-300 flex flex-col h-full cursor-pointer overflow-hidden p-5"
    >
      
      {/* NEW Badge - Subtle Outline */}
      {market.isNew && (
          <div className="absolute top-3 left-3 border border-[#BEFF1D]/30 text-[#BEFF1D] text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider z-10">
              NEW
          </div>
      )}
      {isResolved && (
          <div className="absolute top-3 right-3 border border-zinc-700 text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider text-white bg-zinc-900/80">
              {lang === 'RU' ? `Исход: ${winningYes ? 'ДА' : 'НЕТ'}` : `Outcome: ${winningYes ? 'YES' : 'NO'}`}
          </div>
      )}

      {/* Header: Icon + Title */}
      <div className="flex items-start gap-3 mb-6 mt-1">
        <img 
          src={market.imageUrl} 
          alt={localizedTitle} 
          className="w-10 h-10 rounded-full grayscale opacity-80 group-hover:opacity-100 transition-opacity bg-zinc-900 object-cover flex-shrink-0 border border-zinc-800"
        />
        <h3 className="text-[15px] font-medium tracking-tight text-zinc-100 leading-snug group-hover:text-white transition-colors line-clamp-3">
          {localizedTitle}
        </h3>
      </div>

      {/* Main Stats: Chance Bar */}
      <div className="mt-auto">
        <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-[#BEFF1D] leading-none tracking-tight">{displayChance}%</span>
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                {chanceLabel}
            </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-900 rounded-full mb-6 overflow-hidden flex">
          <div 
            className="h-full bg-[#BEFF1D]" 
            style={{ width: `${displayChance}%` }}
          />
          <div 
            className="h-full bg-[#f544a6]" 
            style={{ width: `${100 - displayChance}%` }}
          />
        </div>

        {/* Inline info instead of buttons */}
        <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span className="flex items-center gap-1">
            <span className="text-[#BEFF1D] font-semibold">{yesLabel}</span>
            <span>${market.yesPrice}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="font-semibold" style={{ color: 'rgba(250, 73, 159, 1)' }}>
              {noLabel}
            </span>
            <span>${market.noPrice}</span>
          </span>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider text-zinc-500 mt-4 pt-3 border-t border-zinc-800/50">
            <div className="flex items-center gap-1">
                <span>{volLabel}</span>
                <span className="text-zinc-400 font-medium">{market.volume}</span>
            </div>
            <div className="flex items-center gap-1 ml-auto font-mono text-[#BEFF1D]">
                <Clock size={10} />
                <span>{timeLeft}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default MarketCard;