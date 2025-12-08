
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, MessageSquare, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp } from 'lucide-react';
import Button from './Button';
import { Market, User } from '../types';

const MarketChart = dynamic(() => import('./MarketChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 h-[400px] animate-pulse" />
  ),
});

interface MarketPageProps {
  market: Market;
  user: User | null;
  onBack: () => void;
  onLogin: () => void;
  onPlaceBet: (params: {
    side: "YES" | "NO";
    amount: number;
    marketId: string;
    marketTitle: string;
  }) => Promise<void>;
}

const MarketPage: React.FC<MarketPageProps> = ({ market, user, onBack, onLogin, onPlaceBet }) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(market.comments);
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const isExpired = (() => {
    const now = Date.now();
    const parsed = Date.parse(market.endDate);
    return Number.isFinite(parsed) && parsed < now;
  })();

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (!user) {
        onLogin();
        return;
    }
    const newComment = {
        id: Date.now().toString(),
        user: 'Вы',
        avatar: `https://ui-avatars.com/api/?name=${user.email || 'User'}&background=BEFF1D&color=000`,
        text: commentText,
        timestamp: 'Только что',
        likes: 0
    };
    setComments([newComment, ...comments]);
    setCommentText('');
  };

  const potentialReturn = amount ? (Number(amount) / (tradeType === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2) : '0.00';
  const potentialProfit = amount ? (Number(potentialReturn) - Number(amount)).toFixed(2) : '0.00';

  const handlePlaceBetClick = async () => {
    if (!user) {
      onLogin();
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0 || isNaN(numericAmount)) {
      setPlaceError("Введите сумму числом больше 0");
      return;
    }
    setPlaceError(null);
    setPlacing(true);
    try {
      await onPlaceBet({
        side: tradeType,
        amount: numericAmount,
        marketId: market.id,
        marketTitle: market.title,
      });
      setAmount('');
    } catch (err: any) {
      setPlaceError(err?.message || "Не удалось выполнить ставку");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
      {/* Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-neutral-400 hover:text-white mb-6 transition-colors"
      >
        <ChevronLeft size={20} />
        <span className="font-medium">Назад к рынкам</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Chart & Info */}
        <div className="lg:col-span-8 space-y-8">
            <div className="flex items-start gap-4">
                <img src={market.imageUrl} alt={market.title} className="w-16 h-16 rounded-lg bg-neutral-800 object-cover" />
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">{market.title}</h1>
                    <div className="flex items-center gap-4 text-sm text-neutral-400">
                        <span className="flex items-center gap-1"><Clock size={14}/> {market.endDate}</span>
                        <span className="flex items-center gap-1"><ShieldCheck size={14}/> Объем: {market.volume}</span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <MarketChart history={market.history} chance={market.chance} />

            {/* Tabs */}
            <div>
                <div className="flex border-b border-neutral-800 mb-6">
                    <button 
                        onClick={() => setActiveTab('COMMENTS')}
                        className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'COMMENTS' ? 'border-[#BEFF1D] text-[#BEFF1D]' : 'border-transparent text-neutral-400 hover:text-white'}`}
                    >
                        Комментарии
                    </button>
                    <button 
                        onClick={() => setActiveTab('ACTIVITY')}
                        className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'ACTIVITY' ? 'border-[#BEFF1D] text-[#BEFF1D]' : 'border-transparent text-neutral-400 hover:text-white'}`}
                    >
                        Активность
                    </button>
                </div>

                {/* Comments Section */}
                {activeTab === 'COMMENTS' && (
                    <div className="space-y-6">
                        {/* Input */}
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                                <UserIcon size={20} className="text-neutral-400" />
                            </div>
                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                    placeholder="Написать комментарий..."
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-3 pl-4 pr-12 text-sm text-white focus:border-[#BEFF1D] focus:outline-none transition-all"
                                />
                                <button 
                                    onClick={handlePostComment}
                                    className="absolute right-2 top-2 p-1.5 text-neutral-500 hover:text-[#BEFF1D] transition-colors"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-4">
                            {comments.map((comment) => (
                                <div key={comment.id} className="flex gap-3 animate-fade-in">
                                    <img src={comment.avatar} alt={comment.user} className="w-10 h-10 rounded-full bg-neutral-800" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-sm">{comment.user}</span>
                                            <span className="text-xs text-neutral-500">{comment.timestamp}</span>
                                        </div>
                                        <p className="text-neutral-300 text-sm mb-2">{comment.text}</p>
                                        <button className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors">
                                            <ThumbsUp size={12} /> {comment.likes}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Right Column: Trading & Rules */}
        <div className="lg:col-span-4 space-y-6">
            
            {/* Trading Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 sticky top-24">
              {isExpired ? (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-300">
                    Торги завершены. Итог будет опубликован после разрешения.
                  </p>
                  <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-400">
                    Итог: {market.chance}% Да • Vol: {market.volume}
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-neutral-800 rounded-lg p-1 flex mb-4">
                    <button 
                        onClick={() => setTradeType('YES')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${tradeType === 'YES' ? 'bg-[#BEFF1D] text-black shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                    >
                        Да ${market.yesPrice}
                    </button>
                    <button 
                        onClick={() => setTradeType('NO')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${tradeType === 'NO' ? 'bg-red-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
                    >
                        Нет ${market.noPrice}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="relative">
                        <label className="text-xs font-medium text-neutral-500 ml-1 mb-1 block">Сумма</label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-neutral-500">$</span>
                            <input 
                                type="number" 
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                                className="w-full bg-black border border-neutral-700 rounded-lg py-2.5 pl-7 pr-4 text-lg font-mono text-white focus:border-[#BEFF1D] focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-neutral-800">
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Потенциальный возврат</span>
                            <span className="text-[#BEFF1D] font-mono">${potentialReturn}</span>
                        </div>
                         <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Прибыль</span>
                            <span className="text-[#BEFF1D] font-mono">+${potentialProfit}</span>
                        </div>
                    </div>

                    {placeError && (
                      <p className="text-xs text-red-400 text-center">{placeError}</p>
                    )}
                    <Button 
                        fullWidth 
                        onClick={handlePlaceBetClick}
                        disabled={!user || placing}
                        className={tradeType === 'NO' && user ? '!bg-red-500 hover:!bg-red-600 !text-white' : ''}
                    >
                        {!user ? 'Войти чтобы торговать' : placing ? 'Обработка...' : `Купить ${tradeType}`}
                    </Button>
                    <p className="text-center text-xs text-neutral-600">Комиссия 0%</p>
                  </div>
                </>
              )}
            </div>

            {/* Rules Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-neutral-400"/>
                    Правила рынка
                </h3>
                <div className="text-sm text-neutral-400 leading-relaxed space-y-3">
                    <p>{market.description}</p>
                    <p className="text-xs text-neutral-600 pt-2 border-t border-neutral-800 mt-2">
                        Держатель этого рынка имеет право разрешить его на основе консенсуса надежных источников. В случае спорной ситуации решение может быть передано в арбитраж UMA.
                    </p>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default MarketPage;