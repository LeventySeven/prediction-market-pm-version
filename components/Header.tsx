import React from 'react';
import Image from 'next/image';
import { Globe, HelpCircle, Wallet } from 'lucide-react';
import Button from './Button';
import { User } from '../types';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  user?: User | null;
  onAuthClick?: () => void;
  lang?: 'RU' | 'EN';
  onToggleLang?: () => void;
  onHelpClick?: () => void;
  onLogoClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onAuthClick,
  lang = 'RU',
  onToggleLang,
  onHelpClick,
  onLogoClick,
}) => {
  const t = {
    home: lang === 'RU' ? 'На главную' : 'Go to home',
    help: lang === 'RU' ? 'Помощь' : 'Help',
    registration: lang === 'RU' ? 'Регистрация' : 'Registration',
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-900/90 bg-black/85 backdrop-blur-xl supports-[backdrop-filter]:bg-black/70">
      <div className="flex h-8 items-center justify-center border-b border-zinc-900/60 bg-zinc-950/80 px-4">
        <a
          href="https://www.yallamarket.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-white"
        >
          pre markets →
        </a>
      </div>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <div
          className={`flex items-center gap-2 ${onLogoClick ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={onLogoClick}
          role={onLogoClick ? 'button' : undefined}
          aria-label={onLogoClick ? t.home : undefined}
        >
          <Image
            src="/white.svg"
            alt="Logo"
            width={64}
            height={16}
            className="h-4 w-auto block"
            draggable={false}
          />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none uppercase transition-colors">
              YALLA MARKET
            </h1>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onHelpClick && (
            <button
              onClick={onHelpClick}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/70 text-sm font-medium text-zinc-300 ring-offset-black transition-colors hover:bg-zinc-950/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
              title={t.help}
            >
              <HelpCircle size={16} className="text-white" />
            </button>
          )}

          {onToggleLang && (
            <button
              onClick={onToggleLang}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 text-xs font-bold text-zinc-300 ring-offset-black transition-colors hover:bg-zinc-950/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-700"
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
