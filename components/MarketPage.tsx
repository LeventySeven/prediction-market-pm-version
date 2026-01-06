import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Market, User, Position, PriceCandle, PublicTrade, Comment } from '../types';
import Button from './Button';
import { ChevronLeft, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp, CalendarDays, Coins, MessageCircle, X, Info } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatTimeRemaining } from '../lib/time';

type ErrorLike = string | Error | { message?: string } | null | undefined;

const getErrorMessage = (error: ErrorLike, fallbackRu: string, fallbackEn: string, lang: 'RU' | 'EN') => {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && typeof (error as { message?: string }).message === 'string') {
    return String((error as { message?: string }).message);
  }
  return lang === 'RU' ? fallbackRu : fallbackEn;
};

interface MarketPageProps {
  market: Market;
  user: User | null;
  onBack: () => void;
  onLogin: () => void;
  betIntent?: { side: 'YES' | 'NO'; nonce: number } | null;
  onRequireBetAuth?: (params: { marketId: string; side: 'YES' | 'NO'; amount: number; marketTitle: string }) => void;
  onPlaceBet: (params: { side: 'YES' | 'NO'; amount: number; marketId: string; marketTitle: string }) => Promise<void>;
  onSellPosition?: (params: { marketId: string; side: 'YES' | 'NO'; shares: number }) => Promise<void>;
  onResolveOutcome?: (params: { marketId: string; outcome: 'YES' | 'NO' }) => Promise<void>;
  comments: Comment[];
  onPostComment: (params: { marketId: string; text: string; parentId?: string | null }) => Promise<void>;
  onToggleCommentLike?: (commentId: string) => Promise<void>;
  userPositions?: Position[];
  lang?: 'RU' | 'EN';
  priceCandles?: PriceCandle[];
  publicTrades?: PublicTrade[];
  insightsLoading?: boolean;
}

