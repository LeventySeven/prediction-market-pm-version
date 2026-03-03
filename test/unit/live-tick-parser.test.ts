import { describe, expect, it } from "bun:test";
import { buildTickDedupeKey, parseLiveTick } from "../../src/server/polymarket/liveTickParser";

describe("live tick parser", () => {
  it("ignores payloads without explicit trade size", () => {
    const parsed = parseLiveTick(
      {
        price: 0.42,
        side: "buy",
      },
      {
        marketId: "market-1",
        sourceSeq: 7,
        sourceTs: "2026-03-03T10:00:00.000Z",
        lastTradePrice: 0.5,
      }
    );

    expect(parsed).toBeNull();
  });

  it("parses and normalizes a valid tick payload", () => {
    const parsed = parseLiveTick(
      {
        trade_id: "trade-abc",
        side: "ask",
        outcome: "YES",
        last_trade_size: "3.25",
        last_trade_price: 47.5,
      },
      {
        marketId: "market-1",
        sourceSeq: 11,
        sourceTs: "2026-03-03T10:01:00.000Z",
        lastTradePrice: 0.55,
      }
    );

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      marketId: "market-1",
      tradeId: "trade-abc",
      sourceSeq: 11,
      sourceTs: "2026-03-03T10:01:00.000Z",
      side: "SELL",
      outcome: "YES",
      size: 3.25,
      price: 0.475,
    });
    expect(parsed?.dedupeKey).toBe(
      buildTickDedupeKey("market-1", "trade-abc", "2026-03-03T10:01:00.000Z", 0.475, 3.25, "SELL", "YES")
    );
  });

  it("uses fallback lastTradePrice when payload has no price", () => {
    const parsed = parseLiveTick(
      {
        size: 1,
      },
      {
        marketId: "market-2",
        sourceSeq: null,
        sourceTs: "2026-03-03T10:02:00.000Z",
        lastTradePrice: 0.63,
      }
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.side).toBe("UNKNOWN");
    expect(parsed?.price).toBe(0.63);
  });
});
