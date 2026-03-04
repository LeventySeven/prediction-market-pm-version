const parseOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export const resolveRolling24hVolumeFromWsPayload = (
  payload: Record<string, unknown>,
  previousValue: number | null | undefined
): number => {
  const incoming =
    parseOptionalNumber(payload.rolling_24h_volume) ??
    parseOptionalNumber(payload.volume) ??
    parseOptionalNumber(payload.volume_24h);
  if (incoming !== null) return Math.max(0, incoming);

  const previous =
    typeof previousValue === "number" && Number.isFinite(previousValue) ? previousValue : 0;
  return Math.max(0, previous);
};
