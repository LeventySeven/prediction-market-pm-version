import React, { useState, useEffect } from 'react';
import { Market } from '../types';
import { Clock } from 'lucide-react';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  lang: 'RU' | 'EN';
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick, lang }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(market.endDate) - +new Date();
      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      return lang === 'RU' ? 'Завершено' : 'Ended';
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    
    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(timer);
  }, [market.endDate, lang]);

  return (
    <div 
        onClick={onClick}
        className="bg-black border border-neutral-900 rounded-xl p-4 hover:border-neutral-700 transition-all duration-300 flex flex-col h-full group cursor-pointer relative overflow-hidden"
    >
      
      {/* NEW Badge - Subtle Outline */}
      {market.isNew && (
          <div className="absolute top-2 left-2 border border-[#BEFF1D]/40 text-[#BEFF1D] text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-black/50 backdrop-blur-sm z-10">
              NEW
          </div>
      )}

      {/* Header: Icon + Title */}
      <div className="flex items-start gap-3 mb-5 mt-2">
        <img 
          src={market.imageUrl} 
          alt={market.title} 
          className="w-10 h-10 rounded-full grayscale opacity-80 group-hover:opacity-100 transition-opacity bg-neutral-900 object-cover flex-shrink-0"
        />
        <h3 className="text-[16px] font-medium text-neutral-200 leading-snug group-hover:text-white transition-colors line-clamp-3">
          {market.title}
        </h3>
      </div>

      {/* Main Stats: Chance Bar */}
      <div className="mt-auto">
        <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-[#BEFF1D] leading-none">{market.chance}%</span>
            <span className="text-xs text-neutral-600 font-mono uppercase">
                {lang === 'RU' ? 'Вероятность' : 'Chance'}
            </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-neutral-900 rounded-full mb-5 overflow-hidden flex">
          <div 
            className="h-full bg-[#BEFF1D]" 
            style={{ width: `${market.chance}%` }}
          />
          <div 
            className="h-full bg-[#f544a6]" 
            style={{ width: `${100 - market.chance}%` }}
          />
        </div>

        {/* Buttons and Info */}
        <div className="flex items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2 w-full">
                {/* YES Button - Green Active */}
                <button className="flex-1 bg-neutral-900 hover:bg-[#BEFF1D]/10 hover:text-[#BEFF1D] hover:border-[#BEFF1D]/30 text-neutral-400 text-xs font-semibold py-2 px-3 rounded-lg text-center transition-colors border border-neutral-800 uppercase">
                    {lang === 'RU' ? 'Да' : 'Yes'} ${market.yesPrice}
                </button>
                {/* NO Button - Pink Active */}
                <button className="flex-1 bg-neutral-900 hover:bg-[#f544a6]/10 hover:text-[#f544a6] hover:border-[#f544a6]/30 text-neutral-400 text-xs font-semibold py-2 px-3 rounded-lg text-center transition-colors border border-neutral-800 uppercase">
                    {lang === 'RU' ? 'Нет' : 'No'} ${market.noPrice}
                </button>
            </div>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider text-neutral-600 mt-4 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1">
                <span>{lang === 'RU' ? 'Объем' : 'Vol'}</span>
                <span className="text-neutral-400">{market.volume}</span>
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