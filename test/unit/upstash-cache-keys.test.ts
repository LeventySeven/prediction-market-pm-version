import { describe, expect, it } from "bun:test";
import {
  buildMarketCandlesCacheKey,
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
    ).toContain("market:detail:v2:polymarket:abc-123");

    expect(
      buildMarketTradesCacheKey({
        provider: "limitless",
        providerMarketId: "lm-9",
        limit: 75,
      })
    ).toContain("market:trades:v2:limitless:lm-9:limit:75");

    expect(
      buildMarketCandlesCacheKey({
        provider: "polymarket",
        providerMarketId: "abc-123",
        interval: "1h",
        limit: 720,
        range: "1M",
      })
    ).toContain("market:candles:v2:polymarket:abc-123:interval:1h:limit:720:range:1M");
  });
});
