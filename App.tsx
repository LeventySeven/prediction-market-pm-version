


import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MarketCard from './components/MarketCard';
import MarketPage from './components/MarketPage';
import OnboardingModal from './components/OnboardingModal';
import AuthModal from './components/AuthModal';
import UserProfileModal from './components/UserProfileModal';
import BottomMenu, { ViewType } from './components/BottomMenu';
import Leaderboard from './components/Leaderboard';
import Referrals from './components/Referrals';
import WalletPage from './components/WalletPage';
import SuggestMarketModal from './components/SuggestMarketModal';
import Button from './components/Button';
import { MOCK_MARKETS, CATEGORIES, MOCK_LEADERBOARD } from './constants';
import { Category, User, Market } from './types';
import { Search, Plus } from 'lucide-react';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  
  // Navigation & User State
  const [currentView, setCurrentView] = useState<ViewType>('EVENTS');
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState<'RU' | 'EN'>('RU');
  
  // Market & Profile Logic
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>(MOCK_MARKETS);
  
  // Profile Modal State (can be own profile or other user)
  const [profileModalUser, setProfileModalUser] = useState<User | null>(null);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
        setTimeout(() => setShowOnboarding(true), 1000);
    }
  }, []);

  const handleToggleLang = () => {
    setLang(prev => prev === 'RU' ? 'EN' : 'RU');
  };

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('hasSeenOnboarding', 'true');
  };

  const handleLogin = () => {
    // Simulate login with mock portfolio data
    setUser({
        id: 'u1',
        name: 'You',
        email: 'user@nothing.market',
        balance: 1500.00,
        pnl: 342.50,
        portfolio: [
            {
                id: 'p1',
                marketId: '4',
                marketTitle: 'Bitcoin > $125k 2025',
                type: 'YES',
                shares: 1000,
                avgPrice: 0.25,
                currentPrice: 0.33,
                endDate: '2025-12-31'
            },
            {
                id: 'p2',
                marketId: '2',
                marketTitle: 'Dolina Case',
                type: 'NO',
                shares: 500,
                avgPrice: 0.60,
                currentPrice: 0.58,
                endDate: '2024-12-31'
            }
        ],
        referrals: 3
    });
  };

  const handleLogout = () => {
      setUser(null);
      setProfileModalUser(null);
      setCurrentView('EVENTS');
  };

  const handleUpdateUser = (updatedUser: User) => {
      setUser(updatedUser);
      setProfileModalUser(updatedUser); // Update modal if open
  };

  // Open Profile (Bottom Menu)
  const handleViewChange = (view: ViewType) => {
      if (view === 'PROFILE') {
          // Instead of a page, we open the modal for self
          setProfileModalUser(user);
      } else {
          setCurrentView(view);
      }
  };

  // Open Market Details
  const handleMarketClick = (marketId: string) => {
      setSelectedMarketId(marketId);
      setProfileModalUser(null); // Close profile if open
  };

  // Inspect User from Leaderboard
  const handleInspectUser = (targetUser: User) => {
      setProfileModalUser(targetUser);
  };

  // Add new suggested market
  const handleSuggestMarket = (title: string, category: Category, endDate: string) => {
    const newMarket: Market = {
        id: Date.now().toString(),
        title: title,
        category: category,
        imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=000&color=fff&size=128`,
        volume: '$0',
        endDate: endDate,
        yesPrice: 0.50,
        noPrice: 0.50,
        chance: 50,
        description: "Pending verification.",
        history: [{date: new Date().toLocaleDateString(), value: 50}],
        comments: [],
        isNew: true // Flag for badge
    };
    // Add to top of list
    setMarkets([newMarket, ...markets]);
  };

  const filteredMarkets = markets.filter(market => {
    const matchesCategory = activeCategory === 'ALL' || market.category === activeCategory;
    const matchesSearch = market.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const selectedMarket = markets.find(m => m.id === selectedMarketId);

  // Render Content based on View State
  const renderContent = () => {
      if (selectedMarket) {
          return (
            <MarketPage 
                market={selectedMarket} 
                user={user} 
                onBack={() => setSelectedMarketId(null)}
                onLogin={() => setShowAuth(true)}
                lang={lang}
            />
          );
      }

      switch (currentView) {
          case 'LEADERBOARD':
              return (
                  <Leaderboard 
                    users={MOCK_LEADERBOARD} 
                    lang={lang} 
                    onUserClick={handleInspectUser}
                  />
              );
          case 'REFERRALS':
              return (
                  <Referrals 
                    user={user} 
                    onLogin={() => setShowAuth(true)} 
                    lang={lang} 
                  />
              );
          case 'WALLET':
              return (
                  <WalletPage 
                    user={user}
                    onLogin={() => setShowAuth(true)}
                    lang={lang}
                  />
              );
          case 'EVENTS':
          default:
              return (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 animate-fade-in pb-24">
                    
                    {/* Top Controls: Suggest & Category */}
                    <div className="flex flex-col-reverse md:flex-row items-start md:items-end justify-between gap-6 mb-8">
                        {/* Categories Bar */}
                        <div className="flex overflow-x-auto pb-2 md:pb-0 gap-2 w-full md:w-auto scrollbar-hide">
                            {CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold transition-all whitespace-nowrap border
                                ${activeCategory === cat.id 
                                    ? 'bg-white text-black border-white' 
                                    : 'bg-transparent text-neutral-600 border-transparent hover:bg-neutral-900 hover:text-white'
                                }`}
                            >
                                {lang === 'RU' ? cat.labelRU : cat.labelEN}
                            </button>
                            ))}
                        </div>

                        {/* Suggest Button */}
                        <div className="w-full md:w-auto flex justify-end">
                            <button 
                                onClick={user ? () => setShowSuggestModal(true) : () => setShowAuth(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-[#BEFF1D]/10 text-[#BEFF1D] border border-[#BEFF1D] hover:bg-[#BEFF1D] hover:text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                <Plus size={14} />
                                {lang === 'RU' ? 'Предложить событие' : 'Suggest Event'}
                            </button>
                        </div>
                    </div>
                    
                    {/* Mobile Search */}
                    <div className="relative w-full md:hidden mb-8">
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={lang === 'RU' ? "Поиск..." : "Search..."}
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-white focus:outline-none"
                        />
                        <Search size={16} className="absolute left-3.5 top-2.5 text-neutral-500" />
                    </div>

                    {/* Markets Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredMarkets.length > 0 ? (
                        filteredMarkets.map((market) => (
                        <MarketCard 
                            key={market.id} 
                            market={market} 
                            onClick={() => setSelectedMarketId(market.id)}
                            lang={lang}
                        />
                        ))
                    ) : (
                        <div className="col-span-full text-center py-32 text-neutral-700">
                            <p className="text-xl mb-2 font-light">
                                {lang === 'RU' ? 'НИЧЕГО НЕ НАЙДЕНО' : 'NOTHING HERE'}
                            </p>
                        </div>
                    )}
                    </div>
                </div>
              );
      }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      <Header 
        lang={lang}
        onToggleLang={handleToggleLang}
        onHelpClick={() => setShowOnboarding(true)}
      />
      
      <main>
        {renderContent()}
      </main>

      {/* Bottom Navigation */}
      {!selectedMarket && (
          <BottomMenu 
            currentView={currentView}
            onChange={handleViewChange}
            lang={lang}
            user={user}
            onLoginRequest={() => setShowAuth(true)}
          />
      )}

      <OnboardingModal 
        isOpen={showOnboarding} 
        onClose={handleCloseOnboarding} 
        lang={lang} 
        onToggleLang={handleToggleLang}
      />
      
      <AuthModal 
        isOpen={showAuth} 
        onClose={() => setShowAuth(false)} 
        onLogin={handleLogin} 
      />
      
      <UserProfileModal 
        isOpen={!!profileModalUser} 
        onClose={() => setProfileModalUser(null)} 
        user={profileModalUser}
        currentUser={user}
        lang={lang}
        onMarketClick={handleMarketClick}
        onLogout={handleLogout}
        onUpdateUser={handleUpdateUser}
      />

      <SuggestMarketModal 
        isOpen={showSuggestModal}
        onClose={() => setShowSuggestModal(false)}
        user={user}
        lang={lang}
        onSubmit={handleSuggestMarket}
      />
    </div>
  );
};

export default App;