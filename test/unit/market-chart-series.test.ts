import { describe, expect, test } from "bun:test";
import type { Market, PriceCandle } from "@/types";
import { buildMarketChartSeries } from "@/src/lib/charts/marketChartSeries";

const baseMarket = (overrides: Partial<Market> = {}): Market => ({
  id: "polymarket:test-market",
  provider: "polymarket",
  providerMarketId: "test-market",
  canonicalMarketId: "polymarket:test-market",
  title: "Test market",
  titleRu: "Тестовый рынок",
  titleEn: "Test market",
  state: "open",
  marketType: "binary",
  resolvedOutcomeId: null,
  outcomes: [],
  outcome: null,
  createdBy: null,
  creatorName: null,
  creatorAvatarUrl: null,
  createdAt: "2026-03-03T10:00:00.000Z",
  categoryId: null,
  categoryLabelRu: null,
  categoryLabelEn: null,
  imageUrl: "https://example.com/a.png",
  volume: "$100.00",
  volumeRaw: 100,
  closesAt: "2026-03-05T10:00:00.000Z",
  expiresAt: "2026-03-06T10:00:00.000Z",
  yesPrice: 0.61,
  noPrice: 0.39,
  chance: 61,
  description: "Test",
  source: null,
  history: [],
  comments: [],
  bestBid: null,
  bestAsk: null,
  mid: null,
  lastTradePrice: null,
  lastTradeSize: null,
  rolling24hVolume: null,
  openInterest: null,
  liveUpdatedAt: null,
  capabilities: null,
  ...overrides,
});

const candles: PriceCandle[] = [
  {
    bucket: "2026-03-03T10:01:00.000Z",
    open: 0.6,
    high: 0.64,
    low: 0.58,
    close: 0.62,
    volume: 100,
    tradesCount: 5,
    outcomeId: null,
    outcomeTitle: null,
    outcomeColor: null,
  },
  {
    bucket: "2026-03-03T10:02:00.000Z",
    open: 0.62,
    high: 0.66,
    low: 0.6,
    close: 0.65,
    volume: 90,
    tradesCount: 4,
    outcomeId: null,
    outcomeTitle: null,
    outcomeColor: null,
  },
];

