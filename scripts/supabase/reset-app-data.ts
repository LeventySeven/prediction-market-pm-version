import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CONFIRMATION = (process.env.APP_RESET_CONFIRM || "").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

if (CONFIRMATION !== "RESET_APP_EXCEPT_USERS") {
  throw new Error("Set APP_RESET_CONFIRM=RESET_APP_EXCEPT_USERS to run this script.");
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const PRESERVED_TABLES = ["users"] as const;
const PRESERVED_BUCKETS = new Set(["avatars"]);

type ResetFilter = {
  column: string;
  op: "in" | "neq" | "gt" | "not_null";
  value: unknown;
};

type ResetStep = {
  table: string;
  filter?: ResetFilter;
  batchColumn?: string;
  batchSize?: number;
};

const resetSteps: ResetStep[] = [
  { table: "market_comment_likes", filter: { column: "user_id", op: "not_null", value: null } },
  { table: "market_comments", filter: { column: "id", op: "not_null", value: null } },
  { table: "market_bookmarks", filter: { column: "user_id", op: "not_null", value: null } },
  { table: "market_context", filter: { column: "market_id", op: "neq", value: "" } },
  { table: "wallet_balances", filter: { column: "user_id", op: "not_null", value: null } },
  { table: "user_referrals", filter: { column: "id", op: "not_null", value: null } },
  { table: "user_events", filter: { column: "id", op: "gt", value: 0 } },
  { table: "trade_relay_audit", filter: { column: "id", op: "gt", value: 0 } },
  { table: "api_rate_limits", filter: { column: "key", op: "neq", value: "" } },
  { table: "market_embeddings", filter: { column: "market_id", op: "neq", value: "" } },
  {
    table: "market_candles_1m",
    filter: { column: "market_id", op: "not_null", value: null },
    batchColumn: "market_id",
    batchSize: 10,
  },
  { table: "market_live", filter: { column: "market_id", op: "not_null", value: null } },
  { table: "market_outcomes", filter: { column: "market_id", op: "not_null", value: null } },
  {
    table: "market_catalog",
    filter: { column: "provider", op: "in", value: ["polymarket", "limitless"] },
    batchColumn: "id",
    batchSize: 250,
  },
  { table: "provider_sync_state", filter: { column: "provider", op: "in", value: ["polymarket", "limitless"] } },
  {
    table: "polymarket_market_cache",
    filter: { column: "market_id", op: "neq", value: "" },
    batchColumn: "market_id",
    batchSize: 250,
  },
  { table: "polymarket_sync_state", filter: { column: "scope", op: "neq", value: "" } },
];

const chunkArray = <T>(rows: T[], chunkSize: number): T[][] => {
  if (rows.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }
  return chunks;
};

const applyFilter = (query: any, filter?: ResetFilter) => {
  if (!filter) return query;
  if (filter.op === "in") {
    return query.in(filter.column, filter.value);
  }
  if (filter.op === "gt") {
    return query.gt(filter.column, filter.value);
  }
  if (filter.op === "not_null") {
    return query.not(filter.column, "is", null);
  }
  return query.neq(filter.column, filter.value);
};

const loadBatchKeys = async (
  table: string,
  column: string,
  filter: ResetFilter | undefined,
  batchSize: number
): Promise<Array<string | number>> => {
  let query = (supabase as any).from(table).select(column).limit(batchSize);
  query = applyFilter(query, filter);
  const { data, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message ?? "SELECT_FAILED"}`);
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => row?.[column])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .filter((value, index, arr) => arr.indexOf(value) === index);
};

const deleteBatchKeys = async (
  table: string,
  batchColumn: string,
  keys: Array<string | number>
): Promise<number> => {
  const { error } = await (supabase as any).from(table).delete().in(batchColumn, keys);
  if (!error) return keys.length;

  const message = error.message ?? "DELETE_FAILED";
  if (message.toLowerCase().includes("statement timeout") && keys.length > 1) {
    const midpoint = Math.floor(keys.length / 2);
    const left = keys.slice(0, midpoint);
    const right = keys.slice(midpoint);
    let deleted = 0;
    if (left.length > 0) deleted += await deleteBatchKeys(table, batchColumn, left);
    if (right.length > 0) deleted += await deleteBatchKeys(table, batchColumn, right);
    return deleted;
  }

  throw new Error(`${table}: ${message}`);
};

const applyDelete = async (step: ResetStep) => {
  const { table, filter, batchColumn, batchSize = 250 } = step;

  if (batchColumn) {
    let totalDeleted = 0;
    while (true) {
      const keys = await loadBatchKeys(table, batchColumn, filter, batchSize);
      if (keys.length === 0) break;

      totalDeleted += await deleteBatchKeys(table, batchColumn, keys);
      console.log(`[reset-app-data] cleared ${table} batch (${totalDeleted})`);
    }

    console.log(`[reset-app-data] cleared ${table}`);
    return;
  }

  let query = (supabase as any).from(table).delete();
  query = applyFilter(query, filter);
  const { error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message ?? "DELETE_FAILED"}`);
  }
  console.log(`[reset-app-data] cleared ${table}`);
};

const listBucketFiles = async (bucketId: string, prefix = ""): Promise<string[]> => {
  const files: string[] = [];
  const pageSize = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`storage:${bucketId}:${prefix || "/"}: ${error.message ?? "LIST_FAILED"}`);
    }

    const entries = Array.isArray(data) ? data : [];
    for (const item of entries) {
      const entry = item as unknown as { name?: string; id?: string | null; metadata?: unknown };
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name) continue;

      const isFolder = entry.id == null && entry.metadata == null;
      const childPath = prefix ? `${prefix}/${name}` : name;

      if (isFolder) {
        files.push(...(await listBucketFiles(bucketId, childPath)));
      } else {
        files.push(childPath);
      }
    }

    if (entries.length < pageSize) break;
    offset += pageSize;
  }

  return files;
};

const clearBucket = async (bucketId: string) => {
  const files = await listBucketFiles(bucketId);
  for (const chunk of chunkArray(files, 100)) {
    const { error } = await supabase.storage.from(bucketId).remove(chunk);
    if (error) {
      throw new Error(`storage:${bucketId}: ${error.message ?? "REMOVE_FAILED"}`);
    }
  }
  console.log(`[reset-app-data] cleared storage bucket ${bucketId} (${files.length} objects)`);
};

const clearStorage = async () => {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    throw new Error(`storage:listBuckets: ${error.message ?? "LIST_BUCKETS_FAILED"}`);
  }

  const buckets = Array.isArray(data) ? data : [];
  for (const bucket of buckets) {
    if (!bucket?.id || PRESERVED_BUCKETS.has(bucket.id)) continue;
    await clearBucket(bucket.id);
  }
};

const main = async () => {
  console.log(
    `[reset-app-data] preserving public tables: ${PRESERVED_TABLES.join(", ")}; preserving storage buckets: ${Array.from(PRESERVED_BUCKETS).join(", ")}`
  );

  for (const step of resetSteps) {
    await applyDelete(step);
  }

  await clearStorage();

  console.log("[reset-app-data] app data reset complete");
  console.log("[reset-app-data] next steps:");
  console.log("  1. Bump UPSTASH_CACHE_NAMESPACE before the next deploy or restart.");
  console.log("  2. Restart the app so server-rendered routes do not serve stale warm caches.");
  console.log("  3. Restart the collectors to repopulate market_catalog and market_live.");
  console.log("  4. Leave auth.users and public.users intact; everything else in public was cleared.");
};

void main().catch((error) => {
  console.error("[reset-app-data] failed", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
