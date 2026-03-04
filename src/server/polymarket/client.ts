type RawMarket = Record<string, unknown>;

export type PolymarketOutcome = {
  id: string;
  tokenId: string | null;
  title: string;
  probability: number;
  price: number;
  sortOrder: number;
};

export type PolymarketMarket = {
  id: string;
  conditionId: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  state: "open" | "closed" | "resolved" | "cancelled";
  closesAt: string;
  expiresAt: string;
  createdAt: string;
  category: string | null;
  volume: number;
  clobTokenIds: string[];
  outcomes: PolymarketOutcome[];
  resolvedOutcomeTitle: string | null;
};

const DEFAULT_BASE = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB_BASE = "https://clob.polymarket.com";
const DEFAULT_DATA_BASE = "https://data-api.polymarket.com";
const DEFAULT_IMAGE = "https://polymarket.com/favicon.ico";

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const looksLikeHexId = (value: string): boolean => /^0x[0-9a-f]+$/i.test(value);
const looksLikeEventSlug = (value: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value) && !looksLikeHexId(value);

const buildPolymarketEventUrl = (slug: string): string =>
  `https://polymarket.com/event/${encodeURIComponent(slug)}`;

const normalizeMarketSourceUrl = (
  rawUrl: string | null,
  slug: string | null,
  eventSlug: string | null
): string | null => {
  const clean = rawUrl?.trim() ?? "";
  if (clean) {
    if (/^https?:\/\//i.test(clean)) return clean;
    if (/^\/\//.test(clean)) return `https:${clean}`;
    if (clean.startsWith("/")) return `https://polymarket.com${clean}`;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(clean)) return `https://${clean}`;
    if (/^event\//i.test(clean)) return `https://polymarket.com/${clean}`;
  }

  if (eventSlug && looksLikeEventSlug(eventSlug)) return buildPolymarketEventUrl(eventSlug);
  if (slug && looksLikeEventSlug(slug)) return buildPolymarketEventUrl(slug);
  return null;
};

const toIso = (value: unknown): string => {
  const direct = asString(value);
  if (!direct) return new Date().toISOString();
  const ms = Date.parse(direct);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseStringArray = (value: unknown): string[] =>
  parseJsonArray(value)
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));

const toProb = (value: unknown): number | null => {
  const n = asNumber(value);
  if (n === null) return null;
  if (n >= 0 && n <= 1) return n;
  if (n >= 0 && n <= 100) return n / 100;
  return null;
};

const normalizeState = (raw: RawMarket): PolymarketMarket["state"] => {
  const closed = Boolean(raw.closed);
  const archived = Boolean(raw.archived);
  const active = Boolean(raw.active);
  const resolved = Boolean(raw.resolved) || asString(raw.winningOutcome) !== null;
  if (archived) return "cancelled";
  if (resolved) return "resolved";
  if (closed || !active) return "closed";
  return "open";
};

const parseClobTokenIds = (raw: RawMarket): string[] => {
  const candidates = [
    raw.clobTokenIds,
    raw.clob_token_ids,
    raw.clobTokens,
    raw.tokens,
    raw.tokenIds,
    raw.token_ids,
  ];
  for (const c of candidates) {
    const ids = parseStringArray(c);
    if (ids.length > 0) return ids;
  }
  return [];
};

const parseOutcomes = (raw: RawMarket, marketId: string): PolymarketOutcome[] => {
  const titlesRaw = parseJsonArray(raw.outcomes);
  const pricesRaw = parseJsonArray(raw.outcomePrices);
  const probsRaw = parseJsonArray(raw.outcomeProbabilities);
  const fallbackYes = toProb(raw.lastTradePrice) ?? 0.5;

  const titles = titlesRaw
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));
  const tokenIds = parseClobTokenIds(raw);

  if (titles.length > 0) {
    return titles.map((title, idx) => {
      const probability =
        toProb(probsRaw[idx]) ??
        toProb(pricesRaw[idx]) ??
        (titles.length === 2 ? (idx === 0 ? fallbackYes : 1 - fallbackYes) : 1 / titles.length);
      const bounded = Math.max(0, Math.min(1, probability));
      return {
        id: tokenIds[idx] ?? `${marketId}:${idx}`,
        tokenId: tokenIds[idx] ?? null,
        title,
        probability: bounded,
        price: bounded,
        sortOrder: idx,
      };
    });
  }

  return [
    { id: tokenIds[0] ?? `${marketId}:0`, tokenId: tokenIds[0] ?? null, title: "YES", probability: fallbackYes, price: fallbackYes, sortOrder: 0 },
    { id: tokenIds[1] ?? `${marketId}:1`, tokenId: tokenIds[1] ?? null, title: "NO", probability: 1 - fallbackYes, price: 1 - fallbackYes, sortOrder: 1 },
  ];
};

