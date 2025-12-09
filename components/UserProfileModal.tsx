
import React, { useEffect, useState } from 'react';
import { User, PortfolioPosition } from '../types';
import { X, TrendingUp, TrendingDown, Clock, Wallet, Shield, Edit2, RefreshCw, Save } from 'lucide-react';
import Button from './Button';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null; // The user to display
  currentUser: User | null; // The logged in user
  lang: 'RU' | 'EN';
  onMarketClick: (marketId: string) => void;
  onLogout?: () => void;
  onUpdateUser?: (updatedUser: User) => void; // Callback to save changes
}

interface PortfolioItemProps {
  item: PortfolioPosition;
  lang: 'RU' | 'EN';
  onClick: () => void;
}

const PortfolioItem: React.FC<PortfolioItemProps> = ({ item, lang, onClick }) => {
    const [timer, setTimer] = useState('');

    useEffect(() => {
        const tick = () => {
            const diff = +new Date(item.endDate) - +new Date();
            if (diff <= 0) {
                setTimer(lang === 'RU' ? 'Завершено' : 'Ended');
                return;
            }
            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const m = Math.floor((diff / 1000 / 60) % 60);
            setTimer(`${d}d ${h}h ${m}m`);
        };
        const t = setInterval(tick, 1000);
        tick();
        return () => clearInterval(t);
    }, [item.endDate, lang]);

    const isProfit = item.currentPrice >= item.avgPrice;
    const pnlPercent = ((item.currentPrice - item.avgPrice) / item.avgPrice) * 100;
    const pnlValue = (item.currentPrice - item.avgPrice) * item.shares;

    const typeLabel = lang === 'RU' ? (item.type === 'YES' ? 'ДА' : 'НЕТ') : item.type;
    const sharesLabel = lang === 'RU' ? 'акций' : 'shares';

    return (
        <div 
            onClick={onClick}
            className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4 flex items-center justify-between group hover:border-neutral-700 transition-colors cursor-pointer"
        >
            <div>
                <div className="flex items-center gap-2 mb-1">
                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.type === 'YES' ? 'bg-[#BEFF1D] text-black' : 'bg-[#f544a6] text-black'}`}>
                        {typeLabel}
                     </span>
                     <span className="text-xs text-neutral-400 max-w-[150px] truncate group-hover:text-white transition-colors">{item.marketTitle}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-neutral-600 uppercase tracking-wider">
                    <span className="flex items-center gap-1 text-[#f544a6]"><Clock size={10} /> {timer}</span>
                </div>
            </div>
            <div className="text-right">
                <div className={`font-mono text-sm font-bold ${isProfit ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                    {isProfit ? '+' : ''}${pnlValue.toFixed(2)} ({pnlPercent.toFixed(1)}%)
                </div>
                <div className="text-[10px] text-neutral-500">
                    {item.shares} {sharesLabel} @ ${item.avgPrice}
                </div>
            </div>
        </div>
    );
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, currentUser, lang, onMarketClick, onLogout, onUpdateUser }) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  // Use a seed for avatar to easily regenerate
  const [avatarSeed, setAvatarSeed] = useState(Date.now());

  useEffect(() => {
    if (isOpen && user) {
        setEditName(user.name || '');
        setIsEditing(false);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const isOwnProfile = currentUser?.id === user.id;

  const handleSave = () => {
      if (onUpdateUser) {
          onUpdateUser({
              ...user,
              name: editName,
              // Update avatar URL based on new seed logic if desired, or just name
          });
      }
      setIsEditing(false);
  };

  const regenerateAvatar = () => {
      setAvatarSeed(Date.now());
  };

  // Construct avatar URL. If editing, use the dynamic seed.
  const displayAvatar = isEditing 
    ? `https://ui-avatars.com/api/?name=${editName || 'User'}&background=random&seed=${avatarSeed}`
    : `https://ui-avatars.com/api/?name=${user.name || 'User'}&background=333&color=fff`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-black border border-neutral-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-fade-in-up flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white tracking-wide uppercase flex items-center gap-2">
                {isOwnProfile ? <Wallet size={20} className="text-neutral-500"/> : <Shield size={20} className="text-neutral-500" />}
                {isOwnProfile ? (lang === 'RU' ? 'Профиль' : 'Profile') : user.name || 'User'}
            </h2>
            <button 
                onClick={onClose}
                className="text-neutral-600 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
        </div>

        {/* User Info Block (Avatar & Name) */}
        <div className="flex items-center gap-4 mb-8 bg-neutral-900/30 p-4 rounded-xl border border-neutral-800">
            <div className="relative">
                <img 
                    src={displayAvatar} 
                    alt="Avatar" 
                    className="w-16 h-16 rounded-full object-cover border-2 border-neutral-800" 
                />
                {isEditing && (
                    <button 
                        onClick={regenerateAvatar}
                        className="absolute bottom-0 right-0 bg-neutral-800 text-white p-1 rounded-full hover:bg-neutral-700 border border-black"
                        title={lang === 'RU' ? 'Сменить аватар' : 'Refresh avatar'}
                    >
                        <RefreshCw size={12} />
                    </button>
                )}
            </div>

            <div className="flex-1">
                {isEditing ? (
                    <div className="flex gap-2">
                         <input 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-white px-2 py-1 rounded text-sm w-full focus:outline-none focus:border-[#BEFF1D]"
                            placeholder="Nickname"
                         />
                         <button onClick={handleSave} className="text-[#BEFF1D] p-1.5 hover:bg-neutral-800 rounded">
                            <Save size={18} />
                         </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{user.name || 'User'}</h3>
                        {isOwnProfile && (
                            <button onClick={() => setIsEditing(true)} className="text-neutral-600 hover:text-white transition-colors">
                                <Edit2 size={14} />
                            </button>
                        )}
                    </div>
                )}
                <p className="text-xs text-neutral-500 font-mono mt-1 truncate max-w-[200px]">{user.email || 'user@kachan.market'}</p>
            </div>
        </div>

        {/* Total PnL Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <span className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest block mb-1">
                    {lang === 'RU' ? 'Баланс' : 'Balance'}
                </span>
                <span className="text-2xl font-mono text-white">${user.balance.toLocaleString()}</span>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 relative overflow-hidden">
                <span className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest block mb-1">
                    PnL (Profit/Loss)
                </span>
                <div className="flex items-center gap-2">
                    <span className={`text-2xl font-mono ${(user.pnl || 0) >= 0 ? 'text-[#BEFF1D]' : 'text-[#f544a6]'}`}>
                        {(user.pnl || 0) >= 0 ? '+' : ''}${(user.pnl || 0).toLocaleString()}
                    </span>
                    {(user.pnl || 0) >= 0 ? <TrendingUp size={16} className="text-[#BEFF1D]"/> : <TrendingDown size={16} className="text-[#f544a6]"/>}
                </div>
            </div>
        </div>

        {/* Active Positions */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-4">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4 sticky top-0 bg-black py-2">
                {lang === 'RU' ? 'Активные ставки' : 'Active Positions'}
            </h3>
            <div className="space-y-3">
                {user.portfolio && user.portfolio.length > 0 ? (
                    user.portfolio.map((item) => (
                        <PortfolioItem 
                            key={item.id} 
                            item={item} 
                            lang={lang} 
                            onClick={() => onMarketClick(item.marketId)}
                        />
                    ))
                ) : (
                    <div className="text-center py-10 text-neutral-700 text-sm">
                        {lang === 'RU' ? 'Нет активных ставок' : 'No active positions'}
                    </div>
                )}
            </div>
        </div>

        {isOwnProfile && (
            <div className="mt-auto pt-4 border-t border-neutral-900">
                <Button variant="ghost" fullWidth onClick={onLogout} className="text-red-500 hover:text-red-400 hover:bg-red-500/10">
                    {lang === 'RU' ? 'Выйти' : 'Log Out'}
                </Button>
            </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;
