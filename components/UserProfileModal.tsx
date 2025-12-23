import React, { useEffect, useState } from 'react';
import { User, Bet, Trade } from '../types';
import { X, TrendingUp, TrendingDown, Clock, Wallet, DollarSign } from 'lucide-react';
import Button from './Button';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  bets: Bet[];
  soldTrades: Trade[];
  realizedPnl: number;
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
    const isSettled = item.status === 'won' || item.status === 'lost';
    const shares =
      typeof item.shares === 'number'
        ? item.shares
        : item.priceAtBet && item.priceAtBet > 0
        ? item.amount / item.priceAtBet
        : null;
    const entryPrice =
      typeof item.priceAtBet === 'number'
        ? item.priceAtBet
        : shares
        ? item.amount / shares
        : null;
    const currentSidePrice =
      item.side === 'YES'
        ? item.priceYes ?? null
        : item.priceNo ?? null;
    const markValue =
      shares !== null && currentSidePrice !== null ? shares * currentSidePrice : null;
    const realizedPnL = (item.payout ?? 0) - item.amount;
    const unrealizedPnL = markValue !== null ? markValue - item.amount : null;
    const displayPnL = isSettled ? realizedPnL : unrealizedPnL ?? 0;
    const displayPercent = item.amount > 0 ? (displayPnL / item.amount) * 100 : 0;
    const isProfit = displayPnL >= 0;

    useEffect(() => {
        const tick = () => {
            if (!item.expiresAt && !item.marketOutcome) {
                 setTimer('—');
                 return;
            }
            if (isSettled || item.marketOutcome) {
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
    }, [item.expiresAt, item.status, item.marketOutcome, lang, isSettled]);

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
                    <span className={`flex items-center gap-1 ${isSettled ? 'text-zinc-500' : 'text-[#f544a6]'}`}>
                        <Clock size={10} /> {timer}
                    </span>
                </div>
            </div>
            <div className="text-right">
                {isSettled ? (
                    <div className={`font-mono text-sm font-bold ${isProfit ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                        {isProfit ? '+' : ''}${Math.abs(displayPnL).toFixed(2)} ({Math.abs(displayPercent).toFixed(1)}%)
                    </div>
                ) : (
                    <div className="font-mono text-sm font-bold text-white">
                        {unrealizedPnL !== null
                          ? `${isProfit ? '+' : ''}$${Math.abs(unrealizedPnL).toFixed(2)}`
                          : `$${item.amount.toFixed(2)}`
                        }
                    </div>
                )}
                <div className="text-[10px] text-zinc-500 mt-1 flex flex-col items-end">
                    {shares !== null && entryPrice !== null && (
                      <span>
                        {shares.toFixed(2)} sh @ ${entryPrice.toFixed(2)}
                      </span>
                    )}
                    <span className="uppercase tracking-wider">
                      {isSettled
                        ? item.status === 'won'
                          ? (lang === 'RU' ? 'ВЫИГРЫШ' : 'WON')
                          : (lang === 'RU' ? 'ПОТЕРЯ' : 'LOST')
                        : (lang === 'RU' ? 'ОТКРЫТА' : 'OPEN')}
                    </span>
                </div>
            </div>
        </div>
    );
};

interface SellHistoryItemProps {
  trade: Trade;
  lang: 'RU' | 'EN';
  onClick: () => void;
}

const SellHistoryItem: React.FC<SellHistoryItemProps> = ({ trade, lang, onClick }) => {
  const sharesSold = Math.abs(trade.sharesDelta);
  const payout = trade.collateralNet;
  const fee = trade.fee;
  const created = new Date(trade.createdAt);
  const formattedDate = created.toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const avgExitPrice =
    trade.avgExitPrice ?? (sharesSold > 0 ? trade.collateralGross / sharesSold : null);
  const avgEntryPrice = trade.avgEntryPrice ?? null;
  const realizedPnlValue =
    typeof trade.realizedPnl === 'number'
      ? trade.realizedPnl
      : avgEntryPrice !== null && avgExitPrice !== null
      ? (avgExitPrice - avgEntryPrice) * sharesSold
      : null;
  const pnlIsPositive = (realizedPnlValue ?? 0) >= 0;
  const formatPrice = (value: number | null) =>
    value !== null && Number.isFinite(value) ? `$${value.toFixed(3)}` : lang === 'RU' ? '—' : '—';

  return (
    <div
      onClick={onClick}
      className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 flex items-center justify-between hover:border-zinc-700 transition-colors cursor-pointer"
    >
      <div>
        <div className="text-xs font-semibold text-white mb-1">
          {trade.marketTitleRu || trade.marketTitleEn || trade.marketId}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
          <DollarSign size={10} /> {lang === 'RU' ? 'Продажа' : 'Sell'} · {formattedDate}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm text-[#BEFF1D]">
          +${payout.toFixed(2)}
        </div>
        <div className="text-[11px] text-zinc-500">
          {sharesSold.toFixed(2)} sh · fee ${fee.toFixed(2)}
        </div>
        <div className="text-[11px] text-zinc-500">
          {lang === 'RU' ? 'Куплено' : 'Bought'} {formatPrice(avgEntryPrice)} ·{' '}
          {lang === 'RU' ? 'Продано' : 'Sold'} {formatPrice(avgExitPrice)}
        </div>
        {realizedPnlValue !== null && (
          <div
            className={`text-[11px] font-mono ${
              pnlIsPositive ? 'text-[#BEFF1D]' : 'text-[#f544a6]'
            }`}
          >
            {lang === 'RU' ? 'Профит' : 'P&L'} {pnlIsPositive ? '+' : '-'}$
            {Math.abs(realizedPnlValue).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  bets,
  soldTrades,
  realizedPnl,
  lang,
  onMarketClick,
  onLogout,
}) => {
  
  if (!isOpen || !user) return null;

  const isOwnProfile = Boolean(onLogout);
  const totalRealizedPnL = realizedPnl;
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

        {/* Bets Lists */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-4 space-y-8">
          <section>
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
                    onClick={() => onMarketClick(bet.marketId)}
                  />
                ))
              ) : (
                <div className="text-center py-10 text-zinc-600 text-sm">
                  {lang === 'RU' ? 'Нет активных ставок' : 'No active bets'}
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 sticky top-0 bg-[#09090b] py-2 z-10">
              {lang === 'RU' ? 'ПРОДАННЫЕ СТАВКИ' : 'SOLD BETS'}
            </h3>
            <div className="space-y-3">
              {soldTrades && soldTrades.length > 0 ? (
                soldTrades.map((trade) => (
                  <SellHistoryItem
                    key={trade.id}
                    trade={trade}
                    lang={lang}
                    onClick={() => onMarketClick(trade.marketId)}
                  />
                ))
              ) : (
                <div className="text-center py-6 text-zinc-600 text-sm">
                  {lang === 'RU' ? 'Нет завершённых продаж' : 'No sold bets yet'}
                </div>
              )}
            </div>
          </section>
        </div>

        {isOwnProfile && onLogout && (
            <div className="mt-auto pt-4 border-t border-zinc-800">
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={onLogout}
                  className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                >
                    {lang === 'RU' ? 'Выйти' : 'Log Out'}
                </Button>
            </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;
