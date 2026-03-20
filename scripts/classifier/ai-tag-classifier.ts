import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import OpenAI from "openai";
import type { Database } from "../../src/types/database";
import {
  TAXONOMY_TAG_IDS,
  CLASSIFIER_OUTPUT_SCHEMA,
  classifierOutputSchema,
  type TaxonomyTagId,
} from "../../src/lib/taxonomy";

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
const MODEL_NAME = (process.env.CLASSIFIER_MODEL ?? "gpt-4.1-mini").trim();
const PROMPT_VERSION = (process.env.CLASSIFIER_PROMPT_VERSION ?? "v3").trim();
const CLASSIFIER_VERSION = "ai-tag-classifier-v2026-03-20";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Fingerprint – detect when market data has changed since last classification
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

const buildFingerprint = (market: CatalogRow, outcomes: OutcomeRow[]): string => {
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
// Classification prompt
// ---------------------------------------------------------------------------

const buildPrompt = (market: CatalogRow, outcomes: OutcomeRow[]): string => {
  const outcomesList = outcomes.map((o) => o.title).join(", ");
  return `You are a prediction-market classifier. Given the market details below, assign a primary tag and up to 4 tags with confidence scores (0.0–1.0).

Taxonomy: ${TAXONOMY_TAG_IDS.join(", ")}

Market:
- Title: ${market.title}
- Description: ${market.description ?? "(none)"}
- Native category: ${market.category ?? "(none)"}
- Outcomes: ${outcomesList || "(none)"}
- Provider: ${market.provider}

Rules:
- primaryTag must be the single best-fit tag for this market.
- tags array: 1 to 4 entries, each with a tag and confidence (0.0-1.0).
- The primaryTag MUST appear in the tags array with the highest confidence.
- Only include tags where confidence is meaningfully above zero.`;
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
  // 1. Fetch batch of open markets
  const { data: markets, error: marketsError } = await supabase
    .from("market_catalog" as any)
    .select("id, title, description, category, source_url, provider, state")
    .eq("state", "open")
    .order("market_created_at", { ascending: false })
    .limit(BATCH_SIZE);

  if (marketsError) throw new Error(`Failed to fetch markets: ${marketsError.message}`);

  const catalogRows = (markets ?? []) as unknown as CatalogRow[];
  if (catalogRows.length === 0) {
    console.log("[classifier] no markets to classify");
    return 0;
  }

  const marketIds = catalogRows.map((m) => m.id);

  // 2+3. Fetch outcomes and existing classifications in parallel
  const [outcomesRes, existingRes] = await Promise.all([
    supabase
      .from("market_outcomes" as any)
      .select("market_id, outcome_key, title, sort_order")
      .in("market_id", marketIds),
    (supabase as any)
      .from("market_ai_classifications")
      .select("market_id, snapshot_fingerprint")
      .in("market_id", marketIds)
      .eq("prompt_version", PROMPT_VERSION),
  ]);

  if (outcomesRes.error) throw new Error(`Failed to fetch outcomes: ${outcomesRes.error.message}`);
  if (existingRes.error) throw new Error(`Failed to fetch classifications: ${existingRes.error.message}`);

  const outcomesByMarket = new Map<string, OutcomeRow[]>();
  for (const row of (outcomesRes.data ?? []) as unknown as OutcomeRow[]) {
    const arr = outcomesByMarket.get(row.market_id) ?? [];
    arr.push(row);
    outcomesByMarket.set(row.market_id, arr);
  }

  const existingFp = new Map<string, string>();
  for (const row of (existingRes.data ?? []) as Array<{ market_id: string; snapshot_fingerprint: string }>) {
    existingFp.set(row.market_id, row.snapshot_fingerprint);
  }

  // 4. Filter to markets needing (re-)classification
  const toClassify: Array<{ market: CatalogRow; outcomes: OutcomeRow[]; fingerprint: string }> = [];
  for (const market of catalogRows) {
    const outcomes = outcomesByMarket.get(market.id) ?? [];
    const fp = buildFingerprint(market, outcomes);
    if (existingFp.get(market.id) === fp) continue;
    toClassify.push({ market, outcomes, fingerprint: fp });
  }

  if (toClassify.length === 0) {
    console.log("[classifier] all markets up-to-date");
    return 0;
  }

  console.log(`[classifier] classifying ${toClassify.length}/${catalogRows.length} markets`);

  // 5. Classify each market
  let classified = 0;

  for (const { market, outcomes, fingerprint } of toClassify) {
    try {
      const response = await openai.responses.create({
        model: MODEL_NAME,
        input: [{ role: "user", content: buildPrompt(market, outcomes) }],
        text: { format: CLASSIFIER_OUTPUT_SCHEMA },
      });

      const outputText = response.output_text;
      if (!outputText) {
        console.warn(`[classifier] empty response for ${market.id}`);
        continue;
      }

      const raw = JSON.parse(outputText);
      // Clamp tags to 1..4 since strict mode doesn't guarantee minItems/maxItems
      if (Array.isArray(raw.tags)) raw.tags = raw.tags.slice(0, 4);
      const parsed = classifierOutputSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(`[classifier] invalid output for ${market.id}: ${parsed.error.message}`);
        continue;
      }

      let { primaryTag, tags } = parsed.data;
      // Ensure primaryTag is in tags array with highest confidence
      if (!tags.some((t) => t.tag === primaryTag)) {
        tags = [{ tag: primaryTag, confidence: 1.0 }, ...tags].slice(0, 4);
      }
      const now = new Date().toISOString();

      // 6. Upsert classification + replace tags in parallel
      // Delete old tags first, then upsert classification + insert new tags together
      await supabase.from("market_ai_tags").delete().eq("market_id", market.id);

      const tagRows: Array<Database["public"]["Tables"]["market_ai_tags"]["Insert"]> = tags.map((t) => ({
        market_id: market.id,
        tag: t.tag,
        confidence: t.confidence,
        model: MODEL_NAME,
        prompt_version: PROMPT_VERSION,
        snapshot_fingerprint: fingerprint,
      }));

      const [classResult, { error: insertError }] = await Promise.all([
        (supabase as any)
          .from("market_ai_classifications")
          .upsert(
            {
              market_id: market.id,
              primary_tag: primaryTag,
              model: MODEL_NAME,
              prompt_version: PROMPT_VERSION,
              snapshot_fingerprint: fingerprint,
              classified_at: now,
            },
            { onConflict: "market_id" }
          ),
        supabase.from("market_ai_tags").insert(tagRows),
      ]);

      if (insertError) {
        console.error(`[classifier] insert tags failed for ${market.id}: ${insertError.message}`);
        totalErrors += 1;
        lastError = insertError.message;
        continue;
      }

      classified += 1;
      totalClassified += 1;
      lastClassifiedAt = Date.now();

      console.log(
        `[classifier] ${market.id}: primary=${primaryTag} tags=${tags.map((t) => `${t.tag}(${t.confidence.toFixed(2)})`).join(", ")}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[classifier] error ${market.id}: ${msg}`);
      totalErrors += 1;
      lastError = msg;
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
    `[classifier] starting ${CLASSIFIER_VERSION} model=${MODEL_NAME} prompt=${PROMPT_VERSION} batch=${BATCH_SIZE} interval=${POLL_INTERVAL_MS}ms`
  );

  while (true) {
    lastPollAt = Date.now();
    try {
      const count = await classifyBatch();
      if (count > 0) console.log(`[classifier] batch done: ${count} classified`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[classifier] batch error:", msg);
      totalErrors += 1;
      lastError = msg;
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
      lastClassifiedAt: lastClassifiedAt > 0 ? new Date(lastClassifiedAt).toISOString() : null,
    };

    res.statusCode = path === "/ready" && !ready ? 503 : 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  });

  server.listen(HEALTH_PORT, () => {
    console.log(`[classifier] health probe on :${HEALTH_PORT}`);
  });
};

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

startHealthServer();
runLoop().catch((err) => {
  console.error("[classifier] fatal:", err);
  process.exit(1);
});
