import { describe, expect, it } from "bun:test";
import { __marketRouterTestUtils } from "../../src/server/trpc/routers/market";

const { normalizeCategoryId, categoryMetaFromRaw, sortMarketRows } = __marketRouterTestUtils;

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
});
