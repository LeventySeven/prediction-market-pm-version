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
  market_created_at: string;
  closes_at: string;
  expires_at: string;
  market_type: "binary" | "multi_choice";
  resolved_outcome_title: string | null;
  total_volume_usd: number;
  is_fast_market: boolean;
  catalog_bucket: "main" | "fast";
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
  normText((existing as Record<string, unknown>).market_created_at) === normText(next.market_created_at) &&
  normText((existing as Record<string, unknown>).closes_at) === normText(next.closes_at) &&
  normText((existing as Record<string, unknown>).expires_at) === normText(next.expires_at) &&
  normText((existing as Record<string, unknown>).market_type) === normText(next.market_type) &&
  normText((existing as Record<string, unknown>).resolved_outcome_title) === normText(next.resolved_outcome_title) &&
  approxEqual((existing as Record<string, unknown>).total_volume_usd, next.total_volume_usd, 1e-8) &&
  Boolean((existing as Record<string, unknown>).is_fast_market) === next.is_fast_market &&
  normText((existing as Record<string, unknown>).catalog_bucket) === normText(next.catalog_bucket) &&
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

const YES_RE = /^(yes|up|true)\b/i;
const NO_RE = /^(no|down|false)\b/i;
const COMPARE_CLOSE_BUCKET_MS = 15 * 60 * 1000;

const normalizeCompareText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['"`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(will|the|a|an|be|to|of|on|in|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCompareCategory = (value: string | null): string => (normText(value) ?? "").toLowerCase();

const roundCompareCloseIso = (iso: string): string | null => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const rounded = Math.round(ms / COMPARE_CLOSE_BUCKET_MS) * COMPARE_CLOSE_BUCKET_MS;
  return new Date(rounded).toISOString();
};

const buildOutcomeMap = (market: VenueMarket): Record<string, string> | null => {
  if (market.outcomes.length !== 2) return null;
  const out: Record<string, string> = {};
  for (const outcome of market.outcomes) {
    const title = String(outcome.title ?? "").trim();
    const mappedKey = YES_RE.test(title) ? "YES" : NO_RE.test(title) ? "NO" : null;
    const outcomeId =
      normText(outcome.providerOutcomeId) ??
      normText(outcome.providerTokenId) ??
      normText(outcome.id);
    if (!mappedKey || !outcomeId || out[mappedKey]) return null;
    out[mappedKey] = outcomeId;
  }
  return out.YES && out.NO ? out : null;
};

type CompareCandidate = {
  marketId: string;
  provider: VenueProvider;
  normalizedQuestion: string;
  normalizedClosesAt: string;
  category: string;
  outcomeMap: Record<string, string>;
};

const buildCompareCandidate = (market: VenueMarket, marketId: string): CompareCandidate | null => {
  const outcomeMap = buildOutcomeMap(market);
  if (!outcomeMap) return null;
  const normalizedQuestion = normalizeCompareText(market.title);
  const normalizedClosesAt = roundCompareCloseIso(market.closesAt);
  if (!normalizedQuestion || normalizedQuestion.length < 12 || !normalizedClosesAt) return null;
  return {
    marketId,
    provider: market.provider,
    normalizedQuestion,
    normalizedClosesAt,
    category: normalizeCompareCategory(market.category),
    outcomeMap,
  };
};

const compareGroupKey = (candidate: {
  normalizedQuestion: string;
  normalizedClosesAt: string;
  category: string;
}) => [candidate.normalizedQuestion, candidate.normalizedClosesAt, candidate.category].join("|");

