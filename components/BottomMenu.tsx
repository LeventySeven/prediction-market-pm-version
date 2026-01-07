
import React from 'react';
import { Home, LayoutGrid, Plus, User as UserIcon, Users } from 'lucide-react';
import { User } from '../types';

export type ViewType = 'FRIENDS' | 'FEED' | 'CATALOG' | 'PROFILE';

interface BottomMenuProps {
  currentView: ViewType;
  onChange: (view: ViewType) => void;
  onCreateMarket: () => void;
  lang: 'RU' | 'EN';
  user: User | null;
  onLoginRequest: () => void;
}

const BottomMenu: React.FC<BottomMenuProps> = ({ currentView, onChange, onCreateMarket, lang, user, onLoginRequest }) => {
  
  const handleProtectedClick = (view: ViewType) => {
    if (!user && view === 'PROFILE') {
        onLoginRequest();
    } else {
        onChange(view);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-black/90 backdrop-blur border-t border-zinc-900 flex items-center justify-around z-50 pb-safe">
      <button
        onClick={() => onChange('FRIENDS')}
        className={`flex flex-col items-center justify-center gap-1.5 w-20 ${
          currentView === 'FRIENDS' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Users size={20} />
        <span className="text-[11px] font-medium">{lang === 'RU' ? 'Друзья' : 'Friends'}</span>
      </button>

      <button
        onClick={() => onChange('FEED')}
        className={`flex flex-col items-center justify-center gap-1.5 w-20 ${
          currentView === 'FEED' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Home size={20} />
        <span className="text-[11px] font-medium">{lang === 'RU' ? 'Лента' : 'Feed'}</span>
      </button>

      <button
        type="button"
        onClick={onCreateMarket}
        className="flex flex-col items-center justify-center gap-1.5 w-20 text-zinc-200 hover:text-white"
        aria-label={lang === 'RU' ? 'Создать рынок' : 'Create market'}
        title={lang === 'RU' ? 'Создать рынок' : 'Create market'}
      >
        <div className="h-11 w-11 rounded-full border-2 border-[rgba(245,68,166,1)] bg-black text-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.10)] transition-all shadow-lg flex items-center justify-center">
          <Plus size={22} />
        </div>
        <span className="sr-only">{lang === 'RU' ? 'Создать рынок' : 'Create market'}</span>
      </button>

      <button
        onClick={() => onChange('CATALOG')}
        className={`flex flex-col items-center justify-center gap-1.5 w-20 ${
          currentView === 'CATALOG' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <LayoutGrid size={20} />
        <span className="text-[11px] font-medium">{lang === 'RU' ? 'Каталог' : 'Catalog'}</span>
      </button>

      <button
        onClick={() => handleProtectedClick('PROFILE')}
        className={`flex flex-col items-center justify-center gap-1.5 w-20 ${
          currentView === 'PROFILE' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <UserIcon size={20} />
        <span className="text-[11px] font-medium">{lang === 'RU' ? 'Профиль' : 'Profile'}</span>
      </button>
    </div>
  );
};

export default BottomMenu;
