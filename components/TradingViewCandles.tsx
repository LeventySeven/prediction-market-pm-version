'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type AreaData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from 'lightweight-charts';

type VolumeBar = {
  ts: number;
  value: number;
  color?: string;
};

type AreaPoint = {
  ts: number;
  value: number;
  high?: number;
  low?: number;
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
      mode: 'area';
      points: AreaPoint[];
      color?: string;
      volumeBars?: VolumeBar[];
      lines?: never;
    }
  | {
      mode: 'lines';
      lines: LineSeriesInput[];
      volumeBars?: VolumeBar[];
      points?: never;
      color?: never;
    };

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const toPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.abs(value) <= 1.0001 ? value * 100 : value;
  return Number(clampPercent(normalized).toFixed(2));
};

const normalizeVolumeBars = (bars: VolumeBar[]): HistogramData<UTCTimestamp>[] => {
  const ordered = [...bars]
    .filter((row) => Number.isFinite(row.ts) && Number.isFinite(row.value))
    .sort((a, b) => a.ts - b.ts);

  return ordered.map((row) => ({
    time: Math.floor(row.ts / 1000) as UTCTimestamp,
    value: Math.max(0, Number(row.value ?? 0)),
    color: row.color,
  }));
};

const normalizeAreaPoints = (
  points: AreaPoint[]
): {
  area: AreaData<UTCTimestamp>[];
  high: LineData<UTCTimestamp>[];
  low: LineData<UTCTimestamp>[];
} => {
  const bySecond = new Map<number, { value: number; high: number | null; low: number | null }>();
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.ts) && Number.isFinite(point.value))
    .sort((a, b) => a.ts - b.ts);

  for (const point of ordered) {
    const second = Math.floor(point.ts / 1000);
    bySecond.set(second, {
      value: toPercent(point.value),
      high: Number.isFinite(point.high) ? toPercent(point.high ?? 0) : null,
      low: Number.isFinite(point.low) ? toPercent(point.low ?? 0) : null,
    });
  }

  const rows = Array.from(bySecond.entries()).sort((a, b) => a[0] - b[0]);
  return {
    area: rows.map(([sec, row]) => ({
      time: sec as UTCTimestamp,
      value: row.value,
    })),
    high: rows
      .filter(([, row]) => row.high !== null)
      .map(([sec, row]) => ({
        time: sec as UTCTimestamp,
        value: row.high as number,
      })),
    low: rows
      .filter(([, row]) => row.low !== null)
      .map(([sec, row]) => ({
        time: sec as UTCTimestamp,
        value: row.low as number,
      })),
  };
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

