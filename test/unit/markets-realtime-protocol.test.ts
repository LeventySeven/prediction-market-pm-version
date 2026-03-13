import { describe, expect, it } from "bun:test";
import {
  normalizeMarketsRealtimeIds,
  parseMarketsRealtimeClientMessage,
  parseMarketsRealtimeServerMessage,
} from "../../src/lib/marketsRealtimeProtocol";

describe("markets realtime protocol", () => {
  it("normalizes subscribe ids with dedupe and limit", () => {
    const ids = normalizeMarketsRealtimeIds(["a", "b", "a", " ", "c"]);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("parses subscribe client messages", () => {
    const parsed = parseMarketsRealtimeClientMessage(
      JSON.stringify({
        type: "subscribe",
        pageScope: "catalog:page:1",
        marketIds: ["polymarket:1", "polymarket:1", "limitless:2"],
        lastSnapshotId: 12,
        lastSeq: 13,
      })
    );

    expect(parsed).toEqual({
      type: "subscribe",
      pageScope: "catalog:page:1",
      marketIds: ["polymarket:1", "limitless:2"],
      lastSnapshotId: 12,
      lastSeq: 13,
    });
  });

  it("parses patch server messages", () => {
    const parsed = parseMarketsRealtimeServerMessage(
      JSON.stringify({
        type: "patch",
        pageScope: "catalog:page:1",
        marketIds: ["polymarket:1"],
        snapshotId: 33,
        seq: 34,
        patches: [
          {
            marketId: "polymarket:1",
            bestBid: 0.51,
            bestAsk: 0.53,
            mid: 0.52,
            lastTradePrice: 0.52,
            lastTradeSize: 40,
            rolling24hVolume: 1234,
            openInterest: 999,
            sourceTs: "2026-03-13T00:00:00.000Z",
            sourceSeq: 90,
            snapshotId: 33,
          },
        ],
      })
    );

    expect(parsed?.type).toBe("patch");
    if (!parsed || parsed.type !== "patch") return;
    expect(parsed.snapshotId).toBe(33);
    expect(parsed.seq).toBe(34);
    expect(parsed.patches[0]?.marketId).toBe("polymarket:1");
  });
});
