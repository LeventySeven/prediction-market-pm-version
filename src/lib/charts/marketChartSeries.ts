import type { CandleInterval, Market, PriceCandle } from "@/types";

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

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
};

const clampPrice = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
};

const resolutionMsByInterval: Record<CandleInterval, number> = {
  "1m": 60 * 1000,
  "1h": 60 * 60 * 1000,
};

const fallbackPointsByInterval: Record<CandleInterval, number> = {
  "1m": 120,
  "1h": 24,
};

const buildFallbackTimeline = (
  inputTimes: number[],
  interval: CandleInterval,
  points = fallbackPointsByInterval[interval]
): number[] => {
  const sortedUnique = Array.from(new Set(inputTimes.filter((ts) => Number.isFinite(ts)))).sort(
    (a, b) => a - b
  );
  if (sortedUnique.length > 0) {
    return sortedUnique.slice(Math.max(0, sortedUnique.length - points));
  }
  const now = Date.now();
  const resolutionMs = resolutionMsByInterval[interval];
  const alignedNow = Math.floor(now / resolutionMs) * resolutionMs;
  const firstTs = alignedNow - (points - 1) * resolutionMs;
  return Array.from({ length: points }, (_, idx) => firstTs + idx * resolutionMs);
};

const aggregatePriceCandles = (candles: PriceCandle[], interval: CandleInterval): PriceCandle[] => {
  if (candles.length === 0) return [];
  const resolutionMs = resolutionMsByInterval[interval];
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
  interval,
}: {
  priceCandles: PriceCandle[];
  market: Market;
  lang: "RU" | "EN";
  interval: CandleInterval;
}): ChartSeries => {
  const chartCandles = aggregatePriceCandles(priceCandles, interval);
  const isMulti =
    market.marketType === "multi_choice" &&
    Array.isArray(market.outcomes) &&
    market.outcomes.length > 0;

  const candleTimes = chartCandles
    .map((c) => Date.parse(String(c.bucket)))
    .filter((t) => Number.isFinite(t));
  const times = [...candleTimes];

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
    const outcomeLookup = new Map<string, string>();
    for (const outcome of market.outcomes ?? []) {
      const id = String(outcome.id ?? "").trim();
      if (!id) continue;
      outcomeLookup.set(id.toLowerCase(), id);
      const slugKey = String(outcome.slug ?? "").trim().toLowerCase();
      const titleKey = String(outcome.title ?? "").trim().toLowerCase();
      if (slugKey) outcomeLookup.set(slugKey, id);
      if (titleKey) outcomeLookup.set(titleKey, id);
    }

    const initialProbByOutcomeId = new Map<string, number>();
    for (const outcome of market.outcomes ?? []) {
      const id = String(outcome.id ?? "").trim();
      if (!id) continue;
      const raw = Number.isFinite(outcome.probability)
        ? outcome.probability <= 1
          ? outcome.probability * 100
          : outcome.probability
        : Number.isFinite(outcome.price)
        ? outcome.price * 100
        : 100 / Math.max(1, outcomeLines.length);
      initialProbByOutcomeId.set(id, clampPercent(raw));
    }

    const resolveOutcomeId = (candle: PriceCandle): string | null => {
      const byId = String(candle.outcomeId ?? "").trim().toLowerCase();
      if (byId && outcomeLookup.has(byId)) {
        return outcomeLookup.get(byId) ?? null;
      }
      const byTitle = String(candle.outcomeTitle ?? "").trim().toLowerCase();
      if (byTitle && outcomeLookup.has(byTitle)) {
        return outcomeLookup.get(byTitle) ?? null;
      }
      return null;
    };

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
      if (!Number.isFinite(ts)) return;
      const resolvedOutcomeId = resolveOutcomeId(c);
      if (!resolvedOutcomeId) return;
      const row = byTs.get(ts) ?? {
        ts,
        label: labelFor(ts),
        spansMultipleDays,
        values: {},
      };
      row.values[resolvedOutcomeId] = Number((c.close * 100).toFixed(2));
      byTs.set(ts, row);
    });

    const sortedRows = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);
    const lastValues: Record<string, number> = {};
    outcomeLines.forEach((o) => {
      lastValues[o.id] = Number(
        (initialProbByOutcomeId.get(o.id) ?? 100 / Math.max(1, outcomeLines.length)).toFixed(2)
      );
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

    if (normalizedRows.length === 0) {
      const timeline = buildFallbackTimeline(candleTimes, interval);
      const fallbackRows = timeline.map((ts) => {
        const values: Record<string, number> = {};
        outcomeLines.forEach((line) => {
          values[line.id] = Number(
            (initialProbByOutcomeId.get(line.id) ?? 100 / Math.max(1, outcomeLines.length)).toFixed(2)
          );
        });
        return {
          ts,
          label: labelFor(ts),
          spansMultipleDays,
          values,
        };
      });
      return {
        mode: "multi",
        data: fallbackRows,
        lines: outcomeLines.sort((a, b) => a.sortOrder - b.sortOrder),
      };
    }

    return {
      mode: "multi",
      data: normalizedRows,
      lines: outcomeLines.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

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

  if (rows.length === 0) {
    const timeline = buildFallbackTimeline(candleTimes, interval);
    const fallbackPrice = clampPrice(Number.isFinite(market.yesPrice) ? market.yesPrice : 0.5);
    const fallbackValue = Number((fallbackPrice * 100).toFixed(2));
    const fallbackRows = timeline.map((ts) => ({
      ts,
      label: labelFor(ts),
      value: fallbackValue,
      open: fallbackValue,
      high: fallbackValue,
      low: fallbackValue,
      close: fallbackValue,
      spansMultipleDays,
    }));
    return { mode: "binary", data: fallbackRows, lines: [] };
  }

  return { mode: "binary", data: rows, lines: [] };
};
