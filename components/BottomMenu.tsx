
import React from 'react';
import { Trophy, Users, Zap, User as UserIcon, Wallet } from 'lucide-react';
import { User } from '../types';

export type ViewType = 'EVENTS' | 'LEADERBOARD' | 'REFERRALS' | 'PROFILE' | 'WALLET';

interface BottomMenuProps {
  currentView: ViewType;
  onChange: (view: ViewType) => void;
  lang: 'RU' | 'EN';
  user: User | null;
  onLoginRequest: () => void;
}

const BottomMenu: React.FC<BottomMenuProps> = ({ currentView, onChange, lang, user, onLoginRequest }) => {
  
  const handleProtectedClick = (view: ViewType) => {
    if (!user && (view === 'PROFILE' || view === 'WALLET')) {
        onLoginRequest();
    } else {
        onChange(view);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-black border-t border-neutral-900 flex items-center justify-around z-50 pb-safe">
      
      {/* Leaderboard */}
      <button 
        onClick={() => onChange('LEADERBOARD')}
        className={`flex flex-col items-center justify-center gap-1 w-14 ${currentView === 'LEADERBOARD' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
      >
        <Trophy size={18} className={currentView === 'LEADERBOARD' ? 'text-yellow-400' : ''} />
        <span className="text-[9px] font-bold uppercase tracking-wider">{lang === 'RU' ? 'Топ' : 'Top'}</span>
      </button>

      {/* Referrals */}
      <button 
        onClick={() => onChange('REFERRALS')}
        className={`flex flex-col items-center justify-center gap-1 w-14 ${currentView === 'REFERRALS' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
      >
        <Users size={18} />
        <span className="text-[9px] font-bold uppercase tracking-wider">{lang === 'RU' ? 'Друзья' : 'Refs'}</span>
      </button>

      {/* Events (Center Highlight) */}
      <button 
        onClick={() => onChange('EVENTS')}
        className={`flex flex-col items-center justify-center gap-1 w-16 -mt-6 bg-black rounded-full border border-neutral-800 shadow-lg ${currentView === 'EVENTS' ? 'border-[#BEFF1D] shadow-[#BEFF1D]/20' : ''}`}
      >
        <div className={`p-3 rounded-full ${currentView === 'EVENTS' ? 'bg-[#BEFF1D] text-black' : 'bg-neutral-900 text-neutral-500'}`}>
            <Zap size={22} fill={currentView === 'EVENTS' ? 'black' : 'none'} />
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider mb-2 ${currentView === 'EVENTS' ? 'text-[#BEFF1D]' : 'text-neutral-600'}`}>
            {lang === 'RU' ? 'События' : 'Events'}
        </span>
      </button>

      {/* Wallet */}
      <button 
        onClick={() => handleProtectedClick('WALLET')}
        className={`flex flex-col items-center justify-center gap-1 w-14 ${currentView === 'WALLET' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
      >
        <Wallet size={18} />
        <span className="text-[9px] font-bold uppercase tracking-wider">{lang === 'RU' ? 'Кошелек' : 'Wallet'}</span>
      </button>

      {/* Profile */}
      <button 
        onClick={() => handleProtectedClick('PROFILE')}
        className={`flex flex-col items-center justify-center gap-1 w-14 ${currentView === 'PROFILE' ? 'text-white' : 'text-neutral-600 hover:text-neutral-400'}`}
      >
        <UserIcon size={18} />
        <span className="text-[9px] font-bold uppercase tracking-wider">{lang === 'RU' ? 'Профиль' : 'Profile'}</span>
      </button>

    </div>
  );
};

export default BottomMenu;
