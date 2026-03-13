const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export type MarketsRealtimePatchRow = {
  marketId: string;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  lastTradePrice: number | null;
  lastTradeSize: number | null;
  rolling24hVolume: number | null;
  openInterest: number | null;
  sourceTs: string | null;
  sourceSeq: number | null;
  snapshotId: number | null;
};

export type MarketsRealtimeClientMessage =
  | {
      type: "subscribe";
      pageScope: string | null;
      marketIds: string[];
      lastSnapshotId: number | null;
      lastSeq: number | null;
    }
  | {
      type: "ping";
      ts: number | null;
    };

export type MarketsRealtimeServerMessage =
  | {
      type: "ready";
      pageScope: string | null;
      marketIds: string[];
      snapshotId: number | null;
      seq: number | null;
      mode: "websocket";
    }
  | {
      type: "patch";
      pageScope: string | null;
      marketIds: string[];
      snapshotId: number | null;
      seq: number | null;
      source: "upstash";
      patches: MarketsRealtimePatchRow[];
    }
  | {
      type: "resync_required";
      pageScope: string | null;
      marketIds: string[];
      snapshotId: number | null;
      seq: number | null;
      reason: "snapshot_mismatch" | "seq_gap" | "subscription_reset" | "stale_snapshot";
    }
  | {
      type: "heartbeat";
      ts: number;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export const normalizeMarketsRealtimeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, 80);
};

const normalizePatchRow = (value: unknown): MarketsRealtimePatchRow | null => {
  const parsed = asObject(value);
  if (!parsed) return null;
  const marketId = typeof parsed.marketId === "string" ? parsed.marketId.trim() : "";
  if (!marketId) return null;
  return {
    marketId,
    bestBid: toFiniteNumber(parsed.bestBid),
    bestAsk: toFiniteNumber(parsed.bestAsk),
    mid: toFiniteNumber(parsed.mid),
    lastTradePrice: toFiniteNumber(parsed.lastTradePrice),
    lastTradeSize: toFiniteNumber(parsed.lastTradeSize),
    rolling24hVolume: toFiniteNumber(parsed.rolling24hVolume),
    openInterest: toFiniteNumber(parsed.openInterest),
    sourceTs: typeof parsed.sourceTs === "string" ? parsed.sourceTs : null,
    sourceSeq: toFiniteNumber(parsed.sourceSeq),
    snapshotId: toFiniteNumber(parsed.snapshotId),
  };
};

export const parseMarketsRealtimeClientMessage = (
  payloadRaw: string
): MarketsRealtimeClientMessage | null => {
  try {
    const payload = asObject(JSON.parse(payloadRaw));
    if (!payload) return null;
    const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : "";
    if (type === "subscribe") {
      return {
        type: "subscribe",
        pageScope: typeof payload.pageScope === "string" ? payload.pageScope : null,
        marketIds: normalizeMarketsRealtimeIds(payload.marketIds),
        lastSnapshotId: toFiniteNumber(payload.lastSnapshotId),
        lastSeq: toFiniteNumber(payload.lastSeq),
      };
    }
    if (type === "ping") {
      return {
        type: "ping",
        ts: toFiniteNumber(payload.ts),
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const parseMarketsRealtimeServerMessage = (
  payloadRaw: string
): MarketsRealtimeServerMessage | null => {
  try {
    const payload = asObject(JSON.parse(payloadRaw));
    if (!payload) return null;
    const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : "";
    const pageScope = typeof payload.pageScope === "string" ? payload.pageScope : null;
    const marketIds = normalizeMarketsRealtimeIds(payload.marketIds);
    if (type === "ready") {
      return {
        type: "ready",
        pageScope,
        marketIds,
        snapshotId: toFiniteNumber(payload.snapshotId),
        seq: toFiniteNumber(payload.seq),
        mode: "websocket",
      };
    }
    if (type === "patch") {
      const patches = Array.isArray(payload.patches)
        ? payload.patches
            .map((row) => normalizePatchRow(row))
            .filter((row): row is MarketsRealtimePatchRow => Boolean(row))
        : [];
      return {
        type: "patch",
        pageScope,
        marketIds,
        snapshotId: toFiniteNumber(payload.snapshotId),
        seq: toFiniteNumber(payload.seq),
        source: "upstash",
        patches,
      };
    }
    if (type === "resync_required") {
      const reason =
        payload.reason === "snapshot_mismatch" ||
        payload.reason === "seq_gap" ||
        payload.reason === "subscription_reset" ||
        payload.reason === "stale_snapshot"
          ? payload.reason
          : "subscription_reset";
      return {
        type: "resync_required",
        pageScope,
        marketIds,
        snapshotId: toFiniteNumber(payload.snapshotId),
        seq: toFiniteNumber(payload.seq),
        reason,
      };
    }
    if (type === "heartbeat") {
      return {
        type: "heartbeat",
        ts: Math.max(0, Math.floor(toFiniteNumber(payload.ts) ?? Date.now())),
      };
    }
    if (type === "error") {
      return {
        type: "error",
        code: typeof payload.code === "string" && payload.code.trim().length > 0 ? payload.code.trim() : "UNKNOWN",
        message:
          typeof payload.message === "string" && payload.message.trim().length > 0
            ? payload.message.trim()
            : "UNKNOWN",
      };
    }
    return null;
  } catch {
    return null;
  }
};
