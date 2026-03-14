import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import OpenAI from "openai";
import type { Database } from "../../src/types/database";

// ---------------------------------------------------------------------------
// Environment & configuration
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required");
}

const BATCH_SIZE = Math.max(1, Math.min(200, Number(process.env.CLASSIFIER_BATCH_SIZE ?? 50)));
const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.CLASSIFIER_POLL_INTERVAL_MS ?? 30_000));
const HEALTH_PORT = Math.max(0, Number(process.env.CLASSIFIER_HEALTH_PORT ?? 8082));
const CONFIDENCE_THRESHOLD = Math.max(0, Math.min(1, Number(process.env.CLASSIFIER_CONFIDENCE_THRESHOLD ?? 0.5)));
const MODEL_NAME = (process.env.CLASSIFIER_MODEL ?? "gpt-5-nano").trim();
const PROMPT_VERSION = (process.env.CLASSIFIER_PROMPT_VERSION ?? "v2").trim();
const CLASSIFIER_VERSION = "ai-tag-classifier-v2026-03-15b";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const TAXONOMY = [
  "crypto",
  "technology",
  "ai",
  "macroeconomics",
  "business",
  "finance",
  "stocks",
  "politics",
  "geopolitics",
  "elections",
  "regulation",
  "science",
  "weather",
  "sports",
  "entertainment",
  "culture",
  "health",
  "energy",
  "legal",
  "world",
] as const;

type TaxonomyTag = (typeof TAXONOMY)[number];

// ---------------------------------------------------------------------------
// Fingerprint helper – builds a lightweight fingerprint from catalog fields
// so we can detect when market data has changed since last classification.
// ---------------------------------------------------------------------------

const buildClassifierFingerprint = (market: CatalogRow, outcomes: OutcomeRow[]): string => {
  const outcomesPart = outcomes
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => `${o.outcome_key}|${o.title}|${o.sort_order}`)
    .join(";");

  return [
    market.title,
    market.description ?? "",
    market.category ?? "",
    market.source_url ?? "",
    market.provider,
    market.state,
    outcomesPart,
  ].join("||");
};

// ---------------------------------------------------------------------------
// Types for DB rows
// ---------------------------------------------------------------------------

type CatalogRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source_url: string | null;
  provider: string;
  state: string;
};

type OutcomeRow = {
  market_id: string;
  outcome_key: string;
  title: string;
  sort_order: number;
};

type ExistingTag = {
  market_id: string;
  snapshot_fingerprint: string;
};

// ---------------------------------------------------------------------------
// Classification prompt
// ---------------------------------------------------------------------------

const buildClassificationPrompt = (
  market: CatalogRow,
  outcomes: OutcomeRow[]
): string => {
  const outcomesList = outcomes.map((o) => o.title).join(", ");
  return `You are a prediction-market classifier. Given the market details below, assign confidence scores (0.0–1.0) for each category in the taxonomy.

Taxonomy: ${TAXONOMY.join(", ")}

Market:
- Title: ${market.title}
- Description: ${market.description ?? "(none)"}
- Native category: ${market.category ?? "(none)"}
- Outcomes: ${outcomesList || "(none)"}
- Source URL: ${market.source_url ?? "(none)"}
- Provider: ${market.provider}

Return a JSON object mapping each taxonomy tag to a confidence score between 0.0 and 1.0. Only include tags where the confidence is meaningfully above zero.`;
};

