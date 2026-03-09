type OutcomeLike = {
  title?: string | null;
  sortOrder?: number | null;
};

export type DisplayVolume = {
  raw: number | null;
  label: string;
  missing: boolean;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const toFiniteNonNegative = (value: number | string | null | undefined): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const trimTrailingZeros = (value: string): string => value.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

const parseVolumeValue = (value: number | string | null | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\$/g, "").replace(/,/g, "");
  if (!normalized) return null;
  const compactMatch = normalized.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/);
  if (compactMatch) {
    const base = Number(compactMatch[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = compactMatch[2];
    const multiplier =
      suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    return Math.max(0, base * multiplier);
  }
  const parsed = Number(normalized.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};

export const normalizeOutcomeLabel = (title?: string | null): string =>
  String(title ?? "").trim().toLowerCase();

export const normalizePercentValue = (value: number | null | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = Math.abs(value) <= 1.0001 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
};

export const roundPercentValue = (
  value: number | null | undefined,
  fractionDigits = 0
): number => Number(normalizePercentValue(value).toFixed(Math.max(0, fractionDigits)));

export const formatPercent = (value: number | null | undefined, fractionDigits = 0): string =>
  `${trimTrailingZeros(normalizePercentValue(value).toFixed(Math.max(0, fractionDigits)))}%`;

export const pickYesLikeOutcome = <T extends OutcomeLike>(outcomes: T[]): T | null => {
  if (outcomes.length === 0) return null;
  const yesByTitle =
    outcomes.find((outcome) => normalizeOutcomeLabel(outcome.title) === "yes") ??
    outcomes.find((outcome) => normalizeOutcomeLabel(outcome.title).includes("yes")) ??
    null;
  if (yesByTitle) return yesByTitle;
  const bySort = outcomes
    .filter((outcome) => Number.isFinite(Number(outcome.sortOrder ?? 0)))
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))[0];
  return bySort ?? outcomes[0] ?? null;
};

export const pickBinaryOutcomes = <T extends OutcomeLike>(outcomes: T[]) => {
  const yes = pickYesLikeOutcome(outcomes);
  const remaining = yes === null ? [...outcomes] : outcomes.filter((outcome) => outcome !== yes);
  const no =
    remaining.find((outcome) => normalizeOutcomeLabel(outcome.title) === "no") ??
    remaining.find((outcome) => normalizeOutcomeLabel(outcome.title).includes("no")) ??
    remaining
      .filter((outcome) => Number.isFinite(Number(outcome.sortOrder ?? 0)))
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))[0] ??
    remaining[0] ??
    null;

  return { yes, no };
};

export const computeEffectiveVolumeRaw = (
  baseVolume: number | string | null | undefined,
  rolling24hVolume: number | string | null | undefined
): number => Math.max(toFiniteNonNegative(baseVolume), toFiniteNonNegative(rolling24hVolume));

export const resolveDisplayVolume = (
  ...values: Array<number | string | null | undefined>
): DisplayVolume => {
  let hasKnown = false;
  let maxValue = 0;

  for (const value of values) {
    const parsed = parseVolumeValue(value);
    if (parsed === null) continue;
    hasKnown = true;
    if (parsed > maxValue) maxValue = parsed;
  }

  if (!hasKnown) {
    return {
      raw: null,
      label: "—",
      missing: true,
    };
  }

  return {
    raw: maxValue,
    label: formatCompactUsd(maxValue),
    missing: false,
  };
};

export const formatCompactUsd = (value: number | null | undefined): string => {
  const numeric = toFiniteNonNegative(value);
  if (numeric >= 1_000_000_000) {
    const compact = numeric / 1_000_000_000;
    return `$${trimTrailingZeros(compact.toFixed(compact >= 100 ? 0 : 1))}b`;
  }
  if (numeric >= 1_000_000) {
    const compact = numeric / 1_000_000;
    return `$${trimTrailingZeros(compact.toFixed(compact >= 100 ? 0 : 1))}m`;
  }
  if (numeric >= 1_000) {
    const compact = numeric / 1_000;
    return `$${trimTrailingZeros(compact.toFixed(compact >= 100 ? 0 : 1))}k`;
  }
  return `$${Math.round(numeric).toLocaleString("en-US")}`;
};

const toPrice01 = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp01(value);
};

export const resolveReliableBinaryPrice = (params: {
  mid?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  lastTradePrice?: number | null;
  fallbackPrice?: number | null;
}): number => {
  const mid = toPrice01(params.mid ?? null);
  const bestBid = toPrice01(params.bestBid ?? null);
  const bestAsk = toPrice01(params.bestAsk ?? null);
  const lastTradePrice = toPrice01(params.lastTradePrice ?? null);
  const fallbackPrice = toPrice01(params.fallbackPrice ?? null) ?? 0.5;

  const bookMid =
    bestBid !== null && bestAsk !== null && bestBid > 0 && bestAsk > 0
      ? clamp01((bestBid + bestAsk) / 2)
      : null;

  if (mid !== null && mid > 0 && mid < 1) return mid;
  if (bookMid !== null) return bookMid;
  if (lastTradePrice !== null && lastTradePrice > 0 && lastTradePrice < 1) return lastTradePrice;
  if (mid !== null) return mid;
  if (lastTradePrice !== null) return lastTradePrice;
  return fallbackPrice;
};
