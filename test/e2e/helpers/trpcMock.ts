import type { Page } from "@playwright/test";
import superjson from "superjson";

type TrpcMockOptions = {
  listMarketsDelayMs?: number;
  getPriceCandlesDelayMs?: number;
  getLiveActivityDelayMs?: number;
  getPublicTradesDelayMs?: number;
  getMarketCommentsDelayMs?: number;
  enabledProviders?: Array<"polymarket" | "limitless">;
};

type TrpcMockState = {
  getRequests: (procedure: string) => number;
  getResponses: (procedure: string) => number;
  getLastInput: (procedure: string) => unknown;
};

const BASE_TS = Date.parse("2026-03-04T12:00:00.000Z");

const delay = async (ms: number) => {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const makeOutcome = (
  marketId: string,
  id: string,
  title: string,
  price: number,
  sortOrder: number
) => ({
  id,
  marketId,
  tokenId: id,
  slug: title.toLowerCase(),
  title,
  iconUrl: null,
  chartColor: null,
  sortOrder,
  isActive: true,
  probability: price,
  price,
});

const makeMarket = (params: {
  id: string;
  provider: "polymarket" | "limitless";
  providerMarketId: string;
  title: string;
  yesPrice: number;
  createdOffsetMin: number;
  volume: number;
}) => {
  const createdAt = new Date(BASE_TS - params.createdOffsetMin * 60_000).toISOString();
  const closesAt = new Date(BASE_TS + 12 * 60 * 60_000).toISOString();
  const expiresAt = new Date(BASE_TS + 24 * 60 * 60_000).toISOString();
  return {
    id: params.id,
    provider: params.provider,
    providerMarketId: params.providerMarketId,
    canonicalMarketId: params.id,
    titleRu: params.title,
    titleEn: params.title,
    description: `${params.title} mock description`,
    source: "https://polymarket.com",
    imageUrl: "https://picsum.photos/seed/market/200/200",
    state: "open" as const,
    createdAt,
    closesAt,
    expiresAt,
    marketType: "binary" as const,
    resolvedOutcomeId: null,
    outcomes: [
      makeOutcome(params.id, `${params.id}:yes`, "Yes", params.yesPrice, 0),
      makeOutcome(params.id, `${params.id}:no`, "No", 1 - params.yesPrice, 1),
    ],
    outcome: null,
    createdBy: null,
    categoryId: "crypto",
    categoryLabelRu: "Crypto",
    categoryLabelEn: "Crypto",
    settlementAsset: "USD",
    feeBps: null,
    liquidityB: null,
    priceYes: params.yesPrice,
    priceNo: 1 - params.yesPrice,
    volume: params.volume,
    chance: Math.round(params.yesPrice * 100),
    creatorName: null,
    creatorAvatarUrl: null,
    bestBid: params.yesPrice - 0.01,
    bestAsk: params.yesPrice + 0.01,
    mid: params.yesPrice,
    lastTradePrice: params.yesPrice,
    lastTradeSize: 22,
    rolling24hVolume: params.volume,
    openInterest: params.volume * 0.8,
    liveUpdatedAt: new Date(BASE_TS).toISOString(),
    capabilities: {
      supportsTrading: true,
      supportsCandles: true,
      supportsPublicTrades: true,
      chainId: 137,
    },
  };
};

const markets = [
  makeMarket({
    id: "polymarket:btc-2026",
    provider: "polymarket",
    providerMarketId: "btc-2026",
    title: "BTC above $120k by Dec 2026?",
    yesPrice: 0.62,
    createdOffsetMin: 40,
    volume: 22450,
  }),
  makeMarket({
    id: "limitless:eth-2026",
    provider: "limitless",
    providerMarketId: "eth-2026",
    title: "ETH above $6k by Dec 2026?",
    yesPrice: 0.47,
    createdOffsetMin: 30,
    volume: 18310,
  }),
  makeMarket({
    id: "polymarket:sol-2026",
    provider: "polymarket",
    providerMarketId: "sol-2026",
    title: "SOL above $400 by Dec 2026?",
    yesPrice: 0.55,
    createdOffsetMin: 20,
    volume: 15300,
  }),
];

const candleMap = new Map(
  markets.map((market) => {
    const rows = Array.from({ length: 120 }).map((_, idx) => {
      const ts = BASE_TS - (120 - idx) * 60_000;
      const drift = Math.sin(idx / 8) * 0.015;
      const close = Math.max(0.05, Math.min(0.95, market.priceYes + drift));
      const open = Math.max(0.05, Math.min(0.95, close - 0.004));
      const high = Math.max(open, close) + 0.004;
      const low = Math.min(open, close) - 0.004;
      return {
        bucket: new Date(ts).toISOString(),
        outcomeId: null,
        outcomeTitle: null,
        outcomeColor: null,
        open,
        high: Math.max(0.05, Math.min(0.95, high)),
        low: Math.max(0.05, Math.min(0.95, low)),
        close,
        volume: 20 + idx,
        tradesCount: 3 + (idx % 4),
      };
    });
    return [market.id, rows];
  })
);

const tradeMap = new Map(
  markets.map((market) => [
    market.id,
    Array.from({ length: 20 }).map((_, idx) => {
      const ts = BASE_TS - idx * 45_000;
      const action = idx % 2 === 0 ? "buy" : "sell";
      const price = Math.max(0.05, Math.min(0.95, market.priceYes + (idx % 3 === 0 ? 0.01 : -0.01)));
      return {
        id: `${market.id}:trade:${idx}`,
        marketId: market.id,
        action,
        outcome: action === "buy" ? "YES" : "NO",
        outcomeId: null,
        outcomeTitle: null,
        collateralGross: 50 + idx,
        sharesDelta: 80 + idx * 2,
        priceBefore: price - 0.005,
        priceAfter: price,
        createdAt: new Date(ts).toISOString(),
      };
    }),
  ])
);

const tickMap = new Map(
  markets.map((market) => [
    market.id,
    Array.from({ length: 30 }).map((_, idx) => {
      const ts = BASE_TS - idx * 30_000;
      return {
        id: `${market.id}:tick:${idx}`,
        marketId: market.id,
        tradeId: `${market.id}:trade:${idx}`,
        side: idx % 2 === 0 ? "BUY" : "SELL",
        outcome: idx % 2 === 0 ? "YES" : "NO",
        price: Math.max(0.05, Math.min(0.95, market.priceYes + (idx % 4 === 0 ? 0.01 : -0.008))),
        size: 30 + idx,
        notional: (30 + idx) * market.priceYes,
        sourceTs: new Date(ts).toISOString(),
        createdAt: new Date(ts).toISOString(),
      };
    }),
  ])
);

const commentsMap = new Map(
  markets.map((market) => [
    market.id,
    [
      {
        id: `${market.id}:comment:1`,
        marketId: market.id,
        userId: "u1",
        parentId: null,
        body: "Strong momentum on this market.",
        createdAt: new Date(BASE_TS - 60_000).toISOString(),
        authorName: "Alpha",
        authorUsername: "alpha",
        authorAvatarUrl: null,
        likesCount: 2,
        likedByMe: false,
      },
      {
        id: `${market.id}:comment:2`,
        marketId: market.id,
        userId: "u2",
        parentId: null,
        body: "Watching liquidity before entering.",
        createdAt: new Date(BASE_TS - 45_000).toISOString(),
        authorName: "Beta",
        authorUsername: "beta",
        authorAvatarUrl: null,
        likesCount: 1,
        likedByMe: false,
      },
    ],
  ])
);

const getProcedureDelay = (procedure: string, options: Required<TrpcMockOptions>) => {
  switch (procedure) {
    case "market.listMarkets":
      return options.listMarketsDelayMs;
    case "market.getPriceCandles":
      return options.getPriceCandlesDelayMs;
    case "market.getLiveActivity":
      return options.getLiveActivityDelayMs;
    case "market.getPublicTrades":
      return options.getPublicTradesDelayMs;
    case "market.getMarketComments":
      return options.getMarketCommentsDelayMs;
    default:
      return 0;
  }
};

const deserializeInput = (raw: unknown): unknown => {
  if (raw === undefined || raw === null) return undefined;
  try {
    return superjson.deserialize(raw as never);
  } catch {
    if (raw && typeof raw === "object" && "json" in (raw as Record<string, unknown>)) {
      return (raw as Record<string, unknown>).json;
    }
    return raw;
  }
};

const parseProcedureInputs = (request: Parameters<Page["route"]>[1]["request"]) => {
  const url = new URL(request.url());
  const procedureCsv = url.pathname.split("/api/trpc/")[1] ?? "";
  const procedures = procedureCsv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const isBatch = url.searchParams.get("batch") === "1" || procedures.length > 1;

  let rawInput: unknown = undefined;
  if (request.method() === "GET") {
    const inputParam = url.searchParams.get("input");
    if (inputParam) {
      rawInput = JSON.parse(inputParam);
    }
  } else {
    const postData = request.postData();
    if (postData) {
      rawInput = JSON.parse(postData);
    }
  }

  const inputs = procedures.map((_, index) => {
    if (!isBatch) return deserializeInput(rawInput);
    const source = rawInput && typeof rawInput === "object" ? rawInput as Record<string, unknown> : {};
    return deserializeInput(source[String(index)]);
  });

  return {
    procedures,
    inputs,
    isBatch,
  };
};

const isRouteClosedError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return /Target page, context or browser has been closed/i.test(error.message);
};