const isLikelyNoisyMarket = (raw: RawMarket, mappedTitle: string, volume: number): boolean => {
  const title = mappedTitle.toLowerCase();
  const hasRealQuestion = title.includes("?") || title.length >= 12;
  const noisyPattern = /(test|testing|demo|sample|lorem|asdf|qwerty|dummy)/i;
  const hidden = Boolean(raw.enableOrderBook === false) || Boolean(raw.archived);
  if (hidden) return true;
  if (!hasRealQuestion && volume < 50) return true;
  if (noisyPattern.test(mappedTitle) && volume < 1_000) return true;
  return false;
};

const mapMarket = (raw: RawMarket): PolymarketMarket | null => {
  const conditionId =
    asString(raw.conditionId) ??
    asString(raw.condition_id) ??
    asString(raw.market) ??
    asString(raw.id);
  if (!conditionId) return null;

  const id = conditionId;
  const eventSlug =
    asString(raw.eventSlug) ??
    asString(raw.event_slug) ??
    asString(raw.parentSlug) ??
    asString(raw.parent_slug) ??
    null;
  const slug = asString(raw.slug) ?? eventSlug ?? conditionId;
  const title =
    asString(raw.question) ??
    asString(raw.title) ??
    asString(raw.name) ??
    "Untitled market";
  const sourceUrl = normalizeMarketSourceUrl(
    asString(raw.url) ?? asString(raw.source),
    slug,
    eventSlug
  );
  const outcomes = parseOutcomes(raw, id);
  const winningTitle = asString(raw.winningOutcome) ?? null;
  const clobTokenIds = parseClobTokenIds(raw);
  const volume = asNumber(raw.volumeNum ?? raw.volume) ?? 0;
  if (isLikelyNoisyMarket(raw, title, volume)) return null;

  return {
    id,
    conditionId,
    slug,
    title,
    description: asString(raw.description),
    imageUrl: asString(raw.image) ?? asString(raw.icon) ?? DEFAULT_IMAGE,
    sourceUrl,
    state: normalizeState(raw),
    closesAt: toIso(raw.endDate ?? raw.end_date ?? raw.closeTime),
    expiresAt: toIso(raw.endDate ?? raw.end_date ?? raw.expirationDate),
    createdAt: toIso(raw.createdAt ?? raw.created_at ?? raw.startDate),
    category: asString(raw.category) ?? asString(raw.group) ?? null,
    volume,
    clobTokenIds,
    outcomes,
    resolvedOutcomeTitle: winningTitle,
  };
};

const getBaseUrl = () => (process.env.POLYMARKET_API_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
const getClobBaseUrl = () => (process.env.POLYMARKET_CLOB_API_BASE_URL || DEFAULT_CLOB_BASE).replace(/\/+$/, "");
const getDataBaseUrl = () => (process.env.POLYMARKET_DATA_API_BASE_URL || DEFAULT_DATA_BASE).replace(/\/+$/, "");

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> | null => (isObject(value) ? value : null);

const parsePriceMap = (value: unknown): Map<string, number> => {
  const map = new Map<string, number>();
  if (!isObject(value)) return map;
  for (const [k, v] of Object.entries(value)) {
    const n = asNumber(v);
    if (n !== null) map.set(k, Math.max(0, Math.min(1, n)));
  }
  return map;
};

const hydrateWithMidpoints = async (markets: PolymarketMarket[]): Promise<PolymarketMarket[]> => {
  const tokenIds = Array.from(
    new Set(
      markets.flatMap((m) =>
        m.outcomes
          .map((o) => o.tokenId)
          .filter((v): v is string => Boolean(v))
      )
    )
  );
  if (tokenIds.length === 0) return markets;

  const base = getClobBaseUrl();
  const chunks: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += 250) chunks.push(tokenIds.slice(i, i + 250));

  const midpointMap = new Map<string, number>();
  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `${base}/midpoints?token_ids=${encodeURIComponent(chunk.join(","))}`;
      try {
        const res = await fetch(url, { next: { revalidate: 10 } });
        if (!res.ok) return;
        const payload = await res.json();
        const map = parsePriceMap(payload);
        for (const [k, v] of map) midpointMap.set(k, v);
      } catch {
        // Best-effort only.
      }
    })
  );
  if (midpointMap.size === 0) return markets;

  return markets.map((m) => {
    const outcomes = m.outcomes.map((o) => {
      const next = o.tokenId ? midpointMap.get(o.tokenId) : undefined;
      if (next === undefined) return o;
      return { ...o, price: next, probability: next };
    });

    if (outcomes.length === 2) {
      const a = outcomes[0];
      const b = outcomes[1];
      if (a && b) {
        const aHas = a.tokenId ? midpointMap.has(a.tokenId) : false;
        const bHas = b.tokenId ? midpointMap.has(b.tokenId) : false;
        if (aHas && !bHas) {
          outcomes[1] = { ...b, price: 1 - a.price, probability: 1 - a.probability };
        }
        if (!aHas && bHas) {
          outcomes[0] = { ...a, price: 1 - b.price, probability: 1 - b.probability };
        }
      }
    }
    return { ...m, outcomes };
  });
};

