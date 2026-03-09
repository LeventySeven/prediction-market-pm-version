import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Market, User, Position, PriceCandle, PublicTrade, Comment, LiveActivityTick } from '../types';
import Button from './Button';
import EligibilityDisclaimerModal from './EligibilityDisclaimerModal';
import { Bookmark, ChevronLeft, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp, CalendarDays, Coins, MessageCircle, X, Info, LineChart, Link as LinkIcon, Check, Loader2, BookOpen } from 'lucide-react';
import { formatTimeRemaining, getTimeRemainingInfo } from '../lib/time';
import TradingViewCandles from './TradingViewCandles';
import { buildMarketChartSeries } from '@/src/lib/charts/marketChartSeries';
import { getChartRangeRequest, MARKET_CHART_RANGES, type MarketChartRange } from '@/src/lib/chartRanges';
import { formatPercent, roundPercentValue } from '@/src/lib/marketPresentation';

type ErrorLike = string | Error | { message?: string } | null | undefined;

const getErrorMessage = (error: ErrorLike, fallbackRu: string, fallbackEn: string, lang: 'RU' | 'EN') => {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : error && typeof error === 'object' && typeof (error as { message?: string }).message === 'string'
          ? String((error as { message?: string }).message)
          : '';
  if (!raw) return lang === 'RU' ? fallbackRu : fallbackEn;

  const upper = raw.toUpperCase();
  if (upper.includes('DECLAREDPROGRAMIDMISMATCH') || upper.includes('CUSTOM":4100')) {
    return lang === 'RU'
      ? 'Версия смарт-контракта не совпадает с настройками приложения. Обновите приложение и повторите попытку.'
      : 'Smart contract version does not match app configuration. Refresh/update the app and try again.';
  }
  if (upper.includes('ACCOUNTNOTINITIALIZED') || upper.includes('CUSTOM":3012')) {
    return lang === 'RU'
      ? 'Ончейн-конфиг не инициализирован для текущего Program ID. Выполните initialize_config и повторите.'
      : 'On-chain config is not initialized for the current Program ID. Run initialize_config and retry.';
  }
  if (upper.includes('TX_FAILED_ONCHAIN')) {
    return lang === 'RU'
      ? 'Транзакция в сети Solana не прошла. Проверьте баланс USDC и попробуйте снова.'
      : 'On-chain Solana transaction failed. Check your USDC balance and try again.';
  }
  if (upper.includes('INSUFFICIENT_SOL_FOR_FEES') || upper.includes('NOT ENOUGH SOL')) {
    return lang === 'RU'
      ? 'Недостаточно SOL для комиссии сети и создания нужных аккаунтов.'
      : 'Not enough SOL for network fees and required account creation.';
  }
  if (upper.includes('INSUFFICIENT_USDC_ONCHAIN')) {
    return lang === 'RU'
      ? 'Недостаточно USDC нужного mint в подключенном кошельке. Проверьте, что токен совпадает с USDC mint приложения.'
      : 'Insufficient USDC for the required mint in the connected wallet. Verify the token mint matches app USDC mint.';
  }
  if (upper.includes('CUSTOM":1')) {
    return lang === 'RU'
      ? 'Транзакция отклонена: недостаточно токенов или слишком маленькая сумма.'
      : 'Transaction rejected: insufficient tokens or amount too small.';
  }
  if (upper.includes('RATE_LIMIT_EXCEEDED')) {
    return lang === 'RU'
      ? 'Лимит создания рынков: до 3 новых рынков за 30 минут.'
      : 'Market creation limit reached: up to 3 new markets per 30 minutes.';
  }
  if (upper.includes('SOLANA_WALLET_MISMATCH')) {
    return lang === 'RU'
      ? 'Кошелёк не привязан к аккаунту. Переподключите кошелёк.'
      : 'Wallet not linked to your account. Please reconnect your wallet.';
  }
  if (upper.includes('MARKET_CLOSED') || upper.includes('MARKET_NOT_OPEN')) {
    return lang === 'RU' ? 'Событие завершено, ставки закрыты.' : 'Market closed for trading.';
  }
  if (upper.includes('NOT_AUTHENTICATED') || upper.includes('UNAUTHORIZED')) {
    return lang === 'RU' ? 'Требуется повторная авторизация.' : 'Re-authentication required.';
  }

  return raw;
};

