import { NextRequest, NextResponse } from "next/server";
import {
  buildUpstashLiveChannelKey,
  buildUpstashLiveChannelPattern,
  getUpstashRedis,
  readUpstashMarketLivePatches,
  upstashStreamEnabled,
} from "@/src/server/cache/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_HEARTBEAT_MS = Math.max(
  5_000,
  Math.min(60_000, Number(process.env.UPSTASH_STREAM_HEARTBEAT_MS ?? 15_000))
);

const parseMarketIds = (request: NextRequest): string[] => {
  const url = request.nextUrl;
  const fromCsv = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fromRepeated = url.searchParams
    .getAll("id")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...fromCsv, ...fromRepeated])).slice(0, 80);
};

const buildFingerprint = (row: {
  sourceTs: string | null;
  sourceSeq: number | null;
  snapshotId?: number | null;
  seq?: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  lastTradePrice: number | null;
  lastTradeSize: number | null;
  rolling24hVolume: number | null;
  openInterest: number | null;
}) =>
  [
    row.sourceTs ?? "",
    row.sourceSeq ?? "",
    row.snapshotId ?? "",
    row.seq ?? "",
    row.bestBid ?? "",
    row.bestAsk ?? "",
    row.mid ?? "",
    row.lastTradePrice ?? "",
    row.lastTradeSize ?? "",
    row.rolling24hVolume ?? "",
    row.openInterest ?? "",
  ].join("|");

const formatSseEvent = (event: string, payload: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const coerceLivePatch = (value: unknown) => {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
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
    seq: toFiniteNumber(parsed.seq),
    pageScope: typeof parsed.pageScope === "string" ? parsed.pageScope : null,
  };
};

export async function GET(request: NextRequest) {
  if (!upstashStreamEnabled) {
    return NextResponse.json(
      {
        error: "UPSTASH_STREAM_DISABLED",
      },
      { status: 503 }
    );
  }

  const marketIds = parseMarketIds(request);
  if (marketIds.length === 0) {
    return NextResponse.json(
      {
        error: "MISSING_MARKET_IDS",
      },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let subscription: {
    on: (type: string, listener: (event: any) => void) => void;
    unsubscribe: (channels?: string[]) => Promise<void>;
    removeAllListeners?: () => void;
  } | null = null;
  const redis = getUpstashRedis();

  if (!redis) {
    return NextResponse.json(
      {
        error: "UPSTASH_STREAM_UNAVAILABLE",
      },
      { status: 503 }
    );
  }

  const latestFingerprints = new Map<string, string>();
  const liveChannels = new Set(marketIds.map((marketId) => buildUpstashLiveChannelKey(marketId)));
  const liveChannelPattern = buildUpstashLiveChannelPattern();

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch {
        // ignore unsubscribe failures
      }
      subscription.removeAllListeners?.();
      subscription = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(formatSseEvent(event, payload)));
      };

      const sendHeartbeat = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      };

      const flushSnapshot = async () => {
        try {
          const rows = await readUpstashMarketLivePatches(marketIds);
          if (closed) return false;

          if (rows.length === 0) return false;

          const changed = rows.filter((row) => {
            const fingerprint = buildFingerprint(row);
            const prev = latestFingerprints.get(row.marketId);
            if (prev === fingerprint) return false;
            latestFingerprints.set(row.marketId, fingerprint);
            return true;
          });

          if (changed.length > 0) {
            const snapshotId = changed.reduce<number | null>(
              (max, row) =>
                typeof row.snapshotId === "number" && Number.isFinite(row.snapshotId)
                  ? max === null || row.snapshotId > max
                    ? row.snapshotId
                    : max
                  : max,
              null
            );
            const seq = changed.reduce<number | null>(
              (max, row) =>
                typeof row.seq === "number" && Number.isFinite(row.seq)
                  ? max === null || row.seq > max
                    ? row.seq
                    : max
                  : max,
              null
            );
            send("live", { marketIds, snapshotId, seq, patches: changed, source: "upstash" });
            return true;
          }
          return false;
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "UPSTASH_STREAM_READ_FAILED",
          });
          return false;
        }
      };

      send("ready", {
        ok: true,
        marketIds,
        mode: "pubsub",
      });
      let buffering = true;
      const bufferedPatches = new Map<string, NonNullable<ReturnType<typeof coerceLivePatch>>>();
      subscription = redis.psubscribe(liveChannelPattern);
      subscription.on("pmessage", (event) => {
        if (closed || !event || typeof event !== "object") return;
        const channel = typeof event.channel === "string" ? event.channel : "";
        if (!channel || !liveChannels.has(channel)) return;
        const patch = coerceLivePatch(event.message);
        if (!patch) return;
        if (buffering) {
          bufferedPatches.set(patch.marketId, patch);
          return;
        }
        const fingerprint = buildFingerprint(patch);
        const previous = latestFingerprints.get(patch.marketId);
        if (previous === fingerprint) return;
        latestFingerprints.set(patch.marketId, fingerprint);
        send("live", {
          marketIds,
          snapshotId: patch.snapshotId ?? null,
          seq: patch.seq ?? null,
          patches: [patch],
          source: "upstash",
        });
      });
      subscription.on("error", (event) => {
        send("error", {
          message: event instanceof Error ? event.message : "UPSTASH_STREAM_SUBSCRIBE_FAILED",
        });
        void cleanup();
        controller.close();
      });

      const initialSent = await flushSnapshot();
      buffering = false;
      const buffered = Array.from(bufferedPatches.values()).filter((patch) => {
        const fingerprint = buildFingerprint(patch);
        const previous = latestFingerprints.get(patch.marketId);
        if (previous === fingerprint) return false;
        latestFingerprints.set(patch.marketId, fingerprint);
        return true;
      });
      bufferedPatches.clear();
      if (!initialSent && buffered.length === 0) {
        send("live", {
          marketIds,
          snapshotId: null,
          seq: null,
          patches: [] as unknown[],
          source: "upstash",
        });
      } else if (buffered.length > 0) {
        const snapshotId = buffered.reduce<number | null>(
          (max, row) =>
            typeof row.snapshotId === "number" && Number.isFinite(row.snapshotId)
              ? max === null || row.snapshotId > max
                ? row.snapshotId
                : max
              : max,
          null
        );
        const seq = buffered.reduce<number | null>(
          (max, row) =>
            typeof row.seq === "number" && Number.isFinite(row.seq)
              ? max === null || row.seq > max
                ? row.seq
                : max
              : max,
          null
        );
        send("live", {
          marketIds,
          snapshotId,
          seq,
          patches: buffered,
          source: "upstash",
        });
      }
      heartbeatTimer = setInterval(sendHeartbeat, STREAM_HEARTBEAT_MS);
      request.signal.addEventListener(
        "abort",
        () => {
          void cleanup();
        },
        { once: true }
      );
    },
    cancel() {
      void cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
