import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getSupabaseServiceClient } from "@/src/server/supabase/client";
import { listMirroredPolymarketMarkets, searchMirroredPolymarketMarkets } from "@/src/server/polymarket/mirror";
import { listPolymarketMarkets, searchPolymarketMarkets } from "@/src/server/polymarket/client";
import { getVenueAdapter, listEnabledProviders } from "@/src/server/venues/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type EmbeddingProvider = "openai" | "huggingface" | "none";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_INPUT_MARKETS = 150;

const MAX_KEYWORD_CANDIDATES = 220;
const MAX_LIVE_SEARCH_CANDIDATES = 140;
const MAX_MIRROR_POOL_CANDIDATES = 700;
const MAX_LATEST_CANDIDATES = 240;
const MAX_SEMANTIC_POOL = 160;

const QUERY_CACHE_TTL_MS = Math.max(5_000, Number(process.env.SEMANTIC_QUERY_CACHE_TTL_MS ?? 20_000));
const EMBEDDING_CACHE_TTL_MS = Math.max(60_000, Number(process.env.SEMANTIC_EMBEDDING_CACHE_TTL_MS ?? 1_800_000));
const LATEST_POOL_CACHE_TTL_MS = Math.max(5_000, Number(process.env.SEMANTIC_LATEST_POOL_CACHE_TTL_MS ?? 30_000));

const queryCache = new Map<string, { expiresAt: number; rows: RecResponseRow[] }>();
const embeddingCache = new Map<string, { expiresAt: number; vector: number[] }>();
let latestPoolCache: { expiresAt: number; rows: RecMarket[] } | null = null;
let openAIClient: OpenAI | null = null;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const tokenize = (input: string): string[] =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const toText = (market: RecMarket): string => `${market.question} ${market.tags.join(" ")}`.trim();

const lexicalScore = (query: string, market: RecMarket): number => {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const text = toText(market).toLowerCase();
  const exact = text.includes(q) ? 1 : 0;

  const tokens = tokenize(q);
  if (tokens.length === 0) return exact;

  let tokenHits = 0;
  for (const token of tokens) {
    if (text.includes(token)) tokenHits += 1;
  }

  const coverage = tokenHits / tokens.length;
  return clamp01(exact * 0.7 + coverage * 0.6);
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
        ? row.tags
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const volumeRaw = Number(row.volume ?? 0);
      return {
        id,
        question,
        tags,
        volume: Number.isFinite(volumeRaw) ? Math.max(0, volumeRaw) : 0,
      } satisfies RecMarket;
    })
    .filter((v): v is RecMarket => Boolean(v))
    .slice(0, MAX_INPUT_MARKETS);
};

const fromMirrorKeyword = async (query: string, limit: number): Promise<RecMarket[]> => {
  try {
    const supabase = getSupabaseServiceClient();
    const rows = await searchMirroredPolymarketMarkets(supabase, query, limit);
    return rows.map((m) => ({
      id: m.id,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title)].filter(Boolean),
      volume: m.volume,
    }));
  } catch {
    return [];
  }
};

const fromMirrorPool = async (limit: number): Promise<RecMarket[]> => {
  try {
    const supabase = getSupabaseServiceClient();
    const rows = await listMirroredPolymarketMarkets(supabase, { onlyOpen: true, limit });
    return rows.map((m) => ({
      id: m.id,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title)].filter(Boolean),
      volume: m.volume,
    }));
  } catch {
    return [];
  }
};

const fromPolymarketLive = async (query: string, limit: number): Promise<RecMarket[]> => {
  try {
    const rows = await searchPolymarketMarkets(query, limit);
    return rows.map((m) => ({
      id: m.id,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title)].filter(Boolean),
      volume: m.volume,
    }));
  } catch {
    return [];
  }
};

const fromLimitlessLive = async (query: string, limit: number): Promise<RecMarket[]> => {
  try {
    const enabled = new Set(listEnabledProviders());
    if (!enabled.has("limitless")) return [];
    const adapter = getVenueAdapter("limitless");
    if (!adapter.isEnabled()) return [];
    const rows = await adapter.searchMarkets(query, limit);
    return rows.map((m) => ({
      id: `limitless:${m.providerMarketId}`,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title), m.slug].filter(Boolean),
      volume: m.volume,
    }));
  } catch {
    return [];
  }
};

const getLatestPolymarketPool = async (limit: number): Promise<RecMarket[]> => {
  const now = Date.now();
  if (latestPoolCache && latestPoolCache.expiresAt > now) return latestPoolCache.rows;

  try {
    const rows = await listPolymarketMarkets(limit, { hydrateMidpoints: false });
    const mapped = rows.map((m) => ({
      id: m.id,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title), m.slug].filter(Boolean),
      volume: m.volume,
    }));
    latestPoolCache = {
      expiresAt: now + LATEST_POOL_CACHE_TTL_MS,
      rows: mapped,
    };
    return mapped;
  } catch {
    return [];
  }
};

