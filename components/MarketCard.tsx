
import React from 'react';
import { Market } from '../types';
import Button from './Button';
import { TrendingUp, Clock } from 'lucide-react';

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick }) => {
  return (
    <div 
        onClick={onClick}
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-[#BEFF1D]/50 transition-all duration-200 flex flex-col h-full group cursor-pointer"
    >
      
      {/* Header: Icon + Title */}
      <div className="flex items-start gap-3 mb-4">
        <img 
          src={market.imageUrl} 
          alt={market.title} 
          className="w-10 h-10 rounded-md object-cover flex-shrink-0 bg-neutral-800"
        />
        <h3 className="text-[17px] font-medium text-white leading-snug group-hover:underline decoration-neutral-500 underline-offset-4 line-clamp-3">
          {market.title}
        </h3>
      </div>

      {/* Main Stats: Chance Bar */}
      <div className="mt-auto">
        <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-bold text-[#BEFF1D] leading-none">{market.chance}%</span>
            <span className="text-sm text-neutral-400 mb-0.5">вероятность Да</span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-neutral-800 rounded-full mb-4 overflow-hidden flex">
          <div 
            className="h-full bg-[#BEFF1D]" 
            style={{ width: `${market.chance}%` }}
          />
          <div 
            className="h-full bg-neutral-700" 
            style={{ width: `${100 - market.chance}%` }}
          />
        </div>

        {/* Inline info instead of buttons */}
        <div className="flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span className="flex items-center gap-1">
            <span className="text-[#BEFF1D] font-semibold">Да</span>
            <span>${market.yesPrice}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-400 font-semibold">Нет</span>
            <span>${market.noPrice}</span>
          </span>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center gap-4 text-xs text-neutral-500 mt-3 pt-3 border-t border-white/5">
            <div className="flex items-center gap-1">
                <span className="font-semibold text-neutral-400">Vol.</span>
                <span>{market.volume}</span>
            </div>
            <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{market.endDate}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default MarketCard;