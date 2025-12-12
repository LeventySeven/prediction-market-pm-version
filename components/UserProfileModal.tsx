import React, { useEffect, useState } from 'react';
import { User, Bet } from '../types';
import { X, TrendingUp, TrendingDown, Clock, Wallet } from 'lucide-react';
import Button from './Button';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  bets: Bet[];
  lang: 'RU' | 'EN';
  onMarketClick: (marketId: string) => void;
  onLogout?: () => void;
}

interface PortfolioItemProps {
  item: Bet;
  lang: 'RU' | 'EN';
  onClick: () => void;
}

const PortfolioItem: React.FC<PortfolioItemProps> = ({ item, lang, onClick }) => {
    const [timer, setTimer] = useState('');

    useEffect(() => {
        const tick = () => {
            if (!item.expiresAt && !item.marketOutcome) {
                 setTimer('—');
                 return;
            }
            if (item.status === 'resolved' || item.marketOutcome) {
                setTimer(lang === 'RU' ? 'ЗАВЕРШЕНО' : 'ENDED');
                return;
            }
            
            const endDate = item.expiresAt ? new Date(item.expiresAt) : new Date();
            const diff = +endDate - +new Date();
            if (diff <= 0) {
                setTimer(lang === 'RU' ? 'ЗАВЕРШЕНО' : 'ENDED');
                return;
            }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            setTimer(`${d}D ${h}H ${m}M`);
        };
        const t = setInterval(tick, 1000);
        tick();
        return () => clearInterval(t);
    }, [item.expiresAt, item.status, item.marketOutcome, lang]);

    // Calculate PnL if possible.
    // For resolved bets: Payout - Amount.
    // For open bets: We don't have entry price, so we can't calculate accurate PnL.
    // We will show "Amount" and "Current Chance".
    
    const isResolved = item.status === 'resolved' || !!item.payout;
    const realizedPnL = isResolved ? (item.payout || 0) - item.amount : 0;
    const realizedPnLPercent = item.amount > 0 ? (realizedPnL / item.amount) * 100 : 0;

    // For open bets, we'll try to estimate if we have price data (assuming entry at 50% for lack of better data? No that's bad).
    // Let's just show Amount and Current Price.
    
    // Actually the picture shows PnL for active bets.
    // We'll mimic the UI structure but if we can't calc PnL, we'll show "Amount".
    // Or we just show 0.00% for open bets.
    
    const displayPnL = isResolved ? realizedPnL : 0; // Placeholder for open
    const displayPercent = isResolved ? realizedPnLPercent : 0;
    
    const isProfit = displayPnL >= 0;
    
    const typeLabel = lang === 'RU' ? (item.side === 'YES' ? 'YES' : 'NO') : item.side; // Picture has "YES" / "NO" even in RU interface maybe? Or localized.
    // The picture shows "YES" in green box. "NO" in pink box.

    // If open, show "Amount" instead of PnL in the main view?
    // The picture shows PnL.
    
    return (
        <div 
            onClick={onClick}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-between group hover:border-zinc-700 transition-colors cursor-pointer"
        >
            <div>
                <div className="flex items-center gap-2 mb-2">
                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${item.side === 'YES' ? 'bg-[#BEFF1D] text-black' : 'bg-[#f544a6] text-black'}`}>
                        {item.side}
                     </span>
                     <span className="text-xs text-white max-w-[150px] truncate group-hover:text-[#BEFF1D] transition-colors font-medium">
                        {item.marketTitle}
                     </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                    <span className={`flex items-center gap-1 ${item.status === 'resolved' ? 'text-zinc-500' : 'text-[#f544a6]'}`}>
                        <Clock size={10} /> {timer}
                    </span>
                </div>
            </div>
            <div className="text-right">
                {isResolved ? (
                    <div className={`font-mono text-sm font-bold ${isProfit ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                        {isProfit ? '+' : ''}${Math.abs(displayPnL).toFixed(2)} ({Math.abs(displayPercent).toFixed(1)}%)
                    </div>
                ) : (
                    <div className="font-mono text-sm font-bold text-white">
                        ${item.amount.toFixed(2)}
                    </div>
                )}
                <div className="text-[10px] text-zinc-500 mt-1">
                    {/* Placeholder for shares info since we don't have it */}
                    {isResolved ? (
                        <span>{lang === 'RU' ? 'Завершено' : 'Resolved'}</span>
                    ) : (
                       <span>Invested</span>
                    )}
                </div>
            </div>
        </div>
    );
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, bets, lang, onMarketClick, onLogout }) => {
  
  if (!isOpen || !user) return null;

  // Calculate Total PnL (Realized only for now)
  const totalRealizedPnL = bets
    .filter(b => b.status === 'resolved' || b.payout !== null)
    .reduce((acc, b) => acc + ((b.payout || 0) - b.amount), 0);
    
  const isPositivePnL = totalRealizedPnL >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      ></div>
      <div className="relative bg-[#09090b] border border-zinc-800 w-full max-w-lg rounded-xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white tracking-wide uppercase flex items-center gap-2">
                <Wallet size={18} className="text-zinc-500"/>
                {lang === 'RU' ? 'ПОРТФОЛИО' : 'PORTFOLIO'}
            </h2>
            <button 
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest block mb-1">
                    {lang === 'RU' ? 'БАЛАНС' : 'BALANCE'}
                </span>
                <span className="text-2xl font-mono text-white tracking-tight">${user.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(',', ' ')}</span>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative overflow-hidden">
                <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-widest block mb-1">
                    PNL (PROFIT/LOSS)
                </span>
                <div className="flex items-center gap-2">
                    <span className={`text-2xl font-mono tracking-tight ${isPositivePnL ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                        {isPositivePnL ? '+' : ''}${Math.abs(totalRealizedPnL).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace('.', ',')}
                    </span>
                    {isPositivePnL ? <TrendingUp size={16} className="text-[#BEFF1D]"/> : <TrendingDown size={16} className="text-[#f544a6]"/>}
                </div>
            </div>
        </div>

        {/* Active Bets List */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 sticky top-0 bg-[#09090b] py-2 z-10">
                {lang === 'RU' ? 'АКТИВНЫЕ СТАВКИ' : 'ACTIVE BETS'}
            </h3>
            <div className="space-y-3">
                {bets && bets.length > 0 ? (
                    bets.map((bet) => (
                        <PortfolioItem 
                            key={bet.id} 
                            item={bet} 
                            lang={lang} 
                            onClick={() => onMarketClick(String(bet.marketId || ''))}
                        />
                    ))
                ) : (
                    <div className="text-center py-10 text-zinc-600 text-sm">
                        {lang === 'RU' ? 'Нет активных ставок' : 'No active bets'}
                    </div>
                )}
            </div>
        </div>

        {/* Footer actions? Maybe Logout if needed, but picture doesn't show it explicitly. Keeping generic close or nothing. */}
        {/* We keep the footer empty or just padding if needed. The modal height is handled. */}
      </div>
    </div>
  );
};

export default UserProfileModal;