const resolveMockProcedure = (
  procedure: string,
  input: unknown,
  options: Required<TrpcMockOptions>
) => {
  switch (procedure) {
    case "market.listEnabledProviders":
      return {
        providers: options.enabledProviders,
      };
    case "market.listCategories":
      return [
        { id: "crypto", labelRu: "Crypto", labelEn: "Crypto" },
        { id: "politics", labelRu: "Politics", labelEn: "Politics" },
      ];
    case "market.listMarkets": {
      const parsed = (input as {
        onlyOpen?: boolean;
        page?: number;
        pageSize?: number;
        sortBy?: "newest" | "volume";
        providerFilter?: "all" | "polymarket" | "limitless";
        providers?: Array<"polymarket" | "limitless">;
      }) ?? {};
      const page = Math.max(1, Number(parsed.page ?? 1));
      const pageSize = Math.max(1, Number(parsed.pageSize ?? 50));
      const providerFilter = parsed.providerFilter ?? "all";
      const providersFromInput = Array.isArray(parsed.providers) ? parsed.providers : [];
      const effectiveProviders =
        providerFilter !== "all"
          ? [providerFilter]
          : providersFromInput.length > 0
            ? providersFromInput
            : ["polymarket", "limitless"];

      let rows = markets.filter((row) => effectiveProviders.includes(row.provider));
      if (parsed.onlyOpen) rows = rows.filter((row) => row.state === "open");
      if (parsed.sortBy === "volume") {
        rows = [...rows].sort((a, b) => b.volume - a.volume);
      } else {
        rows = [...rows].sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      }
      const start = (page - 1) * pageSize;
      return rows.slice(start, start + pageSize);
    }
    case "market.getMarket": {
      const marketId = String(
        (input as { marketId?: string } | undefined)?.marketId ?? ""
      ).trim();
      return markets.find((row) => row.id === marketId) ?? null;
    }
    case "market.getPriceCandles": {
      const marketId = String(
        (input as { marketId?: string } | undefined)?.marketId ?? ""
      ).trim();
      const limit = Math.max(
        1,
        Number((input as { limit?: number } | undefined)?.limit ?? 120)
      );
      const rows = candleMap.get(marketId) ?? [];
      return rows.slice(-limit);
    }
    case "market.getPublicTrades": {
      const marketId = String(
        (input as { marketId?: string } | undefined)?.marketId ?? ""
      ).trim();
      const limit = Math.max(
        1,
        Number((input as { limit?: number } | undefined)?.limit ?? 50)
      );
      return (tradeMap.get(marketId) ?? []).slice(0, limit);
    }
    case "market.getLiveActivity": {
      const marketId = String(
        (input as { marketId?: string } | undefined)?.marketId ?? ""
      ).trim();
      const limit = Math.max(
        1,
        Number((input as { limit?: number } | undefined)?.limit ?? 80)
      );
      return (tickMap.get(marketId) ?? []).slice(0, limit);
    }
    case "market.getMarketComments": {
      const marketId = String(
        (input as { marketId?: string } | undefined)?.marketId ?? ""
      ).trim();
      return commentsMap.get(marketId) ?? [];
    }
    case "events.track":
      return { ok: true };
    default:
      return null;
  }
};