const syncCompareGroupsForCatalog = async (
  supabaseService: unknown,
  markets: VenueMarket[],
  idsByKey: Map<string, string>
) => {
  if (!supabaseService) return;

  const touchedMarketIds = Array.from(new Set(Array.from(idsByKey.values()).filter(Boolean)));
  if (touchedMarketIds.length === 0) return;

  const candidates = markets
    .map((market) => {
      const marketId = idsByKey.get(`${market.provider}:${market.providerMarketId}`);
      return marketId ? buildCompareCandidate(market, marketId) : null;
    })
    .filter((row): row is CompareCandidate => Boolean(row));

  const grouped = new Map<string, CompareCandidate[]>();
  for (const candidate of candidates) {
    const key = compareGroupKey(candidate);
    const rows = grouped.get(key) ?? [];
    rows.push(candidate);
    grouped.set(key, rows);
  }

  const matchedGroups = Array.from(grouped.values()).filter((rows) => new Set(rows.map((row) => row.provider)).size >= 2);
  const matchedKeys = new Set(matchedGroups.map((rows) => compareGroupKey(rows[0]!)));

  await (supabaseService as any).from("market_compare_members").delete().in("market_id", touchedMarketIds);
  await (supabaseService as any).from("market_catalog").update({ compare_group_id: null }).in("id", touchedMarketIds);

  if (matchedGroups.length === 0) {
    return;
  }

  const groupRows = matchedGroups.map((rows) => ({
    normalized_question: rows[0]!.normalizedQuestion,
    normalized_closes_at: rows[0]!.normalizedClosesAt,
    category: rows[0]!.category,
    status: "active",
  }));

  const { error: groupUpsertError } = await (supabaseService as any)
    .from("market_compare_groups")
    .upsert(groupRows, { onConflict: "normalized_question,normalized_closes_at,category" });
  if (groupUpsertError) {
    throw new Error(groupUpsertError.message ?? "MARKET_COMPARE_GROUPS_UPSERT_FAILED");
  }

  const normalizedQuestions = Array.from(new Set(groupRows.map((row) => row.normalized_question)));
  const { data: existingGroups, error: groupResolveError } = await (supabaseService as any)
    .from("market_compare_groups")
    .select("id, normalized_question, normalized_closes_at, category")
    .in("normalized_question", normalizedQuestions);
  if (groupResolveError) {
    throw new Error(groupResolveError.message ?? "MARKET_COMPARE_GROUPS_RESOLVE_FAILED");
  }

  const groupIdByKey = new Map<string, string>();
  for (const row of existingGroups ?? []) {
    const id = normText((row as Record<string, unknown>).id);
    const normalizedQuestion = normText((row as Record<string, unknown>).normalized_question);
    const normalizedClosesAt = normText((row as Record<string, unknown>).normalized_closes_at);
    const category = normalizeCompareCategory(normText((row as Record<string, unknown>).category));
    if (!id || !normalizedQuestion || !normalizedClosesAt) continue;
    const key = compareGroupKey({
      normalizedQuestion,
      normalizedClosesAt: new Date(normalizedClosesAt).toISOString(),
      category,
    });
    if (matchedKeys.has(key)) {
      groupIdByKey.set(key, id);
    }
  }

  const memberRows: Array<{
    compare_group_id: string;
    market_id: string;
    provider: VenueProvider;
    outcome_map: Record<string, string>;
    match_confidence: number;
    match_source: string;
  }> = [];
  const marketIdsByGroupId = new Map<string, string[]>();
  for (const rows of matchedGroups) {
    const key = compareGroupKey(rows[0]!);
    const groupId = groupIdByKey.get(key);
    if (!groupId) continue;
    for (const row of rows) {
      memberRows.push({
        compare_group_id: groupId,
        market_id: row.marketId,
        provider: row.provider,
        outcome_map: row.outcomeMap,
        match_confidence: 1,
        match_source: "normalized_exact",
      });
      const marketIds = marketIdsByGroupId.get(groupId) ?? [];
      marketIds.push(row.marketId);
      marketIdsByGroupId.set(groupId, marketIds);
    }
  }

  if (memberRows.length > 0) {
    const { error: memberUpsertError } = await (supabaseService as any)
      .from("market_compare_members")
      .upsert(memberRows, { onConflict: "market_id" });
    if (memberUpsertError) {
      throw new Error(memberUpsertError.message ?? "MARKET_COMPARE_MEMBERS_UPSERT_FAILED");
    }

    for (const [groupId, marketIds] of marketIdsByGroupId.entries()) {
      await (supabaseService as any)
        .from("market_catalog")
        .update({ compare_group_id: groupId })
        .in("id", Array.from(new Set(marketIds)));
    }
  }
};

export const upsertVenueMarketsToCatalog = async (
  supabaseService: unknown,
  markets: VenueMarket[]
): Promise<number> => {
  if (!supabaseService || markets.length === 0) return 0;

  const dedupedMarkets = Array.from(
    new Map(markets.map((market) => [`${market.provider}:${market.providerMarketId}`, market])).values()
  );
  const nowIso = toNowIso();
  const marketRows: CatalogRowPayload[] = dedupedMarkets.map((market) => {
    const providerPayload =
      market.providerPayload && typeof market.providerPayload === "object" && !Array.isArray(market.providerPayload)
        ? market.providerPayload
        : {};

    return {
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
      market_created_at: market.createdAt,
      closes_at: market.closesAt,
      expires_at: market.expiresAt,
      market_type: market.outcomes.length > 2 ? "multi_choice" : "binary",
      resolved_outcome_title: market.resolvedOutcomeTitle,
      total_volume_usd: Math.max(0, Number.isFinite(market.volume) ? market.volume : 0),
      is_fast_market: true,
      catalog_bucket: "main",
      provider_payload: {
        ...providerPayload,
        capabilities: market.capabilities,
        resolved_outcome_title: market.resolvedOutcomeTitle,
        created_at: market.createdAt,
        closes_at: market.closesAt,
        expires_at: market.expiresAt,
        volume: market.volume,
        market_address: market.marketAddress ?? null,
      },
    };
  });

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
        "id, provider, provider_market_id, provider_condition_id, slug, title, description, state, category, source_url, image_url, market_created_at, closes_at, expires_at, market_type, resolved_outcome_title, total_volume_usd, is_fast_market, catalog_bucket, provider_payload"
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

  await syncCompareGroupsForCatalog(supabaseService, dedupedMarkets, idsByKey);

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
    stats?: Record<string, unknown> | null;
  }
): Promise<void> => {
  if (!supabaseService) return;

  const row: Record<string, unknown> = {
    provider: payload.provider,
    scope: payload.scope,
    updated_at: toNowIso(),
  };
  if (payload.startedAt !== undefined) {
    row.last_started_at = payload.startedAt;
  }
  if (payload.successAt !== undefined) {
    row.last_success_at = payload.successAt;
  }
  if (payload.errorMessage !== undefined) {
    row.last_error = payload.errorMessage;
  }
  if (payload.stats !== undefined) {
    row.stats = payload.stats;
  }

  await (supabaseService as any)
    .from("provider_sync_state")
    .upsert(row, { onConflict: "provider,scope" });
};
