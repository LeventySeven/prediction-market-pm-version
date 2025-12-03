
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MarketCard from './components/MarketCard';
import MarketPage from './components/MarketPage';
import OnboardingModal from './components/OnboardingModal';
import AuthModal from './components/AuthModal';
import { MOCK_MARKETS, CATEGORIES } from './constants';
import { Category, User } from './types';
import { Search } from 'lucide-react';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
        setTimeout(() => setShowOnboarding(true), 1000);
    }
  }, []);

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('hasSeenOnboarding', 'true');
  };

  const handleLogin = () => {
    setUser({
        id: 'u1',
        email: 'user@pravda.market',
        balance: 1500.00
    });
  };

  const filteredMarkets = MOCK_MARKETS.filter(market => {
    const matchesCategory = activeCategory === 'ALL' || market.category === activeCategory;
    const matchesSearch = market.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const selectedMarket = MOCK_MARKETS.find(m => m.id === selectedMarketId);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#BEFF1D] selection:text-black">
      <Header onLoginClick={() => setShowAuth(true)} user={user} />
      
      <main>
        {selectedMarket ? (
           <MarketPage 
                market={selectedMarket} 
                user={user} 
                onBack={() => setSelectedMarketId(null)}
                onLogin={() => setShowAuth(true)}
           />
        ) : (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
                {/* Categories Bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                <div className="flex overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto scrollbar-hide">
                    {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap border
                        ${activeCategory === cat.id 
                            ? 'bg-[#BEFF1D] text-black border-[#BEFF1D]' 
                            : 'bg-transparent text-neutral-400 border-transparent hover:bg-neutral-900 hover:text-white'
                        }`}
                    >
                        <span>{cat.icon}</span>
                        {cat.label}
                    </button>
                    ))}
                </div>
                
                {/* Mobile Search */}
                <div className="relative w-full md:hidden">
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Поиск..." 
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-[#BEFF1D] focus:outline-none"
                    />
                    <Search size={16} className="absolute left-3.5 top-2.5 text-neutral-500" />
                </div>
                </div>

                {/* Markets Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredMarkets.length > 0 ? (
                    filteredMarkets.map((market) => (
                    <MarketCard 
                        key={market.id} 
                        market={market} 
                        onClick={() => setSelectedMarketId(market.id)}
                    />
                    ))
                ) : (
                    <div className="col-span-full text-center py-20 text-neutral-500">
                        <p className="text-lg mb-2">Ничего не найдено</p>
                        <p className="text-sm">Попробуйте другой запрос</p>
                    </div>
                )}
                </div>
            </div>
        )}
      </main>

      <OnboardingModal isOpen={showOnboarding} onClose={handleCloseOnboarding} />
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} onLogin={handleLogin} />
    </div>
  );
};

export default App;