interface MarketPageProps {
  market: Market;
  user: User | null;
  onBack: () => void;
  onLogin: () => void;
  bookmarked?: boolean;
  onToggleBookmark?: (params: { marketId: string; bookmarked: boolean }) => void;
  betIntent?: { side?: 'YES' | 'NO'; outcomeId?: string; nonce: number } | null;
  onRequireBetAuth?: (params: { marketId: string; side?: 'YES' | 'NO'; outcomeId?: string; amount: number; marketTitle: string }) => void;
  onPlaceBet: (params: { side?: 'YES' | 'NO'; outcomeId?: string; amount: number; marketId: string; marketTitle: string }) => Promise<void>;
  onSellPosition?: (params: { marketId: string; side?: 'YES' | 'NO'; outcomeId?: string; shares: number }) => Promise<void>;
  onClaimWinnings?: (params: { marketId: string; assetCode: 'USDC' | 'USDT' }) => Promise<void>;
  onResolveOutcome?: (params: { marketId: string; outcome: 'YES' | 'NO' }) => Promise<void>;
  comments: Comment[];
  onOpenUserProfile?: (userId: string) => void;
  onPostComment: (params: {
    marketId: string;
    provider?: "polymarket" | "limitless";
    text: string;
    parentId?: string | null;
  }) => Promise<void>;
  onToggleCommentLike?: (commentId: string) => Promise<void>;
  userPositions?: Position[];
  lang?: 'RU' | 'EN';
  priceCandles?: PriceCandle[];
  publicTrades?: PublicTrade[];
  liveActivityTicks?: LiveActivityTick[];
  insightsLoading?: boolean;
  insightsError?: string | null;
  commentsError?: string | null;
  activityError?: string | null;
  marketContext?: string | null;
  marketContextSources?: string[];
  marketContextLoading?: boolean;
  marketContextError?: string | null;
  onFetchMarketContext?: (marketId: string) => void;
  creatorHasBets?: boolean;
  onEditMarket?: () => void;
  onDeleteMarket?: () => void;
  onOpenExternalTrade?: (marketId: string) => void;
  chartRange?: MarketChartRange;
  onChartRangeChange?: (range: MarketChartRange) => void;
}

