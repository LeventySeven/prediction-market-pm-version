import React from 'react';
import type { LeaderboardUser } from '../types';
import { Trophy } from 'lucide-react';

interface LeaderboardProps {
  users: LeaderboardUser[];
  onUserClick: (user: LeaderboardUser) => void;
  lang: 'RU' | 'EN';
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, onUserClick, lang }) => {
  const formatPnl = (value: number) =>
    `$${value.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })}`;

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-start gap-3">
        <div className="pt-0.5">
          <Trophy
            size={20}
            className="trophy-glow"
          />
        </div>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-white leading-none">
            {lang === 'RU' ? 'Лидерборд' : 'Leaderboard'}
          </div>
          <div className="mt-1 text-[10px] text-neutral-500 uppercase tracking-wider">
            {lang === 'RU' ? 'Топ трейдеров по прибыли' : 'Top Traders by Profit'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {users.map((user) => (
            <div 
                key={user.id}
                onClick={() => onUserClick(user)}
                className="bg-neutral-900/40 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-neutral-800/60 transition-colors group"
            >
                {/* Rank (no outline / no badge) */}
                <div
                  className={`w-6 text-center font-mono text-xs tabular-nums ${
                    user.rank === 1 ? 'text-white' : 'text-neutral-500'
                  }`}
                >
                  {user.rank}
                </div>
                
                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full bg-black object-cover" />
                
                <div className="flex-1">
                    <h3 className="font-bold text-white text-sm transition-colors">{user.name}</h3>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        {user.betCount ?? 0} {lang === 'RU' ? 'ставок' : 'bets'}
                    </p>
                </div>

                {/* PnL (numbers only, aligned) */}
                <div
                  className={`w-[140px] text-right font-mono font-bold tabular-nums ${
                    (user.pnl || 0) >= 0 ? 'text-[rgba(245,68,166,1)]' : 'text-[rgba(245,68,166,1)]'
                  }`}
                >
                  {(user.pnl || 0) >= 0 ? '+' : ''}
                  {formatPnl(user.pnl || 0)}
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;