import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  buildUpstashLiveChannelKey,
  getUpstashRedis,
  readUpstashMarketLivePatches,
  readUpstashSnapshotCursor,
  upstashStreamEnabled,
} from "../../src/server/cache/upstash";
import {
  normalizeMarketsRealtimeIds,
  parseMarketsRealtimeClientMessage,
  type MarketsRealtimePatchRow,
  type MarketsRealtimeServerMessage,
} from "../../src/lib/marketsRealtimeProtocol";

type RealtimeSocketState = {
  marketIds: Set<string>;
  pageScope: string | null;
  lastSnapshotId: number | null;
  lastSeq: number | null;
};

type UpstashSubscriber = {
  on: (type: string, listener: (event: any) => void) => void;
  unsubscribe: (channels?: string[]) => Promise<void>;
  removeAllListeners?: () => void;
};

const PORT = Math.max(1, Number(process.env.MARKETS_WS_PORT ?? 3011));
const HOST = (process.env.MARKETS_WS_HOST ?? "0.0.0.0").trim() || "0.0.0.0";
const HEARTBEAT_MS = Math.max(5_000, Number(process.env.MARKETS_WS_HEARTBEAT_MS ?? 15_000));
const MAX_MARKET_IDS = 80;
const WS_PATH = (process.env.MARKETS_WS_PATH ?? "/ws/markets").trim() || "/ws/markets";

const redis = getUpstashRedis();

if (!redis || !upstashStreamEnabled) {
  throw new Error("MARKETS_WS_REDIS_UNAVAILABLE");
}

const socketState = new WeakMap<WebSocket, RealtimeSocketState>();
const sockets = new Set<WebSocket>();
const socketsByMarketId = new Map<string, Set<WebSocket>>();
const subscribersByMarketId = new Map<
  string,
  {
    subscriber: UpstashSubscriber;
    sockets: Set<WebSocket>;
  }
>();

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

const normalizeLivePatch = (value: unknown) => {
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : asObject(value);
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

const encode = (message: MarketsRealtimeServerMessage): string => JSON.stringify(message);

const safeSend = (socket: WebSocket, message: MarketsRealtimeServerMessage) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(encode(message));
};

const getSocketState = (socket: WebSocket): RealtimeSocketState => {
  const existing = socketState.get(socket);
  if (existing) return existing;
  const created: RealtimeSocketState = {
    marketIds: new Set<string>(),
    pageScope: null,
    lastSnapshotId: null,
    lastSeq: null,
  };
  socketState.set(socket, created);
  return created;
};

const detachSocketFromMarket = async (socket: WebSocket, marketId: string) => {
  const activeSockets = socketsByMarketId.get(marketId);
  if (!activeSockets) return;
  activeSockets.delete(socket);
  if (activeSockets.size === 0) {
    socketsByMarketId.delete(marketId);
  }

  const subscription = subscribersByMarketId.get(marketId);
  if (!subscription) return;
  subscription.sockets.delete(socket);
  if (subscription.sockets.size > 0) return;
  subscribersByMarketId.delete(marketId);
  try {
    await subscription.subscriber.unsubscribe([buildUpstashLiveChannelKey(marketId)]);
  } catch {
    // ignore unsubscribe failures on shutdown/reconnect
  }
  subscription.subscriber.removeAllListeners?.();
};

