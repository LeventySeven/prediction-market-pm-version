const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const parseNumericLike = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/[$,%_\s]/g, "").replace(/,/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const VOLUME_KEYWORD = /volume/i;
const PREFERRED_VOLUME_KEY = /(total.*volume|volume.*usd|usd.*volume|all.?time.*volume|lifetime.*volume|cumulative.*volume)/i;
const REJECTED_VOLUME_KEY = /(24h|24hr|24_hour|24hour|daily|1d|7d|week|monthly|rank|ranking|liquidity|open.?interest)/i;

export const extractTotalVolumeFromPayload = (
  payload: Record<string, unknown> | null | undefined,
  maxDepth = 4
): number | null => {
  const root = asRecord(payload);
  if (!root) return null;

  let fallback: number | null = null;
  const visited = new Set<Record<string, unknown>>();
  const queue: Array<{ node: Record<string, unknown>; depth: number }> = [{ node: root, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { node, depth } = current;
    if (visited.has(node)) continue;
    visited.add(node);

    for (const [rawKey, rawValue] of Object.entries(node)) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;

      const parsed = parseNumericLike(rawValue);
      if (parsed !== null) {
        const normalized = Math.max(0, parsed);
        if (!REJECTED_VOLUME_KEY.test(key) && PREFERRED_VOLUME_KEY.test(key)) {
          if (normalized > 0) return normalized;
          if (fallback === null) fallback = normalized;
        } else if (!REJECTED_VOLUME_KEY.test(key) && VOLUME_KEYWORD.test(key) && fallback === null) {
          fallback = normalized;
        }
      }

      if (depth >= maxDepth) continue;
      const child = asRecord(rawValue);
      if (child) queue.push({ node: child, depth: depth + 1 });
    }
  }

  return fallback;
};