type MarketSnapshotScope = "open" | "all";

type FetchMarketsPagedOptions = {
  scope?: MarketSnapshotScope;
  pageSize?: number;
  maxPages?: number;
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(value)));

const dedupeRawMarkets = (rows: RawMarket[]): RawMarket[] => {
  const seen = new Set<string>();
  const deduped: RawMarket[] = [];
  for (const row of rows) {
    const id =
      asString(row.conditionId) ??
      asString(row.condition_id) ??
      asString(row.market) ??
      asString(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }
  return deduped;
};

const flattenMarketsFromEvents = (events: RawMarket[]): RawMarket[] => {
  const flattened: RawMarket[] = [];
  for (const event of events) {
    const eventSlug = asString(event.slug) ?? asString(event.eventSlug) ?? null;
    const eventCategory = asString(event.category) ?? asString(event.group) ?? null;
    const eventImage = asString(event.image) ?? asString(event.icon) ?? null;
    const eventDescription = asString(event.description) ?? null;
    const eventCreatedAt =
      asString(event.createdAt) ??
      asString(event.created_at) ??
      asString(event.startDate) ??
      asString(event.start_date) ??
      null;
    const eventEndDate =
      asString(event.endDate) ??
      asString(event.end_date) ??
      asString(event.endTime) ??
      null;
    const eventUrl = normalizeMarketSourceUrl(
      asString(event.url) ?? asString(event.source),
      eventSlug,
      eventSlug
    );

    const markets = Array.isArray(event.markets) ? event.markets : [];
    for (const row of markets) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const market = row as RawMarket;
      flattened.push({
        ...market,
        eventSlug: asString(market.eventSlug) ?? asString(market.event_slug) ?? eventSlug,
        slug: asString(market.slug) ?? eventSlug ?? asString(market.conditionId) ?? asString(market.id),
        url:
          asString(market.url) ??
          asString(market.source) ??
          eventUrl ??
          (eventSlug ? `/event/${eventSlug}` : null),
        category: asString(market.category) ?? eventCategory,
        image: asString(market.image) ?? asString(market.icon) ?? eventImage,
        description: asString(market.description) ?? eventDescription,
        createdAt: asString(market.createdAt) ?? asString(market.created_at) ?? eventCreatedAt,
        endDate: asString(market.endDate) ?? asString(market.end_date) ?? eventEndDate,
        active: typeof market.active === "boolean" ? market.active : event.active,
        closed: typeof market.closed === "boolean" ? market.closed : event.closed,
        archived: typeof market.archived === "boolean" ? market.archived : event.archived,
      });
    }
  }
  return flattened;
};

