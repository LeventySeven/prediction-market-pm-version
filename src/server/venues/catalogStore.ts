import type { VenueMarket, VenueProvider } from "./types";

const toNowIso = () => new Date().toISOString();

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const normText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const asString = String(value).trim();
  return asString.length > 0 ? asString : null;
};

const normNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (!value || typeof value !== "object") return value ?? null;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    out[key] = normalizeJson(source[key]);
  }
  return out;
};

const stableJson = (value: unknown): string => JSON.stringify(normalizeJson(value ?? {}));

const approxEqual = (a: unknown, b: unknown, epsilon = 1e-9): boolean => {
  const av = normNumber(a);
  const bv = normNumber(b);
  if (av === null || bv === null) return av === bv;
  return Math.abs(av - bv) <= epsilon;
};

type CatalogRowPayload = {
  provider: string;
  provider_market_id: string;
  provider_condition_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  state: string;
  category: string | null;
  source_url: string | null;
  image_url: string | null;
  provider_payload: unknown;
};

type ExistingCatalogRow = CatalogRowPayload & { id: string };

const catalogRowsEqual = (existing: ExistingCatalogRow, next: CatalogRowPayload): boolean =>
  normText(existing.provider_condition_id) === normText(next.provider_condition_id) &&
  normText(existing.slug) === normText(next.slug) &&
  normText(existing.title) === normText(next.title) &&
  normText(existing.description) === normText(next.description) &&
  normText(existing.state) === normText(next.state) &&
  normText(existing.category) === normText(next.category) &&
  normText(existing.source_url) === normText(next.source_url) &&
  normText(existing.image_url) === normText(next.image_url) &&
  stableJson(existing.provider_payload) === stableJson(next.provider_payload);

type OutcomeRowPayload = {
  market_id: string;
  provider_outcome_id: string | null;
  provider_token_id: string | null;
  outcome_key: string;
  title: string;
  sort_order: number;
  probability: number;
  price: number;
  is_active: boolean;
  provider_payload: unknown;
};

type ExistingOutcomeRow = OutcomeRowPayload;

const outcomeRowsEqual = (existing: ExistingOutcomeRow, next: OutcomeRowPayload): boolean =>
  normText(existing.provider_outcome_id) === normText(next.provider_outcome_id) &&
  normText(existing.provider_token_id) === normText(next.provider_token_id) &&
  normText(existing.title) === normText(next.title) &&
  Math.floor(normNumber(existing.sort_order) ?? 0) === Math.floor(normNumber(next.sort_order) ?? 0) &&
  approxEqual(existing.probability, next.probability, 1e-8) &&
  approxEqual(existing.price, next.price, 1e-8) &&
  Boolean(existing.is_active) === Boolean(next.is_active) &&
  stableJson(existing.provider_payload) === stableJson(next.provider_payload);

