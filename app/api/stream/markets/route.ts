import { NextRequest, NextResponse } from "next/server";
import { readUpstashMarketLivePatches, upstashStreamEnabled } from "@/src/server/cache/upstash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_POLL_MS = Math.max(
  250,
  Math.min(10_000, Number(process.env.UPSTASH_STREAM_POLL_INTERVAL_MS ?? 1000))
);
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
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const latestFingerprints = new Map<string, string>();

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

      const flushSnapshot = async (initial: boolean) => {
        try {
          const rows = await readUpstashMarketLivePatches(marketIds);
          if (closed) return;

          if (rows.length === 0) {
            if (initial) {
              send("live", { marketIds, patches: [] as unknown[], source: "upstash" });
            }
            return;
          }

          const changed = rows.filter((row) => {
            const fingerprint = buildFingerprint(row);
            const prev = latestFingerprints.get(row.marketId);
            if (prev === fingerprint) return false;
            latestFingerprints.set(row.marketId, fingerprint);
            return true;
          });

          if (initial || changed.length > 0) {
            send("live", {
              marketIds,
              patches: initial ? rows : changed,
              source: "upstash",
            });
          }
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "UPSTASH_STREAM_READ_FAILED",
          });
        }
      };

      send("ready", {
        ok: true,
        marketIds,
        pollIntervalMs: STREAM_POLL_MS,
      });
      await flushSnapshot(true);

      pollTimer = setInterval(() => {
        void flushSnapshot(false);
      }, STREAM_POLL_MS);
      heartbeatTimer = setInterval(sendHeartbeat, STREAM_HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
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