const RESPONSE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "market_tags",
    strict: true,
    schema: {
      type: "object",
      properties: Object.fromEntries(
        TAXONOMY.map((tag) => [tag, { type: "number" }])
      ),
      required: [...TAXONOMY],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Tracking state for health endpoint
// ---------------------------------------------------------------------------

let lastPollAt = 0;
let lastClassifiedAt = 0;
let totalClassified = 0;
let totalErrors = 0;
let lastError: string | null = null;

// ---------------------------------------------------------------------------
// Core classification loop
// ---------------------------------------------------------------------------

const classifyBatch = async (): Promise<number> => {
  // 1. Fetch a batch of markets from market_catalog
  const { data: markets, error: marketsError } = await supabase
    .from("market_catalog" as any)
    .select("id, title, description, category, source_url, provider, state")
    .eq("state", "open")
    .order("market_created_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (marketsError) {
    throw new Error(`Failed to fetch markets: ${marketsError.message}`);
  }

  const catalogRows = (markets ?? []) as unknown as CatalogRow[];
  if (catalogRows.length === 0) {
    console.log("[ai-tag-classifier] no markets to classify");
    return 0;
  }

  const marketIds = catalogRows.map((m) => m.id);

  // 2. Fetch outcomes for these markets
  const { data: outcomesRaw, error: outcomesError } = await supabase
    .from("market_outcomes" as any)
    .select("market_id, outcome_key, title, sort_order")
    .in("market_id", marketIds);

  if (outcomesError) {
    throw new Error(`Failed to fetch outcomes: ${outcomesError.message}`);
  }

  const outcomesByMarket = new Map<string, OutcomeRow[]>();
  for (const row of (outcomesRaw ?? []) as unknown as OutcomeRow[]) {
    const existing = outcomesByMarket.get(row.market_id) ?? [];
    existing.push(row);
    outcomesByMarket.set(row.market_id, existing);
  }

  // 3. Fetch existing tags for these markets to check fingerprints
  const { data: existingTagsRaw, error: existingTagsError } = await supabase
    .from("market_ai_tags")
    .select("market_id, snapshot_fingerprint")
    .in("market_id", marketIds)
    .eq("prompt_version", PROMPT_VERSION);

  if (existingTagsError) {
    throw new Error(`Failed to fetch existing tags: ${existingTagsError.message}`);
  }

  const existingFingerprintsByMarket = new Map<string, string>();
  for (const row of (existingTagsRaw ?? []) as ExistingTag[]) {
    existingFingerprintsByMarket.set(row.market_id, row.snapshot_fingerprint);
  }

  // 4. Filter to markets that need (re-)classification
  const marketsToClassify: Array<{
    market: CatalogRow;
    outcomes: OutcomeRow[];
    fingerprint: string;
  }> = [];

  for (const market of catalogRows) {
    const outcomes = outcomesByMarket.get(market.id) ?? [];
    const fingerprint = buildClassifierFingerprint(market, outcomes);
    const existingFp = existingFingerprintsByMarket.get(market.id);

    if (existingFp === fingerprint) {
      continue; // already classified with same data
    }

    marketsToClassify.push({ market, outcomes, fingerprint });
  }

  if (marketsToClassify.length === 0) {
    console.log("[ai-tag-classifier] all markets in batch already up-to-date");
    return 0;
  }

  console.log(
    `[ai-tag-classifier] classifying ${marketsToClassify.length} markets out of ${catalogRows.length} fetched`
  );

  // 5. Classify each market via OpenAI
  let classified = 0;

  for (const { market, outcomes, fingerprint } of marketsToClassify) {
    try {
      const prompt = buildClassificationPrompt(market, outcomes);

      const response = await openai.responses.create({
        model: MODEL_NAME,
        input: [{ role: "user", content: prompt }],
        text: {
          format: RESPONSE_SCHEMA,
        },
      });

      const outputText = response.output_text;
      if (!outputText) {
        console.warn(`[ai-tag-classifier] empty response for market ${market.id}`);
        continue;
      }

      const scores: Record<string, number> = JSON.parse(outputText);

      // 6. Filter by confidence threshold and build insert rows
      const tagRows: Array<
        Database["public"]["Tables"]["market_ai_tags"]["Insert"]
      > = [];

      for (const tag of TAXONOMY) {
        const confidence = scores[tag];
        if (typeof confidence !== "number" || !Number.isFinite(confidence)) continue;
        if (confidence < CONFIDENCE_THRESHOLD) continue;

        tagRows.push({
          market_id: market.id,
          tag,
          confidence,
          model: MODEL_NAME,
          prompt_version: PROMPT_VERSION,
          snapshot_fingerprint: fingerprint,
        });
      }

      if (tagRows.length === 0) {
        console.log(
          `[ai-tag-classifier] no tags above threshold for market ${market.id}`
        );
        continue;
      }

      // 7. Delete old tags for this market+prompt_version, then insert new
      await supabase
        .from("market_ai_tags")
        .delete()
        .eq("market_id", market.id)
        .eq("prompt_version", PROMPT_VERSION);

      const { error: insertError } = await supabase
        .from("market_ai_tags")
        .insert(tagRows);

      if (insertError) {
        console.error(
          `[ai-tag-classifier] failed to insert tags for market ${market.id}:`,
          insertError.message
        );
        totalErrors += 1;
        lastError = insertError.message;
        continue;
      }

      classified += 1;
      totalClassified += 1;
      lastClassifiedAt = Date.now();

      console.log(
        `[ai-tag-classifier] classified market ${market.id}: ${tagRows.map((r) => `${r.tag}(${(r.confidence as number).toFixed(2)})`).join(", ")}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ai-tag-classifier] error classifying market ${market.id}:`,
        message
      );
      totalErrors += 1;
      lastError = message;
    }
  }

  return classified;
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const runLoop = async () => {
  console.log(
    `[ai-tag-classifier] starting ${CLASSIFIER_VERSION} model=${MODEL_NAME} prompt=${PROMPT_VERSION} batch=${BATCH_SIZE} interval=${POLL_INTERVAL_MS}ms threshold=${CONFIDENCE_THRESHOLD}`
  );

  while (true) {
    lastPollAt = Date.now();
    try {
      const count = await classifyBatch();
      if (count > 0) {
        console.log(`[ai-tag-classifier] batch done: ${count} markets classified`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[ai-tag-classifier] batch error:", message);
      totalErrors += 1;
      lastError = message;
    }

    await wait(POLL_INTERVAL_MS);
  }
};

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

const startHealthServer = () => {
  if (HEALTH_PORT <= 0) return;

  const server = createServer((req, res) => {
    const path = String(req.url ?? "/");
    if (path !== "/health" && path !== "/ready") {
      res.statusCode = 404;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("not found");
      return;
    }

    const now = Date.now();
    const ready = now - lastPollAt <= Math.max(POLL_INTERVAL_MS * 3, 120_000);

    const payload = {
      version: CLASSIFIER_VERSION,
      ready,
      model: MODEL_NAME,
      promptVersion: PROMPT_VERSION,
      totalClassified,
      totalErrors,
      lastError,
      lastPollAt: lastPollAt > 0 ? new Date(lastPollAt).toISOString() : null,
      lastClassifiedAt:
        lastClassifiedAt > 0 ? new Date(lastClassifiedAt).toISOString() : null,
    };

    res.statusCode = path === "/ready" && !ready ? 503 : 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  });

  server.listen(HEALTH_PORT, () => {
    console.log(
      `[ai-tag-classifier] health probe listening on :${HEALTH_PORT}`
    );
  });
};

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

startHealthServer();
runLoop().catch((err) => {
  console.error("[ai-tag-classifier] fatal error:", err);
  process.exit(1);
});
