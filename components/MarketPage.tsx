import React, { useState, useEffect, useMemo } from 'react';
import { Market, User } from '../types';
import Button from './Button';
import { ChevronLeft, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp, CalendarDays } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTimeRemaining } from '../lib/time';

const getErrorMessage = (error: unknown, fallbackRu: string, fallbackEn: string, lang: 'RU' | 'EN') => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const possible = (error as { message?: unknown }).message;
    if (typeof possible === 'string') {
      return possible;
    }
  }
  return lang === 'RU' ? fallbackRu : fallbackEn;
};

interface MarketPageProps {
  market: Market;
  user: User | null;
  onBack: () => void;
  onLogin: () => void;
  onPlaceBet: (params: { side: 'YES' | 'NO'; amount: number; marketId: string; marketTitle: string }) => Promise<void>;
  lang?: 'RU' | 'EN';
}

const MarketPage: React.FC<MarketPageProps> = ({ market, user, onBack, onLogin, onPlaceBet, lang = 'RU' }) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState(market.comments);
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const formattedEndDate = useMemo(() => {
    const parsed = Date.parse(market.endDate);
    if (!Number.isFinite(parsed)) return lang === 'RU' ? '—' : '—';
    return new Date(parsed).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [market.endDate, lang]);
  const localizedTitle = useMemo(
    () => (lang === 'RU' ? market.titleRu ?? market.titleEn ?? market.title : market.titleEn ?? market.titleRu ?? market.title),
    [lang, market.title, market.titleEn, market.titleRu]
  );

  useEffect(() => {
    const update = () => {
      setTimeLeft(formatTimeRemaining(market.endDate, 'minutes', lang));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [market.endDate, lang]);

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
        user: 'You',
        avatar: `https://ui-avatars.com/api/?name=${user.email || 'User'}&background=333&color=fff`,
        text: commentText,
        timestamp: lang === 'RU' ? 'Только что' : 'Just now',
        likes: 0
    };
    setComments([newComment, ...comments]);
    setCommentText('');
  };

  const numericAmount = Number(amount || 0);
  const potentialReturn = amount
    ? (numericAmount / (tradeType === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2)
    : '0.00';
  const potentialProfit = amount ? (Number(potentialReturn) - numericAmount).toFixed(2) : '0.00';

  const handleAmountChange = (value: string) => {
    const normalized = value.replace(',', '.');
    if (/^\d*\.?\d*$/.test(normalized)) {
      setAmount(normalized);
    }
  };

  const handlePlaceBetClick = async () => {
    if (isExpired) {
      setPlaceError(lang === 'RU' ? 'Событие завершено, ставки закрыты.' : 'Event ended, betting closed.');
      return;
    }
    if (!user) {
      onLogin();
      return;
    }
    const numeric = Number(amount);
    if (!numeric || Number.isNaN(numeric) || numeric <= 0) {
      setPlaceError(lang === 'RU' ? 'Введите сумму числом больше 0' : 'Enter a numeric amount greater than 0');
      return;
    }
    setPlaceError(null);
    setPlacing(true);
    try {
      await onPlaceBet({
        side: tradeType,
        amount: numeric,
        marketId: market.id,
        marketTitle: market.title,
      });
      setAmount('');
    } catch (error: unknown) {
      setPlaceError(
        getErrorMessage(
          error,
          'Не удалось выполнить ставку',
          'Failed to place bet',
          lang
        )
      );
    } finally {
      setPlacing(false);
    }
  };
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-in fade-in duration-500">
      {/* Navigation */}
      <button 
        onClick={onBack}
        className="inline-flex items-center gap-2 text-zinc-500 hover:text-white mb-8 transition-colors text-sm font-medium"
      >
        <ChevronLeft size={16} />
        <span>{lang === 'RU' ? 'Назад' : 'Back'}</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Chart & Info */}
        <div className="lg:col-span-8 space-y-8">
            <div className="flex items-start gap-6">
                <img src={market.imageUrl} alt={localizedTitle} className="w-16 h-16 rounded-full bg-zinc-900 object-cover grayscale opacity-90 border border-zinc-800" />
                <div>
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight mb-3">{localizedTitle}</h1>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <span className="flex items-center gap-2 text-[#BEFF1D] font-mono"><Clock size={14}/> {timeLeft}</span>
                        <span className="flex items-center gap-2"><ShieldCheck size={14}/> 
                            {lang === 'RU' ? 'Объем' : 'Vol'}: {market.volume}
                        </span>
                        <span className="flex items-center gap-2 text-zinc-400">
                            <CalendarDays size={14} />
                            {lang === 'RU' ? `Окончание: ${formattedEndDate}` : `Ends: ${formattedEndDate}`}
                        </span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-6 h-[450px]">
                <div className="flex items-baseline gap-4 mb-8">
                    <span className="text-4xl font-bold tracking-tight text-[#BEFF1D]">{market.chance}%</span>
                    <span className="text-zinc-500 text-sm font-medium uppercase tracking-wide">
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
                            tick={{fill: '#52525b', fontSize: 10}} 
                            tickFormatter={(value) => String(value).toUpperCase()}
                            minTickGap={40}
                            dy={10}
                        />
                        <YAxis 
                            hide domain={[0, 100]} 
                        />
                        <CartesianGrid vertical={false} stroke="#18181b" strokeDasharray="3 3" />
                        <Tooltip 
                            contentStyle={{backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '6px'}}
                            itemStyle={{color: '#BEFF1D', fontSize: '12px'}}
                            labelStyle={{color: '#71717a', fontSize: '10px', textTransform: 'uppercase'}}
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
                <div className="flex border-b border-zinc-800 mb-8">
                    <button 
                        onClick={() => setActiveTab('COMMENTS')}
                        className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'COMMENTS' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'Комментарии' : 'Comments'}
                    </button>
                    <button 
                        onClick={() => setActiveTab('ACTIVITY')}
                        className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'ACTIVITY' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}
                    >
                        {lang === 'RU' ? 'Активность' : 'Activity'}
                    </button>
                </div>

                {/* Comments Section */}
                {activeTab === 'COMMENTS' && (
                    <div className="space-y-8">
                        {/* Input */}
                        <div className="flex gap-4">
                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                <UserIcon size={16} className="text-zinc-500" />
                            </div>
                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                                    placeholder={lang === 'RU' ? "Написать комментарий..." : "Write something..."}
                                    className="flex h-10 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-2 pr-10 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#BEFF1D] placeholder:text-zinc-600"
                                />
                                <button 
                                    onClick={handlePostComment}
                                    className="absolute right-2 top-2 p-1 text-zinc-500 hover:text-white transition-colors"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="space-y-6">
                            {comments.map((comment) => (
                                <div key={comment.id} className="flex gap-4 animate-in fade-in group">
                                    <img src={comment.avatar} alt={comment.user} className="w-9 h-9 rounded-full bg-zinc-900 grayscale opacity-70 group-hover:opacity-100 transition-opacity" />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-semibold text-sm text-white">{comment.user}</span>
                                            <span className="text-[10px] uppercase text-zinc-500 tracking-wider">{comment.timestamp}</span>
                                        </div>
                                        <p className="text-zinc-300 text-sm mb-2">{comment.text}</p>
                                        <button className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white transition-colors">
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
            <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-6 sticky top-24 shadow-sm">
              {isExpired ? (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-300">
                    {lang === 'RU'
                      ? 'Торги завершены. Итог будет опубликован после разрешения.'
                      : 'Trading closed. Outcome will be published after resolution.'}
                  </p>
                  <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-400">
                    {lang === 'RU' ? 'Итог' : 'Summary'}: {market.chance}% Да • Vol: {market.volume}
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-zinc-900/50 rounded-lg p-1 flex mb-6 border border-zinc-800">
                    <button
                      onClick={() => setTradeType('YES')}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                        tradeType === 'YES' ? 'bg-[#BEFF1D] text-black shadow-sm' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      {lang === 'RU' ? 'ДА' : 'YES'} ${market.yesPrice}
                    </button>
                    <button
                      onClick={() => setTradeType('NO')}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${
                        tradeType === 'NO'
                          ? 'bg-[rgba(250,73,159,1)] text-black shadow-sm'
                          : 'text-[rgba(250,73,159,1)] hover:text-white'
                      }`}
                    >
                      {lang === 'RU' ? 'НЕТ' : 'NO'} ${market.noPrice}
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="relative">
                      <label className="text-xs font-medium text-zinc-400 mb-2 block">
                        {lang === 'RU' ? 'Сумма' : 'Amount'}
                      </label>
                      <div className="relative group">
                        <span className="absolute left-3 top-2.5 text-zinc-500 transition-colors group-hover:text-white">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          value={amount}
                          onChange={(e) => handleAmountChange(e.target.value)}
                          placeholder="0"
                          className="flex h-11 w-full rounded-md border border-zinc-800 bg-transparent px-3 py-2 pl-7 text-lg font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#BEFF1D] placeholder:text-zinc-700"
                        />
                      </div>
                    </div>

                    {placeError && <p className="text-sm text-red-400">{placeError}</p>}

                    <div className="space-y-3 pt-4 border-t border-zinc-800/50">
                      <div className="flex justify-between text-xs text-zinc-500 uppercase font-medium">
                        <span>{lang === 'RU' ? 'Потенциальный выигрыш' : 'Return'}</span>
                        <span className="text-white font-mono">${potentialReturn}</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500 uppercase font-medium">
                        <span>{lang === 'RU' ? 'Прибыль' : 'Profit'}</span>
                        <span className="text-[#BEFF1D] font-mono">+${potentialProfit}</span>
                      </div>
                    </div>

                    <Button
                      fullWidth
                      onClick={handlePlaceBetClick}
                      disabled={!user || placing}
                      className={
                        tradeType === 'NO' && user
                          ? '!bg-[rgba(250,73,159,1)] hover:!opacity-90 !text-white'
                          : ''
                      }
                    >
                      {!user
                        ? lang === 'RU'
                          ? 'Войдите чтобы торговать'
                          : 'Log In to Trade'
                        : lang === 'RU'
                        ? `Купить ${tradeType === 'YES' ? 'ДА' : 'НЕТ'}`
                        : `BUY ${tradeType}`}
                    </Button>
                    <p className="text-center text-[10px] uppercase text-zinc-600 tracking-wider">
                      {lang === 'RU' ? '0% комиссии' : '0% Fees'}
                    </p>
                  </div>
                </>
              )}

              {/* Disclaimer Footnote */}
              <div className="mt-6 pt-4 border-t border-zinc-800/50">
                <p className="text-[10px] leading-relaxed text-zinc-500 text-justify">
                  <span className="text-[#f544a6] font-semibold">Disclaimer:</span>{' '}
                  {lang === 'RU'
                    ? `Если ваш прогноз верен, каждая акция погашается по цене $1.00. Если неверен — акции сгорают. Рынки прогнозов сопряжены с высоким риском потери средств.`
                    : `If your prediction is correct, each share is redeemed for $1.00. If incorrect — shares expire worthless. Prediction markets involve a high risk of total loss.`}
                </p>
              </div>
            </div>

            {/* Rules Card */}
            <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-6 shadow-sm">
                <h3 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
                    <ShieldCheck size={14} />
                    {lang === 'RU' ? 'Правила исхода' : 'Rules'}
                </h3>
                <div className="text-xs text-zinc-500 leading-relaxed space-y-4 font-mono">
                    <p>{market.description}</p>
                    <p className="pt-4 border-t border-zinc-800">
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