export const installTrpcMock = async (
  page: Page,
  options?: TrpcMockOptions
): Promise<TrpcMockState> => {
  const counters = {
    requests: {} as Record<string, number>,
    responses: {} as Record<string, number>,
    inputs: {} as Record<string, unknown[]>,
  };
  const mergedOptions: Required<TrpcMockOptions> = {
    listMarketsDelayMs: options?.listMarketsDelayMs ?? 80,
    getPriceCandlesDelayMs: options?.getPriceCandlesDelayMs ?? 120,
    getLiveActivityDelayMs: options?.getLiveActivityDelayMs ?? 240,
    getPublicTradesDelayMs: options?.getPublicTradesDelayMs ?? 240,
    getMarketCommentsDelayMs: options?.getMarketCommentsDelayMs ?? 500,
    enabledProviders: options?.enabledProviders ?? ["polymarket", "limitless"],
  };

  await page.route("**/api/trpc/**", async (route) => {
    const request = route.request();
    const { procedures, inputs, isBatch } = parseProcedureInputs(request);

    const responses: Array<{ result: { data: unknown } }> = [];
    for (let index = 0; index < procedures.length; index += 1) {
      const procedure = procedures[index] ?? "";
      counters.requests[procedure] = (counters.requests[procedure] ?? 0) + 1;
      const procedureInputs = counters.inputs[procedure] ?? [];
      procedureInputs.push(inputs[index]);
      counters.inputs[procedure] = procedureInputs;

      const waitMs = getProcedureDelay(procedure, mergedOptions);
      await delay(waitMs);

      const payload = resolveMockProcedure(procedure, inputs[index], mergedOptions);
      responses.push({
        result: {
          data: superjson.serialize(payload),
        },
      });

      counters.responses[procedure] = (counters.responses[procedure] ?? 0) + 1;
    }

    const body = JSON.stringify(
      isBatch ? responses : responses[0] ?? { result: { data: superjson.serialize(null) } }
    );
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    } catch (error) {
      if (!isRouteClosedError(error)) {
        throw error;
      }
    }
  });

  return {
    getRequests: (procedure: string) => counters.requests[procedure] ?? 0,
    getResponses: (procedure: string) => counters.responses[procedure] ?? 0,
    getLastInput: (procedure: string) => {
      const values = counters.inputs[procedure] ?? [];
      return values.length > 0 ? values[values.length - 1] : undefined;
    },
  };
};