const MarketPage: React.FC<MarketPageProps> = ({
  market,
  user,
  onBack,
  onLogin,
  bookmarked = false,
  onToggleBookmark,
  betIntent = null,
  onRequireBetAuth,
  onPlaceBet,
  onSellPosition,
  onClaimWinnings,
  onResolveOutcome,
  comments,
  onOpenUserProfile,
  onPostComment,
  onToggleCommentLike,
  userPositions = [],
  lang = 'EN',
  priceCandles = [],
  publicTrades = [],
  liveActivityTicks = [],
  insightsLoading = false,
  insightsError = null,
  commentsError = null,
  activityError = null,
  marketContext = null,
  marketContextSources = [],
  marketContextLoading = false,
  marketContextError = null,
  onFetchMarketContext,
  creatorHasBets = false,
  onEditMarket,
  onDeleteMarket,
  onOpenExternalTrade,
  chartRange = "1M",
  onChartRangeChange,
}) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [commentSendError, setCommentSendError] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const isMulti = market.marketType === "multi_choice" && Array.isArray(market.outcomes) && market.outcomes.length > 0;
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(isMulti ? (market.outcomes?.[0]?.id ?? null) : null);
  const [amount, setAmount] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgentCountdown, setIsUrgentCountdown] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [resolvingOutcome, setResolvingOutcome] = useState<'YES' | 'NO' | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; label: string } | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Trading is delegated to venue-specific flows from the shell page.
  const isOnChainMarket = false;
  const walletConnected = false;
  const walletBalanceMajor: number | null = null;
  const vaultBalanceMajor: number | null = null;
  const onchainYesShares: number | null = null;
  const onchainNoShares: number | null = null;
  const onchainLoadError: string | null = null;

  useEffect(() => {
    if (!betIntent) return;
    if (betIntent.side) {
      setTradeType(betIntent.side);
    }
    if (betIntent.outcomeId) {
      setSelectedOutcomeId(betIntent.outcomeId);
    }
    const el = document.getElementById("bid-section");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [betIntent?.nonce]);

  useEffect(() => {
    if (!isMulti) {
      setSelectedOutcomeId(null);
      return;
    }
    if (!selectedOutcomeId && market.outcomes && market.outcomes.length > 0) {
      setSelectedOutcomeId(market.outcomes[0].id);
    }
  }, [isMulti, selectedOutcomeId, market.outcomes]);

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
  const creatorId = market.createdBy ? String(market.createdBy) : null;
  const creatorLabel = creatorId
    ? (user?.id === creatorId
        ? (lang === 'RU' ? 'Вы' : 'You')
        : `${creatorId.slice(0, 6)}...${creatorId.slice(-4)}`)
    : null;
  const creatorDisplayName = market.creatorName ?? creatorLabel;
  const creatorAvatarUrl = market.creatorAvatarUrl ?? null;
  const eventEnded = (() => {
    const parsed = Date.parse(eventEnd);
    return Number.isFinite(parsed) && parsed <= Date.now();
  })();
  const creatorControlsEnabled = Boolean(isCreator && onResolveOutcome);
  const showCreatorResolveControls = creatorControlsEnabled && (isResolved || eventEnded);

  // User's current position for this market
  const userYesPosition = userPositions.find(p => p.outcome === 'YES');
  const userNoPosition = userPositions.find(p => p.outcome === 'NO');
  const selectedOutcome = isMulti ? (market.outcomes ?? []).find((o) => o.id === selectedOutcomeId) ?? null : null;
  const userShares = isMulti
    ? (userPositions.find((p) => p.outcomeId === selectedOutcomeId)?.shares ?? 0)
    : (tradeType === 'YES' ? (userYesPosition?.shares ?? 0) : (userNoPosition?.shares ?? 0));
  const sellablePositions = userPositions.filter((p) => (p.shares ?? 0) > 0);

  const fallbackOutcomeColor = (seed: string) => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const r = 40 + (Math.abs(hash) % 180);
    const g = 40 + (Math.abs(hash >> 8) % 180);
    const b = 40 + (Math.abs(hash >> 16) % 180);
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  const chartRequest = useMemo(() => getChartRangeRequest(chartRange), [chartRange]);
  const chartSeries = useMemo(
    () =>
      buildMarketChartSeries({
        priceCandles,
        market,
        lang,
        interval: chartRequest.interval,
      }),
    [chartRequest.interval, lang, market, priceCandles]
  );

  const displayedChance = isMulti
    ? roundPercentValue(selectedOutcome?.price ?? 0)
    : roundPercentValue(Number.isFinite(market.chance) ? market.chance : Number(market.yesPrice ?? 0.5));
  const chartDelta = useMemo(() => {
    if (chartSeries.data.length < 2) return 0;
    if (chartSeries.mode === 'multi') {
      const activeOutcomeId = selectedOutcome?.id ?? chartSeries.lines[0]?.id ?? null;
      if (!activeOutcomeId) return 0;
      const first = Number(chartSeries.data[0]?.values?.[activeOutcomeId] ?? 0);
      const last = Number(chartSeries.data[chartSeries.data.length - 1]?.values?.[activeOutcomeId] ?? 0);
      return Number((last - first).toFixed(1));
    }
    const first = Number(chartSeries.data[0]?.value ?? 0);
    const last = Number(chartSeries.data[chartSeries.data.length - 1]?.value ?? 0);
    return Number((last - first).toFixed(1));
  }, [chartSeries, selectedOutcome?.id]);
  const chartVolumeBars = useMemo(() => {
    if (chartSeries.mode === 'multi') {
      return chartSeries.data.map((row) => ({
        ts: row.ts,
        value: row.volume,
        color: 'rgba(244,63,164,0.35)',
      }));
    }

    return chartSeries.data.map((row, index, rows) => {
      const prev = rows[Math.max(0, index - 1)]?.value ?? row.value;
      const rising = row.value >= prev;
      return {
        ts: row.ts,
        value: row.volume,
        color: rising ? 'rgba(190,255,29,0.42)' : 'rgba(245,68,166,0.42)',
      };
    });
  }, [chartSeries]);
  const prevDisplayedChanceRef = useRef(displayedChance);
  const [chanceBump, setChanceBump] = useState(false);

  useEffect(() => {
    if (prevDisplayedChanceRef.current === displayedChance) return;
    prevDisplayedChanceRef.current = displayedChance;
    setChanceBump(true);
    const timer = setTimeout(() => setChanceBump(false), 260);
    return () => clearTimeout(timer);
  }, [displayedChance]);

  const activityItems = useMemo(() => {
    const items: Array<
      | ({
          kind: "trade";
        } & PublicTrade)
      | {
          kind: "tick";
          id: string;
          createdAt: string;
          side: LiveActivityTick["side"];
          outcome: string | null;
          size: number;
          price: number;
          notional: number;
        }
    > = [];

    for (const trade of publicTrades) {
      items.push({ kind: "trade", ...trade });
    }

    for (const tick of liveActivityTicks) {
      items.push({
        kind: "tick",
        id: `tick:${tick.id}`,
        createdAt: tick.sourceTs || tick.createdAt,
        side: tick.side,
        outcome: tick.outcome,
        size: tick.size,
        price: tick.price,
        notional: tick.notional,
      });
    }

    const byId = new Map<string, (typeof items)[number]>();
    for (const item of items) {
      byId.set(item.id, item);
    }

    return Array.from(byId.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }, [publicTrades, liveActivityTicks]);

  useEffect(() => {
    const update = () => {
      if (isResolved) {
        setTimeLeft(lang === 'RU' ? 'Завершено' : 'Resolved');
        setIsUrgentCountdown(false);
        return;
      }
      const remaining = getTimeRemainingInfo(tradingDeadline);
      if (remaining.isExpired) {
        setTimeLeft(lang === 'RU' ? 'Завершено' : 'Ended');
        setIsUrgentCountdown(false);
        return;
      }
      setIsUrgentCountdown(remaining.isUnderHour);
      setTimeLeft(formatTimeRemaining(tradingDeadline, 'minutes', lang));
    };
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, [tradingDeadline, lang, isResolved]);

  const tradingClosed = (() => {
    const now = Date.now();
    const parsed = Date.parse(tradingDeadline);
    return Number.isFinite(parsed) && parsed < now;
  })();
  const isExpired = isResolved || tradingClosed;

  const handlePostComment = async () => {
    if (!commentText.trim()) return;
    if (!user) {
      onLogin();
      return;
    }
    const text = commentText.trim();
    setCommentSendError(null);
    setCommentText('');
    try {
      await onPostComment({
        marketId: market.id,
        provider: market.provider,
        text,
        parentId: replyTo?.id ?? null,
      });
    } catch (err) {
      console.error("postMarketComment failed", err);
      setCommentSendError(getErrorMessage(err, 'Не удалось отправить комментарий', 'Failed to post comment', lang));
    }
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
  const currentPrice = isMulti
    ? Number(selectedOutcome?.price ?? 0)
    : (tradeType === 'YES' ? market.yesPrice : market.noPrice);
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
    if (!supportsTrading) {
      setPlaceError(
        lang === 'RU'
          ? `Торги через ${externalVenueLabel} пока недоступны в приложении.`
          : `Trading via ${externalVenueLabel} is not available in the app yet.`
      );
      return;
    }
    if (isExpired) {
      setPlaceError(lang === 'RU' ? 'Торги закрыты.' : 'Trading closed.');
      return;
    }
    const numeric = Number(amount);
    if (!numeric || Number.isNaN(numeric) || numeric <= 0) {
      setPlaceError(lang === 'RU' ? 'Введите сумму числом больше 0' : 'Enter a numeric amount greater than 0');
      return;
    }
    if (isMulti && !selectedOutcomeId) {
      setPlaceError(lang === 'RU' ? 'Выберите вариант ответа' : 'Select an outcome option');
      return;
    }
    if (!user) {
      setPlaceError(null);
      if (onRequireBetAuth) {
        onRequireBetAuth({
          marketId: market.id,
          side: isMulti ? undefined : tradeType,
          outcomeId: isMulti ? selectedOutcomeId ?? undefined : undefined,
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
        side: isMulti ? undefined : tradeType,
        outcomeId: isMulti ? selectedOutcomeId ?? undefined : undefined,
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
        side: isMulti ? undefined : tradeType,
        outcomeId: isMulti ? selectedOutcomeId ?? undefined : undefined,
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

  const handleClaimClick = async () => {
    if (!isOnChainMarket || !onClaimWinnings) return;
    if (!user) return;
    try {
      setPlaceError(null);
      await onClaimWinnings({ marketId: market.id, assetCode: market.settlementAsset as 'USDC' | 'USDT' });
    } catch (e) {
      setPlaceError(getErrorMessage(e, 'Не удалось получить выигрыш', 'Failed to claim winnings', lang));
    }
  };

  const handleResolveOutcomeClick = async (side: 'YES' | 'NO') => {
    if (!creatorControlsEnabled || !onResolveOutcome) return;
    if (!eventEnded) {
      // Defensive guard; UI should hide the button before event end.
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

  const sourceLabel = lang === "RU" ? "Источник" : "Source";
  const sourceValue = (market.source ?? "").trim();
  const sourceIsUrl = /^https?:\/\//i.test(sourceValue);
  const providerLabel = market.provider === "limitless" ? "Limitless" : "Polymarket";
  const externalVenueLabel = market.provider === "limitless" ? "Limitless" : "Polymarket";
  const supportsTrading = market.capabilities?.supportsTrading !== false;

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

  const buildShareUrl = () => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    const titleSource = market.titleEn ?? market.titleRu ?? market.title;
    const titleSlug = String(titleSource ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const query = titleSlug ? `?title=${encodeURIComponent(titleSlug)}` : "";
    return `${origin}/market/${encodeURIComponent(market.id)}${query}`;
  };

  const copyMarketLink = async () => {
    const url = buildShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback: create a temporary input.
      try {
        const el = document.createElement("input");
        el.value = url;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore
      }
    }
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
        <div className="lg:col-span-8 lg:col-start-1 lg:row-start-1 space-y-6">
          {/* Market Header: Circular Image at Top */}
          <div className="relative">
            {/* Share + Bookmark buttons - top right */}
            <div className="absolute top-0 right-0 z-10 flex flex-col gap-2">
              <button
                type="button"
                onClick={copyMarketLink}
                className="h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center transition-colors text-zinc-300 hover:text-white"
                aria-label={lang === "RU" ? "Скопировать ссылку" : "Copy link"}
                title={lang === "RU" ? "Скопировать ссылку" : "Copy link"}
              >
                {copied ? <Check size={18} className="text-[rgba(190,255,29,1)]" /> : <LinkIcon size={18} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onLogin();
                    return;
                  }
                  onToggleBookmark?.({ marketId: market.id, bookmarked: !bookmarked });
                }}
                className={`h-10 w-10 rounded-full border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-950/60 flex items-center justify-center transition-colors ${
                  bookmarked ? "text-[rgba(245,68,166,1)]" : "text-zinc-300"
                }`}
                aria-label={lang === "RU" ? "Закладка" : "Bookmark"}
                title={lang === "RU" ? "Закладка" : "Bookmark"}
              >
                <Bookmark size={18} fill={bookmarked ? "currentColor" : "none"} />
              </button>
            </div>

            {/* Circular Market Image - centered at top */}
            <div className="mb-4">
              <img 
                src={market.imageUrl} 
                alt={localizedTitle} 
                className="w-20 h-20 rounded-full bg-zinc-950 object-cover border border-zinc-900" 
              />
            </div>

            {/* Market Title */}
            <div className="mb-2 pr-12">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 leading-tight mb-3">{localizedTitle}</h1>
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <span className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/50 px-2 py-1 text-zinc-200">
                  {providerLabel}
                </span>
                <span className={`flex items-center gap-2 font-mono ${isUrgentCountdown ? 'text-red-400' : 'text-zinc-200'}`}>
                  {isUrgentCountdown ? (
                    <span className="relative inline-flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/80" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.9)]" />
                    </span>
                  ) : (
                    <Clock size={14} />
                  )}
                  {timeLeft}
                </span>
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
              onClick={() => scrollToSection('chart-section')}
              className="flex-1 h-11 rounded-full border border-zinc-900 bg-black px-4 text-xs font-bold uppercase tracking-wider text-zinc-200 hover:bg-zinc-950/60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <LineChart size={16} className="text-zinc-400" />
              <span>{lang === 'RU' ? 'График' : 'Chart'}</span>
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
        </div>

        {/* Bet (trade card) */}
        <div
          id="bid-section"
          className="scroll-mt-24 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-3"
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
                  {lang === 'RU' ? 'Итог' : 'Summary'}: {formatPercent(market.chance)} {lang === 'RU' ? 'Да' : 'Yes'} • Vol: {market.volume}
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
                {isMulti ? (
                  <div className="mb-6 space-y-2">
                    {(market.outcomes ?? []).map((o) => {
                      const active = selectedOutcomeId === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedOutcomeId(o.id)}
                          className={`w-full rounded-xl border px-3 py-2 flex items-center justify-between text-sm ${
                            active
                              ? "border-[rgba(245,68,166,1)] bg-[rgba(245,68,166,0.10)] text-white"
                              : "border-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700"
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {o.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={o.iconUrl} alt={o.title} className="w-5 h-5 rounded-full object-cover border border-zinc-800" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700" />
                            )}
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-zinc-800/80"
                              style={{ backgroundColor: o.chartColor ?? fallbackOutcomeColor(`${market.id}:${o.id}`) }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{o.title}</span>
                          </span>
                          <span className="font-mono">${o.price.toFixed(2)} • {formatPercent(o.probability)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-zinc-950 rounded-full p-1 flex mb-6 border border-zinc-900">
                    <button
                      onClick={() => setTradeType('YES')}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-all ${
                        tradeType === 'YES'
                          ? 'bg-[rgba(190,255,29,1)] text-black shadow-[0_10px_30px_rgba(190,255,29,0.18)]'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                      }`}
                    >
                      {lang === 'RU' ? 'ДА' : 'YES'} ${market.yesPrice.toFixed(2)}
                    </button>
                    <button
                      onClick={() => setTradeType('NO')}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-all ${
                        tradeType === 'NO'
                          ? 'bg-[rgba(245,68,166,1)] text-white shadow-[0_10px_30px_rgba(245,68,166,0.20)]'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
                      }`}
                    >
                      {lang === 'RU' ? 'НЕТ' : 'NO'} ${market.noPrice.toFixed(2)}
                    </button>
                  </div>
                )}

                <div className="space-y-6">
                  {isOnChainMarket && (
                    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            {lang === 'RU' ? 'On-chain режим' : 'On-chain mode'}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-zinc-100">
                            {market.settlementAsset} {lang === 'RU' ? 'в хранилище' : 'vault settlement'}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {lang === 'RU'
                              ? 'Для ставок нужно пополнить баланс в Vault (Deposit).'
                              : 'You must deposit into the Vault before betting.'}
                          </div>
                        </div>
                        <div className="text-right text-xs text-zinc-500 font-mono">{walletConnected ? 'Solana' : ''}</div>
                      </div>

                      {onchainLoadError && (
                        <div className="mt-3 text-xs text-red-400">{onchainLoadError}</div>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-zinc-900 bg-black/40 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                            {lang === 'RU' ? 'Кошелек' : 'Wallet'}
                          </div>
                          <div className="mt-1 text-sm font-mono text-zinc-100">
                            {walletBalanceMajor === null ? '—' : `${walletBalanceMajor.toFixed(2)}`}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-900 bg-black/40 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                            Vault
                          </div>
                          <div className="mt-1 text-sm font-mono text-zinc-100">
                            {vaultBalanceMajor === null ? '—' : `${vaultBalanceMajor.toFixed(2)}`}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-zinc-900 bg-black/40 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">YES</div>
                          <div className="mt-1 text-sm font-mono text-zinc-100">
                            {onchainYesShares === null ? '—' : `${onchainYesShares.toFixed(2)} sh`}
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-900 bg-black/40 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-zinc-500">NO</div>
                          <div className="mt-1 text-sm font-mono text-zinc-100">
                            {onchainNoShares === null ? '—' : `${onchainNoShares.toFixed(2)} sh`}
                          </div>
                        </div>
                      </div>

                      {isResolved && winningSide && onClaimWinnings && (
                        <Button
                          fullWidth
                          className="mt-4"
                          onClick={handleClaimClick}
                          disabled={!walletConnected}
                        >
                          {lang === 'RU' ? 'Получить выигрыш (Claim)' : 'Claim winnings'}
                        </Button>
                      )}
                    </div>
                  )}

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
                        disabled={!supportsTrading}
                        className="flex h-11 w-full rounded-md border border-zinc-900 bg-transparent px-3 py-2 pl-7 text-lg font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 placeholder:text-zinc-700"
                      />
                    </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[1, 5, 10, 100].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => handleQuickAdd(inc)}
                      disabled={placing || isExpired || !supportsTrading}
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
                      <span className="text-[rgba(190,255,29,1)] font-mono">{numericAmount > 0 && currentPrice > 0 ? (((1 / currentPrice) - 1) * 100).toFixed(1) : '0.0'}%</span>
                    </div>
                  </div>

                  <Button
                    fullWidth
                    onClick={handlePlaceBetClick}
                    disabled={placing || !supportsTrading}
                  >
                    {!supportsTrading
                      ? lang === 'RU'
                        ? 'Недоступно в приложении'
                        : 'Unavailable in app'
                      : !user
                      ? lang === 'RU'
                        ? 'Зарегистрируйтесь, чтобы торговать'
                        : 'Sign up to trade'
                      : lang === 'RU'
                      ? isMulti
                        ? 'Купить опцию'
                        : `Купить ${tradeType === 'YES' ? 'ДА' : 'НЕТ'}`
                      : isMulti
                        ? 'BUY OPTION'
                        : `BUY ${tradeType}`}
                  </Button>
                  {onOpenExternalTrade && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onOpenExternalTrade(market.id)}
                        className="text-xs font-medium text-zinc-400 underline underline-offset-2 hover:text-white"
                      >
                        {lang === 'RU'
                          ? `Открыть рынок на ${externalVenueLabel}`
                          : `Open on ${externalVenueLabel}`}
                      </button>
                    </div>
                  )}
                  {showFee && (
                    <p className="text-center text-[10px] uppercase text-zinc-600 tracking-wider">
                      {feePercent}% {lang === 'RU' ? 'комиссия' : 'fee'}
                    </p>
                  )}
                </div>

                {user && onSellPosition && !isOnChainMarket && sellablePositions.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      {lang === 'RU' ? 'Активные ставки' : 'Your Active Bets'}
                    </p>
                    <div className="space-y-3">
                      {sellablePositions.map((position) => (
                        <div
                          key={`${position.marketId}-${position.outcomeId ?? position.outcome ?? "unknown"}`}
                          className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-3"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-white">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                                  position.outcome === 'YES'
                                    ? 'bg-[rgba(190,255,29,1)] border border-[rgba(190,255,29,1)] text-black'
                                    : position.outcome === 'NO'
                                      ? 'bg-[rgba(245,68,166,1)] border border-[rgba(245,68,166,1)] text-white'
                                      : 'bg-zinc-800 border border-zinc-700 text-white'
                                }`}
                              >
                                {position.outcomeTitle ?? position.outcome ?? (lang === 'RU' ? 'Опция' : 'Option')}
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
                                side: position.outcome ?? undefined,
                                outcomeId: position.outcomeId ?? undefined,
                                shares: position.shares ?? 0,
                              })
                            }
                          >
                            {lang === 'RU'
                              ? `Продать ${position.outcomeTitle ?? (position.outcome === 'YES' ? 'ДА' : position.outcome === 'NO' ? 'НЕТ' : 'опцию')}`
                              : `Sell ${position.outcomeTitle ?? position.outcome ?? 'option'}`}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {user && onSellPosition && isOnChainMarket && (
                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      {lang === 'RU' ? 'On-chain позиция' : 'On-chain position'}
                    </p>
                    <div className="space-y-3">
                      {([
                        { outcome: 'YES' as const, shares: onchainYesShares ?? 0 },
                        { outcome: 'NO' as const, shares: onchainNoShares ?? 0 },
                      ]).map((p) => (
                        <div key={p.outcome} className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-3">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-white">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${
                                p.outcome === 'YES'
                                  ? 'bg-[rgba(190,255,29,1)] border-[rgba(190,255,29,1)] text-black'
                                  : 'bg-[rgba(245,68,166,1)] border-[rgba(245,68,166,1)] text-white'
                              }`}>
                                {p.outcome}
                              </span>
                              <span className="font-medium">{lang === 'RU' ? 'Акций' : 'Shares'}</span>
                            </div>
                            <span className="font-mono text-white">{p.shares.toFixed(2)} sh</span>
                          </div>
                          <Button
                            fullWidth
                            className="mt-3 !bg-zinc-800 !text-white hover:!bg-zinc-700"
                            onClick={() =>
                              onSellPosition({
                                marketId: market.id,
                                side: p.outcome,
                                shares: p.shares,
                              })
                            }
                            disabled={!walletConnected || p.shares <= 0}
                          >
                            {lang === 'RU' ? 'Продать' : 'Sell'} {p.outcome}
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {lang === 'RU'
                        ? 'On-chain сделки появятся в истории после индексации (на тестнете).'
                        : 'On-chain trades will appear in history after indexing (on testnet).'}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Creator Controls (only after event end) */}
            {showCreatorResolveControls && (
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
                {creatorId && creatorDisplayName && (
                  <p className="text-[11px] text-zinc-400">
                    <span className="uppercase tracking-wider text-zinc-500">
                      {lang === 'RU' ? 'Создатель' : 'Created by'}:
                    </span>{' '}
                    {onOpenUserProfile ? (
                      <button
                        type="button"
                        onClick={() => onOpenUserProfile(creatorId)}
                        className="inline-flex items-center gap-2 text-zinc-200 underline underline-offset-4 hover:text-white"
                      >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden">
                          {creatorAvatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
                          ) : (
                            <UserIcon size={12} className="text-zinc-400" />
                          )}
                        </span>
                        {creatorDisplayName}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-zinc-200">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden">
                          {creatorAvatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
                          ) : (
                            <UserIcon size={12} className="text-zinc-400" />
                          )}
                        </span>
                        {creatorDisplayName}
                      </span>
                    )}
                  </p>
                )}
              {sourceValue && (
                <p className="text-[11px] text-zinc-400">
                  <span className="uppercase tracking-wider text-zinc-500">{sourceLabel}:</span>{" "}
                  {sourceIsUrl ? (
                    <a
                      href={sourceValue}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-200 underline underline-offset-4 hover:text-white"
                    >
                      {sourceValue}
                    </a>
                  ) : (
                    <span className="text-zinc-200">{sourceValue}</span>
                  )}
                </p>
              )}
                <p className="pt-4 border-t border-zinc-900">
                  Resolution based on consensus.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart (mobile: after bet; desktop: left column row 2) */}
        <div
          id="chart-section"
          className="scroll-mt-24 lg:col-span-8 lg:col-start-1 lg:row-start-2"
        >
          <div className="relative h-[580px] overflow-hidden rounded-[30px] border border-zinc-900 bg-[linear-gradient(180deg,rgba(19,19,24,0.96),rgba(4,4,6,1))] p-5 sm:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(190,255,29,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(245,68,166,0.12),transparent_38%)]" />

            <div className="relative flex h-full flex-col">
              <div className="flex flex-col gap-4 border-b border-zinc-900/80 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                    {isMulti
                      ? (lang === 'RU' ? 'Выбранный исход' : 'Selected outcome')
                      : (lang === 'RU' ? 'Да вероятность' : 'Yes probability')}
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <span
                      className={`text-5xl font-semibold tracking-tight text-zinc-50 transition-transform duration-200 ${
                        chanceBump ? 'scale-105' : 'scale-100'
                      }`}
                    >
                      {displayedChance}%
                    </span>
                    <span
                      className={`pb-1 text-sm font-semibold ${
                        chartDelta > 0
                          ? 'text-[rgba(190,255,29,1)]'
                          : chartDelta < 0
                            ? 'text-[rgba(245,68,166,1)]'
                            : 'text-zinc-400'
                      }`}
                    >
                      {chartDelta > 0 ? '+' : ''}
                      {chartDelta.toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {lang === 'RU'
                      ? `Диапазон ${chartRange} • Последняя цена синхронизирована с текущим рынком`
                      : `Range ${chartRange} • Latest point stays synced to the current market`}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <div className="inline-flex rounded-full border border-zinc-900 bg-zinc-950/70 p-1">
                    {MARKET_CHART_RANGES.map((rangeOption) => {
                      const active = chartRange === rangeOption;
                      return (
                        <button
                          key={`chart-range-${rangeOption}`}
                          type="button"
                          onClick={() => onChartRangeChange?.(rangeOption)}
                          className={`min-h-[38px] rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                            active
                              ? 'bg-zinc-100 text-zinc-950 shadow-[0_8px_30px_rgba(255,255,255,0.08)]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                          aria-pressed={active}
                        >
                          {rangeOption}
                        </button>
                      );
                    })}
                  </div>
                  {insightsLoading ? (
                    <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {lang === 'RU' ? 'Обновление...' : 'Updating...'}
                    </span>
                  ) : null}
                </div>
              </div>

              {chartSeries.mode === 'multi' && chartSeries.lines.length > 0 ? (
                <div className="relative z-10 mt-4 flex flex-wrap gap-2">
                  {chartSeries.lines.map((line) => (
                    <div
                      key={`legend-${line.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-950/60 px-3 py-1 text-[11px] text-zinc-300"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-zinc-800/80"
                        style={{ backgroundColor: line.color }}
                      />
                      <span className="truncate">{line.title}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="relative mt-5 flex-1">
                {chartSeries.data.length > 0 ? (
                  chartSeries.mode === 'multi' ? (
                    <TradingViewCandles
                      mode="lines"
                      volumeBars={chartVolumeBars}
                      lines={chartSeries.lines.map((line) => ({
                        id: line.id,
                        title: line.title,
                        color: line.color,
                        points: chartSeries.data
                          .map((row) => ({
                            ts: row.ts,
                            value: Number(row.values[line.id] ?? Number.NaN),
                          }))
                          .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.value)),
                      }))}
                    />
                  ) : (
                    <TradingViewCandles
                      mode="area"
                      color="rgba(190,255,29,1)"
                      volumeBars={chartVolumeBars}
                      points={chartSeries.data.map((row) => ({
                        ts: row.ts,
                        value: Number(row.close ?? row.value ?? 0),
                        high: Number(row.high ?? row.value ?? 0),
                        low: Number(row.low ?? row.value ?? 0),
                      }))}
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                    {lang === 'RU' ? 'Нет данных для графика' : 'No chart data yet'}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-zinc-800 text-zinc-200 hover:text-white"
              onClick={() => onFetchMarketContext?.(market.id)}
              disabled={marketContextLoading}
            >
              {marketContextLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <BookOpen size={16} />
              )}
              {lang === 'RU' ? 'Контекст рынка' : 'Market context'}
            </Button>
            {marketContext && (
              <span className="text-xs text-zinc-500">
                {lang === 'RU' ? 'Контекст готов' : 'Context ready'}
              </span>
            )}
          </div>
          {marketContextError && (
            <div className="mt-3 rounded-xl border border-zinc-900 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-400">
              {getErrorMessage(
                marketContextError,
                'Не удалось загрузить контекст',
                'Failed to load context',
                lang
              )}
            </div>
          )}
          {marketContext && (
            <div className="mt-4 rounded-2xl border border-zinc-900 bg-black p-6">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
                {lang === 'RU' ? 'Контекст рынка' : 'Market context'}
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {marketContext}
              </p>
              {marketContextSources.length > 0 && (
                <div className="mt-4 text-xs text-zinc-400">
                  <div className="uppercase tracking-wider text-zinc-500">
                    {lang === 'RU' ? 'Источники' : 'Sources'}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {marketContextSources.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-300 underline underline-offset-4 hover:text-white"
                      >
                        {url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {isCreator && (
          <div className="lg:col-span-4 lg:col-start-9 lg:row-start-2">
            <div className="rounded-2xl border border-zinc-900 bg-black p-6">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
                {lang === 'RU' ? 'Управление рынком' : 'Market management'}
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={onEditMarket}
                  disabled={creatorHasBets}
                >
                  {lang === 'RU' ? 'Изменить параметры' : 'Edit parameters'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={onDeleteMarket}
                  disabled={creatorHasBets}
                >
                  {lang === 'RU' ? 'Удалить рынок' : 'Delete market'}
                </Button>
              </div>
              {creatorHasBets && (
                <p className="mt-3 text-xs text-zinc-500">
                  {lang === 'RU'
                    ? 'На рынке есть ставки — параметры и удаление недоступны.'
                    : 'This market already has bets — editing and deletion are disabled.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Comments / Activity (on mobile this comes AFTER bid; on desktop it stays under chart) */}
        <div id="comments-section" className="scroll-mt-24 lg:col-span-8 lg:col-start-1 lg:row-start-3">
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
                {commentsError ? (
                  <div className="rounded-xl border border-zinc-900 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-400">
                    {getErrorMessage(
                      commentsError,
                      'Не удалось загрузить комментарии',
                      'Failed to load comments',
                      lang
                    )}
                  </div>
                ) : null}
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

                {commentSendError && (
                  <div className="text-xs text-[rgba(245,68,166,1)]">{commentSendError}</div>
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
                            <button
                              type="button"
                              onClick={() => onOpenUserProfile?.(node.userId)}
                              className="w-9 h-9 rounded-full overflow-hidden bg-zinc-900 opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              aria-label={lang === 'RU' ? 'Открыть профиль' : 'Open profile'}
                            >
                              <img
                                src={node.avatar}
                                alt={node.user}
                                className="w-full h-full object-cover"
                              />
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <button
                                  type="button"
                                  onClick={() => onOpenUserProfile?.(node.userId)}
                                  className="font-semibold text-sm text-white hover:underline text-left"
                                >
                                  {node.user}
                                </button>
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
                {!insightsLoading && activityError ? (
                  <div className="rounded-xl border border-zinc-900 bg-zinc-950/40 px-4 py-3 text-xs text-zinc-400">
                    {getErrorMessage(
                      activityError,
                      'Не удалось загрузить активность',
                      'Failed to load activity',
                      lang
                    )}
                  </div>
                ) : null}
                {!insightsLoading && activityItems.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    {lang === 'RU' ? 'Сделок пока нет' : 'No trades yet'}
                  </p>
                )}
                {activityItems.map((item) => {
                  const formattedTime = new Date(item.createdAt).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: 'short',
                  });
                  const isBuy = item.kind === "trade"
                    ? item.action === "buy"
                    : item.side === "BUY";
                  const label =
                    item.kind === "tick" && item.side === "UNKNOWN"
                      ? (lang === "RU" ? "Сделка" : "Trade")
                      : isBuy
                        ? lang === 'RU'
                          ? 'Покупка'
                          : 'Buy'
                        : lang === 'RU'
                        ? 'Продажа'
                        : 'Sell';
                  const outcome =
                    item.kind === "trade"
                      ? (item.outcomeTitle ?? item.outcome ?? (lang === 'RU' ? 'Опция' : 'Option'))
                      : (item.outcome ?? (lang === 'RU' ? 'Опция' : 'Option'));
                  const notional = item.kind === "trade" ? item.collateralGross : item.notional;
                  const shares = item.kind === "trade" ? Math.abs(item.sharesDelta) : Math.abs(item.size);
                  const price = item.kind === "trade" ? item.priceAfter : item.price;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between border border-zinc-900 rounded-2xl p-3 text-sm text-neutral-300"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {label} • {outcome}
                        </p>
                        <p className="text-[11px] text-neutral-500 uppercase tracking-wider">
                          {formattedTime}
                        </p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="text-zinc-100">
                          ${notional.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-neutral-500">
                          {shares.toFixed(2)} sh @ {(price * 100).toFixed(1)}%
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
              {creatorId && creatorDisplayName && (
                <p className="text-[11px] text-zinc-400">
                  <span className="uppercase tracking-wider text-zinc-500">
                    {lang === 'RU' ? 'Создатель' : 'Created by'}:
                  </span>{' '}
                  {onOpenUserProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(creatorId)}
                      className="inline-flex items-center gap-2 text-zinc-200 underline underline-offset-4 hover:text-white"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
                        ) : (
                          <UserIcon size={12} className="text-zinc-400" />
                        )}
                      </span>
                      {creatorDisplayName}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-zinc-200">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-900 bg-zinc-950/40 overflow-hidden">
                        {creatorAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={creatorAvatarUrl} alt={creatorDisplayName} className="h-full w-full object-cover" />
                        ) : (
                          <UserIcon size={12} className="text-zinc-400" />
                        )}
                      </span>
                      {creatorDisplayName}
                    </span>
                  )}
                </p>
              )}
              {sourceValue && (
                <p className="text-[11px] text-zinc-400">
                  <span className="uppercase tracking-wider text-zinc-500">{sourceLabel}:</span>{" "}
                  {sourceIsUrl ? (
                    <a
                      href={sourceValue}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-200 underline underline-offset-4 hover:text-white"
                    >
                      {sourceValue}
                    </a>
                  ) : (
                    <span className="text-zinc-200">{sourceValue}</span>
                  )}
                </p>
              )}
              <p className="pt-4 border-t border-zinc-900">
                Resolution based on consensus.
              </p>
            </div>
          </div>
        </div>
      </div>

      <EligibilityDisclaimerModal
        isOpen={disclaimerOpen}
        onClose={() => setDisclaimerOpen(false)}
        lang={lang}
      />
    </div>
  );
};

export default MarketPage;