describe("buildMarketChartSeries", () => {
  test("binary series does not append synthetic rows when live chance changes", () => {
    const first = buildMarketChartSeries({
      priceCandles: candles,
      market: baseMarket({ chance: 61, yesPrice: 0.61 }),
      lang: "EN",
      interval: "1h",
    });
    const second = buildMarketChartSeries({
      priceCandles: candles,
      market: baseMarket({ chance: 75, yesPrice: 0.75 }),
      lang: "EN",
      interval: "1h",
    });

    expect(first.mode).toBe("binary");
    expect(second.mode).toBe("binary");
    if (first.mode !== "binary" || second.mode !== "binary") return;

    expect(first.data.length).toBe(second.data.length);
    expect(first.data.map((row) => row.ts)).toEqual(second.data.map((row) => row.ts));
  });

  test("binary series preserves minute points in 1m interval", () => {
    const series = buildMarketChartSeries({
      priceCandles: candles,
      market: baseMarket({ chance: 61, yesPrice: 0.61 }),
      lang: "EN",
      interval: "1m",
    });

    expect(series.mode).toBe("binary");
    if (series.mode !== "binary") return;
    expect(series.data).toHaveLength(2);
    expect(series.data[0]?.ts).toBe(Date.parse("2026-03-03T10:01:00.000Z"));
    expect(series.data[1]?.ts).toBe(Date.parse("2026-03-03T10:02:00.000Z"));
  });

  test("multi series stays stable on probability changes without synthetic trailing points", () => {
    const outcomes = [
      {
        id: "yes",
        marketId: "polymarket:test-market",
        tokenId: "yes",
        slug: "yes",
        title: "Yes",
        iconUrl: null,
        chartColor: null,
        sortOrder: 0,
        probability: 0.6,
        price: 0.6,
        isActive: true,
      },
      {
        id: "no",
        marketId: "polymarket:test-market",
        tokenId: "no",
        slug: "no",
        title: "No",
        iconUrl: null,
        chartColor: null,
        sortOrder: 1,
        probability: 0.4,
        price: 0.4,
        isActive: true,
      },
    ] as const;

    const multiCandles: PriceCandle[] = [
      {
        bucket: "2026-03-03T10:01:00.000Z",
        outcomeId: "yes",
        outcomeTitle: "Yes",
        outcomeColor: null,
        open: 0.58,
        high: 0.6,
        low: 0.56,
        close: 0.59,
        volume: 50,
        tradesCount: 2,
      },
      {
        bucket: "2026-03-03T10:01:00.000Z",
        outcomeId: "no",
        outcomeTitle: "No",
        outcomeColor: null,
        open: 0.42,
        high: 0.44,
        low: 0.4,
        close: 0.41,
        volume: 50,
        tradesCount: 2,
      },
      {
        bucket: "2026-03-03T10:02:00.000Z",
        outcomeId: "yes",
        outcomeTitle: "Yes",
        outcomeColor: null,
        open: 0.59,
        high: 0.63,
        low: 0.58,
        close: 0.62,
        volume: 80,
        tradesCount: 3,
      },
      {
        bucket: "2026-03-03T10:02:00.000Z",
        outcomeId: "no",
        outcomeTitle: "No",
        outcomeColor: null,
        open: 0.41,
        high: 0.42,
        low: 0.38,
        close: 0.38,
        volume: 80,
        tradesCount: 3,
      },
    ];

    const first = buildMarketChartSeries({
      priceCandles: multiCandles,
      market: baseMarket({
        marketType: "multi_choice",
        outcomes: outcomes.map((o) => ({ ...o })),
      }),
      lang: "EN",
      interval: "1h",
    });

    const second = buildMarketChartSeries({
      priceCandles: multiCandles,
      market: baseMarket({
        marketType: "multi_choice",
        outcomes: outcomes.map((o) => ({
          ...o,
          probability: o.id === "yes" ? 0.72 : 0.28,
          price: o.id === "yes" ? 0.72 : 0.28,
        })),
      }),
      lang: "EN",
      interval: "1h",
    });

    expect(first.mode).toBe("multi");
    expect(second.mode).toBe("multi");
    if (first.mode !== "multi" || second.mode !== "multi") return;

    expect(first.data.length).toBe(second.data.length);
    expect(first.data.map((row) => row.ts)).toEqual(second.data.map((row) => row.ts));
  });

  test("binary series falls back to baseline when candle history is empty", () => {
    const series = buildMarketChartSeries({
      priceCandles: [],
      market: baseMarket({
        chance: 67,
        yesPrice: 0.67,
        createdAt: "2026-03-03T10:00:00.000Z",
      }),
      lang: "EN",
      interval: "1h",
    });

    expect(series.mode).toBe("binary");
    if (series.mode !== "binary") return;
    expect(series.data.length).toBeGreaterThan(0);
    expect(series.data[series.data.length - 1]?.close).toBeCloseTo(67, 2);
  });

  test("multi series falls back to baseline when only aggregate candles are available", () => {
    const outcomes = [
      {
        id: "yes",
        marketId: "polymarket:test-market",
        tokenId: "yes",
        slug: "yes",
        title: "Yes",
        iconUrl: null,
        chartColor: null,
        sortOrder: 0,
        probability: 0.63,
        price: 0.63,
        isActive: true,
      },
      {
        id: "no",
        marketId: "polymarket:test-market",
        tokenId: "no",
        slug: "no",
        title: "No",
        iconUrl: null,
        chartColor: null,
        sortOrder: 1,
        probability: 0.37,
        price: 0.37,
        isActive: true,
      },
    ] as const;

    const aggregateOnlyCandles: PriceCandle[] = [
      {
        bucket: "2026-03-03T10:01:00.000Z",
        outcomeId: null,
        outcomeTitle: null,
        outcomeColor: null,
        open: 0.63,
        high: 0.64,
        low: 0.62,
        close: 0.63,
        volume: 50,
        tradesCount: 3,
      },
    ];

    const series = buildMarketChartSeries({
      priceCandles: aggregateOnlyCandles,
      market: baseMarket({
        marketType: "multi_choice",
        outcomes: outcomes.map((o) => ({ ...o })),
      }),
      lang: "EN",
      interval: "1h",
    });

    expect(series.mode).toBe("multi");
    if (series.mode !== "multi") return;
    expect(series.data.length).toBeGreaterThan(0);
    const latest = series.data[series.data.length - 1];
    expect(latest?.values.yes).toBeCloseTo(63, 2);
    expect(latest?.values.no).toBeCloseTo(37, 2);
  });
});
