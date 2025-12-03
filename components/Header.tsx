
import React from 'react';
import { Scale, Search, User as UserIcon, Wallet } from 'lucide-react';
import Button from './Button';
import { User } from '../types';

interface HeaderProps {
  onLoginClick: () => void;
  user: User | null;
}

const Header: React.FC<HeaderProps> = ({ onLoginClick, user }) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer group">
          <div className="text-[#BEFF1D] transition-transform group-hover:scale-110 duration-200">
            <Scale size={26} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">Pravda</h1>
          </div>
        </div>

        {/* Search (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-lg mx-8 relative">
          <input 
            type="text" 
            placeholder="Поиск по рынкам..." 
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-[#BEFF1D] focus:outline-none focus:ring-1 focus:ring-[#BEFF1D] transition-all placeholder:text-neutral-600"
          />
          <Search size={16} className="absolute left-3.5 top-2.5 text-neutral-500" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {user ? (
             <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 pl-4 pr-1.5 hover:border-neutral-700 transition-colors cursor-pointer group">
                <span className="text-sm font-bold text-[#BEFF1D] group-hover:text-white transition-colors">${user.balance.toLocaleString()}</span>
                <div className="h-7 w-7 bg-neutral-800 rounded flex items-center justify-center border border-neutral-700 group-hover:border-neutral-600">
                    <UserIcon size={14} className="text-white" />
                </div>
             </div>
          ) : (
            <>
              <Button variant="ghost" onClick={onLoginClick} className="hidden sm:inline-flex text-sm font-medium hover:text-[#BEFF1D]">Вход</Button>
              <Button onClick={onLoginClick} className="flex items-center gap-2 text-sm">
                <Wallet size={16} />
                <span>Регистрация</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
