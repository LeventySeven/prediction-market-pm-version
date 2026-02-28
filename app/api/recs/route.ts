import { getSupabaseServiceClient } from "@/src/server/supabase/client";
import { searchMirroredPolymarketMarkets } from "@/src/server/polymarket/mirror";
import { searchPolymarketMarkets } from "@/src/server/polymarket/client";

export const runtime = "nodejs";

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

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_KEYWORD_CANDIDATES = 240;
const MAX_LIVE_CANDIDATES = 140;
const MAX_INPUT_MARKETS = 150;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const lexicalScore = (query: string, market: RecMarket): number => {
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

const fromPolymarketLive = async (query: string, limit: number): Promise<RecMarket[]> => {
  const rows = await searchPolymarketMarkets(query, limit);
  return rows.map((m) => ({
    id: m.id,
    question: m.title,
    tags: [m.category ?? "", ...m.outcomes.map((o) => o.title)].filter(Boolean),
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
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit ?? DEFAULT_LIMIT)));
  const inputMarkets = normalizeMarkets(body.markets);

  if (query.length < 2) return Response.json([]);

  const [keywordCandidates, liveCandidates] = await Promise.all([
    fromMirrorKeyword(query, MAX_KEYWORD_CANDIDATES),
    fromPolymarketLive(query, MAX_LIVE_CANDIDATES),
  ]);

  const mergedById = new Map<string, RecMarket>();
  for (const m of keywordCandidates) mergedById.set(m.id, m);
  for (const m of liveCandidates) mergedById.set(m.id, m);
  for (const m of inputMarkets) {
    if (!mergedById.has(m.id)) mergedById.set(m.id, m);
  }

  const liveRank = new Map<string, number>();
  liveCandidates.forEach((m, idx) => {
    liveRank.set(m.id, idx);
  });

  const rows: RecResponseRow[] = Array.from(mergedById.values()).map((market) => {
    const lex = lexicalScore(query, market);
    const volumeBoost = Math.log10((market.volume ?? 0) + 1) * 0.02;
    const rank = liveRank.get(market.id);
    const liveBoost =
      typeof rank === "number" && liveCandidates.length > 0
        ? 0.25 * (1 - rank / liveCandidates.length)
        : 0;
    const score = clamp01(lex * 0.75 + volumeBoost + liveBoost);
    return { market, score };
  });

  rows.sort((a, b) => b.score - a.score);
  return Response.json(rows.slice(0, limit));
}
