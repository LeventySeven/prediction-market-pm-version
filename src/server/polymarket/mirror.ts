import type { PolymarketMarket, PolymarketOutcome } from "./client";
import { upsertVenueMarketsToCatalog } from "../venues/catalogStore";
import type { VenueMarket } from "../venues/types";

type MirrorRow = {
  market_id: string;
  condition_id: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  source_url: string | null;
  state: "open" | "closed" | "resolved" | "cancelled";
  market_created_at: string;
  closes_at: string;
  expires_at: string;
  category: string | null;
  volume: number;
  clob_token_ids: unknown;
  outcomes: unknown;
  resolved_outcome_title: string | null;
  search_text: string;
  source_updated_at: string;
  last_synced_at: string;
};

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asString(v))
    .filter((v): v is string => Boolean(v));
};

const parseOutcomes = (value: unknown): PolymarketOutcome[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row, idx) => {
      const rec = asRecord(row);
      if (!rec) return null;
      const id = asString(rec.id) ?? `outcome:${idx}`;
      const tokenId = asString(rec.tokenId);
      const title = asString(rec.title) ?? `Outcome ${idx + 1}`;
      const probability = asNumber(rec.probability) ?? 0;
      const price = asNumber(rec.price) ?? probability;
      const sortOrder = asNumber(rec.sortOrder) ?? idx;
      return {
        id,
        tokenId,
        title,
        probability: Math.max(0, Math.min(1, probability)),
        price: Math.max(0, Math.min(1, price)),
        sortOrder: Math.max(0, Math.floor(sortOrder)),
      } satisfies PolymarketOutcome;
    })
    .filter((v): v is PolymarketOutcome => Boolean(v));
};

const buildSearchText = (market: PolymarketMarket): string => {
  const parts = [
    market.id,
    market.conditionId,
    market.slug,
    market.title,
    market.description ?? "",
    market.category ?? "",
    ...market.outcomes.map((o) => o.title),
  ];
  return parts
    .map((v) => (v ?? "").toString().trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
};

const toMirrorRow = (market: PolymarketMarket, nowIso: string): MirrorRow => ({
  market_id: market.id,
  condition_id: market.conditionId,
  slug: market.slug,
  title: market.title,
  description: market.description,
  image_url: market.imageUrl,
  source_url: market.sourceUrl,
  state: market.state,
  market_created_at: market.createdAt,
  closes_at: market.closesAt,
  expires_at: market.expiresAt,
  category: market.category,
  volume: Number.isFinite(market.volume) ? market.volume : 0,
  clob_token_ids: market.clobTokenIds,
  outcomes: market.outcomes,
  resolved_outcome_title: market.resolvedOutcomeTitle,
  search_text: buildSearchText(market),
  source_updated_at: nowIso,
  last_synced_at: nowIso,
});

const toVenueMarket = (market: PolymarketMarket): VenueMarket => ({
  provider: "polymarket",
  providerMarketId: market.id,
  providerConditionId: market.conditionId,
  slug: market.slug,
  title: market.title,
  description: market.description,
  imageUrl: market.imageUrl,
  sourceUrl: market.sourceUrl,
  state: market.state,
  closesAt: market.closesAt,
  expiresAt: market.expiresAt,
  createdAt: market.createdAt,
  category: market.category,
  volume: Number.isFinite(market.volume) ? market.volume : 0,
  resolvedOutcomeTitle: market.resolvedOutcomeTitle,
  outcomes: market.outcomes.map((outcome) => ({
    id: outcome.id,
    providerOutcomeId: outcome.id,
    providerTokenId: outcome.tokenId,
    title: outcome.title,
    probability: outcome.probability,
    price: outcome.price,
    sortOrder: outcome.sortOrder,
    isActive: true,
  })),
  capabilities: {
    supportsTrading: true,
    supportsCandles: true,
    supportsPublicTrades: true,
    chainId: Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137),
  },
});

