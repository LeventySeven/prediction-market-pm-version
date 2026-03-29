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

type LivePatch = {
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
  seq: number | null;
  pageScope: string | null;
};

const coerceLivePatch = (value: unknown): LivePatch | null => {
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

// ---------------------------------------------------------------------------
// Shared psubscribe singleton — one Redis subscription per Node.js process,
// fanned out to all connected SSE clients.  This avoids opening N separate
// psubscribe connections for N concurrent users.
// ---------------------------------------------------------------------------

type ClientEntry = {
  channels: Set<string>; // the channel keys this client cares about
  onPatch: (patch: LivePatch) => void;
  onError: (err: unknown) => void;
};

let sharedSubscription: {
  on: (type: any, listener: (event: any) => void) => void;
  unsubscribe: (channels?: string[]) => Promise<void>;
  removeAllListeners?: () => void;
} | null = null;
const connectedClients = new Set<ClientEntry>();
let subscriberSetupInProgress = false;

const ensureSharedSubscriber = () => {
  if (sharedSubscription || subscriberSetupInProgress) return;
  const redis = getUpstashRedis();
  if (!redis) return;

  subscriberSetupInProgress = true;
  const pattern = buildUpstashLiveChannelPattern();
  const sub = redis.psubscribe(pattern);

  sub.on("pmessage", (event: any) => {
    if (!event || typeof event !== "object") return;
    const channel = typeof event.channel === "string" ? event.channel : "";
    if (!channel) return;
    const patch = coerceLivePatch(event.message);
    if (!patch) return;

    // Fan out to all clients interested in this channel
    for (const client of connectedClients) {
      if (client.channels.has(channel)) {
        try {
          client.onPatch(patch);
        } catch {
          // individual client handler error — skip
        }
      }
    }
  });

  sub.on("error", (event: any) => {
    console.error("[stream] shared psubscribe error", event);
    for (const client of connectedClients) {
      try {
        client.onError(event);
      } catch {
        // skip
      }
    }
    // Reset so next request creates a fresh subscriber
    sharedSubscription = null;
    subscriberSetupInProgress = false;
  });

  sharedSubscription = sub;
  subscriberSetupInProgress = false;
};

const registerClient = (client: ClientEntry) => {
  ensureSharedSubscriber();
  connectedClients.add(client);
};

const unregisterClient = (client: ClientEntry) => {
  connectedClients.delete(client);
  // If no more clients, tear down the shared subscriber to free resources
  if (connectedClients.size === 0 && sharedSubscription) {
    const sub = sharedSubscription;
    sharedSubscription = null;
    sub.unsubscribe().catch(() => {});
    sub.removeAllListeners?.();
  }
};

// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!upstashStreamEnabled) {
    return NextResponse.json(
      { error: "UPSTASH_STREAM_DISABLED" },
      { status: 503 }
    );
  }

  const marketIds = parseMarketIds(request);
  if (marketIds.length === 0) {
    return NextResponse.json(
      { error: "MISSING_MARKET_IDS" },
      { status: 400 }
    );
  }

  const redis = getUpstashRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "UPSTASH_STREAM_UNAVAILABLE" },
      { status: 503 }
    );
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let clientEntry: ClientEntry | null = null;

  const latestFingerprints = new Map<string, string>();
  const liveChannels = new Set(marketIds.map((marketId) => buildUpstashLiveChannelKey(marketId)));

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (clientEntry) {
      unregisterClient(clientEntry);
      clientEntry = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event, payload)));
        } catch {
          // Stream may have been closed by the client
          cleanup();
        }
      };

      const sendHeartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
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

      // 1. Send ready event
      send("ready", { ok: true, marketIds, mode: "pubsub" });

      // 2. Buffer patches while we fetch the initial snapshot
      let buffering = true;
      const bufferedPatches = new Map<string, LivePatch>();

      clientEntry = {
        channels: liveChannels,
        onPatch: (patch) => {
          if (closed) return;
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
        },
        onError: (event) => {
          send("error", {
            message: event instanceof Error ? event.message : "UPSTASH_STREAM_SUBSCRIBE_FAILED",
          });
          cleanup();
          try { controller.close(); } catch { /* already closed */ }
        },
      };
      registerClient(clientEntry);

      // 3. Fetch & send initial snapshot from Upstash cache
      const initialSent = await flushSnapshot();

      // 4. Flush any patches buffered during snapshot fetch
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

      // 5. Start heartbeat
      heartbeatTimer = setInterval(sendHeartbeat, STREAM_HEARTBEAT_MS);

      // 6. Cleanup on client disconnect
      request.signal.addEventListener(
        "abort",
        () => { cleanup(); },
        { once: true }
      );
    },
    cancel() {
      cleanup();
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