async function fetchOpenMarketsViaEvents(pageSize: number, maxPages: number): Promise<RawMarket[]> {
  const base = getBaseUrl();
  const allEvents: RawMarket[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    params.set("archived", "false");
    params.set("active", "true");
    params.set("closed", "false");
    params.set("order", "id");
    params.set("ascending", "false");

    const response = await fetch(`${base}/events?${params.toString()}`, {
      next: { revalidate: 20 },
    });
    if (!response.ok) break;
    const payload = (await response.json()) as unknown;
    const pageRows = Array.isArray(payload) ? (payload as RawMarket[]) : [];
    if (pageRows.length === 0) break;
    allEvents.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return dedupeRawMarkets(flattenMarketsFromEvents(allEvents));
}

async function fetchMarketsPaged(options?: FetchMarketsPagedOptions): Promise<RawMarket[]> {
  const base = getBaseUrl();
  const scope = options?.scope ?? "open";
  const pageSize = clampInt(options?.pageSize ?? 200, 10, 500);
  const maxPages = clampInt(options?.maxPages ?? 1, 1, 200);
  if (scope === "open") {
    try {
      const fromEvents = await fetchOpenMarketsViaEvents(Math.min(200, pageSize), maxPages);
      if (fromEvents.length > 0) return fromEvents;
    } catch {
      // Fallback to /markets below.
    }
  }

  const allRows: RawMarket[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    params.set("archived", "false");
    params.set("order", "volume");
    params.set("ascending", "false");
    if (scope === "open") {
      params.set("active", "true");
      params.set("closed", "false");
    }

    const url = `${base}/markets?${params.toString()}`;
    const response = await fetch(url, { next: { revalidate: scope === "open" ? 30 : 120 } });
    if (!response.ok) break;
    const payload = (await response.json()) as unknown;
    const pageRows = Array.isArray(payload) ? (payload as RawMarket[]) : [];
    if (pageRows.length === 0) break;
    allRows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return dedupeRawMarkets(allRows);
}

async function fetchMarkets(limit = 200): Promise<RawMarket[]> {
  const safeLimit = clampInt(limit, 1, 5000);
  const pageSize = Math.min(200, safeLimit);
  const maxPages = Math.max(1, Math.ceil(safeLimit / pageSize));
  const rows = await fetchMarketsPaged({
    scope: "open",
    pageSize,
    maxPages,
  });
  return rows.slice(0, safeLimit);
}

export async function listPolymarketMarkets(
  limit = 200,
  options?: { hydrateMidpoints?: boolean }
): Promise<PolymarketMarket[]> {
  const rows = await fetchMarkets(limit);
  const mapped = rows.map(mapMarket).filter((v): v is PolymarketMarket => Boolean(v));
  const shouldHydrate = options?.hydrateMidpoints ?? true;
  return shouldHydrate ? hydrateWithMidpoints(mapped) : mapped;
}

export async function listPolymarketMarketsSnapshot(options?: {
  scope?: MarketSnapshotScope;
  pageSize?: number;
  maxPages?: number;
  hydrateMidpoints?: boolean;
}): Promise<PolymarketMarket[]> {
  const rows = await fetchMarketsPaged(options);
  const mapped = rows.map(mapMarket).filter((v): v is PolymarketMarket => Boolean(v));
  const shouldHydrate = options?.hydrateMidpoints ?? true;
  return shouldHydrate ? hydrateWithMidpoints(mapped) : mapped;
}

export async function searchPolymarketMarkets(query: string, limit = 80): Promise<PolymarketMarket[]> {
  const q = query.trim();
  if (!q) return [];
  const base = getBaseUrl();
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit_per_type", String(Math.max(10, Math.min(100, limit))));
  params.set("search_profiles", "false");
  params.set("search_tags", "false");
  params.set("cache", "true");
  params.set("optimized", "true");
  params.set("keep_closed_markets", "1");
  const url = `${base}/public-search?${params.toString()}`;
  try {
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) return [];
    const payload = await res.json();
    const obj = asRecord(payload);
    const events = Array.isArray(obj?.events) ? obj.events : [];
    const marketsRaw: RawMarket[] = [];
    for (const ev of events) {
      const eventObj = asRecord(ev);
      const eventMarkets = Array.isArray(eventObj?.markets) ? eventObj?.markets : [];
      for (const m of eventMarkets) {
        if (m && typeof m === "object" && !Array.isArray(m)) marketsRaw.push(m as RawMarket);
      }
    }
    const seen = new Set<string>();
    const mapped = marketsRaw
      .map(mapMarket)
      .filter((m): m is PolymarketMarket => Boolean(m))
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .slice(0, limit);
    return hydrateWithMidpoints(mapped);
  } catch {
    return [];
  }
}

export async function getPolymarketMarketById(marketId: string): Promise<PolymarketMarket | null> {
  const target = marketId.trim();
  if (!target) return null;

  const base = getBaseUrl();
  const directUrl = `${base}/markets/${encodeURIComponent(target)}`;
  try {
    const direct = await fetch(directUrl, { next: { revalidate: 30 } });
    if (direct.ok) {
      const payload = (await direct.json()) as unknown;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const mapped = mapMarket(payload as RawMarket);
        if (mapped) {
          const [hydrated] = await hydrateWithMidpoints([mapped]);
          return hydrated ?? mapped;
        }
      }
    }
  } catch {
    // Fallback to list scan below.
  }

  try {
    const params = new URLSearchParams();
    params.set("limit", "1");
    if (target.startsWith("0x")) params.set("condition_ids", target);
    else if (/^\d+$/.test(target)) params.set("id", target);
    else params.set("slug", target);
    const byQuery = await fetch(`${base}/markets?${params.toString()}`, { next: { revalidate: 30 } });
    if (byQuery.ok) {
      const payload = (await byQuery.json()) as unknown;
      const first = Array.isArray(payload) ? payload[0] : null;
      const mapped = first ? mapMarket(first as RawMarket) : null;
      if (mapped) {
        const [hydrated] = await hydrateWithMidpoints([mapped]);
        return hydrated ?? mapped;
      }
    }
  } catch {
    // Fallback below.
  }

  const rows = await listPolymarketMarkets(400);
  return (
    rows.find((m) => m.id === target) ??
    rows.find((m) => m.conditionId === target) ??
    rows.find((m) => m.slug === target) ??
    null
  );
}