const broadcastPatch = (marketId: string, patch: ReturnType<typeof normalizeLivePatch>) => {
  if (!patch) return;
  const targets = socketsByMarketId.get(marketId);
  if (!targets || targets.size === 0) return;

  const targetsByScope = new Map<string, Set<WebSocket>>();
  for (const socket of targets) {
    const state = getSocketState(socket);
    const key = state.pageScope ?? "__none__";
    const bucket = targetsByScope.get(key) ?? new Set<WebSocket>();
    bucket.add(socket);
    targetsByScope.set(key, bucket);
  }

  for (const [scopeKey, scopeSockets] of targetsByScope.entries()) {
    const marketIds = Array.from(
      new Set(
        Array.from(scopeSockets)
          .flatMap((socket) => Array.from(getSocketState(socket).marketIds))
          .filter(Boolean)
      )
    );
    const message: MarketsRealtimeServerMessage = {
      type: "patch",
      pageScope: scopeKey === "__none__" ? null : scopeKey,
      marketIds,
      snapshotId: patch.snapshotId ?? null,
      seq: patch.seq ?? null,
      source: "upstash",
      patches: [
        {
          marketId: patch.marketId,
          bestBid: patch.bestBid,
          bestAsk: patch.bestAsk,
          mid: patch.mid,
          lastTradePrice: patch.lastTradePrice,
          lastTradeSize: patch.lastTradeSize,
          rolling24hVolume: patch.rolling24hVolume,
          openInterest: patch.openInterest,
          sourceTs: patch.sourceTs,
          sourceSeq: patch.sourceSeq,
          snapshotId: patch.snapshotId ?? null,
        } satisfies MarketsRealtimePatchRow,
      ],
    };
    for (const socket of scopeSockets) {
      safeSend(socket, message);
    }
  }
};

const ensureMarketSubscriber = (marketId: string) => {
  const existing = subscribersByMarketId.get(marketId);
  if (existing) return existing;

  const subscriber = redis.subscribe(buildUpstashLiveChannelKey(marketId)) as unknown as UpstashSubscriber;
  const entry = {
    subscriber,
    sockets: new Set<WebSocket>(),
  };
  subscriber.on("message", (event) => {
    const patch = normalizeLivePatch(event?.message);
    if (!patch) return;
    broadcastPatch(marketId, patch);
  });
  subscriber.on("error", (error) => {
    const targets = socketsByMarketId.get(marketId);
    if (!targets) return;
    for (const socket of targets) {
      safeSend(socket, {
        type: "error",
        code: "UPSTASH_SUBSCRIBE_FAILED",
        message: error instanceof Error ? error.message : "UPSTASH_SUBSCRIBE_FAILED",
      });
    }
  });
  subscribersByMarketId.set(marketId, entry);
  return entry;
};

const updateSocketSubscriptions = async (socket: WebSocket, nextMarketIds: string[]) => {
  const state = getSocketState(socket);
  const previous = new Set(state.marketIds);
  const next = new Set(nextMarketIds.slice(0, MAX_MARKET_IDS));

  for (const marketId of previous) {
    if (next.has(marketId)) continue;
    state.marketIds.delete(marketId);
    await detachSocketFromMarket(socket, marketId);
  }

  for (const marketId of next) {
    if (state.marketIds.has(marketId)) continue;
    state.marketIds.add(marketId);
    const socketsForMarket = socketsByMarketId.get(marketId) ?? new Set<WebSocket>();
    socketsForMarket.add(socket);
    socketsByMarketId.set(marketId, socketsForMarket);
    const subscriber = ensureMarketSubscriber(marketId);
    subscriber.sockets.add(socket);
  }
};

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
};

const handleHealth = async (_req: IncomingMessage, res: ServerResponse) => {
  writeJson(res, 200, {
    status: "ok",
    transport: "websocket",
    clients: sockets.size,
    activeMarkets: subscribersByMarketId.size,
    snapshotId: await readUpstashSnapshotCursor("global"),
    checkedAt: new Date().toISOString(),
  });
};

