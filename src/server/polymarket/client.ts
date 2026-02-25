type RawMarket = Record<string, unknown>;

export type PolymarketOutcome = {
  id: string;
  title: string;
  probability: number;
  price: number;
  sortOrder: number;
};

export type PolymarketMarket = {
  id: string;
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
  outcomes: PolymarketOutcome[];
  resolvedOutcomeTitle: string | null;
};

const DEFAULT_BASE = "https://gamma-api.polymarket.com";
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

const parseOutcomes = (raw: RawMarket, marketId: string): PolymarketOutcome[] => {
  const titlesRaw = parseJsonArray(raw.outcomes);
  const pricesRaw = parseJsonArray(raw.outcomePrices);
  const probsRaw = parseJsonArray(raw.outcomeProbabilities);
  const fallbackYes = toProb(raw.lastTradePrice) ?? 0.5;

  const titles = titlesRaw
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));

  if (titles.length > 0) {
    return titles.map((title, idx) => {
      const probability =
        toProb(probsRaw[idx]) ??
        toProb(pricesRaw[idx]) ??
        (titles.length === 2 ? (idx === 0 ? fallbackYes : 1 - fallbackYes) : 1 / titles.length);
      const bounded = Math.max(0, Math.min(1, probability));
      return {
        id: `${marketId}:${idx}`,
        title,
        probability: bounded,
        price: bounded,
        sortOrder: idx,
      };
    });
  }

  return [
    { id: `${marketId}:0`, title: "YES", probability: fallbackYes, price: fallbackYes, sortOrder: 0 },
    { id: `${marketId}:1`, title: "NO", probability: 1 - fallbackYes, price: 1 - fallbackYes, sortOrder: 1 },
  ];
};

const mapMarket = (raw: RawMarket): PolymarketMarket | null => {
  const id =
    asString(raw.id) ??
    asString(raw.conditionId) ??
    asString(raw.condition_id) ??
    asString(raw.slug);
  if (!id) return null;

  const slug = asString(raw.slug) ?? id;
  const title =
    asString(raw.question) ??
    asString(raw.title) ??
    asString(raw.name) ??
    "Untitled market";
  const sourceUrl =
    asString(raw.url) ??
    asString(raw.source) ??
    (slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : null);
  const outcomes = parseOutcomes(raw, id);
  const winningTitle = asString(raw.winningOutcome) ?? null;

  return {
    id,
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
    volume: asNumber(raw.volumeNum ?? raw.volume) ?? 0,
    outcomes,
    resolvedOutcomeTitle: winningTitle,
  };
};

const getBaseUrl = () => (process.env.POLYMARKET_API_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");

async function fetchMarkets(limit = 200): Promise<RawMarket[]> {
  const base = getBaseUrl();
  const url = `${base}/markets?limit=${limit}&closed=false`;
  const response = await fetch(url, { next: { revalidate: 30 } });
  if (!response.ok) return [];
  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as RawMarket[]) : [];
}

export async function listPolymarketMarkets(limit = 200): Promise<PolymarketMarket[]> {
  const rows = await fetchMarkets(limit);
  return rows.map(mapMarket).filter((v): v is PolymarketMarket => Boolean(v));
}

export async function getPolymarketMarketById(marketId: string): Promise<PolymarketMarket | null> {
  const target = marketId.trim();
  if (!target) return null;

  const directUrl = `${getBaseUrl()}/markets/${encodeURIComponent(target)}`;
  try {
    const direct = await fetch(directUrl, { next: { revalidate: 30 } });
    if (direct.ok) {
      const payload = (await direct.json()) as unknown;
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const mapped = mapMarket(payload as RawMarket);
        if (mapped) return mapped;
      }
    }
  } catch {
    // Fallback to list scan below.
  }

  const rows = await listPolymarketMarkets(400);
  return (
    rows.find((m) => m.id === target) ??
    rows.find((m) => m.slug === target) ??
    null
  );
}