const fromMirrorRow = (row: Record<string, unknown>): PolymarketMarket | null => {
  const id = asString(row.market_id);
  const conditionId = asString(row.condition_id) ?? id;
  const slug = asString(row.slug) ?? id;
  const title = asString(row.title) ?? "Untitled market";
  const state = asString(row.state);
  if (!id || !conditionId || !slug || !state) return null;
  if (!["open", "closed", "resolved", "cancelled"].includes(state)) return null;
  return {
    id,
    conditionId,
    slug,
    title,
    description: asString(row.description),
    imageUrl: asString(row.image_url),
    sourceUrl: asString(row.source_url),
    state: state as PolymarketMarket["state"],
    closesAt: asString(row.closes_at) ?? new Date().toISOString(),
    expiresAt: asString(row.expires_at) ?? new Date().toISOString(),
    createdAt: asString(row.market_created_at) ?? new Date().toISOString(),
    category: asString(row.category),
    volume: asNumber(row.volume) ?? 0,
    clobTokenIds: parseStringArray(row.clob_token_ids),
    outcomes: parseOutcomes(row.outcomes),
    resolvedOutcomeTitle: asString(row.resolved_outcome_title),
  };
};

const clampLimit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const sanitizeSearch = (value: string) =>
  value
    .replace(/%/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function upsertMirroredPolymarketMarkets(
  supabaseService: unknown,
  markets: PolymarketMarket[]
): Promise<number> {
  if (!supabaseService || markets.length === 0) return 0;
  const nowIso = new Date().toISOString();
  const rows = markets.map((m) => toMirrorRow(m, nowIso));
  const chunkSize = 200;
  let written = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const { error } = await (supabaseService as any)
      .from("polymarket_market_cache")
      .upsert(batch, { onConflict: "market_id" });
    if (error) throw new Error(error.message ?? "MIRROR_UPSERT_FAILED");
    written += batch.length;
  }

  try {
    await upsertVenueMarketsToCatalog(
      supabaseService,
      markets.map((market) => toVenueMarket(market))
    );
  } catch (error) {
    // Canonical table sync should not block legacy mirror updates.
    console.warn("Canonical market catalog upsert failed", error);
  }

  return written;
}

export async function listMirroredPolymarketMarkets(
  supabaseService: unknown,
  params?: { onlyOpen?: boolean; limit?: number }
): Promise<PolymarketMarket[]> {
  if (!supabaseService) return [];
  const onlyOpen = params?.onlyOpen ?? false;
  const limit = clampLimit(params?.limit ?? 500, 1, 5000);
  let query = (supabaseService as any)
    .from("polymarket_market_cache")
    .select("*")
    .order("volume", { ascending: false })
    .limit(limit);
  if (onlyOpen) {
    query = query.eq("state", "open");
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message ?? "MIRROR_LIST_FAILED");
  return (data ?? [])
    .map((row: Record<string, unknown>) => fromMirrorRow(row))
    .filter((v: PolymarketMarket | null): v is PolymarketMarket => Boolean(v));
}

export async function getMirroredPolymarketMarketById(
  supabaseService: unknown,
  marketId: string
): Promise<PolymarketMarket | null> {
  if (!supabaseService) return null;
  const target = marketId.trim();
  if (!target) return null;

  const lookups: Array<{ key: string; value: string }> = [
    { key: "market_id", value: target },
    { key: "condition_id", value: target },
    { key: "slug", value: target },
  ];

  for (const lookup of lookups) {
    const { data, error } = await (supabaseService as any)
      .from("polymarket_market_cache")
      .select("*")
      .eq(lookup.key, lookup.value)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message ?? "MIRROR_GET_FAILED");
    }
    if (data) {
      return fromMirrorRow(data as Record<string, unknown>);
    }
  }

  return null;
}

export async function searchMirroredPolymarketMarkets(
  supabaseService: unknown,
  queryText: string,
  limit = 120
): Promise<PolymarketMarket[]> {
  if (!supabaseService) return [];
  const normalized = sanitizeSearch(queryText.toLowerCase());
  if (normalized.length < 2) return [];
  const safeLimit = clampLimit(limit, 1, 1000);

  const { data, error } = await (supabaseService as any)
    .from("polymarket_market_cache")
    .select("*")
    .ilike("search_text", `%${normalized}%`)
    .order("volume", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(error.message ?? "MIRROR_SEARCH_FAILED");

  return (data ?? [])
    .map((row: Record<string, unknown>) => fromMirrorRow(row))
    .filter((v: PolymarketMarket | null): v is PolymarketMarket => Boolean(v));
}