const getLatestLimitlessPool = async (limit: number): Promise<RecMarket[]> => {
  try {
    const enabled = new Set(listEnabledProviders());
    if (!enabled.has("limitless")) return [];
    const adapter = getVenueAdapter("limitless");
    if (!adapter.isEnabled()) return [];
    const rows = await adapter.listMarketsSnapshot({ limit, onlyOpen: true });
    return rows.map((m) => ({
      id: `limitless:${m.providerMarketId}`,
      question: m.title,
      tags: [m.category ?? "", ...m.outcomes.map((o) => o.title), m.slug].filter(Boolean),
      volume: m.volume,
    }));
  } catch {
    return [];
  }
};

const hashText = (value: string): string =>
  createHash("sha1").update(value).digest("hex").slice(0, 20);

const normalizeVector = (raw: number[]): number[] => {
  let sum = 0;
  for (const n of raw) sum += n * n;
  if (sum <= 0) return raw;
  const norm = Math.sqrt(sum);
  return raw.map((n) => n / norm);
};

const dot = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < len; i += 1) total += a[i] * b[i];
  return total;
};

const pickProvider = (): EmbeddingProvider => {
  const configured = (process.env.SEMANTIC_SEARCH_PROVIDER ?? "auto").trim().toLowerCase();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasHF = Boolean(process.env.HUGGINGFACE_API_KEY);

  if (configured === "openai") return hasOpenAI ? "openai" : "none";
  if (configured === "huggingface") return hasHF ? "huggingface" : "none";
  if (hasOpenAI) return "openai";
  if (hasHF) return "huggingface";
  return "none";
};

const getOpenAIClient = (): OpenAI => {
  if (openAIClient) return openAIClient;
  openAIClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAIClient;
};

const embedOpenAIBatch = async (texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) return [];
  const model = (process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small").trim();
  const client = getOpenAIClient();
  const response = await client.embeddings.create({ model, input: texts });
  const byIndex = response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => normalizeVector(row.embedding));
  return byIndex;
};

const toHfVector = (payload: unknown): number[] | null => {
  if (!Array.isArray(payload) || payload.length === 0) return null;

  if (payload.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return normalizeVector(payload as number[]);
  }

  if (payload.every((row) => Array.isArray(row))) {
    const matrix = payload as unknown[];

    if (
      matrix.length > 0 &&
      Array.isArray(matrix[0]) &&
      (matrix[0] as unknown[]).every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      const rows = matrix as number[][];
      const dims = rows[0]?.length ?? 0;
      if (dims === 0) return null;
      const sums = new Array(dims).fill(0);
      for (const row of rows) {
        for (let i = 0; i < dims; i += 1) sums[i] += Number(row[i] ?? 0);
      }
      return normalizeVector(sums.map((v) => v / rows.length));
    }

    if (
      matrix.length === 1 &&
      Array.isArray(matrix[0]) &&
      (matrix[0] as unknown[]).every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return normalizeVector(matrix[0] as number[]);
    }
  }

  return null;
};

const embedHuggingFaceOne = async (text: string): Promise<number[] | null> => {
  const token = process.env.HUGGINGFACE_API_KEY?.trim();
  if (!token) return null;

  const model = (process.env.HUGGINGFACE_EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2").trim();
  const response = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      inputs: text,
      options: { wait_for_model: true, use_cache: true },
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = await response.json();
  return toHfVector(payload);
};

const embedTexts = async (
  provider: EmbeddingProvider,
  cacheKeys: string[],
  texts: string[]
): Promise<Array<number[] | null>> => {
  const now = Date.now();
  const result: Array<number[] | null> = new Array(texts.length).fill(null);
  const missing: Array<{ idx: number; key: string; text: string }> = [];

  for (let i = 0; i < texts.length; i += 1) {
    const key = cacheKeys[i];
    const cached = embeddingCache.get(key);
    if (cached && cached.expiresAt > now) {
      result[i] = cached.vector;
      continue;
    }
    missing.push({ idx: i, key, text: texts[i] });
  }

  if (missing.length === 0 || provider === "none") return result;

  if (provider === "openai") {
    const chunkSize = 100;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const vectors = await embedOpenAIBatch(chunk.map((row) => row.text));
      vectors.forEach((vector, offset) => {
        const item = chunk[offset];
        if (!item || !vector) return;
        const normalized = normalizeVector(vector);
        result[item.idx] = normalized;
        embeddingCache.set(item.key, {
          expiresAt: now + EMBEDDING_CACHE_TTL_MS,
          vector: normalized,
        });
      });
    }
    return result;
  }

  const concurrency = 3;
  let cursor = 0;
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (cursor < missing.length) {
      const idx = cursor;
      cursor += 1;
      const item = missing[idx];
      if (!item) continue;
      try {
        const vector = await embedHuggingFaceOne(item.text);
        if (!vector) continue;
        result[item.idx] = vector;
        embeddingCache.set(item.key, {
          expiresAt: now + EMBEDDING_CACHE_TTL_MS,
          vector,
        });
      } catch {
        // continue best-effort
      }
    }
  });
  await Promise.all(workers);
  return result;
};

