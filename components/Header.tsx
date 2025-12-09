import React from 'react';
import { Search, Globe, HelpCircle } from 'lucide-react';

interface HeaderProps {
  lang: 'RU' | 'EN';
  onToggleLang: () => void;
  onHelpClick: () => void;
}

// Custom Minimalist Normis Icon (Abstract Geometric)
const NormisIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect x="4" y="4" width="16" height="16" rx="4" stroke="#BEFF1D" strokeWidth="1.5" strokeOpacity="0.8" />
    <circle cx="12" cy="12" r="3" fill="#BEFF1D" />
  </svg>
);

const Header: React.FC<HeaderProps> = ({ lang, onToggleLang, onHelpClick }) => {
  return (
    <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer group">
          <div className="transition-transform group-hover:rotate-90 duration-500">
            <NormisIcon size={26} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-white leading-none uppercase group-hover:text-[#BEFF1D] transition-colors">
              NORMIS MARKET
            </h1>
          </div>
        </div>

        {/* Search (Desktop) */}
        <div className="hidden md:flex flex-1 max-w-lg mx-8 relative">
          <input 
            type="text" 
            placeholder={lang === 'RU' ? "Поиск..." : "Search..."}
            className="w-full bg-black border border-neutral-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-neutral-600 focus:outline-none transition-all placeholder:text-neutral-700"
          />
          <Search size={16} className="absolute left-3.5 top-2.5 text-neutral-700" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          
          {/* Help Button */}
          <button
            onClick={onHelpClick}
            className="flex items-center justify-center p-2 rounded-lg border border-neutral-800 hover:border-neutral-600 text-neutral-400 hover:text-white transition-colors"
            title={lang === 'RU' ? 'Помощь' : 'Help'}
          >
            <HelpCircle size={16} />
          </button>

          {/* Lang Toggle */}
          <button 
            onClick={onToggleLang}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 hover:border-neutral-600 text-xs font-bold text-neutral-400 hover:text-white transition-colors"
          >
            <Globe size={12} />
            {lang}
          </button>

        </div>
      </div>
    </header>
  );
};

export default Header;