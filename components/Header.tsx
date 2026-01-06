import React from 'react';
import { Search, Globe, HelpCircle, Wallet } from 'lucide-react';
import Button from './Button';
import { User } from '../types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  user?: User | null;
  onAuthClick?: () => void;
  lang?: 'RU' | 'EN';
  onToggleLang?: () => void;
  onHelpClick?: () => void;
  onLogoClick?: () => void;
}

// Exact logo from ylogo2.svg
const YallaIcon = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size * (554 / 297)}
    viewBox="0 0 297 554"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <g clipPath="url(#clip0_579_11)">
      <path d="M0 491.137L108.931 425.633V423.309L0 357.515V296.077L148.727 387.725L297.455 294.625V357.079L189.25 423.309V425.633L297.455 491.863V554.026L148.727 460.055L0 552.864V491.137Z" fill="currentColor"/>
      <circle cx="148.5" cy="148.5" r="125" stroke="currentColor" strokeWidth="47"/>
    </g>
    <defs>
      <clipPath id="clip0_579_11">
        <rect width="297" height="554" fill="white"/>
      </clipPath>
    </defs>
  </svg>
);

const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  user,
  onAuthClick,
  lang = 'RU',
  onToggleLang,
  onHelpClick,
  onLogoClick,
}) => {
  const t = {
    home: lang === 'RU' ? 'На главную' : 'Go to home',
    search: lang === 'RU' ? 'Поиск...' : 'Search...',
    help: lang === 'RU' ? 'Помощь' : 'Help',
    registration: lang === 'RU' ? 'Регистрация' : 'Registration',
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-900 bg-black/80 backdrop-blur supports-[backdrop-filter]:bg-black/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <div
          className={`flex items-center gap-2 group ${onLogoClick ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
          aria-label={onLogoClick ? t.home : undefined}
        >
          <div className="transition-transform group-hover:rotate-90 duration-500 text-white">
            <YallaIcon size={24} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none uppercase transition-colors">
              YALLA MARKET
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
            className="flex h-9 w-full rounded-full border border-zinc-900 bg-zinc-950/40 px-3 py-1 pl-9 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-600" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onHelpClick && (
            <button
              onClick={onHelpClick}
              className="inline-flex items-center justify-center rounded-full text-sm font-medium ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700 border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 text-zinc-300 hover:text-white h-9 w-9"
              title={t.help}
            >
              <HelpCircle size={16} className="text-white" />
            </button>
          )}

          {onToggleLang && (
            <button
              onClick={onToggleLang}
              className="inline-flex items-center justify-center rounded-full text-xs font-bold ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700 border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 text-zinc-300 hover:text-white h-9 px-3 gap-2"
            >
              <Globe size={12} className="text-white" />
              {lang}
            </button>
          )}

          {!user && onAuthClick && (
            <Button type="button" onClick={onAuthClick} className="flex items-center gap-2 text-sm">
              <Wallet size={16} />
              <span>{t.registration}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;