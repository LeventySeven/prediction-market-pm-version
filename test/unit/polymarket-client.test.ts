import { afterEach, describe, expect, it, mock } from "bun:test";
import { listPolymarketMarketsSnapshot } from "../../src/server/polymarket/client";

const originalFetch = global.fetch;

const makeMarketPayload = (overrides: Record<string, unknown> = {}) => ({
  conditionId: "0xmarket",
  slug: "will-btc-close-above-100k",
  question: "Will BTC close above 100k?",
  volume: "1234.5",
  volumeNum: 1234.5,
  outcomes: JSON.stringify(["YES", "NO"]),
  outcomePrices: JSON.stringify(["0.61", "0.39"]),
  clobTokenIds: JSON.stringify(["token-yes", "token-no"]),
  active: true,
  closed: false,
  archived: false,
  ...overrides,
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("polymarket client volume sourcing", () => {
  it("uses the markets endpoint and sorts locally by lifetime volume for open snapshots", async () => {
    const calls: string[] = [];
    global.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      return Response.json([
        makeMarketPayload({ conditionId: "0xsmaller", slug: "smaller", volumeNum: 50, volume: "50" }),
        makeMarketPayload({ conditionId: "0xbigger", slug: "bigger", volumeNum: 5000, volume: "5000" }),
      ]);
    }) as typeof fetch;

    const rows = await listPolymarketMarketsSnapshot({
      scope: "open",
      sortBy: "volume",
      pageSize: 5,
      maxPages: 1,
      hydrateMidpoints: false,
    });

    expect(calls[0]).toContain("/markets?");
    expect(calls[0]).not.toContain("order=volume");
    expect(rows[0]?.id).toBe("0xbigger");
    expect(rows[0]?.volume).toBe(5000);
  });

  it("keeps the events path only for created-desc head snapshots", async () => {
    const calls: string[] = [];
    global.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      return Response.json([
        {
          slug: "event-slug",
          markets: [makeMarketPayload({ conditionId: "0xevent-market", slug: "event-market", volumeNum: 55 })],
        },
      ]);
    }) as typeof fetch;

    const rows = await listPolymarketMarketsSnapshot({
      scope: "open",
      sortBy: "created_desc",
      pageSize: 5,
      maxPages: 1,
      hydrateMidpoints: false,
    });

    expect(calls[0]).toContain("/events?");
    expect(rows[0]?.id).toBe("0xevent-market");
    expect(rows[0]?.volume).toBe(55);
  });

  it("falls back to documented split lifetime volume fields when volumeNum is absent", async () => {
    global.fetch = mock(async () =>
      Response.json([
        makeMarketPayload({
          volume: undefined,
          volumeNum: undefined,
          volumeClob: 876.25,
          volumeAmm: 10.75,
        }),
      ])
    ) as typeof fetch;

    const rows = await listPolymarketMarketsSnapshot({
      scope: "open",
      sortBy: "volume",
      pageSize: 5,
      maxPages: 1,
      hydrateMidpoints: false,
    });

    expect(rows[0]?.volume).toBe(887);
  });
});
