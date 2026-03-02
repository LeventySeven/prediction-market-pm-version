import type { VenueMarket, VenueProvider } from "./types";

const toNowIso = () => new Date().toISOString();

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

export const upsertVenueMarketsToCatalog = async (
  supabaseService: unknown,
  markets: VenueMarket[]
): Promise<number> => {
  if (!supabaseService || markets.length === 0) return 0;

  const nowIso = toNowIso();
  const marketRows = markets.map((market) => ({
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
    },
    source_updated_at: nowIso,
    last_synced_at: nowIso,
  }));

  let written = 0;
  for (const batch of chunk(marketRows, 200)) {
    const { error } = await (supabaseService as any)
      .from("market_catalog")
      .upsert(batch, { onConflict: "provider,provider_market_id" });
    if (error) throw new Error(error.message ?? "MARKET_CATALOG_UPSERT_FAILED");
    written += batch.length;
  }

  const keyRows = markets.map((market) => ({
    provider: market.provider,
    providerMarketId: market.providerMarketId,
  }));

  const idsByKey = new Map<string, string>();

  for (const batch of chunk(keyRows, 250)) {
    const providers = Array.from(new Set(batch.map((item) => item.provider)));
    const providerMarketIds = Array.from(new Set(batch.map((item) => item.providerMarketId)));

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

  const outcomeRows: Array<Record<string, unknown>> = [];

  for (const market of markets) {
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
        provider_outcome_id: outcome.providerOutcomeId,
        provider_token_id: outcome.providerTokenId,
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

  for (const batch of chunk(outcomeRows, 400)) {
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
