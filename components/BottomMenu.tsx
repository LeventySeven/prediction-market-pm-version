
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
    <div className="fixed bottom-0 left-0 right-0 h-14 bg-black/90 backdrop-blur border-t border-zinc-900 flex items-center justify-around z-50 pb-safe">
      <button
        onClick={() => onChange('LEADERBOARD')}
        className={`flex flex-col items-center justify-center gap-1 w-16 ${
          currentView === 'LEADERBOARD' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Trophy size={18} />
        <span className="text-[10px] font-medium">{lang === 'RU' ? 'Топ' : 'Top'}</span>
      </button>

      <button
        onClick={() => onChange('REFERRALS')}
        className={`flex flex-col items-center justify-center gap-1 w-16 ${
          currentView === 'REFERRALS' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Users size={18} />
        <span className="text-[10px] font-medium">{lang === 'RU' ? 'Друзья' : 'Friends'}</span>
      </button>

      <button
        onClick={() => onChange('EVENTS')}
        className={`flex flex-col items-center justify-center gap-1 w-16 ${
          currentView === 'EVENTS' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Zap size={18} />
        <span className="text-[10px] font-medium">{lang === 'RU' ? 'События' : 'Events'}</span>
      </button>

      <button
        onClick={() => handleProtectedClick('WALLET')}
        className={`flex flex-col items-center justify-center gap-1 w-16 ${
          currentView === 'WALLET' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Wallet size={18} />
        <span className="text-[10px] font-medium">{lang === 'RU' ? 'Кошелек' : 'Wallet'}</span>
      </button>

      <button
        onClick={() => handleProtectedClick('PROFILE')}
        className={`flex flex-col items-center justify-center gap-1 w-16 ${
          currentView === 'PROFILE' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <UserIcon size={18} />
        <span className="text-[10px] font-medium">{lang === 'RU' ? 'Профиль' : 'Profile'}</span>
      </button>
    </div>
  );
};

export default BottomMenu;
