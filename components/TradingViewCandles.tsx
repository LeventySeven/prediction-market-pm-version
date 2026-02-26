'use client';

import React, { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

type CandlePoint = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type TradingViewCandlesProps = {
  data: CandlePoint[];
};

const TradingViewCandles: React.FC<TradingViewCandlesProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const normalized = useMemo(
    () => {
      const bySecond = new Map<number, { open: number; high: number; low: number; close: number }>();
      const ordered = [...data]
        .filter((d) => Number.isFinite(d.ts))
        .sort((a, b) => a.ts - b.ts);

      for (const item of ordered) {
        const maxValue = Math.max(item.open, item.high, item.low, item.close);
        const scale = maxValue <= 1.0001 ? 100 : 1;
        const open = Math.max(0, Math.min(100, item.open * scale));
        const high = Math.max(0, Math.min(100, item.high * scale));
        const low = Math.max(0, Math.min(100, item.low * scale));
        const close = Math.max(0, Math.min(100, item.close * scale));
        const second = Math.floor(item.ts / 1000);
        const prev = bySecond.get(second);
        if (!prev) {
          bySecond.set(second, {
            open,
            high,
            low,
            close,
          });
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
        .map(([sec, ohlc]) => ({
          time: sec as UTCTimestamp,
          open: ohlc.open,
          high: ohlc.high,
          low: ohlc.low,
          close: ohlc.close,
        }));
    },
    [data]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#a1a1aa",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: {
        vertLine: { color: "rgba(244,63,164,0.65)" },
        horzLine: { color: "rgba(244,63,164,0.65)" },
      },
      localization: {
        priceFormatter: (value) => `${value.toFixed(2)}%`,
      },
      rightPriceScale: {
        borderColor: "#18181b",
        scaleMargins: { top: 0.06, bottom: 0.06 },
      },
      timeScale: {
        borderColor: "#18181b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        barSpacing: 6,
        minBarSpacing: 4,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "rgba(163,230,53,0.95)",
      downColor: "rgba(244,63,164,0.95)",
      borderUpColor: "rgba(190,242,100,1)",
      borderDownColor: "rgba(249,168,212,1)",
      borderVisible: true,
      wickUpColor: "rgba(190,242,100,0.95)",
      wickDownColor: "rgba(249,168,212,0.95)",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: "rgba(244,63,164,0.9)",
    });

    if (normalized.length > 0) {
      series.setData(normalized);
      chart.timeScale().fitContent();
    }

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chartRef.current = null;
      seriesRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }

    if (normalized.length === 0) {
      series.setData([] as CandlestickData<UTCTimestamp>[]);
      return;
    }

    series.setData(normalized);
    chart.timeScale().fitContent();
  }, [normalized]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-900 bg-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(163,230,53,0.08),transparent_45%),radial-gradient(circle_at_80%_100%,rgba(244,63,164,0.10),transparent_50%)]" />
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default TradingViewCandles;
