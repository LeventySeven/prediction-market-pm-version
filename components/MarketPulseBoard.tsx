'use client';

import React, { useMemo, useState } from 'react';
import { Activity, ArrowUpRight, Clock3, Layers3, Waves } from 'lucide-react';
import type { Market } from '../types';
import { formatTimeRemaining } from '../lib/time';

type MarketPulseBoardProps = {
  markets: Market[];
  loading?: boolean;
  lang?: 'RU' | 'EN';
  onMarketClick?: (market: Market) => void;
};

type BoardMode = 'TRENDING' | 'TOP';

const formatCompactValue = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 100 ? 0 : 1,
    ...options,
  }).format(value);

const formatUsd = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const safe = Math.max(0, value);
  if (safe < 1_000) return `$${Math.round(safe).toLocaleString('en-US')}`;
  return `$${formatCompactValue(safe)}`;
};

const formatCount = (value: number) => formatCompactValue(Math.max(0, value));

const hasFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const getLiquidity = (market: Market): number | null => {
  if (hasFinite(market.openInterest)) return Math.max(0, market.openInterest);
  if (hasFinite(market.liquidityB)) return Math.max(0, market.liquidityB);
  return null;
};

const getSpreadPercent = (market: Market): number | null => {
  if (!hasFinite(market.bestBid) || !hasFinite(market.bestAsk)) return null;
  return Math.max(0, (market.bestAsk - market.bestBid) * 100);
};

const getSignal = (market: Market, lang: 'RU' | 'EN') => {
  const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
  const isMulti = market.marketType === 'multi_choice' && outcomes.length > 0;
  if (isMulti) {
    const top = [...outcomes].sort((a, b) => b.probability - a.probability)[0] ?? null;
    const rawChance = top?.probability ?? 0;
    const normalizedChance = rawChance <= 1 ? rawChance * 100 : rawChance;
    return {
      label: top?.title ?? (lang === 'RU' ? 'Лидер' : 'Leader'),
      chance: Math.round(normalizedChance),
    };
  }

  return {
    label: lang === 'RU' ? 'Да' : 'Yes',
    chance: Math.round(Number.isFinite(market.chance) ? market.chance : (market.yesPrice ?? 0.5) * 100),
  };
};

const getEndsLabel = (market: Market, lang: 'RU' | 'EN') => {
  const deadline = market.closesAt || market.expiresAt;
  if (!deadline) return '—';
  return formatTimeRemaining(deadline, 'hours', lang);
};

const isEnded = (market: Market) => {
  if (market.state === 'resolved' || market.state === 'closed' || market.state === 'cancelled') return true;
  const deadline = market.closesAt || market.expiresAt;
  if (!deadline) return false;
  const parsed = Date.parse(deadline);
  return Number.isFinite(parsed) && parsed <= Date.now();
};

const getProviderName = (market: Market) => (market.provider === 'limitless' ? 'Limitless' : 'Polymarket');

const getProviderLogo = (market: Market) =>
  market.provider === 'limitless' ? '/venues/limitless.svg' : '/venues/polymarket.svg';

