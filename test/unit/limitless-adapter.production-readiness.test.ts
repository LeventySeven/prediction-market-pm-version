import { afterEach, beforeAll, describe, expect, it } from "bun:test";

type AdapterModule = typeof import("../../src/server/venues/limitlessAdapter");

let limitlessAdapter: AdapterModule["limitlessAdapter"];
const originalFetch = globalThis.fetch;

const baseTs = Date.parse("2026-01-01T00:00:00.000Z");

const isoOffsetSeconds = (seconds: number): string =>
  new Date(baseTs + seconds * 1000).toISOString();

const makeMarketRow = (id: number) => ({
  id,
  slug: `market-${id}`,
  title: `Market ${id}`,
  description: `Description ${id}`,
  state: "open",
  createdAt: isoOffsetSeconds(id),
  closesAt: isoOffsetSeconds(id + 3_600),
  expiresAt: isoOffsetSeconds(id + 3_600),
  volume: id * 10,
  outcomes: [
    { id: `${id}-yes`, title: "YES", price: 0.6, probability: 0.6 },
    { id: `${id}-no`, title: "NO", price: 0.4, probability: 0.4 },
  ],
});

const getUrl = (input: Parameters<typeof fetch>[0]): URL => {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
};

describe("limitlessAdapter production readiness", () => {
  beforeAll(async () => {
    process.env.LIMITLESS_API_BASE_URL = "https://api.limitless.exchange";
    process.env.LIMITLESS_ACTIVE_PAGE_LIMIT = "120";
    process.env.LIMITLESS_PAGED_FETCH_CONCURRENCY = "2";
    process.env.LIMITLESS_HTTP_TIMEOUT_MS = "10000";
    process.env.LIMITLESS_HTTP_MAX_RETRIES = "2";
    process.env.LIMITLESS_HTTP_RETRY_BASE_MS = "1";
    process.env.LIMITLESS_HTTP_RETRY_MAX_MS = "10";
    process.env.LIMITLESS_MARKETS_CACHE_TTL_MS = "60000";
    process.env.LIMITLESS_DEBUG = "false";

    const mod = await import("../../src/server/venues/limitlessAdapter");
    limitlessAdapter = mod.limitlessAdapter;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("caps page size to API-safe limits and returns newest-first markets", async () => {
    const requested: Array<{ path: string; page: number; limit: number }> = [];
    const total = 220;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "100");
      requested.push({ path: url.pathname, page, limit });

      const start = (page - 1) * 100 + 1;
      const count = Math.max(0, Math.min(limit, total - start + 1));
      const rows = Array.from({ length: count }, (_, idx) => makeMarketRow(start + idx));
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 220 });

    expect(rows).toHaveLength(220);
    expect(rows[0]?.providerMarketId).toBe("220");
    expect(requested.map((r) => `${r.page}:${r.limit}`)).toEqual(["1:100", "2:100", "3:20"]);
    expect(new Set(requested.map((r) => r.path))).toEqual(new Set(["/markets/active"]));
  });

  it("serves repeated snapshot reads from cache to reduce API pressure", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchCalls += 1;
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "100");
      const rows = page === 1
        ? Array.from({ length: limit }, (_, idx) => makeMarketRow(idx + 1))
        : [];
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const first = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 12 });
    const second = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 12 });

    expect(first).toHaveLength(12);
    expect(second).toHaveLength(12);
    expect(fetchCalls).toBe(1);
  });

  it("fetches pages concurrently to keep sync latency low", async () => {
    let active = 0;
    let maxActive = 0;
    const total = 300;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "100");

      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(25);
      active -= 1;

      const start = (page - 1) * 100 + 1;
      const count = Math.max(0, Math.min(limit, total - start + 1));
      const rows = Array.from({ length: count }, (_, idx) => makeMarketRow(start + idx));
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 220, sortBy: "volume" });

    expect(rows).toHaveLength(220);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("retries transient API errors and still serves markets", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "0",
          },
        });
      }
      const rows = Array.from({ length: 10 }, (_, idx) => makeMarketRow(idx + 1));
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 10 });
    expect(rows).toHaveLength(10);
    expect(calls).toBe(2);
  });

  it("uses high_value sorting when volume-first snapshot is requested", async () => {
    const observedSortBy: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = getUrl(input);
      if (url.pathname === "/markets/active") {
        observedSortBy.push(url.searchParams.get("sortBy") || "");
      }
      const rows = [
        { ...makeMarketRow(1), volume: 40 },
        { ...makeMarketRow(2), volume: 130 },
        { ...makeMarketRow(3), volume: 90 },
      ];
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({
      onlyOpen: true,
      sortBy: "volume",
      limit: 3,
    });

    expect(rows.map((row) => row.providerMarketId)).toEqual(["2", "3", "1"]);
    expect(observedSortBy[0]).toBe("high_value");
  });

  it("prefers explicit total volume fields over ambiguous values", async () => {
    globalThis.fetch = (async () => {
      const rows = [
        {
          ...makeMarketRow(11),
          total_volume: 1234,
          volume: 77,
          liquidity: 99_999,
        },
      ];
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 17, sortBy: "volume" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.volume).toBe(1234);
  });

  it("does not use liquidity as a volume fallback", async () => {
    globalThis.fetch = (async () => {
      const rows = [
        {
          ...makeMarketRow(12),
          total_volume: undefined,
          volume: undefined,
          volume24h: undefined,
          liquidity: 54_321,
        },
      ];
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 18, sortBy: "volume" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.volume).toBe(0);
  });

  it("does not treat 24h or ranking fields as total volume", async () => {
    globalThis.fetch = (async () => {
      const rows = [
        {
          ...makeMarketRow(13),
          total_volume: undefined,
          volume: undefined,
          volume24h: 888,
          dailyVolume: 777,
          high_value: 666,
        },
      ];
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 1, sortBy: "volume" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.volume).toBe(0);
  });
});
