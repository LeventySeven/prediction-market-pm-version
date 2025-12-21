import React, { useState, useEffect } from 'react';
import { LeaderboardUser } from '../types';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';

interface LeaderboardProps {
  users: LeaderboardUser[];
  onUserClick: (user: LeaderboardUser) => void;
  lang: 'RU' | 'EN';
}

const Leaderboard: React.FC<LeaderboardProps> = ({ users, onUserClick, lang }) => {
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
        setGlow(prev => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 pb-24 animate-fade-in">
      <div className="text-center mb-8">
        <Trophy 
            size={48} 
            className={`mx-auto mb-4 transition-all duration-1000 ${glow ? 'text-[#BEFF1D] drop-shadow-[0_0_8px_rgba(190,255,29,0.5)]' : 'text-neutral-600'}`} 
        />
        <h2 className="text-2xl font-bold uppercase tracking-widest text-white mb-2">
            {lang === 'RU' ? 'Лидерборд' : 'Leaderboard'}
        </h2>
        <p className="text-xs text-neutral-500 uppercase tracking-wider">
            {lang === 'RU' ? 'Топ трейдеров по прибыли' : 'Top Traders by Profit'}
        </p>
      </div>

      <div className="space-y-3">
        {users.map((user) => (
            <div 
                key={user.id}
                onClick={() => onUserClick(user)}
                className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-neutral-800/80 hover:border-neutral-700 transition-all group"
            >
                {/* Monochrome Minimalist Rank Badge */}
                <div className={`w-8 h-8 flex items-center justify-center font-bold font-mono rounded text-sm ${
                    user.rank === 1 ? 'bg-white text-black' : 
                    user.rank === 2 ? 'bg-neutral-400 text-black' : 
                    user.rank === 3 ? 'bg-neutral-600 text-black' : 
                    'bg-neutral-800 text-white'
                }`}>
                    {user.rank}
                </div>
                
                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full bg-black object-cover grayscale" />
                
                <div className="flex-1">
                    <h3 className="font-bold text-white text-sm group-hover:text-[#BEFF1D] transition-colors">{user.name}</h3>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        {user.betCount ?? 0} {lang === 'RU' ? 'ставок' : 'bets'}
                    </p>
                </div>

                <div className="text-right">
                    <div className={`font-mono font-bold flex items-center justify-end gap-1 ${(user.pnl || 0) >= 0 ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                        {(user.pnl || 0) >= 0 ? '+' : ''}${(user.pnl || 0).toLocaleString()}
                        {(user.pnl || 0) >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                    </div>
                     <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Profit</span>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default Leaderboard;