const MarketPulseBoard: React.FC<MarketPulseBoardProps> = ({
  markets,
  loading = false,
  lang = 'EN',
  onMarketClick,
}) => {
  const [mode, setMode] = useState<BoardMode>('TRENDING');

  const topRows = useMemo(() => {
    const candidates = markets.filter((market) => !isEnded(market));
    const rows = candidates.length > 0 ? candidates : markets;
    const sorted = [...rows].sort((a, b) => {
      const aPrimary = mode === 'TRENDING' ? (a.volume24hRaw ?? 0) : (a.volumeRaw ?? 0);
      const bPrimary = mode === 'TRENDING' ? (b.volume24hRaw ?? 0) : (b.volumeRaw ?? 0);
      if (bPrimary !== aPrimary) return bPrimary - aPrimary;
      const aLiquidity = getLiquidity(a) ?? 0;
      const bLiquidity = getLiquidity(b) ?? 0;
      if (bLiquidity !== aLiquidity) return bLiquidity - aLiquidity;
      const aCreated = Date.parse(a.createdAt);
      const bCreated = Date.parse(b.createdAt);
      return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
    });
    return sorted.slice(0, 8);
  }, [markets, mode]);

  const summary = useMemo(() => {
    const liveMarkets = markets.filter((market) => !isEnded(market)).length;
    const volume24h = markets.reduce((sum, market) => sum + Math.max(0, market.volume24hRaw ?? 0), 0);
    const liveBooks = markets.filter((market) => hasFinite(market.bestBid) && hasFinite(market.bestAsk)).length;
    const closingSoon = markets.filter((market) => {
      if (isEnded(market)) return false;
      const deadline = market.closesAt || market.expiresAt;
      const parsed = Date.parse(deadline ?? '');
      return Number.isFinite(parsed) && parsed <= Date.now() + 24 * 60 * 60 * 1000;
    }).length;

    return [
      {
        key: 'live',
        label: lang === 'RU' ? 'Живые рынки' : 'Live markets',
        value: formatCount(liveMarkets),
        tone: 'text-[rgba(190,255,29,1)]',
        icon: Activity,
      },
      {
        key: 'volume',
        label: lang === 'RU' ? 'Объем 24ч' : '24h volume',
        value: formatUsd(volume24h),
        tone: 'text-white',
        icon: Waves,
      },
      {
        key: 'books',
        label: lang === 'RU' ? 'Активные книги' : 'Live books',
        value: formatCount(liveBooks),
        tone: 'text-zinc-100',
        icon: Layers3,
      },
      {
        key: 'closing',
        label: lang === 'RU' ? 'Скоро закроются' : 'Closing soon',
        value: formatCount(closingSoon),
        tone: 'text-[rgba(245,68,166,1)]',
        icon: Clock3,
      },
    ];
  }, [lang, markets]);

  return (
    <section className="px-4 pt-4 pb-5">
      <div className="relative overflow-hidden rounded-[28px] border border-zinc-900 bg-[radial-gradient(circle_at_top_left,rgba(245,68,166,0.16),transparent_35%),radial-gradient(circle_at_top_right,rgba(190,255,29,0.10),transparent_30%),linear-gradient(180deg,rgba(20,20,24,0.96),rgba(5,5,7,1))] p-4 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_40%)] pointer-events-none" />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800/90 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-[rgba(190,255,29,1)] shadow-[0_0_12px_rgba(190,255,29,0.9)]" />
                {lang === 'RU' ? 'Пульс рынка' : 'Market pulse'}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[2rem]">
                {lang === 'RU'
                  ? 'Топ рынков с приоритетом на ликвидность, объем и скорость чтения'
                  : 'Top markets tuned for liquidity, volume, and fast scanning'}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                {lang === 'RU'
                  ? 'Сохраняем текущий каталог, но добавляем более плотный обзор для быстрого входа в лучшие рынки.'
                  : 'The existing catalog stays in place, with a denser board above it for fast entry into the best markets.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:w-[520px]">
              {loading && markets.length === 0
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={`summary-skeleton-${idx}`}
                      className="h-[92px] rounded-2xl border border-zinc-900 bg-black/50 animate-pulse"
                    />
                  ))
                : summary.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.key}
                        className="rounded-2xl border border-zinc-900 bg-black/55 px-4 py-3 backdrop-blur-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            {item.label}
                          </div>
                          <Icon size={15} className="text-zinc-500" />
                        </div>
                        <div className={`mt-3 text-xl font-semibold tracking-tight ${item.tone}`}>{item.value}</div>
                      </div>
                    );
                  })}
            </div>
          </div>

          <div className="rounded-[24px] border border-zinc-900 bg-black/60 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {lang === 'RU' ? 'Топ рынков' : 'Top markets'}
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {lang === 'RU'
                    ? 'Blur-подобный обзор, но на реальных рыночных метриках платформы'
                    : 'Blur-style scan view, adapted to real platform market metrics'}
                </div>
              </div>
              <div className="inline-flex rounded-full border border-zinc-900 bg-zinc-950/60 p-1">
                {([
                  { id: 'TRENDING' as const, labelRu: 'Тренды', labelEn: 'Trending' },
                  { id: 'TOP' as const, labelRu: 'Топ', labelEn: 'Top' },
                ]).map((tab) => {
                  const active = mode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMode(tab.id)}
                      className={`min-h-[40px] rounded-full px-4 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                        active
                          ? 'bg-zinc-100 text-zinc-950 shadow-[0_10px_25px_rgba(255,255,255,0.08)]'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {lang === 'RU' ? tab.labelRu : tab.labelEn}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-[minmax(0,2.6fr)_1fr_1fr_1fr_1.1fr_0.8fr] gap-4 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <div>{lang === 'RU' ? 'Рынок' : 'Market'}</div>
                <div>{lang === 'RU' ? 'Сигнал' : 'Signal'}</div>
                <div>{lang === 'RU' ? 'Объем 24ч' : '24h vol'}</div>
                <div>{lang === 'RU' ? 'Общий объем' : 'Total vol'}</div>
                <div>{lang === 'RU' ? 'Ликвидность' : 'Liquidity'}</div>
                <div>{lang === 'RU' ? 'До конца' : 'Ends'}</div>
              </div>

              <div className="border-t border-zinc-900">
                {loading && topRows.length === 0
                  ? Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={`desktop-row-skeleton-${idx}`}
                        className="grid grid-cols-[minmax(0,2.6fr)_1fr_1fr_1fr_1.1fr_0.8fr] gap-4 border-b border-zinc-900 px-4 py-4 animate-pulse"
                      >
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                        <div className="h-10 rounded-2xl bg-zinc-950/80" />
                      </div>
                    ))
                  : topRows.map((market) => {
                      const signal = getSignal(market, lang);
                      const liquidity = getLiquidity(market);
                      const spread = getSpreadPercent(market);
                      const category =
                        (lang === 'RU' ? market.categoryLabelRu : market.categoryLabelEn) ??
                        market.categoryLabelEn ??
                        market.categoryLabelRu;

                      return (
                        <button
                          key={`desktop-market-${market.id}`}
                          type="button"
                          onClick={() => onMarketClick?.(market)}
                          className="grid w-full grid-cols-[minmax(0,2.6fr)_1fr_1fr_1fr_1.1fr_0.8fr] gap-4 border-b border-zinc-900 px-4 py-4 text-left transition-colors hover:bg-zinc-950/70"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <img
                              src={market.imageUrl}
                              alt={market.title}
                              className="h-12 w-12 rounded-2xl border border-zinc-900 object-cover"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                                {lang === 'RU' ? market.titleRu ?? market.title : market.titleEn ?? market.title}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-900 bg-zinc-950/60 px-2 py-1">
                                  <img src={getProviderLogo(market)} alt={getProviderName(market)} className="h-3.5 w-3.5 object-contain" />
                                  {getProviderName(market)}
                                </span>
                                {category ? <span className="truncate">{category}</span> : null}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col justify-center">
                            <div className="text-sm font-semibold text-zinc-100">{signal.chance}%</div>
                            <div className="mt-1 text-[11px] text-zinc-500">{signal.label}</div>
                          </div>

                          <div className="flex flex-col justify-center">
                            <div className="text-sm font-semibold text-zinc-100">{formatUsd(market.volume24hRaw)}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              {market.liveUpdatedAt ? (lang === 'RU' ? 'живые данные' : 'live data') : (lang === 'RU' ? 'кэш' : 'cache')}
                            </div>
                          </div>

                          <div className="flex flex-col justify-center">
                            <div className="text-sm font-semibold text-zinc-100">{formatUsd(market.volumeRaw)}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">{market.volume}</div>
                          </div>

                          <div className="flex flex-col justify-center">
                            <div className="text-sm font-semibold text-zinc-100">{formatUsd(liquidity)}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              {spread === null ? (lang === 'RU' ? 'спред —' : 'spread —') : `${lang === 'RU' ? 'спред' : 'spread'} ${spread.toFixed(1)}%`}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">{getEndsLabel(market, lang)}</div>
                              <div className="mt-1 text-[11px] text-zinc-500">
                                {isEnded(market) ? (lang === 'RU' ? 'завершен' : 'ended') : (lang === 'RU' ? 'активен' : 'active')}
                              </div>
                            </div>
                            <ArrowUpRight size={14} className="text-zinc-600" />
                          </div>
                        </button>
                      );
                    })}
              </div>
            </div>

            <div className="space-y-3 p-4 lg:hidden">
              {loading && topRows.length === 0
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={`mobile-row-skeleton-${idx}`}
                      className="h-[148px] rounded-3xl border border-zinc-900 bg-zinc-950/60 animate-pulse"
                    />
                  ))
                : topRows.map((market) => {
                    const signal = getSignal(market, lang);
                    const liquidity = getLiquidity(market);
                    const spread = getSpreadPercent(market);
                    return (
                      <button
                        key={`mobile-market-${market.id}`}
                        type="button"
                        onClick={() => onMarketClick?.(market)}
                        className="w-full rounded-3xl border border-zinc-900 bg-zinc-950/55 p-4 text-left transition-colors hover:bg-zinc-950/80"
                      >
                        <div className="flex items-start gap-3">
                          <img
                            src={market.imageUrl}
                            alt={market.title}
                            className="h-12 w-12 rounded-2xl border border-zinc-900 object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                              {lang === 'RU' ? market.titleRu ?? market.title : market.titleEn ?? market.title}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {getProviderName(market)} • {signal.label} {signal.chance}%
                            </div>
                          </div>
                          <ArrowUpRight size={14} className="mt-1 text-zinc-600" />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-zinc-900 bg-black/40 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              {lang === 'RU' ? '24ч' : '24h'}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-zinc-100">{formatUsd(market.volume24hRaw)}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-900 bg-black/40 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              {lang === 'RU' ? 'Всего' : 'Total'}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-zinc-100">{formatUsd(market.volumeRaw)}</div>
                          </div>
                          <div className="rounded-2xl border border-zinc-900 bg-black/40 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              {lang === 'RU' ? 'Ликвидность' : 'Liquidity'}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-zinc-100">{formatUsd(liquidity)}</div>
                            <div className="mt-1 text-[11px] text-zinc-500">
                              {spread === null ? '—' : `${spread.toFixed(1)}%`}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-zinc-900 bg-black/40 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              {lang === 'RU' ? 'До конца' : 'Ends'}
                            </div>
                            <div className="mt-2 text-sm font-semibold text-zinc-100">{getEndsLabel(market, lang)}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MarketPulseBoard;
