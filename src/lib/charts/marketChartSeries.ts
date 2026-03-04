import type { Market, PriceCandle } from "@/types";

export type MultiChartRow = {
  ts: number;
  label: string;
  spansMultipleDays: boolean;
  values: Record<string, number>;
};

export type BinaryChartRow = {
  ts: number;
  label: string;
  value: number;
  open: number;
  high: number;
  low: number;
  close: number;
  spansMultipleDays: boolean;
};

export type ChartSeries =
  | {
      mode: "multi";
      data: MultiChartRow[];
      lines: Array<{ id: string; title: string; color: string; sortOrder: number }>;
    }
  | {
      mode: "binary";
      data: BinaryChartRow[];
      lines: [];
    };

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

const candleTs = (candle: PriceCandle): number => Date.parse(String(candle.bucket));

const selectResolutionMs = (candles: PriceCandle[]): number => {
  if (candles.length < 2) return 60 * 60 * 1000;
  const times = candles
    .map(candleTs)
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b);
  if (times.length < 2) return 60 * 60 * 1000;
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? first;
  const span = Math.max(0, last - first);
  if (span >= 45 * 24 * 60 * 60 * 1000) {
    return 24 * 60 * 60 * 1000;
  }
  return 60 * 60 * 1000;
};

const aggregatePriceCandles = (candles: PriceCandle[]): PriceCandle[] => {
  if (candles.length === 0) return [];
  const resolutionMs = selectResolutionMs(candles);
  const ordered = [...candles]
    .filter((c) => Number.isFinite(candleTs(c)))
    .sort((a, b) => candleTs(a) - candleTs(b));
  if (ordered.length === 0) return [];

  const byBucket = new Map<string, PriceCandle>();
  for (const row of ordered) {
    const ts = candleTs(row);
    if (!Number.isFinite(ts)) continue;
    const bucketStart = Math.floor(ts / resolutionMs) * resolutionMs;
    const outcomeKey = row.outcomeId ?? "__market__";
    const key = `${outcomeKey}:${bucketStart}`;
    const existing = byBucket.get(key);
    if (!existing) {
      byBucket.set(key, {
        ...row,
        bucket: new Date(bucketStart).toISOString(),
      });
      continue;
    }
    byBucket.set(key, {
      ...existing,
      high: Math.max(existing.high, row.high),
      low: Math.min(existing.low, row.low),
      close: row.close,
      volume: (existing.volume ?? 0) + (row.volume ?? 0),
      tradesCount: (existing.tradesCount ?? 0) + (row.tradesCount ?? 0),
    });
  }

  return Array.from(byBucket.values()).sort((a, b) => candleTs(a) - candleTs(b));
};

export const buildMarketChartSeries = ({
  priceCandles,
  market,
  lang,
}: {
  priceCandles: PriceCandle[];
  market: Market;
  lang: "RU" | "EN";
}): ChartSeries => {
  const chartCandles = aggregatePriceCandles(priceCandles);
  const isMulti =
    market.marketType === "multi_choice" &&
    Array.isArray(market.outcomes) &&
    market.outcomes.length > 0;

  const candleTimes = chartCandles
    .map((c) => Date.parse(String(c.bucket)))
    .filter((t) => Number.isFinite(t));
  const createdTsRaw = Date.parse(String(market.createdAt));
  const createdTs = Number.isFinite(createdTsRaw)
    ? createdTsRaw
    : (candleTimes[0] ?? Date.now());
  const times = [...candleTimes, createdTs];

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
      ? new Date(ts).toLocaleString(lang === "RU" ? "ru-RU" : "en-US", {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date(ts).toLocaleTimeString(lang === "RU" ? "ru-RU" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });

  if (isMulti) {
    const outcomeLines = (market.outcomes ?? []).map((o) => ({
      id: o.id,
      title: o.title,
      color: o.chartColor ?? fallbackOutcomeColor(`${market.id}:${o.id}`),
      sortOrder: o.sortOrder ?? 0,
    }));
    const initialProb =
      outcomeLines.length > 0 ? Number((100 / outcomeLines.length).toFixed(2)) : 0;
    const byTs = new Map<
      number,
      {
        ts: number;
        label: string;
        spansMultipleDays: boolean;
        values: Record<string, number>;
      }
    >();
    chartCandles.forEach((c) => {
      const ts = Date.parse(String(c.bucket));
      if (!Number.isFinite(ts) || !c.outcomeId) return;
      const row = byTs.get(ts) ?? {
        ts,
        label: labelFor(ts),
        spansMultipleDays,
        values: {},
      };
      row.values[c.outcomeId] = Number((c.close * 100).toFixed(2));
      byTs.set(ts, row);
    });

    if (!byTs.has(createdTs)) {
      const initValues: Record<string, number> = {};
      outcomeLines.forEach((o) => {
        const liveProb = Number(
          (market.outcomes ?? []).find((mo) => mo.id === o.id)?.probability ??
            Number.NaN
        );
        initValues[o.id] = Number.isFinite(liveProb)
          ? Number((liveProb * 100).toFixed(2))
          : initialProb;
      });
      byTs.set(createdTs, {
        ts: createdTs,
        label: labelFor(createdTs),
        spansMultipleDays,
        values: initValues,
      });
    }

    const sortedRows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
    const lastValues: Record<string, number> = {};
    outcomeLines.forEach((o) => {
      lastValues[o.id] = initialProb;
    });
    const normalizedRows = sortedRows.map((row) => {
      const values: Record<string, number> = {};
      outcomeLines.forEach((o) => {
        if (
          typeof row.values[o.id] === "number" &&
          Number.isFinite(row.values[o.id])
        ) {
          lastValues[o.id] = row.values[o.id];
        }
        values[o.id] = Number(lastValues[o.id].toFixed(2));
      });
      return { ...row, values };
    });

    return {
      mode: "multi",
      data: normalizedRows,
      lines: outcomeLines.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  const fallbackChance = Number.isFinite(market.chance)
    ? market.chance
    : Math.round(Number(market.yesPrice ?? 0.5) * 100);

  const rows = chartCandles
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
    .filter(
      (
        v
      ): v is {
        ts: number;
        label: string;
        value: number;
        open: number;
        high: number;
        low: number;
        close: number;
        spansMultipleDays: boolean;
      } => Boolean(v)
    )
    .sort((a, b) => a.ts - b.ts);

  if (rows.length === 0 || rows[0].ts > createdTs) {
    const seed = Number(fallbackChance.toFixed(2));
    rows.unshift({
      ts: createdTs,
      label: labelFor(createdTs),
      value: seed,
      open: seed,
      high: seed,
      low: seed,
      close: seed,
      spansMultipleDays,
    });
  }

  return { mode: "binary", data: rows, lines: [] };
};
