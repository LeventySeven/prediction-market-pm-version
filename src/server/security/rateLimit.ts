const FALLBACK_MAX_ENTRIES = 5_000;
const FALLBACK_PRUNE_BATCH = 500;

const inMemoryFallback = new Map<string, { count: number; resetAt: number }>();

const pruneExpiredEntries = () => {
  if (inMemoryFallback.size <= FALLBACK_MAX_ENTRIES) return;
  const now = Date.now();
  let pruned = 0;
  for (const [k, v] of inMemoryFallback) {
    if (v.resetAt <= now) {
      inMemoryFallback.delete(k);
      pruned++;
      if (pruned >= FALLBACK_PRUNE_BATCH) break;
    }
  }
  // If we couldn't free enough expired entries, drop oldest entries
  if (inMemoryFallback.size > FALLBACK_MAX_ENTRIES) {
    const excess = inMemoryFallback.size - FALLBACK_MAX_ENTRIES;
    let dropped = 0;
    for (const k of inMemoryFallback.keys()) {
      inMemoryFallback.delete(k);
      dropped++;
      if (dropped >= excess) break;
    }
  }
};

type DurableRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
};

const applyInMemoryFallback = (
  key: string,
  limit: number,
  windowSeconds: number
): DurableRateLimitResult => {
  pruneExpiredEntries();
  const now = Date.now();
  const windowMs = Math.max(1, Math.floor(windowSeconds * 1000));
  const existing = inMemoryFallback.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    inMemoryFallback.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: new Date(resetAt).toISOString() };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: new Date(existing.resetAt).toISOString(),
  };
};

export const consumeDurableRateLimit = async (
  supabaseService: unknown,
  params: {
    key: string;
    limit: number;
    windowSeconds: number;
  }
): Promise<DurableRateLimitResult> => {
  const key = params.key.trim();
  const limit = Math.max(1, Math.floor(params.limit));
  const windowSeconds = Math.max(1, Math.floor(params.windowSeconds));

  if (!supabaseService || !key) {
    return applyInMemoryFallback(key || "fallback", limit, windowSeconds);
  }

  try {
    const { data, error } = await (supabaseService as any).rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      return applyInMemoryFallback(key, limit, windowSeconds);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      return applyInMemoryFallback(key, limit, windowSeconds);
    }

    return {
      allowed: Boolean((row as { allowed?: boolean }).allowed),
      remaining: Number((row as { remaining?: number }).remaining ?? 0),
      resetAt:
        typeof (row as { reset_at?: string }).reset_at === "string"
          ? (row as { reset_at?: string }).reset_at ?? null
          : null,
    };
  } catch {
    return applyInMemoryFallback(key, limit, windowSeconds);
  }
};
