type OutcomeLike = {
  title?: string | null;
  sortOrder?: number | null;
};

const toFiniteNonNegative = (value: number | string | null | undefined): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export const normalizeOutcomeLabel = (title?: string | null): string =>
  String(title ?? "").trim().toLowerCase();

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
