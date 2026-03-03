'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  createChart,
  type CandlestickData,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts';

type CandlePoint = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type LinePoint = {
  ts: number;
  value: number;
};

type LineSeriesInput = {
  id: string;
  title?: string;
  color: string;
  points: LinePoint[];
};

type TradingViewCandlesProps =
  | {
      mode?: 'candles';
      data: CandlePoint[];
      lines?: never;
    }
  | {
      mode: 'lines';
      lines: LineSeriesInput[];
      data?: never;
    };

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const toPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.abs(value) <= 1.0001 ? value * 100 : value;
  return Number(clampPercent(normalized).toFixed(2));
};

const normalizeCandles = (data: CandlePoint[]): CandlestickData<UTCTimestamp>[] => {
  const bySecond = new Map<number, { open: number; high: number; low: number; close: number }>();

  const ordered = [...data]
    .filter((row) => Number.isFinite(row.ts))
    .sort((a, b) => a.ts - b.ts);

  for (const row of ordered) {
    const second = Math.floor(row.ts / 1000);
    const open = toPercent(row.open);
    const high = toPercent(row.high);
    const low = toPercent(row.low);
    const close = toPercent(row.close);
    const prev = bySecond.get(second);

    if (!prev) {
      bySecond.set(second, { open, high, low, close });
      continue;
    }

    bySecond.set(second, {
      open: prev.open,
      high: Math.max(prev.high, high),
      low: Math.min(prev.low, low),
      close,
    });
  }

  return Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sec, value]) => ({
      time: sec as UTCTimestamp,
      open: value.open,
      high: value.high,
      low: value.low,
      close: value.close,
    }));
};

const normalizeLinePoints = (points: LinePoint[]): LineData<UTCTimestamp>[] => {
  const bySecond = new Map<number, number>();
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.value))
    .sort((a, b) => a.ts - b.ts);

  for (const point of ordered) {
    bySecond.set(Math.floor(point.ts / 1000), toPercent(point.value));
  }

  return Array.from(bySecond.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sec, value]) => ({
      time: sec as UTCTimestamp,
      value,
    }));
};

const sameCandle = (
  a: CandlestickData<UTCTimestamp>,
  b: CandlestickData<UTCTimestamp>
): boolean =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close;

const sameLinePoint = (a: LineData<UTCTimestamp>, b: LineData<UTCTimestamp>): boolean =>
  a.time === b.time && a.value === b.value;

const shouldResetCandles = (
  prev: CandlestickData<UTCTimestamp>[],
  next: CandlestickData<UTCTimestamp>[]
): boolean => {
  if (next.length === 0) return prev.length !== 0;
  if (prev.length === 0) return true;
  if (next.length < prev.length) return true;

  const stablePrefixLength = Math.min(prev.length, next.length) - 1;
  for (let i = 0; i < stablePrefixLength; i += 1) {
    if (!sameCandle(prev[i], next[i])) return true;
  }

  return false;
};

const shouldResetLine = (
  prev: LineData<UTCTimestamp>[],
  next: LineData<UTCTimestamp>[]
): boolean => {
  if (next.length === 0) return prev.length !== 0;
  if (prev.length === 0) return true;
  if (next.length < prev.length) return true;

  const stablePrefixLength = Math.min(prev.length, next.length) - 1;
  for (let i = 0; i < stablePrefixLength; i += 1) {
    if (!sameLinePoint(prev[i], next[i])) return true;
  }

  return false;
};

