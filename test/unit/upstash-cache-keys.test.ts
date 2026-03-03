import { describe, expect, it } from "bun:test";
import {
  buildMarketDetailCacheKey,
  buildMarketListCacheKey,
  buildMarketTradesCacheKey,
} from "../../src/server/cache/upstash";

describe("upstash cache key behavior", () => {
  it("builds deterministic market list keys regardless of provider order", () => {
    const keyA = buildMarketListCacheKey({
      onlyOpen: false,
      page: 1,
      pageSize: 50,
      sortBy: "newest",
      providers: ["polymarket", "limitless"],
    });

    const keyB = buildMarketListCacheKey({
      onlyOpen: false,
      page: 1,
      pageSize: 50,
      sortBy: "newest",
      providers: ["limitless", "polymarket"],
    });

    expect(keyA).toBe(keyB);
  });

  it("encodes provider + market id in detail/trades keys", () => {
    expect(
      buildMarketDetailCacheKey({
        provider: "polymarket",
        providerMarketId: "abc-123",
      })
    ).toContain("market:detail:v1:polymarket:abc-123");

    expect(
      buildMarketTradesCacheKey({
        provider: "limitless",
        providerMarketId: "lm-9",
        limit: 75,
      })
    ).toContain("market:trades:v1:limitless:lm-9:limit:75");
  });
});
