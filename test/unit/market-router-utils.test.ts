import { describe, expect, it } from "bun:test";
import { __marketRouterTestUtils } from "../../src/server/trpc/routers/market";

const {
  normalizeCategoryId,
  categoryMetaFromRaw,
  sortMarketRows,
  readVolumeFromPayload,
  pickBetterCandleSet,
  selectCandleResolutionMs,
  normalizeCandlesForChart,
  normalizePublicEnabledProviders,
} = __marketRouterTestUtils;

describe("market router utility behavior", () => {
  it("normalizes category ids deterministically", () => {
    expect(normalizeCategoryId("Politics")).toBe("politics");
    expect(normalizeCategoryId("Crypto & AI")).toBe("crypto_and_ai");
    expect(normalizeCategoryId("All")).toBe("all_markets");
    expect(normalizeCategoryId("   ")).toBeNull();
  });

  it("builds category metadata from raw values", () => {
    expect(categoryMetaFromRaw("Sports")).toEqual({
      id: "sports",
      labelRu: "Sports",
      labelEn: "Sports",
    });
    expect(categoryMetaFromRaw(null)).toBeNull();
  });

  it("sorts by newest with volume tie-breaker", () => {
    const rows = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z", volume: 100 },
      { id: "b", createdAt: "2026-01-02T00:00:00.000Z", volume: 50 },
      { id: "c", createdAt: "2026-01-02T00:00:00.000Z", volume: 200 },
    ] as any[];

    const sorted = sortMarketRows(rows, "newest");
    expect(sorted.map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts by volume with createdAt tie-breaker", () => {
    const rows = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z", volume: 100 },
      { id: "b", createdAt: "2026-01-03T00:00:00.000Z", volume: 100 },
      { id: "c", createdAt: "2026-01-04T00:00:00.000Z", volume: 50 },
    ] as any[];

    const sorted = sortMarketRows(rows, "volume");
    expect(sorted.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("reads volume from explicit payload fields and ignores liquidity fallback", () => {
    expect(
      readVolumeFromPayload({
        total_volume: 1250,
        volume: 44,
        liquidity: 90_000,
      })
    ).toBe(1250);

    expect(
      readVolumeFromPayload({
        liquidity: 90_000,
      })
    ).toBeNull();

    expect(
      readVolumeFromPayload({
        high_value: 0,
        volumeUsd: 777,
      })
    ).toBe(777);
  });

  it("ignores 24h-only payload fields when total volume is absent", () => {
    expect(
      readVolumeFromPayload({
        volume24h: 321,
        dailyVolume: 654,
      })
    ).toBeNull();
  });

  it("finds nested lifetime volume fields before falling back to raw volume", () => {
    expect(
      readVolumeFromPayload({
        volume: 0,
        stats: {
          analytics: {
            allTimeVolumeUsd: 98765,
          },
        },
      })
    ).toBe(98765);
  });

  it("normalizes candle resolution from explicit interval", () => {
    const hourly = selectCandleResolutionMs("1h");
    expect(hourly).toBe(60 * 60 * 1000);

    const minute = selectCandleResolutionMs("1m");
    expect(minute).toBe(60 * 1000);
  });

  it("aggregates minute candles into broader hourly buckets", () => {
    const rows = normalizeCandlesForChart(
      [
        {
          bucket: "2026-03-01T10:01:00.000Z",
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: 0.5,
          high: 0.55,
          low: 0.49,
          close: 0.52,
          volume: 10,
          tradesCount: 1,
        },
        {
          bucket: "2026-03-01T10:37:00.000Z",
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: 0.52,
          high: 0.58,
          low: 0.51,
          close: 0.56,
          volume: 6,
          tradesCount: 2,
        },
      ] as any,
      100,
      "1h"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bucket).toBe("2026-03-01T10:00:00.000Z");
    expect(rows[0]?.volume).toBe(16);
    expect(rows[0]?.tradesCount).toBe(3);
  });

  it("keeps minute buckets when interval is 1m", () => {
    const rows = normalizeCandlesForChart(
      [
        {
          bucket: "2026-03-01T10:01:00.000Z",
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: 0.5,
          high: 0.55,
          low: 0.49,
          close: 0.52,
          volume: 10,
          tradesCount: 1,
        },
        {
          bucket: "2026-03-01T10:02:00.000Z",
          outcomeId: null,
          outcomeTitle: null,
          outcomeColor: null,
          open: 0.52,
          high: 0.58,
          low: 0.51,
          close: 0.56,
          volume: 6,
          tradesCount: 2,
        },
      ] as any,
      100,
      "1m"
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.bucket).toBe("2026-03-01T10:01:00.000Z");
    expect(rows[1]?.bucket).toBe("2026-03-01T10:02:00.000Z");
  });

  it("prefers real moving history over a longer flat baseline", () => {
    const flat = Array.from({ length: 12 }, (_, idx) => ({
      bucket: new Date(Date.parse("2026-03-01T00:00:00.000Z") + idx * 60 * 60 * 1000).toISOString(),
      outcomeId: null,
      outcomeTitle: null,
      outcomeColor: null,
      open: 0.5,
      high: 0.5,
      low: 0.5,
      close: 0.5,
      volume: 0,
      tradesCount: 0,
    })) as any[];
    const moving = [
      {
        bucket: "2026-03-01T08:00:00.000Z",
        outcomeId: null,
        outcomeTitle: null,
        outcomeColor: null,
        open: 0.41,
        high: 0.46,
        low: 0.4,
        close: 0.45,
        volume: 10,
        tradesCount: 2,
      },
      {
        bucket: "2026-03-01T09:00:00.000Z",
        outcomeId: null,
        outcomeTitle: null,
        outcomeColor: null,
        open: 0.45,
        high: 0.61,
        low: 0.44,
        close: 0.58,
        volume: 11,
        tradesCount: 3,
      },
    ] as any[];

    expect(pickBetterCandleSet(flat, moving)).toEqual(moving);
  });

  it("filters enabled providers to public venues only", () => {
    expect(
      normalizePublicEnabledProviders([
        "polymarket",
        "limitless",
        "disabled-provider",
      ] as any)
    ).toEqual(["polymarket", "limitless"]);
  });
});