const TradingViewCandles: React.FC<TradingViewCandlesProps> = (props) => {
  const mode = props.mode ?? 'candles';
  const candleInput = mode === 'candles' ? props.data : [];
  const lineInput = mode === 'lines' ? props.lines : [];

  const normalizedCandles = useMemo(() => normalizeCandles(candleInput), [candleInput]);
  const normalizedLines = useMemo(
    () =>
      lineInput.map((line) => ({
        ...line,
        points: normalizeLinePoints(line.points),
      })),
    [lineInput]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());

  const candleDataRef = useRef<CandlestickData<UTCTimestamp>[]>([]);
  const lineDataRef = useRef<Map<string, LineData<UTCTimestamp>[]>>(new Map());
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#a1a1aa',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(244,63,164,0.65)' },
        horzLine: { color: 'rgba(244,63,164,0.65)' },
      },
      localization: {
        priceFormatter: (value) => `${value.toFixed(2)}%`,
      },
      rightPriceScale: {
        borderColor: '#18181b',
        scaleMargins: { top: 0.06, bottom: 0.06 },
      },
      timeScale: {
        borderColor: '#18181b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 6,
        minBarSpacing: 4,
      },
    });

    chartRef.current = chart;

    return () => {
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current.clear();
      candleDataRef.current = [];
      lineDataRef.current.clear();
      didInitialFitRef.current = false;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || mode !== 'candles') return;

    for (const [id, series] of lineSeriesRef.current.entries()) {
      chart.removeSeries(series);
      lineSeriesRef.current.delete(id);
    }
    lineDataRef.current.clear();

    let series = candleSeriesRef.current;
    if (!series) {
      series = chart.addSeries(CandlestickSeries, {
        upColor: 'rgba(163,230,53,0.95)',
        downColor: 'rgba(244,63,164,0.95)',
        borderUpColor: 'rgba(190,242,100,1)',
        borderDownColor: 'rgba(249,168,212,1)',
        borderVisible: true,
        wickUpColor: 'rgba(190,242,100,0.95)',
        wickDownColor: 'rgba(249,168,212,0.95)',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: 'rgba(244,63,164,0.9)',
      });
      candleSeriesRef.current = series;
      candleDataRef.current = [];
      didInitialFitRef.current = false;
    }

    const prev = candleDataRef.current;
    const next = normalizedCandles;

    if (shouldResetCandles(prev, next)) {
      series.setData(next);
      candleDataRef.current = next;
    } else if (next.length > prev.length) {
      for (let i = prev.length; i < next.length; i += 1) {
        series.update(next[i]);
      }
      candleDataRef.current = next;
    } else if (next.length > 0 && prev.length > 0) {
      const prevLast = prev[prev.length - 1];
      const nextLast = next[next.length - 1];
      if (!sameCandle(prevLast, nextLast)) {
        series.update(nextLast);
      }
      candleDataRef.current = next;
    }

    if (!didInitialFitRef.current && next.length > 0) {
      chart.timeScale().fitContent();
      didInitialFitRef.current = true;
    }
  }, [mode, normalizedCandles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || mode !== 'lines') return;

    if (candleSeriesRef.current) {
      chart.removeSeries(candleSeriesRef.current);
      candleSeriesRef.current = null;
      candleDataRef.current = [];
      didInitialFitRef.current = false;
    }

    const activeIds = new Set(normalizedLines.map((line) => line.id));
    for (const [id, series] of lineSeriesRef.current.entries()) {
      if (activeIds.has(id)) continue;
      chart.removeSeries(series);
      lineSeriesRef.current.delete(id);
      lineDataRef.current.delete(id);
    }

    let hasAnyData = false;

    for (const line of normalizedLines) {
      let series = lineSeriesRef.current.get(line.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: true,
          priceLineColor: line.color,
          crosshairMarkerVisible: true,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        });
        lineSeriesRef.current.set(line.id, series);
        lineDataRef.current.set(line.id, []);
      } else {
        series.applyOptions({
          color: line.color,
          priceLineColor: line.color,
        });
      }

      const prev = lineDataRef.current.get(line.id) ?? [];
      const next = line.points;

      if (shouldResetLine(prev, next)) {
        series.setData(next);
        lineDataRef.current.set(line.id, next);
      } else if (next.length > prev.length) {
        for (let i = prev.length; i < next.length; i += 1) {
          series.update(next[i]);
        }
        lineDataRef.current.set(line.id, next);
      } else if (next.length > 0 && prev.length > 0) {
        const prevLast = prev[prev.length - 1];
        const nextLast = next[next.length - 1];
        if (!sameLinePoint(prevLast, nextLast)) {
          series.update(nextLast);
        }
        lineDataRef.current.set(line.id, next);
      }

      if (next.length > 0) {
        hasAnyData = true;
      }
    }

    if (!didInitialFitRef.current && hasAnyData) {
      chart.timeScale().fitContent();
      didInitialFitRef.current = true;
    }
  }, [mode, normalizedLines]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-900 bg-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(163,230,53,0.08),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(244,63,164,0.10),transparent_50%)]" />
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default TradingViewCandles;
