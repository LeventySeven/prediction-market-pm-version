import React from 'react';
import { Search, Globe, HelpCircle, User as UserIcon, Wallet, Plus } from 'lucide-react';
import Button from './Button';
import { User } from '../types';

interface HeaderProps {
  onLoginClick: () => void;
  user: User | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onProfileClick?: () => void;
  onAdminClick?: () => void;
  lang?: 'RU' | 'EN';
  onToggleLang?: () => void;
  onHelpClick?: () => void;
  onLogoClick?: () => void;
}

// Custom Minimalist Normis Icon (Abstract Geometric)
const NormisIcon = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect
      x="4"
      y="4"
      width="16"
      height="16"
      rx="4"
      stroke="#BEFF1D"
      strokeWidth="1.5"
      strokeOpacity="0.8"
    />
    <circle cx="12" cy="12" r="3" fill="#BEFF1D" />
  </svg>
);

const Header: React.FC<HeaderProps> = ({
  onLoginClick,
  user,
  searchQuery,
  onSearchChange,
  onProfileClick,
  onAdminClick,
  lang = 'RU',
  onToggleLang,
  onHelpClick,
  onLogoClick,
}) => {
  const t = {
    home: lang === 'RU' ? 'На главную' : 'Go to home',
    search: lang === 'RU' ? 'Поиск...' : 'Search...',
    help: lang === 'RU' ? 'Помощь' : 'Help',
    createMarket: lang === 'RU' ? 'Создать рынок' : 'Create market',
    login: lang === 'RU' ? 'Вход' : 'Log in',
    registration: lang === 'RU' ? 'Регистрация' : 'Registration',
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur supports-[backdrop-filter]:bg-[#09090b]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div
          className={`flex items-center gap-2 group ${onLogoClick ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
          aria-label={onLogoClick ? t.home : undefined}
        >
          <div className="transition-transform group-hover:rotate-90 duration-500">
            <NormisIcon size={24} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none uppercase group-hover:text-[#BEFF1D] transition-colors">
              NORMIS MARKET
            </h1>
          </div>
        </div>

        {/* Search (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-sm mx-8 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t.search}
            className="flex h-9 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-1 pl-9 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#BEFF1D] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onHelpClick && (
            <button
              onClick={onHelpClick}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEFF1D] hover:bg-zinc-800 hover:text-zinc-50 h-9 w-9"
              title={t.help}
            >
              <HelpCircle size={16} />
            </button>
          )}

          {onToggleLang && (
            <button
              onClick={onToggleLang}
              className="inline-flex items-center justify-center rounded-md text-xs font-bold ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEFF1D] border border-zinc-800 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white h-9 px-3 gap-2"
            >
              <Globe size={12} />
              {lang}
            </button>
          )}

          {user?.isAdmin && onAdminClick && (
            <>
              <Button variant="secondary" onClick={onAdminClick} className="hidden sm:inline-flex text-sm">
                {t.createMarket}
              </Button>
              <button
                onClick={onAdminClick}
                className="sm:hidden inline-flex items-center justify-center rounded-md border border-zinc-800 bg-neutral-900 text-white hover:border-[#BEFF1D] h-9 w-9"
                aria-label={t.createMarket}
              >
                <Plus size={16} />
              </button>
            </>
          )}

          {user ? (
            <button
              onClick={onProfileClick}
              className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 pl-4 pr-1.5 hover:border-neutral-700 transition-colors cursor-pointer group"
            >
              <span className="text-sm font-bold text-[#BEFF1D] group-hover:text-white transition-colors">
                ${user.balance.toLocaleString()}
              </span>
              <div className="h-7 w-7 bg-neutral-800 rounded flex items-center justify-center border border-neutral-700 group-hover:border-neutral-600">
                <UserIcon size={14} className="text-white" />
              </div>
            </button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onLoginClick}
                className="hidden sm:inline-flex text-sm font-medium hover:text-[#BEFF1D]"
              >
                {t.login}
              </Button>
              <Button onClick={onLoginClick} className="flex items-center gap-2 text-sm">
                <Wallet size={16} />
                <span>{t.registration}</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;