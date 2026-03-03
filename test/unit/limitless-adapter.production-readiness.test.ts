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
    process.env.LIMITLESS_ACTIVE_PAGE_LIMIT = "25";
    process.env.LIMITLESS_PAGED_FETCH_CONCURRENCY = "4";
    process.env.LIMITLESS_HTTP_TIMEOUT_MS = "10000";
    process.env.LIMITLESS_MARKETS_CACHE_TTL_MS = "60000";
    process.env.LIMITLESS_DEBUG = "false";

    const mod = await import("../../src/server/venues/limitlessAdapter");
    limitlessAdapter = mod.limitlessAdapter;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses API-safe page limits and returns newest-first markets", async () => {
    const requested: Array<{ path: string; page: number; limit: number }> = [];
    const total = 80;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "25");
      requested.push({ path: url.pathname, page, limit });

      const start = (page - 1) * 25 + 1;
      const count = Math.max(0, Math.min(limit, total - start + 1));
      const rows = Array.from({ length: count }, (_, idx) => makeMarketRow(start + idx));
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 80 });

    expect(rows).toHaveLength(80);
    expect(rows[0]?.providerMarketId).toBe("80");
    expect(requested.map((r) => `${r.page}:${r.limit}`)).toEqual(["1:25", "2:25", "3:25", "4:5"]);
    expect(new Set(requested.map((r) => r.path))).toEqual(new Set(["/markets/active"]));
  });

  it("serves repeated snapshot reads from cache to reduce API pressure", async () => {
    let fetchCalls = 0;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      fetchCalls += 1;
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "25");
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

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = getUrl(input);
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "25");

      active += 1;
      maxActive = Math.max(maxActive, active);
      await Bun.sleep(25);
      active -= 1;

      const start = (page - 1) * 25 + 1;
      const rows = Array.from({ length: limit }, (_, idx) => makeMarketRow(start + idx));
      return new Response(JSON.stringify({ data: rows }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const rows = await limitlessAdapter.listMarketsSnapshot({ onlyOpen: true, limit: 100 });

    expect(rows).toHaveLength(100);
    expect(maxActive).toBeGreaterThan(1);
  });
});