export type PolymarketPricePoint = { ts: number; price: number };

export async function getPolymarketPriceHistory(
  tokenId: string,
  options?: { interval?: "1m" | "1h" }
): Promise<PolymarketPricePoint[]> {
  const clean = tokenId.trim();
  if (!clean) return [];
  const base = getClobBaseUrl();
  const requestedInterval = options?.interval ?? "1h";
  const historyWindows: Array<{ interval: string; fidelity?: number }> =
    requestedInterval === "1m"
      ? [
          { interval: "1h", fidelity: 1 },
          { interval: "1m", fidelity: 1 },
          { interval: "max", fidelity: 1 },
          { interval: "max", fidelity: 15 },
        ]
      : [
          { interval: "1h" },
          { interval: "max", fidelity: 60 },
          { interval: "max", fidelity: 15 },
          { interval: "1w", fidelity: 15 },
          { interval: "1m", fidelity: 60 },
        ];

  for (const window of historyWindows) {
    const params = new URLSearchParams();
    params.set("market", clean);
    params.set("interval", window.interval);
    if (typeof window.fidelity === "number" && Number.isFinite(window.fidelity)) {
      params.set("fidelity", String(window.fidelity));
    }
    const url = `${base}/prices-history?${params.toString()}`;
    try {
      const res = await fetch(url, { next: { revalidate: 20 } });
      if (!res.ok) continue;
      const payload = await res.json();
      const obj = asRecord(payload);
      const history = obj?.history;
      if (!Array.isArray(history)) continue;
      const points = history
        .map((row) => {
          const rec = asRecord(row);
          const t = asNumber(rec?.t);
          const p = asNumber(rec?.p);
          if (t === null || p === null) return null;
          return { ts: t, price: Math.max(0, Math.min(1, p)) };
        })
        .filter((v): v is PolymarketPricePoint => Boolean(v));
      if (points.length > 0) return points;
    } catch {
      // Continue trying narrower windows.
    }
  }

  return [];
}

export type PolymarketPublicTrade = {
  id: string;
  conditionId: string;
  side: "BUY" | "SELL";
  outcome: string | null;
  size: number;
  price: number;
  timestamp: number;
};

export async function getPolymarketPublicTrades(
  conditionId: string,
  limit = 50
): Promise<PolymarketPublicTrade[]> {
  const clean = conditionId.trim();
  if (!clean) return [];
  const base = getDataBaseUrl();
  const params = new URLSearchParams();
  params.set("market", clean);
  params.set("limit", String(Math.max(1, Math.min(500, limit))));
  params.set("offset", "0");
  params.set("takerOnly", "true");
  const url = `${base}/trades?${params.toString()}`;
  try {
    const res = await fetch(url, { next: { revalidate: 10 } });
    if (!res.ok) return [];
    const payload = await res.json();
    if (!Array.isArray(payload)) return [];
    return payload
      .map((row) => {
        const rec = asRecord(row);
        const sideRaw = asString(rec?.side)?.toUpperCase();
        if (sideRaw !== "BUY" && sideRaw !== "SELL") return null;
        const price = asNumber(rec?.price);
        const size = asNumber(rec?.size);
        const ts = asNumber(rec?.timestamp);
        if (price === null || size === null || ts === null) return null;
        const txHash = asString(rec?.transactionHash);
        const asset = asString(rec?.asset);
        const id = txHash ?? `${clean}:${asset ?? "asset"}:${ts}:${price}:${size}`;
        return {
          id,
          conditionId: asString(rec?.conditionId) ?? clean,
          side: sideRaw,
          outcome: asString(rec?.outcome),
          size,
          price: Math.max(0, Math.min(1, price)),
          timestamp: ts,
        } as PolymarketPublicTrade;
      })
      .filter((v): v is PolymarketPublicTrade => Boolean(v));
  } catch {
    return [];
  }
}
