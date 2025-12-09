
import React, { useState, useEffect } from 'react';
import { Market, User } from '../types';
import Button from './Button';
import { ChevronLeft, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface MarketPageProps {
  market: Market;
  user: User | null;
  onBack: () => void;
  onLogin: () => void;
  lang: 'RU' | 'EN';
}

const MarketPage: React.FC<MarketPageProps> = ({ market, user, onBack, onLogin, lang }) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(market.comments);
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');

  // Countdown logic for the main page too
  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(market.endDate) - +new Date();
      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
      }
      return lang === 'RU' ? 'Завершено' : 'Ended';
    };
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    setTimeLeft(calculateTimeLeft());
    return () => clearInterval(timer);
  }, [market.endDate, lang]);

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (!user) {
        onLogin();
        return;
    }
    const newComment = {
        id: Date.now().toString(),
        user: 'You',
        avatar: `https://ui-avatars.com/api/?name=${user.email || 'User'}&background=333&color=fff`,
        text: commentText,
        timestamp: lang === 'RU' ? 'Только что' : 'Just now',
        likes: 0
    };
    setComments([newComment, ...comments]);
    setCommentText('');
  };

  const potentialReturn = amount ? (Number(amount) / (tradeType === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2) : '0.00';
  const potentialProfit = amount ? (Number(potentialReturn) - Number(amount)).toFixed(2) : '0.00';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      {/* Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-neutral-500 hover:text-white mb-8 transition-colors text-sm uppercase tracking-widest"
      >
        <ChevronLeft size={16} />
        <span>{lang === 'RU' ? 'Назад' : 'Back'}</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Chart & Info */}
        <div className="lg:col-span-8 space-y-8">
            <div className="flex items-start gap-6">
                <img src={market.imageUrl} alt={market.title} className="w-20 h-20 rounded-full bg-neutral-900 object-cover grayscale opacity-90" />
                <div>
                    <h1 className="text-2xl sm:text-3xl font-medium text-white leading-tight mb-4">{market.title}</h1>
                    <div className="flex items-center gap-6 text-xs uppercase tracking-wider text-neutral-500">
                        <span className="flex items-center gap-2 text-[#BEFF1D] font-mono"><Clock size={14}/> {timeLeft}</span>
                        <span className="flex items-center gap-2"><ShieldCheck size={14}/> 
                            {lang === 'RU' ? 'Объем' : 'Vol'}: {market.volume}
                        </span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-black border border-neutral-900 rounded-xl p-8 h-[450px]">
                <div className="flex items-baseline gap-4 mb-8">
                    <span className="text-5xl font-bold text-[#BEFF1D]">{market.chance}%</span>
                    <span className="text-neutral-500 text-sm uppercase tracking-widest">
                        {lang === 'RU' ? 'Вероятность (Да)' : 'Yes Probability'}
                    </span>
                </div>
                <ResponsiveContainer width="100%" height="80%">
                    <AreaChart data={market.history}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#BEFF1D" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#BEFF1D" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fill: '#333', fontSize: 10, textTransform: 'uppercase'}} 
                            minTickGap={40}
                            dy={10}
                        />
                        <YAxis 
                            hide domain={[0, 100]} 
                        />
                        <CartesianGrid vertical={false} stroke="#111" strokeDasharray="3 3" />
                        <Tooltip 
                            contentStyle={{backgroundColor: '#000', border: '1px solid #333', borderRadius: '4px'}}
                            itemStyle={{color: '#BEFF1D', fontSize: '12px'}}
                            labelStyle={{color: '#666', fontSize: '10px', textTransform: 'uppercase'}}
                            formatter={(value: number) => [`${value}%`, lang === 'RU' ? 'Вероятность' : 'Chance']}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#BEFF1D" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorValue)" 
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Tabs */}
            <div>
                <div className="flex border-b border-neutral-900 mb-8">
                    <button 
                        onClick={() => setActiveTab('COMMENTS')}
                        className={`px-6 py-4 font-medium text-xs uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'COMMENTS' ? 'border-white text-white' : 'border-transparent text-neutral-600 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'Комментарии' : 'Comments'}
                    </button>
                    <button 
                        onClick={() => setActiveTab('ACTIVITY')}
                        className={`px-6 py-4 font-medium text-xs uppercase tracking-widest transition-colors border-b-2 ${activeTab === 'ACTIVITY' ? 'border-white text-white' : 'border-transparent text-neutral-600 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'Активность' : 'Activity'}
                    </button>
                </div>

                {/* Comments Section */}
                {activeTab === 'COMMENTS' && (
                    <div className="space-y-8">
                        {/* Input */}
                        <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-neutral-900 flex items-center justify-center flex-shrink-0">
                                <UserIcon size={18} className="text-neutral-500" />
                            </div>
                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                    placeholder={lang === 'RU' ? "Написать комментарий..." : "Write something..."}
                                    className="w-full bg-black border border-neutral-900 rounded-lg py-3 pl-4 pr-12 text-sm text-white focus:border-neutral-700 focus:outline-none transition-all placeholder:text-neutral-700"
                                />
                                <button 
                                    onClick={handlePostComment}
                                    className="absolute right-2 top-2 p-1.5 text-neutral-600 hover:text-white transition-colors"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-6">
                            {comments.map((comment) => (
                                <div key={comment.id} className="flex gap-4 animate-fade-in group">
                                    <img src={comment.avatar} alt={comment.user} className="w-10 h-10 rounded-full bg-neutral-900 grayscale opacity-70 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-semibold text-sm text-white">{comment.user}</span>
                                            <span className="text-[10px] uppercase text-neutral-600 tracking-wider">{comment.timestamp}</span>
                                        </div>
                                        <p className="text-neutral-400 text-sm mb-2 font-light">{comment.text}</p>
                                        <button className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-white transition-colors">
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
            <div className="bg-black border border-neutral-900 rounded-xl p-6 sticky top-24">
                <div className="bg-neutral-900/50 rounded-lg p-1 flex mb-6">
                    <button 
                        onClick={() => setTradeType('YES')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${tradeType === 'YES' ? 'bg-[#BEFF1D] text-black shadow-[0_0_15px_rgba(190,255,29,0.2)]' : 'text-neutral-500 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'ДА' : 'YES'} ${market.yesPrice}
                    </button>
                    <button 
                        onClick={() => setTradeType('NO')}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${tradeType === 'NO' ? 'bg-[#f544a6] text-black shadow-[0_0_15px_rgba(245,68,166,0.3)]' : 'text-neutral-500 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'НЕТ' : 'NO'} ${market.noPrice}
                    </button>
                </div>

                <div className="space-y-6">
                    <div className="relative">
                        <label className="text-[10px] uppercase font-bold text-neutral-600 mb-2 block tracking-widest">
                            {lang === 'RU' ? 'Сумма' : 'Amount'}
                        </label>
                        <div className="relative group">
                            <span className="absolute left-3 top-3 text-neutral-600 transition-colors group-hover:text-white">$</span>
                            <input 
                                type="number" 
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                                className="w-full bg-black border border-neutral-800 rounded-lg py-3 pl-7 pr-4 text-xl font-medium text-white focus:border-neutral-600 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-900">
                        <div className="flex justify-between text-xs text-neutral-500 uppercase">
                            <span>{lang === 'RU' ? 'Потенциальный выигрыш' : 'Return'}</span>
                            <span className="text-white font-mono">${potentialReturn}</span>
                        </div>
                         <div className="flex justify-between text-xs text-neutral-500 uppercase">
                            <span>{lang === 'RU' ? 'Прибыль' : 'Profit'}</span>
                            <span className="text-[#BEFF1D] font-mono">+${potentialProfit}</span>
                        </div>
                    </div>

                    <Button 
                        fullWidth 
                        onClick={user ? () => {} : onLogin}
                        disabled={!amount && !!user}
                        className={tradeType === 'NO' && user ? '!bg-[#f544a6] hover:!bg-[#d1388c] !text-black !border-[#f544a6]' : (user ? '!bg-[#BEFF1D] hover:!bg-[#a6e612] !text-black !border-[#BEFF1D]' : '')}
                    >
                        {!user ? (lang === 'RU' ? 'Войдите чтобы торговать' : 'Log In to Trade') : (lang === 'RU' ? `Купить ${tradeType === 'YES' ? 'ДА' : 'НЕТ'}` : `BUY ${tradeType}`)}
                    </Button>
                     <p className="text-center text-[10px] uppercase text-neutral-700 tracking-widest">
                        {lang === 'RU' ? '0% комиссии' : '0% Fees'}
                     </p>
                </div>

                {/* Disclaimer Footnote */}
                <div className="mt-6 pt-4 border-t border-white/5">
                    <p className="text-[10px] leading-relaxed text-neutral-600 text-justify">
                        <span className="text-[#f544a6] font-bold">Disclaimer:</span> {lang === 'RU' 
                            ? `Если ваш прогноз верен, каждая акция погашается по цене $1.00. Если неверен — акции сгорают. Рынки прогнозов сопряжены с высоким риском потери средств.` 
                            : `If your prediction is correct, each share is redeemed for $1.00. If incorrect — shares expire worthless. Prediction markets involve a high risk of total loss.`}
                    </p>
                </div>
            </div>

            {/* Rules Card */}
            <div className="bg-black border border-neutral-900 rounded-xl p-6">
                <h3 className="font-bold text-neutral-300 mb-4 flex items-center gap-2 text-xs uppercase tracking-widest">
                    <ShieldCheck size={14} />
                    {lang === 'RU' ? 'Правила исхода' : 'Rules'}
                </h3>
                <div className="text-xs text-neutral-500 leading-relaxed space-y-4 font-mono">
                    <p>{market.description}</p>
                    <p className="pt-4 border-t border-neutral-900">
                        Resolution based on consensus.
                    </p>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default MarketPage;