export const upsertVenueMarketsToCatalog = async (
  supabaseService: unknown,
  markets: VenueMarket[]
): Promise<number> => {
  if (!supabaseService || markets.length === 0) return 0;

  const dedupedMarkets = Array.from(
    new Map(markets.map((market) => [`${market.provider}:${market.providerMarketId}`, market])).values()
  );
  const nowIso = toNowIso();
  const marketRows: CatalogRowPayload[] = dedupedMarkets.map((market) => ({
    provider: market.provider,
    provider_market_id: market.providerMarketId,
    provider_condition_id: market.providerConditionId,
    slug: market.slug,
    title: market.title,
    description: market.description,
    state: market.state,
    category: market.category,
    source_url: market.sourceUrl,
    image_url: market.imageUrl,
    provider_payload: {
      capabilities: market.capabilities,
      resolved_outcome_title: market.resolvedOutcomeTitle,
      created_at: market.createdAt,
      closes_at: market.closesAt,
      expires_at: market.expiresAt,
    },
  }));

  const keyRows = marketRows.map((row) => ({
    provider: row.provider,
    providerMarketId: row.provider_market_id,
  }));

  const existingByKey = new Map<string, ExistingCatalogRow>();
  for (const batch of chunk(keyRows, 250)) {
    const providers = Array.from(new Set(batch.map((item) => item.provider)));
    const providerMarketIds = Array.from(new Set(batch.map((item) => item.providerMarketId)));
    if (providers.length === 0 || providerMarketIds.length === 0) continue;
    const { data, error } = await (supabaseService as any)
      .from("market_catalog")
      .select(
        "id, provider, provider_market_id, provider_condition_id, slug, title, description, state, category, source_url, image_url, provider_payload"
      )
      .in("provider", providers)
      .in("provider_market_id", providerMarketIds);

    if (error) throw new Error(error.message ?? "MARKET_CATALOG_PREFETCH_FAILED");
    for (const row of (data ?? []) as ExistingCatalogRow[]) {
      const provider = String((row as Record<string, unknown>).provider ?? "").trim();
      const providerMarketId = String((row as Record<string, unknown>).provider_market_id ?? "").trim();
      if (!provider || !providerMarketId) continue;
      existingByKey.set(`${provider}:${providerMarketId}`, row);
    }
  }

  const marketRowsToUpsert = marketRows
    .filter((row) => {
      const existing = existingByKey.get(`${row.provider}:${row.provider_market_id}`);
      if (!existing) return true;
      return !catalogRowsEqual(existing, row);
    })
    .map((row) => ({
      ...row,
      source_updated_at: nowIso,
      last_synced_at: nowIso,
    }));

  let written = 0;
  for (const batch of chunk(marketRowsToUpsert, 200)) {
    const { error } = await (supabaseService as any)
      .from("market_catalog")
      .upsert(batch, { onConflict: "provider,provider_market_id" });
    if (error) throw new Error(error.message ?? "MARKET_CATALOG_UPSERT_FAILED");
    written += batch.length;
  }

  const idsByKey = new Map<string, string>();
  for (const [key, existing] of existingByKey.entries()) {
    if (existing.id) idsByKey.set(key, existing.id);
  }

  for (const batch of chunk(keyRows, 250)) {
    const missing = batch.filter((item) => !idsByKey.has(`${item.provider}:${item.providerMarketId}`));
    if (missing.length === 0) continue;
    const providers = Array.from(new Set(missing.map((item) => item.provider)));
    const providerMarketIds = Array.from(new Set(missing.map((item) => item.providerMarketId)));

    const { data, error } = await (supabaseService as any)
      .from("market_catalog")
      .select("id, provider, provider_market_id")
      .in("provider", providers)
      .in("provider_market_id", providerMarketIds);

    if (error) throw new Error(error.message ?? "MARKET_CATALOG_RESOLVE_FAILED");

    for (const row of data ?? []) {
      const provider = String((row as Record<string, unknown>).provider ?? "").trim();
      const providerMarketId = String((row as Record<string, unknown>).provider_market_id ?? "").trim();
      const id = String((row as Record<string, unknown>).id ?? "").trim();
      if (!provider || !providerMarketId || !id) continue;
      idsByKey.set(`${provider}:${providerMarketId}`, id);
    }
  }

  const outcomeRows: OutcomeRowPayload[] = [];

  for (const market of dedupedMarkets) {
    const marketId = idsByKey.get(`${market.provider}:${market.providerMarketId}`);
    if (!marketId) continue;

    for (const outcome of market.outcomes) {
      const outcomeKey =
        outcome.providerOutcomeId ||
        outcome.providerTokenId ||
        outcome.id ||
        `${market.providerMarketId}:${outcome.sortOrder}`;

      outcomeRows.push({
        market_id: marketId,
        provider_outcome_id: outcome.providerOutcomeId ?? null,
        provider_token_id: outcome.providerTokenId ?? null,
        outcome_key: outcomeKey,
        title: outcome.title,
        sort_order: outcome.sortOrder,
        probability: outcome.probability,
        price: outcome.price,
        is_active: outcome.isActive,
        provider_payload: {
          id: outcome.id,
        },
      });
    }
  }

  const existingOutcomesByKey = new Map<string, ExistingOutcomeRow>();
  const marketIds = Array.from(new Set(outcomeRows.map((row) => row.market_id)));
  for (const batch of chunk(marketIds, 500)) {
    if (batch.length === 0) continue;
    const { data, error } = await (supabaseService as any)
      .from("market_outcomes")
      .select(
        "market_id, provider_outcome_id, provider_token_id, outcome_key, title, sort_order, probability, price, is_active, provider_payload"
      )
      .in("market_id", batch);
    if (error) throw new Error(error.message ?? "MARKET_OUTCOMES_PREFETCH_FAILED");
    for (const row of (data ?? []) as ExistingOutcomeRow[]) {
      const marketId = String((row as Record<string, unknown>).market_id ?? "").trim();
      const outcomeKey = String((row as Record<string, unknown>).outcome_key ?? "").trim();
      if (!marketId || !outcomeKey) continue;
      existingOutcomesByKey.set(`${marketId}:${outcomeKey}`, row);
    }
  }

  const outcomeRowsToUpsert = outcomeRows.filter((row) => {
    const existing = existingOutcomesByKey.get(`${row.market_id}:${row.outcome_key}`);
    if (!existing) return true;
    return !outcomeRowsEqual(existing, row);
  });

  for (const batch of chunk(outcomeRowsToUpsert, 400)) {
    const { error } = await (supabaseService as any)
      .from("market_outcomes")
      .upsert(batch, { onConflict: "market_id,outcome_key" });
    if (error) throw new Error(error.message ?? "MARKET_OUTCOMES_UPSERT_FAILED");
  }

  return written;
};

export const upsertProviderSyncState = async (
  supabaseService: unknown,
  payload: {
    provider: VenueProvider;
    scope: string;
    startedAt?: string;
    successAt?: string;
    errorMessage?: string | null;
  }
): Promise<void> => {
  if (!supabaseService) return;

  await (supabaseService as any).from("provider_sync_state").upsert(
    {
      provider: payload.provider,
      scope: payload.scope,
      last_started_at: payload.startedAt ?? null,
      last_success_at: payload.successAt ?? null,
      last_error: payload.errorMessage ?? null,
      updated_at: toNowIso(),
    },
    { onConflict: "provider,scope" }
  );
};