const server = createServer((req, res) => {
  if (req.url === "/health") {
    void handleHealth(req, res);
    return;
  }
  writeJson(res, 404, {
    error: "NOT_FOUND",
  });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const origin = `http://${request.headers.host ?? "localhost"}`;
  const url = new URL(request.url ?? "/", origin);
  if (url.pathname !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (socket) => {
  sockets.add(socket);
  socketState.set(socket, {
    marketIds: new Set<string>(),
    pageScope: null,
    lastSnapshotId: null,
    lastSeq: null,
  });

  socket.on("message", async (payload) => {
    const raw = typeof payload === "string" ? payload : payload.toString("utf8");
    const message = parseMarketsRealtimeClientMessage(raw);
    if (!message) {
      safeSend(socket, {
        type: "error",
        code: "INVALID_MESSAGE",
        message: "INVALID_MESSAGE",
      });
      return;
    }

    if (message.type === "ping") {
      safeSend(socket, {
        type: "heartbeat",
        ts: message.ts ?? Date.now(),
      });
      return;
    }

    const marketIds = normalizeMarketsRealtimeIds(message.marketIds);
    const state = getSocketState(socket);
    state.pageScope = message.pageScope ?? null;
    state.lastSnapshotId = message.lastSnapshotId ?? null;
    state.lastSeq = message.lastSeq ?? null;
    await updateSocketSubscriptions(socket, marketIds);

    const currentRows = await readUpstashMarketLivePatches(marketIds);
    const currentSnapshotId = currentRows.reduce<number | null>(
      (max, row) =>
        typeof row.snapshotId === "number" && Number.isFinite(row.snapshotId)
          ? max === null || row.snapshotId > max
            ? row.snapshotId
            : max
          : max,
      null
    );
    const currentSeq = currentRows.reduce<number | null>(
      (max, row) =>
        typeof row.seq === "number" && Number.isFinite(row.seq)
          ? max === null || row.seq > max
            ? row.seq
            : max
          : max,
      null
    );

    safeSend(socket, {
      type: "ready",
      pageScope: state.pageScope,
      marketIds,
      snapshotId: currentSnapshotId,
      seq: currentSeq,
      mode: "websocket",
    });

    if (
      state.lastSnapshotId !== null &&
      currentSnapshotId !== null &&
      state.lastSnapshotId !== currentSnapshotId
    ) {
      safeSend(socket, {
        type: "resync_required",
        pageScope: state.pageScope,
        marketIds,
        snapshotId: currentSnapshotId,
        seq: currentSeq,
        reason: "snapshot_mismatch",
      });
      return;
    }

    if (state.lastSeq !== null && currentSeq !== null && currentSeq > state.lastSeq + 1) {
      safeSend(socket, {
        type: "resync_required",
        pageScope: state.pageScope,
        marketIds,
        snapshotId: currentSnapshotId,
        seq: currentSeq,
        reason: "seq_gap",
      });
      return;
    }

    if (currentRows.length > 0) {
      safeSend(socket, {
        type: "patch",
        pageScope: state.pageScope,
        marketIds,
        snapshotId: currentSnapshotId,
        seq: currentSeq,
        source: "upstash",
        patches: currentRows.map((row) => ({
          marketId: row.marketId,
          bestBid: row.bestBid,
          bestAsk: row.bestAsk,
          mid: row.mid,
          lastTradePrice: row.lastTradePrice,
          lastTradeSize: row.lastTradeSize,
          rolling24hVolume: row.rolling24hVolume,
          openInterest: row.openInterest,
          sourceTs: row.sourceTs ?? null,
          sourceSeq: row.sourceSeq ?? null,
          snapshotId: row.snapshotId ?? currentSnapshotId,
        })),
      });
    }
  });

  socket.on("close", () => {
    sockets.delete(socket);
    const state = getSocketState(socket);
    void Promise.all(Array.from(state.marketIds).map((marketId) => detachSocketFromMarket(socket, marketId)));
    socketState.delete(socket);
  });

  socket.on("error", () => {
    socket.close();
  });
});

const heartbeat = setInterval(() => {
  for (const socket of sockets) {
    safeSend(socket, {
      type: "heartbeat",
      ts: Date.now(),
    });
  }
}, HEARTBEAT_MS);

const shutdown = async () => {
  clearInterval(heartbeat);
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // ignore socket close errors during shutdown
    }
  }
  for (const [marketId, subscription] of subscribersByMarketId.entries()) {
    subscribersByMarketId.delete(marketId);
    try {
      await subscription.subscriber.unsubscribe([buildUpstashLiveChannelKey(marketId)]);
    } catch {
      // ignore shutdown unsubscribe failures
    }
    subscription.subscriber.removeAllListeners?.();
  }
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

server.listen(PORT, HOST, () => {
  console.log(`[markets-ws] listening on ws://${HOST}:${PORT}${WS_PATH}`);
});
