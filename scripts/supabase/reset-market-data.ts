import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRMATION = (process.env.MARKET_RESET_CONFIRM || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

if (CONFIRMATION !== "RESET_MARKETS") {
  throw new Error("Set MARKET_RESET_CONFIRM=RESET_MARKETS to run this script.");
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const resetSteps: Array<{ table: string; filter?: { column: string; op: "in" | "neq"; value: unknown } }> = [
  { table: "market_candles_1m", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "market_live", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "market_outcomes", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "market_catalog", filter: { column: "provider", op: "in", value: ["polymarket", "limitless"] } },
  { table: "provider_sync_state", filter: { column: "provider", op: "in", value: ["polymarket", "limitless"] } },
  { table: "polymarket_market_ticks", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "polymarket_candles_1m", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "polymarket_market_live", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "polymarket_market_cache", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "polymarket_sync_state", filter: { column: "scope", op: "neq", value: "" } },
];

const applyDelete = async (table: string, filter?: { column: string; op: "in" | "neq"; value: unknown }) => {
  let query = (supabase as any).from(table).delete();
  if (filter) {
    if (filter.op === "in") {
      query = query.in(filter.column, filter.value);
    } else {
      query = query.neq(filter.column, filter.value);
    }
  }
  const { error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message ?? "DELETE_FAILED"}`);
  }
  console.log(`[reset-market-data] cleared ${table}`);
};

const main = async () => {
  for (const step of resetSteps) {
    await applyDelete(step.table, step.filter);
  }

  console.log("[reset-market-data] market data reset complete");
  console.log("[reset-market-data] next steps:");
  console.log("  1. Deploy or start the polymarket collector");
  console.log("  2. Deploy or start the limitless collector");
  console.log("  3. Verify provider_sync_state and market_catalog repopulate");
};

void main().catch((error) => {
  console.error("[reset-market-data] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
