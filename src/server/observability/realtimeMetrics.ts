type TimingSeries = {
  samples: number[];
  maxSamples: number;
};

type CounterSeries = {
  value: number;
};

const DEFAULT_MAX_SAMPLES = 512;

const timings = new Map<string, TimingSeries>();
const counters = new Map<string, CounterSeries>();

const nowIso = () => new Date().toISOString();

const getTimingSeries = (name: string): TimingSeries => {
  const existing = timings.get(name);
  if (existing) return existing;
  const created: TimingSeries = { samples: [], maxSamples: DEFAULT_MAX_SAMPLES };
  timings.set(name, created);
  return created;
};

export const recordRealtimeMetricTiming = (name: string, durationMs: number) => {
  if (!name || !Number.isFinite(durationMs) || durationMs < 0) return;
  const series = getTimingSeries(name);
  series.samples.push(durationMs);
  if (series.samples.length > series.maxSamples) {
    series.samples.splice(0, series.samples.length - series.maxSamples);
  }
};

export const incrementRealtimeMetricCounter = (name: string, by = 1) => {
  if (!name || !Number.isFinite(by)) return;
  const existing = counters.get(name);
  if (!existing) {
    counters.set(name, { value: by });
    return;
  }
  existing.value += by;
};

const percentile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1));
  return sorted[idx] ?? 0;
};

export const getRealtimeMetricsSnapshot = () => {
  const timingOut: Record<
    string,
    {
      samples: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
      maxMs: number;
      lastUpdatedAt: string;
    }
  > = {};

  for (const [name, series] of timings.entries()) {
    if (series.samples.length === 0) continue;
    const sorted = [...series.samples].sort((a, b) => a - b);
    timingOut[name] = {
      samples: sorted.length,
      p50Ms: Number(percentile(sorted, 0.5).toFixed(2)),
      p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
      p99Ms: Number(percentile(sorted, 0.99).toFixed(2)),
      maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
      lastUpdatedAt: nowIso(),
    };
  }

  const counterOut: Record<string, number> = {};
  for (const [name, series] of counters.entries()) {
    counterOut[name] = series.value;
  }

  return {
    generatedAt: nowIso(),
    counters: counterOut,
    timings: timingOut,
  };
};