export async function POST(req: Request) {
  let body: RecRequest;
  try {
    body = (await req.json()) as RecRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit ?? DEFAULT_LIMIT)));
  const inputMarkets = normalizeMarkets(body.markets);

  if (query.length < 2) {
    return Response.json([] as RecResponseRow[], {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }

  const provider = pickProvider();
  const queryCacheKey = `${provider}:${query.toLowerCase()}:${limit}`;
  const now = Date.now();
  const cached = queryCache.get(queryCacheKey);
  if (cached && cached.expiresAt > now) {
    return Response.json(cached.rows, {
      headers: { "cache-control": "no-store, max-age=0" },
    });
  }

  const [keywordCandidates, liveCandidatesPolymarket, liveCandidatesLimitless, mirrorPool, latestPoolPolymarket, latestPoolLimitless] = await Promise.all([
    fromMirrorKeyword(query, MAX_KEYWORD_CANDIDATES),
    fromPolymarketLive(query, MAX_LIVE_SEARCH_CANDIDATES),
    fromLimitlessLive(query, MAX_LIVE_SEARCH_CANDIDATES),
    fromMirrorPool(MAX_MIRROR_POOL_CANDIDATES),
    getLatestPolymarketPool(MAX_LATEST_CANDIDATES),
    getLatestLimitlessPool(MAX_LATEST_CANDIDATES),
  ]);

  const liveCandidates = [...liveCandidatesPolymarket, ...liveCandidatesLimitless];
  const latestPool = [...latestPoolPolymarket, ...latestPoolLimitless];

  const mergedById = new Map<string, RecMarket>();
  for (const m of mirrorPool) mergedById.set(m.id, m);
  for (const m of latestPool) mergedById.set(m.id, m);
  for (const m of keywordCandidates) mergedById.set(m.id, m);
  for (const m of liveCandidates) mergedById.set(m.id, m);
  for (const m of inputMarkets) mergedById.set(m.id, m);

  const liveRank = new Map<string, number>();
  liveCandidates.forEach((m, idx) => liveRank.set(m.id, idx));

  const preRanked = Array.from(mergedById.values())
    .map((market) => {
      const lex = lexicalScore(query, market);
      const volumeBoost = Math.log10((market.volume ?? 0) + 1) * 0.02;
      const rank = liveRank.get(market.id);
      const liveBoost =
        typeof rank === "number" && liveCandidates.length > 0
          ? 0.2 * (1 - rank / liveCandidates.length)
          : 0;
      const preScore = clamp01(lex * 0.85 + volumeBoost + liveBoost);
      return { market, lex, volumeBoost, liveBoost, preScore };
    })
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, MAX_SEMANTIC_POOL);

  let rows: RecResponseRow[];

  if (provider === "none" || preRanked.length === 0) {
    rows = preRanked
      .map((row) => ({ market: row.market, score: row.preScore }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } else {
    const queryText = query.toLowerCase().trim();
    const marketTexts = preRanked.map((row) => toText(row.market));

    const allTexts = [queryText, ...marketTexts];
    const allKeys = [
      `q:${provider}:${hashText(queryText)}`,
      ...preRanked.map((row) => `m:${provider}:${row.market.id}:${hashText(toText(row.market).toLowerCase())}`),
    ];

    const vectors = await embedTexts(provider, allKeys, allTexts);
    const queryVector = vectors[0];

    rows = preRanked
      .map((row, idx) => {
        const marketVector = vectors[idx + 1];
        const semantic = queryVector && marketVector ? clamp01((dot(queryVector, marketVector) + 1) / 2) : 0;
        const score = clamp01(semantic * 0.65 + row.lex * 0.25 + row.volumeBoost + row.liveBoost);
        return { market: row.market, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  queryCache.set(queryCacheKey, {
    expiresAt: now + QUERY_CACHE_TTL_MS,
    rows,
  });

  return Response.json(rows, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