const MarketPage: React.FC<MarketPageProps> = ({
  market,
  user,
  onBack,
  onLogin,
  betIntent = null,
  onRequireBetAuth,
  onPlaceBet,
  onSellPosition,
  onResolveOutcome,
  comments,
  onPostComment,
  onToggleCommentLike,
  userPositions = [],
  lang = 'RU',
  priceCandles = [],
  publicTrades = [],
  insightsLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [resolvingOutcome, setResolvingOutcome] = useState<'YES' | 'NO' | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const betSectionRef = useRef<HTMLDivElement | null>(null);
  const lastBetIntentNonce = useRef<number | null>(null);

  // Handle bet intent scrolling - use useEffect to avoid side effects in render
  useEffect(() => {
    if (!betIntent) return;
    const currentNonce = betIntent.nonce;
    if (currentNonce !== lastBetIntentNonce.current) {
      lastBetIntentNonce.current = currentNonce;
      setTradeType(betIntent.side);
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        betSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [betIntent?.nonce, betIntent]);

  // Use closesAt for trading deadline, expiresAt for event end
  const tradingDeadline = market.closesAt || market.expiresAt;
  const eventEnd = market.expiresAt;

  const formattedEndDate = useMemo(() => {
    const parsed = Date.parse(eventEnd);
    if (!Number.isFinite(parsed)) return '—';
    return new Date(parsed).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [eventEnd, lang]);

  const localizedTitle = useMemo(
    () => (lang === 'RU' ? market.titleRu ?? market.titleEn ?? market.title : market.titleEn ?? market.titleRu ?? market.title),
    [lang, market.title, market.titleEn, market.titleRu]
  );

  const isResolved = market.state === 'resolved' || Boolean(market.outcome);
  const winningSide = market.outcome;
  const isCreator = Boolean(user && market.createdBy && market.createdBy === user.id);
  const eventEnded = (() => {
    const parsed = Date.parse(eventEnd);
    return Number.isFinite(parsed) && parsed <= Date.now();
  })();
  const creatorControlsEnabled = Boolean(isCreator && onResolveOutcome);

  // User's current position for this market
  const userYesPosition = userPositions.find(p => p.outcome === 'YES');
  const userNoPosition = userPositions.find(p => p.outcome === 'NO');
  const userShares = tradeType === 'YES' ? (userYesPosition?.shares ?? 0) : (userNoPosition?.shares ?? 0);
  const sellablePositions = userPositions.filter((p) => (p.shares ?? 0) > 0);

  const chartSeries = useMemo(() => {
    if (priceCandles.length > 0) {
      return priceCandles.map((c) => ({
        date: new Date(c.bucket).toLocaleTimeString(lang === 'RU' ? 'ru-RU' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        value: Number((c.close * 100).toFixed(2)),
      }));
    }
    return [];
  }, [priceCandles, lang]);

  const displayedChance = chartSeries.length > 0 ? chartSeries[chartSeries.length - 1].value : market.chance;

  useEffect(() => {
    const update = () => {
      if (isResolved) {
        setTimeLeft(lang === 'RU' ? 'Завершено' : 'Resolved');
        return;
      }
      setTimeLeft(formatTimeRemaining(tradingDeadline, 'minutes', lang));
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [tradingDeadline, lang, isResolved]);

  const tradingClosed = (() => {
    const now = Date.now();
    const parsed = Date.parse(tradingDeadline);
    return Number.isFinite(parsed) && parsed < now;
  })();
  const isExpired = isResolved || tradingClosed;

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (!user) {
      onLogin();
      return;
    }
    const text = commentText.trim();
    setCommentText('');
    void onPostComment({ marketId: market.id, text, parentId: replyTo?.id ?? null });
    setReplyTo(null);
  };

  type CommentNode = Comment & { children: CommentNode[] };
  const threadedComments = useMemo(() => {
    const byId = new Map<string, CommentNode>();
    comments.forEach((c) => {
      byId.set(c.id, { ...c, children: [] });
    });
    const roots: CommentNode[] = [];
    comments.forEach((c) => {
      const node = byId.get(c.id)!;
      const parentId = c.parentId ?? null;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    // Ensure replies feel natural: oldest -> newest within a thread, so new replies appear at the bottom.
    const sortChildren = (node: CommentNode) => {
      node.children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      node.children.forEach(sortChildren);
    };
    roots.forEach(sortChildren);
    return roots;
  }, [comments]);

  const numericAmount = Number(amount || 0);
  const currentPrice = tradeType === 'YES' ? market.yesPrice : market.noPrice;
  // Estimated shares to receive
  const estimatedShares = currentPrice > 0 ? numericAmount / currentPrice : 0;
  // Potential return if prediction is correct ($1 per share)
  const potentialReturn = estimatedShares.toFixed(2);
  const potentialProfit = (estimatedShares - numericAmount).toFixed(2);

  const handleAmountChange = (value: string) => {
    const normalized = value.replace(',', '.');
    if (/^\d*\.?\d*$/.test(normalized)) {
      setAmount(normalized);
    }
  };

  const setAmountFromNumber = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    const rounded = Math.round(value * 100) / 100;
    const str = String(rounded)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
    setAmount(str);
  };

  const handleQuickAdd = (delta: number) => {
    setAmountFromNumber(numericAmount + delta);
  };

  const handlePlaceBetClick = async () => {
    if (isExpired) {
      setPlaceError(lang === 'RU' ? 'Торги закрыты.' : 'Trading closed.');
      return;
    }
    const numeric = Number(amount);
    if (!numeric || Number.isNaN(numeric) || numeric <= 0) {
      setPlaceError(lang === 'RU' ? 'Введите сумму числом больше 0' : 'Enter a numeric amount greater than 0');
      return;
    }
    if (!user) {
      setPlaceError(null);
      if (onRequireBetAuth) {
        onRequireBetAuth({
          marketId: market.id,
          side: tradeType,
          amount: numeric,
          marketTitle: market.title,
        });
      } else {
        onLogin();
      }
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
    } catch (error) {
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

  const handleSellClick = async () => {
    if (!user || !onSellPosition || userShares <= 0) return;
    if (isExpired) {
      setSellError(lang === 'RU' ? 'Торги закрыты.' : 'Trading closed.');
      return;
    }
    setSellError(null);
    setSelling(true);
    try {
      await onSellPosition({
        marketId: market.id,
        side: tradeType,
        shares: userShares,
      });
    } catch (error) {
      setSellError(
        getErrorMessage(
          error,
          'Не удалось продать позицию',
          'Failed to sell position',
          lang
        )
      );
    } finally {
      setSelling(false);
    }
  };

  const handleResolveOutcomeClick = async (side: 'YES' | 'NO') => {
    if (!creatorControlsEnabled || !onResolveOutcome) return;
    if (!eventEnded) {
      setResolveError(lang === 'RU' ? 'Событие ещё не закончилось' : 'Event has not ended yet');
      return;
    }
    setResolveError(null);
    setResolvingOutcome(side);
    try {
      await onResolveOutcome({ marketId: market.id, outcome: side });
    } catch (error) {
      setResolveError(
        getErrorMessage(
          error,
          'Не удалось завершить рынок',
          'Failed to resolve market',
          lang
        ) ?? (lang === 'RU' ? 'Не удалось завершить рынок' : 'Failed to resolve market')
      );
    } finally {
      setResolvingOutcome(null);
    }
  };

  const renderOutcomeBadge = () => {
    if (!winningSide) return null;
    return (
      <span
        className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border border-zinc-900 bg-black/50 text-zinc-200"
      >
        {lang === 'RU'
          ? `Исход: ${winningSide === 'YES' ? 'ДА' : 'НЕТ'}`
          : `Outcome: ${winningSide === 'YES' ? 'YES' : 'NO'}`}
      </span>
    );
  };

  // Fee display (in basis points). When fee is 0, we should not show any fallback.
  const feeBps = market.feeBps ?? 0;
  const feePercent = (feeBps / 100).toFixed(1);
  const showFee = feeBps > 0;

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-500">
      {/* Navigation */}
      <button 
        onClick={onBack}
        className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-100 mb-6 transition-colors text-sm font-medium"
      >
        <ChevronLeft size={16} />
        <span>{lang === 'RU' ? 'Назад' : 'Back'}</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Chart + Info */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex items-start gap-6">
            <img src={market.imageUrl} alt={localizedTitle} className="w-16 h-16 rounded-full bg-zinc-950 object-cover grayscale opacity-90 border border-zinc-900" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 leading-tight mb-3">{localizedTitle}</h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <span className="flex items-center gap-2 text-zinc-200 font-mono"><Clock size={14}/> {timeLeft}</span>
                <span className="flex items-center gap-2"><ShieldCheck size={14}/> 
                  {lang === 'RU' ? 'Объем' : 'Vol'}: {market.volume}
                </span>
                <span className="flex items-center gap-2 text-zinc-400">
                  <CalendarDays size={14} />
                  {lang === 'RU' ? `Окончание: ${formattedEndDate}` : `Ends: ${formattedEndDate}`}
                </span>
                {renderOutcomeBadge()}
              </div>
            </div>
          </div>

          {/* Mobile quick scroll buttons (keep desktop web layout untouched) */}
          <div className="lg:hidden flex gap-2">
            <button
              type="button"
              onClick={() => scrollToSection('bid-section')}
              className="flex-1 h-11 rounded-full border border-zinc-900 bg-black px-4 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-950/60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Coins size={16} className="text-zinc-400" />
              <span>{lang === 'RU' ? 'Ставка' : 'Bet'}</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('comments-section')}
              className="flex-1 h-11 rounded-full border border-zinc-900 bg-black px-4 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-950/60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} className="text-zinc-400" />
              <span>{lang === 'RU' ? 'Комментарии' : 'Comments'}</span>
            </button>
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-zinc-900 bg-black p-6 h-[380px] relative">
            <div className="flex items-baseline gap-4 mb-8">
              <span className="text-4xl font-bold tracking-tight text-zinc-100">{displayedChance}%</span>
              <span className="text-zinc-500 text-sm font-medium uppercase tracking-wide">
                {lang === 'RU' ? 'Вероятность (Да)' : 'Yes Probability'}
              </span>
            </div>
            {insightsLoading && (
              <span className="absolute top-6 right-6 text-[11px] uppercase text-zinc-500 tracking-wider">
                {lang === 'RU' ? 'Обновление...' : 'Updating...'}
              </span>
            )}
            {chartSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={chartSeries}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffffff" stopOpacity={0.14}/>
                      <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
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
                    contentStyle={{backgroundColor: '#000000', borderColor: '#27272a', borderRadius: '10px'}}
                    itemStyle={{color: '#ffffff', fontSize: '12px'}}
                    labelStyle={{color: '#71717a', fontSize: '10px', textTransform: 'uppercase'}}
                    formatter={(value: number) => [`${value}%`, lang === 'RU' ? 'Вероятность' : 'Chance']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#ffffff" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[80%] items-center justify-center text-sm text-neutral-500">
                {lang === 'RU' ? 'Нет данных для графика' : 'No chart data yet'}
              </div>
            )}
          </div>
        </div>

        {/* Bet (trade card) */}
        <div
          ref={betSectionRef}
          id="bid-section"
          className="scroll-mt-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2"
        >
          <div className="space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto lg:pr-1 custom-scrollbar">
            {/* Trading Card */}
            <div className="rounded-2xl border border-zinc-900 bg-black p-6 shadow-sm">
            {isExpired ? (
              <div className="space-y-3">
                <p className="text-sm text-neutral-300">
                  {isResolved
                    ? lang === 'RU'
                      ? `Рынок завершен. Итог: ${winningSide === 'YES' ? 'ДА' : 'НЕТ'}.`
                      : `Market resolved. Outcome: ${winningSide === 'YES' ? 'YES' : 'NO'}.`
                    : lang === 'RU'
                    ? 'Торги завершены. Итог будет опубликован после разрешения.'
                    : 'Trading closed. Outcome will be published after resolution.'}
                </p>
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-neutral-400">
                  {lang === 'RU' ? 'Итог' : 'Summary'}: {market.chance}% {lang === 'RU' ? 'Да' : 'Yes'} • Vol: {market.volume}
                  {isResolved && (
                    <div className="text-xs text-neutral-500 mt-2">
                      {lang === 'RU'
                        ? 'Исход подтвержден администратором. Победители получают $1 за акцию.'
                        : 'Outcome confirmed by admin. Winning shares redeem for $1 each.'}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-zinc-950 rounded-full p-1 flex mb-6 border border-zinc-900">
                  <button
                    onClick={() => setTradeType('YES')}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-all ${
                      tradeType === 'YES'
                        ? 'bg-black ring-1 ring-inset ring-[rgba(245,68,166,1)] text-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.10)]'
                        : 'text-[rgba(245,68,166,0.75)] hover:text-white hover:bg-zinc-900/40'
                    }`}
                  >
                    {lang === 'RU' ? 'ДА' : 'YES'} ${market.yesPrice.toFixed(2)}
                  </button>
                  <button
                    onClick={() => setTradeType('NO')}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-all ${
                      tradeType === 'NO'
                        ? 'bg-black ring-1 ring-inset ring-[rgba(245,68,166,1)] text-[rgba(245,68,166,1)] hover:bg-[rgba(245,68,166,0.10)]'
                        : 'text-[rgba(245,68,166,0.75)] hover:text-white hover:bg-zinc-900/40'
                    }`}
                  >
                    {lang === 'RU' ? 'НЕТ' : 'NO'} ${market.noPrice.toFixed(2)}
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
                        className="flex h-11 w-full rounded-md border border-zinc-900 bg-transparent px-3 py-2 pl-7 text-lg font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 placeholder:text-zinc-700"
                      />
                    </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[1, 5, 10, 100].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => handleQuickAdd(inc)}
                      disabled={placing || isExpired}
                      className="h-9 rounded-md border border-zinc-900 bg-zinc-950/50 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/40 transition-colors disabled:opacity-50 disabled:pointer-events-none tabular-nums"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
                  </div>

                  {placeError && <p className="text-sm text-red-400">{placeError}</p>}

                  <div className="space-y-3 pt-4 border-t border-zinc-900/50">
                    <div className="flex justify-between text-xs text-zinc-500 uppercase font-medium">
                      <span>{lang === 'RU' ? 'Акций' : 'Shares'}</span>
                      <span className="text-white font-mono">{estimatedShares.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500 uppercase font-medium">
                      <span>{lang === 'RU' ? 'Потенциальный выигрыш' : 'Return if Win'}</span>
                      <span className="text-white font-mono">${potentialReturn}</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500 uppercase font-medium">
                      <span>{lang === 'RU' ? 'Прибыль' : 'Profit'}</span>
                      <span className="text-[rgba(245,68,166,1)] font-mono">{numericAmount > 0 && currentPrice > 0 ? (((1 / currentPrice) - 1) * 100).toFixed(1) : '0.0'}%</span>
                    </div>
                  </div>

                  <Button
                    fullWidth
                    onClick={handlePlaceBetClick}
                    disabled={placing}
                  >
                    {!user
                      ? lang === 'RU'
                        ? 'Зарегистрируйтесь, чтобы торговать'
                        : 'Sign up to trade'
                      : lang === 'RU'
                      ? `Купить ${tradeType === 'YES' ? 'ДА' : 'НЕТ'}`
                      : `BUY ${tradeType}`}
                  </Button>
                  {showFee && (
                    <p className="text-center text-[10px] uppercase text-zinc-600 tracking-wider">
                      {feePercent}% {lang === 'RU' ? 'комиссия' : 'fee'}
                    </p>
                  )}
                </div>

                {user && onSellPosition && sellablePositions.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      {lang === 'RU' ? 'Активные ставки' : 'Your Active Bets'}
                    </p>
                    <div className="space-y-3">
                      {sellablePositions.map((position) => (
                        <div
                          key={`${position.marketId}-${position.outcome}`}
                          className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-3"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-white">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                                  position.outcome === 'YES'
                                    ? 'bg-[rgba(245,68,166,1)] border border-[rgba(245,68,166,1)] text-white'
                                    : 'bg-[rgba(245,68,166,1)] border border-[rgba(245,68,166,1)] text-white'
                                }`}
                              >
                                {position.outcome}
                              </span>
                              <span className="font-medium">
                                {lang === 'RU' ? 'Ставка' : 'Position'}
                              </span>
                            </div>
                            <span className="font-mono text-white">
                              {(position.shares ?? 0).toFixed(2)} sh
                            </span>
                          </div>
                          <div className="flex justify-between text-xs text-zinc-500 mt-1">
                            <span>{lang === 'RU' ? 'Средняя цена' : 'Avg. entry'}</span>
                            <span className="font-mono">
                              $
                              {position.avgEntryPrice !== null
                                ? Number(position.avgEntryPrice).toFixed(3)
                                : '0.00'}
                            </span>
                          </div>
                          <Button
                            fullWidth
                            className="mt-3 !bg-zinc-800 !text-white hover:!bg-zinc-700"
                            onClick={() =>
                              onSellPosition({
                                marketId: market.id,
                                side: position.outcome,
                                shares: position.shares ?? 0,
                              })
                            }
                          >
                            {lang === 'RU'
                              ? `Продать ${position.outcome === 'YES' ? 'ДА' : 'НЕТ'}`
                              : `Sell ${position.outcome}`}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Creator Controls */}
            {creatorControlsEnabled && (
              <div className="mt-6 pt-4 border-t border-zinc-900/50 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <ShieldCheck size={12} />
                  {lang === 'RU' ? 'Исход события (создатель)' : 'Resolve outcome (creator)'}
                </p>
                {isResolved ? (
                  <p className="text-sm text-neutral-300">
                    {lang === 'RU'
                      ? `Исход установлен: ${winningSide === 'YES' ? 'ДА' : 'НЕТ'}.`
                      : `Outcome already set to ${winningSide === 'YES' ? 'YES' : 'NO'}.`}
                  </p>
                ) : (
                  <>
                    <div className="flex gap-3">
                      <Button
                        fullWidth
                        onClick={() => handleResolveOutcomeClick('YES')}
                        disabled={Boolean(resolvingOutcome)}
                        variant="primary"
                      >
                        {lang === 'RU' ? 'Завершить как ДА' : 'Resolve as YES'}
                      </Button>
                      <Button
                        fullWidth
                        onClick={() => handleResolveOutcomeClick('NO')}
                        disabled={Boolean(resolvingOutcome)}
                        variant="destructive"
                      >
                        {lang === 'RU' ? 'Завершить как НЕТ' : 'Resolve as NO'}
                      </Button>
                    </div>
                    {resolveError && (
                      <p className="text-sm text-red-400">{resolveError}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Disclaimer (hidden behind info) */}
            <div className="mt-6 pt-4 border-t border-zinc-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setDisclaimerOpen(true)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={lang === 'RU' ? 'Информация' : 'Info'}
                title={lang === 'RU' ? 'Информация' : 'Info'}
              >
                <Info size={16} />
              </button>
            </div>
            </div>

            {/* Rules Card (desktop stays as-is) */}
            <div className="hidden lg:block rounded-2xl border border-zinc-900 bg-black p-6 shadow-sm">
              <h3 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
                <ShieldCheck size={14} />
                {lang === 'RU' ? 'Правила исхода' : 'Rules'}
              </h3>
              <div className="text-xs text-zinc-500 leading-relaxed space-y-4 font-mono">
                <p>{market.description}</p>
                <p className="pt-4 border-t border-zinc-900">
                  Resolution based on consensus.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Comments / Activity (on mobile this comes AFTER bid; on desktop it stays under chart) */}
        <div id="comments-section" className="scroll-mt-24 lg:col-span-8">
          <div>
            <div className="flex border-b border-zinc-900 mb-8">
              <button
                onClick={() => setActiveTab('COMMENTS')}
                className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === 'COMMENTS'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-500 hover:text-white'
                }`}
              >
                {lang === 'RU' ? 'Комментарии' : 'Comments'}
              </button>
              <button
                onClick={() => setActiveTab('ACTIVITY')}
                className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === 'ACTIVITY'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-500 hover:text-white'
                }`}
              >
                {lang === 'RU' ? 'Активность' : 'Activity'}
              </button>
            </div>

            {/* Comments Section */}
            {activeTab === 'COMMENTS' && (
              <div className="space-y-8">
                {/* Input */}
                {!replyTo && (
                  <div className="flex gap-4">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <UserIcon size={16} className="text-zinc-500" />
                    </div>
                    <div className="flex-1">
                      <div className="relative">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                          placeholder={lang === 'RU' ? "Написать комментарий..." : "Write something..."}
                          className="flex h-10 w-full rounded-md border border-zinc-900 bg-transparent px-3 py-2 pr-12 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 placeholder:text-zinc-600"
                        />
                        <button
                          type="button"
                          onClick={handlePostComment}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white transition-colors"
                          aria-label={lang === 'RU' ? 'Отправить' : 'Send'}
                        >
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* List */}
                <div className="space-y-6">
                  {threadedComments.map((root) => {
                    const renderNode = (node: CommentNode, depth: number): React.ReactNode => {
                      const canLike = Boolean(onToggleCommentLike && user);
                      const liked = Boolean(node.likedByMe);
                      const likeClasses = liked ? "text-[rgba(245,68,166,1)]" : "text-zinc-500 hover:text-white";
                      const isReplyingHere = Boolean(replyTo && replyTo.id === node.id);

                      return (
                        <div key={node.id} className="animate-in fade-in">
                          <div
                            className={`flex gap-4 group ${depth > 0 ? "border-l-2 border-zinc-800 pl-4" : ""}`}
                            style={{ marginLeft: depth * 20 }}
                          >
                            <img
                              src={node.avatar}
                              alt={node.user}
                              className="w-9 h-9 rounded-full bg-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <span className="font-semibold text-sm text-white">{node.user}</span>
                                <span className="text-[10px] uppercase text-zinc-500 tracking-wider">{node.timestamp}</span>
                              </div>
                              <p className="text-zinc-300 text-sm mb-2">{node.text}</p>
                              <div className="flex items-center gap-4">
                                <button
                                  type="button"
                                  disabled={!onToggleCommentLike}
                                  onClick={() => {
                                    if (!user) {
                                      onLogin();
                                      return;
                                    }
                                    void onToggleCommentLike?.(node.id);
                                  }}
                                  className={`flex items-center gap-1.5 text-xs transition-colors ${likeClasses} ${!canLike ? "opacity-70" : ""}`}
                                >
                                  <ThumbsUp size={12} />
                                  {node.likes}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!user) {
                                      onLogin();
                                      return;
                                    }
                                    setReplyTo({ id: node.id, label: node.user });
                                  }}
                                  className="text-xs text-zinc-500 hover:text-white transition-colors"
                                >
                                  {lang === 'RU' ? 'Ответить' : 'Reply'}
                                </button>
                              </div>

                              {isReplyingHere && (
                                <div className="mt-3 flex gap-4 border-l-2 border-zinc-800 pl-4">
                                  <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                    <UserIcon size={16} className="text-zinc-500" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                                      <div className="min-w-0 truncate">
                                        {lang === 'RU' ? 'Ответ на' : 'Replying to'}: <span className="text-white">{replyTo?.label}</span>
                                      </div>
                                    </div>
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handlePostComment();
                                          if (e.key === 'Escape') {
                                            setReplyTo(null);
                                            setCommentText('');
                                          }
                                        }}
                                        placeholder={lang === 'RU' ? "Написать ответ..." : "Write a reply..."}
                                        className="flex h-10 w-full rounded-md border border-zinc-900 bg-transparent px-3 py-2 pr-24 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 placeholder:text-zinc-600"
                                      />
                                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReplyTo(null);
                                            setCommentText('');
                                          }}
                                          className="h-8 w-8 rounded-md border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                                          aria-label={lang === 'RU' ? 'Отменить' : 'Cancel'}
                                        >
                                          <X size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handlePostComment}
                                          className="h-8 w-8 rounded-md border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300 hover:text-white"
                                          aria-label={lang === 'RU' ? 'Отправить' : 'Send'}
                                        >
                                          <Send size={14} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          {node.children.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {node.children.map((child) => renderNode(child, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return renderNode(root, 0);
                  })}
                </div>
              </div>
            )}

            {activeTab === 'ACTIVITY' && (
              <div className="space-y-4">
                {insightsLoading && (
                  <p className="text-sm text-neutral-400">
                    {lang === 'RU' ? 'Загрузка активности...' : 'Loading activity...'}
                  </p>
                )}
                {!insightsLoading && publicTrades.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    {lang === 'RU' ? 'Сделок пока нет' : 'No trades yet'}
                  </p>
                )}
                {publicTrades.map((trade) => {
                  const isBuy = trade.action === 'buy';
                  const label =
                    isBuy
                      ? lang === 'RU'
                        ? 'Покупка'
                        : 'Buy'
                      : lang === 'RU'
                      ? 'Продажа'
                      : 'Sell';
                  const formattedTime = new Date(trade.createdAt).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: 'short',
                  });
                  return (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between border border-zinc-900 rounded-2xl p-3 text-sm text-neutral-300"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {label} • {trade.outcome}
                        </p>
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wider">
                          {formattedTime}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="text-zinc-100">
                          ${trade.collateralGross.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {Math.abs(trade.sharesDelta).toFixed(2)} sh @ {(trade.priceAfter * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rules Card (mobile: after bid + comments/activity) */}
          <div className="mt-8 lg:hidden rounded-2xl border border-zinc-900 bg-black p-6 shadow-sm">
            <h3 className="font-semibold text-zinc-300 mb-4 flex items-center gap-2 text-xs uppercase tracking-wider">
              <ShieldCheck size={14} />
              {lang === 'RU' ? 'Правила исхода' : 'Rules'}
            </h3>
            <div className="text-xs text-zinc-500 leading-relaxed space-y-4 font-mono">
              <p>{market.description}</p>
              <p className="pt-4 border-t border-zinc-900">
                Resolution based on consensus.
              </p>
            </div>
          </div>
        </div>
      </div>

      {disclaimerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDisclaimerOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-900 bg-black p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-semibold text-zinc-100">{lang === 'RU' ? 'Информация' : 'Info'}</div>
              <button
                type="button"
                onClick={() => setDisclaimerOpen(false)}
                className="h-9 w-9 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center text-zinc-300"
                aria-label={lang === 'RU' ? 'Закрыть' : 'Close'}
              >
                <X size={18} />
              </button>
            </div>

            <div className="text-sm text-zinc-300 leading-relaxed">
              {lang === 'RU'
                ? `Если ваш прогноз верен, каждая акция погашается по цене $1.00. Если неверен — акции сгорают. Рынки прогнозов сопряжены с высоким риском потери средств.`
                : `If your prediction is correct, each share is redeemed for $1.00. If incorrect — shares expire worthless. Prediction markets involve a high risk of total loss.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketPage;
