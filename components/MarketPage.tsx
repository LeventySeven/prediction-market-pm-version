import React, { useMemo, useState, useEffect } from 'react';
import { Market, User, Position, PriceCandle, PublicTrade, Comment } from '../types';
import Button from './Button';
import { Bookmark, ChevronLeft, Clock, ShieldCheck, User as UserIcon, Send, ThumbsUp, CalendarDays, Coins, MessageCircle, X, Info, LineChart, Link as LinkIcon, Check, Loader2, BookOpen } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart as RechartsLineChart, Line } from 'recharts';
import { formatTimeRemaining } from '../lib/time';
import TradingViewCandles from './TradingViewCandles';

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
  tradeBlockedMessage?: string | null;
  onOpenExternalTrade?: (marketId: string) => void;
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
  tradeBlockedMessage = null,
  onOpenExternalTrade,
}) => {
  const [activeTab, setActiveTab] = useState<'COMMENTS' | 'ACTIVITY'>('COMMENTS');
  const [commentText, setCommentText] = useState('');
  const [commentSendError, setCommentSendError] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<'YES' | 'NO'>('YES');
  const isMulti = market.marketType === "multi_choice" && Array.isArray(market.outcomes) && market.outcomes.length > 0;
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(isMulti ? (market.outcomes?.[0]?.id ?? null) : null);
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
  const [copied, setCopied] = useState(false);

  // Wrapper mode: all market execution is performed on Polymarket.
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

  const chartSeries = useMemo(() => {
    const nowTs = Date.now();
    const createdTsRaw = Date.parse(String(market.createdAt));
    const createdTs = Number.isFinite(createdTsRaw) ? createdTsRaw : nowTs;
    const candleTimes = priceCandles
      .map((c) => Date.parse(String(c.bucket)))
      .filter((t) => Number.isFinite(t));
    const times = [...candleTimes, createdTs, nowTs];
    const spansMultipleDays = (() => {
      if (times.length === 0) return false;
      const minTs = Math.min(...times);
      const maxTs = Math.max(...times);
      const first = new Date(minTs);
      const last = new Date(maxTs);
      return (
        first.getFullYear() !== last.getFullYear() ||
        first.getMonth() !== last.getMonth() ||
        first.getDate() !== last.getDate()
      );
    })();
    const labelFor = (ts: number) =>
      spansMultipleDays
        ? new Date(ts).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : new Date(ts).toLocaleTimeString(lang === 'RU' ? 'ru-RU' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit',
          });

    if (isMulti) {
      const outcomeLines = (market.outcomes ?? []).map((o) => ({
        id: o.id,
        title: o.title,
        color: o.chartColor ?? fallbackOutcomeColor(`${market.id}:${o.id}`),
        sortOrder: o.sortOrder ?? 0,
      }));
      const initialProb = outcomeLines.length > 0 ? Number((100 / outcomeLines.length).toFixed(2)) : 0;
      const byTs = new Map<number, { ts: number; label: string; spansMultipleDays: boolean; values: Record<string, number> }>();
      priceCandles.forEach((c) => {
        const ts = Date.parse(String(c.bucket));
        if (!Number.isFinite(ts) || !c.outcomeId) return;
        const row = byTs.get(ts) ?? { ts, label: labelFor(ts), spansMultipleDays, values: {} };
        row.values[c.outcomeId] = Number((c.close * 100).toFixed(2));
        byTs.set(ts, row);
      });
      if (!byTs.has(createdTs)) {
        const initValues: Record<string, number> = {};
        outcomeLines.forEach((o) => {
          initValues[o.id] = initialProb;
        });
        byTs.set(createdTs, { ts: createdTs, label: labelFor(createdTs), spansMultipleDays, values: initValues });
      }

      const sortedRows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
      const lastValues: Record<string, number> = {};
      outcomeLines.forEach((o) => {
        lastValues[o.id] = initialProb;
      });
      const normalizedRows = sortedRows.map((row) => {
        const values: Record<string, number> = {};
        outcomeLines.forEach((o) => {
          if (typeof row.values[o.id] === 'number' && Number.isFinite(row.values[o.id])) {
            lastValues[o.id] = row.values[o.id];
          }
          values[o.id] = Number(lastValues[o.id].toFixed(2));
        });
        return { ...row, values };
      });

      const liveValues: Record<string, number> = {};
      outcomeLines.forEach((o) => {
        const liveProb = Number((market.outcomes ?? []).find((mo) => mo.id === o.id)?.probability ?? NaN);
        liveValues[o.id] = Number.isFinite(liveProb)
          ? Number((liveProb * 100).toFixed(2))
          : Number(lastValues[o.id].toFixed(2));
      });
      const lastRow = normalizedRows[normalizedRows.length - 1] ?? null;
      const liveChanged = lastRow
        ? outcomeLines.some((o) => Math.abs((lastRow.values[o.id] ?? 0) - (liveValues[o.id] ?? 0)) > 0.05)
        : true;
      if (liveChanged) {
        normalizedRows.push({
          ts: Math.max(nowTs, (lastRow?.ts ?? 0) + 1),
          label: labelFor(nowTs),
          spansMultipleDays,
          values: liveValues,
        });
      }

      const data = normalizedRows.map((row) => ({ ...row, ...row.values }));
      return { mode: 'multi' as const, data, lines: outcomeLines.sort((a, b) => a.sortOrder - b.sortOrder) };
    }

    const fallbackChance = Number.isFinite(market.chance)
      ? market.chance
      : Math.round(Number(market.yesPrice ?? 0.5) * 100);

    const rows = priceCandles
      .map((c) => {
        const ts = Date.parse(String(c.bucket));
        if (!Number.isFinite(ts)) return null;
        const open = Number((c.open * 100).toFixed(2));
        const high = Number((c.high * 100).toFixed(2));
        const low = Number((c.low * 100).toFixed(2));
        const close = Number((c.close * 100).toFixed(2));
        return {
          ts,
          label: labelFor(ts),
          value: close,
          open,
          high,
          low,
          close,
          spansMultipleDays,
        };
      })
      .filter((v): v is { ts: number; label: string; value: number; open: number; high: number; low: number; close: number; spansMultipleDays: boolean } => Boolean(v))
      .sort((a, b) => a.ts - b.ts);

    if (rows.length === 0 || rows[0].ts > createdTs) {
      rows.unshift({ ts: createdTs, label: labelFor(createdTs), value: 50, open: 50, high: 50, low: 50, close: 50, spansMultipleDays });
    }

    const last = rows[rows.length - 1] ?? null;
    if (!last || Math.abs(last.value - fallbackChance) > 0.05) {
      rows.push({
        ts: Math.max(nowTs, (last?.ts ?? 0) + 1),
        label: labelFor(nowTs),
        value: Number(fallbackChance.toFixed(2)),
        open: Number((last?.close ?? fallbackChance).toFixed(2)),
        high: Number(Math.max(last?.close ?? fallbackChance, fallbackChance).toFixed(2)),
        low: Number(Math.min(last?.close ?? fallbackChance, fallbackChance).toFixed(2)),
        close: Number(fallbackChance.toFixed(2)),
        spansMultipleDays,
      });
    }

    return { mode: 'binary' as const, data: rows, lines: [] };
  }, [priceCandles, lang, market.chance, market.yesPrice, isMulti, market.outcomes, market.id]);

  const displayedChance = isMulti
    ? Math.round(Number((selectedOutcome?.price ?? 0) * 100))
    : (Number.isFinite(market.chance) ? market.chance : Math.round(Number(market.yesPrice ?? 0.5) * 100));

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
                          <span className="font-mono">${o.price.toFixed(2)} • {(o.probability * 100).toFixed(1)}%</span>
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
                      <span className="text-[rgba(190,255,29,1)] font-mono">{numericAmount > 0 && currentPrice > 0 ? (((1 / currentPrice) - 1) * 100).toFixed(1) : '0.0'}%</span>
                    </div>
                  </div>

                  <Button
                    fullWidth
                    onClick={handlePlaceBetClick}
                    disabled={placing || Boolean(tradeBlockedMessage)}
                  >
                    {!user
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
                  {tradeBlockedMessage && (
                    <div className="space-y-2">
                      <p className="text-xs text-red-400">{tradeBlockedMessage}</p>
                      {onOpenExternalTrade && (
                        <button
                          type="button"
                          onClick={() => onOpenExternalTrade(market.id)}
                          className="text-xs font-medium text-zinc-400 underline underline-offset-2 hover:text-white"
                        >
                          {lang === 'RU' ? 'Открыть рынок на Polymarket' : 'Open market on Polymarket'}
                        </button>
                      )}
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
          <div className="rounded-2xl border border-zinc-900 bg-black p-6 h-[520px] relative">
            <div className="flex items-baseline gap-4 mb-8">
              <span className="text-4xl font-bold tracking-tight text-zinc-100">{displayedChance}%</span>
              <span className="text-zinc-500 text-sm font-medium uppercase tracking-wide">
                {isMulti
                  ? (lang === 'RU' ? 'Вероятность выбранного исхода' : 'Selected outcome probability')
                  : (lang === 'RU' ? 'Вероятность (Да)' : 'Yes Probability')}
              </span>
            </div>
            {insightsLoading && (
              <span className="absolute top-6 right-6 text-[11px] uppercase text-zinc-500 tracking-wider">
                {lang === 'RU' ? 'Обновление...' : 'Updating...'}
              </span>
            )}
            {chartSeries.mode === 'multi' && chartSeries.lines.length > 0 && (
              <div className="absolute top-12 right-6 z-10 rounded-xl border border-zinc-900 bg-black/80 backdrop-blur px-3 py-2 space-y-1">
                {chartSeries.lines.map((line) => (
                  <div key={`legend-${line.id}`} className="flex items-center gap-2 text-[10px] text-zinc-300 max-w-[180px]">
                    <span className="w-2.5 h-2.5 rounded-full border border-zinc-800/80 shrink-0" style={{ backgroundColor: line.color }} />
                    <span className="truncate">{line.title}</span>
                  </div>
                ))}
              </div>
            )}
            {chartSeries.data.length > 0 ? (
              chartSeries.mode === 'multi' ? (
                <ResponsiveContainer width="100%" height="84%">
                  <RechartsLineChart data={chartSeries.data}>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#52525b', fontSize: 10 }}
                      tickFormatter={(value) => String(value)}
                      minTickGap={40}
                      dy={10}
                    />
                    <YAxis hide domain={[0, 100]} />
                    <CartesianGrid vertical={false} stroke="#18181b" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#000000', borderColor: '#27272a', borderRadius: '10px' }}
                      itemStyle={{ color: '#ffffff', fontSize: '12px' }}
                      labelStyle={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase' }}
                      labelFormatter={(_, payload) => {
                        const p = Array.isArray(payload) ? payload[0]?.payload : null;
                        const ts = p && typeof p.ts === "number" ? p.ts : null;
                        if (!ts) return "";
                        return new Date(ts).toLocaleString(lang === 'RU' ? 'ru-RU' : 'en-US', {
                          month: 'short',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      }}
                      formatter={(value: number, name: string) => [`${Number(value).toFixed(2)}%`, name]}
                    />
                    {chartSeries.lines.map((line) => (
                      <Line
                        key={line.id}
                        type="monotone"
                        dataKey={line.id}
                        name={line.title}
                        stroke={line.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ))}
                  </RechartsLineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[84%]">
                  <TradingViewCandles
                    data={chartSeries.data.slice(-300).map((row) => ({
                      ts: row.ts,
                      open: Number((row as { open?: number }).open ?? row.value ?? 0),
                      high: Number((row as { high?: number }).high ?? row.value ?? 0),
                      low: Number((row as { low?: number }).low ?? row.value ?? 0),
                      close: Number((row as { close?: number }).close ?? row.value ?? 0),
                    }))}
                  />
                </div>
              )
            ) : (
              <div className="flex h-[84%] items-center justify-center text-sm text-neutral-500">
                {lang === 'RU' ? 'Нет данных для графика' : 'No chart data yet'}
              </div>
            )}
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
                          {label} • {trade.outcomeTitle ?? trade.outcome ?? (lang === 'RU' ? 'Опция' : 'Option')}
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
