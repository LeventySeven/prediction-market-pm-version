import { pipeline } from "@xenova/transformers";
import { searchPolymarketMarkets } from "@/src/server/polymarket/client";

export const runtime = "edge";

type RecMarket = {
  id: string;
  question: string;
  tags: string[];
  volume: number;
};

type RecRequest = {
  query: string;
  markets?: RecMarket[];
  limit?: number;
};

type RecResponseRow = {
  market: RecMarket;
  score: number;
};

type Embedder = Awaited<ReturnType<typeof pipeline>>;

const TASK = "feature-extraction";
const MODEL = "Xenova/all-MiniLM-L6-v2";
const MAX_MARKETS = 100;
const DEFAULT_LIMIT = 10;
const MAX_EMBED_CANDIDATES = 80;

declare global {
  // eslint-disable-next-line no-var
  var __recsEmbedderPromise: Promise<Embedder> | undefined;
  // eslint-disable-next-line no-var
  var __recsEmbeddingCache: Map<string, { fingerprint: string; vector: number[]; ts: number }> | undefined;
}

const getEmbedder = () => {
  if (!globalThis.__recsEmbedderPromise) {
    globalThis.__recsEmbedderPromise = pipeline(TASK, MODEL);
  }
  return globalThis.__recsEmbedderPromise;
};

const asVector = (value: unknown): number[] => {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data.map((n) => Number(n));
    if (data && typeof (data as { length?: unknown }).length === "number") {
      return Array.from(data as ArrayLike<number>).map((n) => Number(n));
    }
  }
  return [];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const dot = (a: number[], b: number[]) => {
  const size = Math.min(a.length, b.length);
  let acc = 0;
  for (let i = 0; i < size; i += 1) acc += a[i]! * b[i]!;
  return acc;
};

const makeFingerprint = (market: RecMarket) =>
  `${market.question}|${market.tags.join("|")}`.toLowerCase().trim();

const lexicalScore = (query: string, market: RecMarket) => {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const text = `${market.question} ${market.tags.join(" ")}`.toLowerCase();
  if (text.includes(q)) return 1;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (text.includes(token)) hits += 1;
  }
  return hits / tokens.length;
};

const normalizeMarkets = (markets: unknown): RecMarket[] => {
  if (!Array.isArray(markets)) return [];
  return markets
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const row = m as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      const question = typeof row.question === "string" ? row.question.trim() : "";
      if (!id || !question) return null;
      const tags = Array.isArray(row.tags)
        ? row.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean)
        : [];
      const volumeRaw = Number(row.volume ?? 0);
      return {
        id,
        question,
        tags,
        volume: Number.isFinite(volumeRaw) ? Math.max(0, volumeRaw) : 0,
      };
    })
    .filter((v): v is RecMarket => Boolean(v));
};

const fromPolymarketDirectory = async (query: string, limit: number): Promise<RecMarket[]> => {
  const rows = await searchPolymarketMarkets(query, limit);
  return rows.map((m) => ({
    id: m.id,
    question: m.title,
    tags: [
      m.category ?? "",
      ...m.outcomes.map((o) => o.title),
    ].filter(Boolean),
    volume: m.volume,
  }));
};

export async function POST(req: Request) {
  let body: RecRequest;
  try {
    body = (await req.json()) as RecRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  const limit = Math.max(1, Math.min(20, Number(body.limit ?? DEFAULT_LIMIT)));
  const inputMarkets = normalizeMarkets(body.markets).slice(0, MAX_MARKETS);
  if (!query) return Response.json([]);
  const directoryMarkets = await fromPolymarketDirectory(query, MAX_MARKETS);
  const mergedById = new Map<string, RecMarket>();
  for (const m of directoryMarkets) mergedById.set(m.id, m);
  for (const m of inputMarkets) {
    if (!mergedById.has(m.id)) mergedById.set(m.id, m);
  }
  const markets = Array.from(mergedById.values()).slice(0, MAX_MARKETS);
  if (markets.length === 0) return Response.json([]);

  const prefiltered = [...markets]
    .map((market) => {
      const lex = lexicalScore(query, market);
      const volBoost = Math.log10((market.volume ?? 0) + 1) * 0.01;
      return { market, lex, base: lex + volBoost };
    })
    .sort((a, b) => b.base - a.base)
    .slice(0, MAX_EMBED_CANDIDATES);

  const embedder = await getEmbedder();
  const queryOut = await (embedder as any)(query, { pooling: "mean", normalize: true });
  const queryVec = asVector(queryOut);
  if (queryVec.length === 0) return Response.json([]);

  const cache = globalThis.__recsEmbeddingCache ?? new Map<string, { fingerprint: string; vector: number[]; ts: number }>();
  globalThis.__recsEmbeddingCache = cache;
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > 1000 * 60 * 30) cache.delete(key);
  }

  const missing: RecMarket[] = [];
  for (const { market } of prefiltered) {
    const fingerprint = makeFingerprint(market);
    const cached = cache.get(market.id);
    if (!cached || cached.fingerprint !== fingerprint || cached.vector.length === 0) {
      missing.push(market);
    } else {
      cached.ts = now;
    }
  }

  if (missing.length > 0) {
    const texts = missing.map((m) => `${m.question} ${m.tags.join(" ")}`.trim());
    const out = await (embedder as any)(texts, { pooling: "mean", normalize: true });
    const vectors = Array.isArray(out) ? out.map(asVector) : [asVector(out)];
    for (let i = 0; i < missing.length; i += 1) {
      const market = missing[i]!;
      const vector = vectors[i] ?? [];
      cache.set(market.id, {
        fingerprint: makeFingerprint(market),
        vector,
        ts: now,
      });
    }
  }

  const results: RecResponseRow[] = prefiltered.map(({ market, lex }) => {
    const candidateVec = cache.get(market.id)?.vector ?? [];
    const semantic = candidateVec.length > 0 ? dot(queryVec, candidateVec) : 0;
    const volumeBoost = Math.log10((market.volume ?? 0) + 1) * 0.01;
    const lexicalBoost = lex * 0.15;
    return {
      market,
      score: clamp01(semantic + lexicalBoost + volumeBoost),
    };
  });

  results.sort((a, b) => b.score - a.score);
  return Response.json(results.slice(0, limit));
}