const TradingViewCandles: React.FC<TradingViewCandlesProps> = (props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const highBandSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lowBandSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const areaPoints = props.mode === 'area' ? props.points : undefined;
  const lineInputs = props.mode === 'lines' ? props.lines : undefined;

  const normalizedVolume = useMemo(
    () => normalizeVolumeBars(props.volumeBars ?? []),
    [props.volumeBars]
  );
  const normalizedArea = useMemo(
    () => (areaPoints ? normalizeAreaPoints(areaPoints) : null),
    [areaPoints]
  );
  const normalizedLines = useMemo(
    () =>
      lineInputs
        ? lineInputs.map((line) => ({
            ...line,
            points: normalizeLinePoints(line.points),
          }))
        : [],
    [lineInputs]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#9ca3af',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.035)' },
        horzLines: { color: 'rgba(255,255,255,0.045)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(244,63,164,0.28)' },
        horzLine: { color: 'rgba(244,63,164,0.28)' },
      },
      localization: {
        priceFormatter: (value) => `${value.toFixed(1)}%`,
      },
      rightPriceScale: {
        borderColor: '#18181b',
        scaleMargins: { top: 0.08, bottom: 0.24 },
      },
      timeScale: {
        borderColor: '#18181b',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 7,
        minBarSpacing: 4,
      },
    });

    chartRef.current = chart;

    return () => {
      chartRef.current = null;
      areaSeriesRef.current = null;
      highBandSeriesRef.current = null;
      lowBandSeriesRef.current = null;
      lineSeriesRef.current.clear();
      volumeSeriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    const syncSize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;
      chart.resize(width, height);
    };

    syncSize();
    const frameId = window.requestAnimationFrame(syncSize);
    const onVisibilityChange = () => {
      if (!document.hidden) syncSize();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.cancelAnimationFrame(frameId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    }

    const observer = new ResizeObserver(() => {
      syncSize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (!volumeSeriesRef.current) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        base: 0,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale('volume').applyOptions({
        visible: false,
        scaleMargins: { top: 0.8, bottom: 0.02 },
        borderVisible: false,
      });
    }
    volumeSeriesRef.current.setData(normalizedVolume);
  }, [normalizedVolume]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || props.mode !== 'area' || !normalizedArea) return;

    for (const [id, series] of lineSeriesRef.current.entries()) {
      chart.removeSeries(series);
      lineSeriesRef.current.delete(id);
    }

    if (!areaSeriesRef.current) {
      areaSeriesRef.current = chart.addSeries(AreaSeries, {
        lineWidth: 3,
        priceLineVisible: false,
        lastValueVisible: true,
        lineColor: props.color ?? 'rgba(190,255,29,1)',
        topColor: 'rgba(190,255,29,0.28)',
        bottomColor: 'rgba(190,255,29,0.02)',
        crosshairMarkerVisible: true,
      });
    }
    areaSeriesRef.current.applyOptions({
      lineColor: props.color ?? 'rgba(190,255,29,1)',
      topColor: 'rgba(190,255,29,0.28)',
      bottomColor: 'rgba(190,255,29,0.02)',
    });
    areaSeriesRef.current.setData(normalizedArea.area);

    if (!highBandSeriesRef.current) {
      highBandSeriesRef.current = chart.addSeries(LineSeries, {
        color: 'rgba(190,255,29,0.18)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    if (!lowBandSeriesRef.current) {
      lowBandSeriesRef.current = chart.addSeries(LineSeries, {
        color: 'rgba(245,68,166,0.18)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    highBandSeriesRef.current.setData(normalizedArea.high);
    lowBandSeriesRef.current.setData(normalizedArea.low);

    const allTimes = normalizedArea.area.map((row) => Number(row.time));
    if (allTimes.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [normalizedArea, props.mode, props.color]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || props.mode !== 'lines') return;

    if (areaSeriesRef.current) {
      chart.removeSeries(areaSeriesRef.current);
      areaSeriesRef.current = null;
    }
    if (highBandSeriesRef.current) {
      chart.removeSeries(highBandSeriesRef.current);
      highBandSeriesRef.current = null;
    }
    if (lowBandSeriesRef.current) {
      chart.removeSeries(lowBandSeriesRef.current);
      lowBandSeriesRef.current = null;
    }

    const activeIds = new Set(normalizedLines.map((line) => line.id));
    for (const [id, series] of lineSeriesRef.current.entries()) {
      if (activeIds.has(id)) continue;
      chart.removeSeries(series);
      lineSeriesRef.current.delete(id);
    }

    for (const line of normalizedLines) {
      let series = lineSeriesRef.current.get(line.id);
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: line.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
        });
        lineSeriesRef.current.set(line.id, series);
      }
      series.applyOptions({
        color: line.color,
        lastValueVisible: true,
      });
      series.setData(line.points);
    }

    const allTimes = normalizedLines.flatMap((line) => line.points.map((row) => Number(row.time)));
    if (allTimes.length > 0) {
      chart.timeScale().fitContent();
    }
  }, [normalizedLines, props.mode]);

  return (
    <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-[26px] border border-zinc-900 bg-[linear-gradient(180deg,rgba(17,17,22,0.95),rgba(0,0,0,1))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(163,230,53,0.12),transparent_42%),radial-gradient(circle_at_85%_100%,rgba(244,63,164,0.12),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default TradingViewCandles;
