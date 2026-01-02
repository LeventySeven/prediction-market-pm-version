import { readFile } from "node:fs/promises";
import path from "node:path";

type OpenApi = {
  swagger?: string;
  paths?: Record<string, unknown>;
  definitions?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const env = (key: string) => {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
};

const getSupabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
const getSupabaseApiKey = () =>
  env("SUPABASE_SERVICE_ROLE_KEY") ||
  env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
  env("SUPABASE_ANON_KEY") ||
  env("SUPABASE_ANON_SECRET");

const normalizeBaseUrl = (raw: string) => raw.replace(/\/+$/, "");

const tryFetchOpenApi = async (baseUrl: string, apiKey: string) => {
  const candidates = [`${baseUrl}/rest/v1/`, `${baseUrl}/rest/v1`];
  let lastErr: unknown = null;

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/openapi+json",
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastErr = new Error(
          `HTTP ${res.status} ${res.statusText} from ${url}${text ? `: ${text.slice(0, 200)}` : ""}`
        );
        continue;
      }
      return (await res.json()) as OpenApi;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error("Failed to fetch OpenAPI schema from Supabase");
};

const extractResourceNames = (openapi: OpenApi) => {
  const paths = openapi.paths ?? {};
  return Object.keys(paths)
    .map((p) => p.trim())
    .filter((p) => /^\/[a-z_][a-z0-9_]*$/i.test(p))
    .map((p) => p.slice(1))
    .sort();
};

const extractResourceColumnsFromOpenApi = (openapi: OpenApi, resource: string) => {
  const defs = openapi.definitions ?? {};
  const def = isRecord(defs) ? defs[resource] : undefined;
  const props: Record<string, unknown> =
    isRecord(def) && isRecord(def.properties) ? (def.properties as Record<string, unknown>) : {};
  return Object.keys(props).sort();
};

const extractMapKeysFromDatabaseTypes = (ts: string, startMarker: string, endMarker: string) => {
  const startIdx = ts.indexOf(startMarker);
  const endIdx = ts.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];

  const block = ts.slice(startIdx, endIdx);
  const lines = block.split("\n");

  // We start inside `<Marker>: {` (depth 1). We only consider keys at depth==1.
  let depth = 0;
  const keys: string[] = [];

  for (const line of lines) {
    // count braces AFTER matching, so the `assets: {` line is still depth==1 matchable.
    if (depth === 1) {
      const m = line.match(/^\s*([a-zA-Z0-9_]+):\s*{\s*$/);
      if (m?.[1]) keys.push(m[1]);
    }

    const opens = (line.match(/{/g) ?? []).length;
    const closes = (line.match(/}/g) ?? []).length;
    depth += opens - closes;
  }

  return keys;
};

const sliceBetween = (ts: string, startMarker: string, endMarker: string) => {
  const start = ts.indexOf(startMarker);
  const end = ts.indexOf(endMarker);
  if (start === -1 || end === -1 || end <= start) return null;
  return ts.slice(start, end);
};

const extractRowKeysForResource = (tsBlock: string, resource: string) => {
  const re = new RegExp(
    `\\n\\s*${resource}:\\s*\\{[\\s\\S]*?\\n\\s*Row:\\s*\\{([\\s\\S]*?)\\n\\s*\\};`,
    "m"
  );
  const m = tsBlock.match(re);
  if (!m?.[1]) return null;
  const rowBlock = m[1];
  const keys = rowBlock
    .split("\n")
    .map((l) => l.match(/^\s*([a-zA-Z0-9_]+)\s*:/)?.[1])
    .filter((x): x is string => Boolean(x));
  return Array.from(new Set(keys)).sort();
};

async function main() {
  const typesPath = path.join(process.cwd(), "src", "types", "database.ts");
  const rawUrl = getSupabaseUrl();
  const apiKey = getSupabaseApiKey();
  if (!rawUrl || !apiKey) {
    console.error("Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon key).");
    process.exit(1);
  }
  const baseUrl = normalizeBaseUrl(rawUrl);
  const openapi = await tryFetchOpenApi(baseUrl, apiKey);

  const ts = await readFile(typesPath, "utf8");
  const localTables = new Set(extractMapKeysFromDatabaseTypes(ts, "Tables:", "Views:"));
  const localViews = new Set(extractMapKeysFromDatabaseTypes(ts, "Views:", "Functions:"));
  const localResources = new Set([...localTables, ...localViews]);
  const remoteResources = new Set(extractResourceNames(openapi));

  const missingLocally = [...remoteResources].filter((t) => !localResources.has(t)).sort();
  const extraLocally = [...localResources].filter((t) => !remoteResources.has(t)).sort();

  if (missingLocally.length === 0 && extraLocally.length === 0) {
    console.log(
      "Schema check OK: local Database types (Tables + Views) match live Supabase PostgREST resource set"
    );
    // Continue to deeper checks (column sets).
  } else {
    if (missingLocally.length > 0) {
      console.error(
        "Resources present in live Supabase but missing from src/types/database.ts (Tables/Views):"
      );
      for (const t of missingLocally) console.error(`- ${t}`);
    }
    if (extraLocally.length > 0) {
      console.error(
        "Resources present in src/types/database.ts (Tables/Views) but missing from live Supabase:"
      );
      for (const t of extraLocally) console.error(`- ${t}`);
    }
    process.exit(1);
  }

  const tablesBlock = sliceBetween(ts, "Tables:", "Views:");
  const viewsBlock = sliceBetween(ts, "Views:", "Functions:");
  if (!tablesBlock || !viewsBlock) {
    console.error("Failed to parse src/types/database.ts Tables/Views blocks.");
    process.exit(1);
  }

  const resourcesToCheck = [...remoteResources].sort();
  const columnMismatches: { resource: string; missing: string[]; extra: string[] }[] = [];

  for (const resource of resourcesToCheck) {
    const remoteCols = extractResourceColumnsFromOpenApi(openapi, resource);
    if (remoteCols.length === 0) continue; // some endpoints might not expose schema cleanly

    const localCols =
      extractRowKeysForResource(tablesBlock, resource) ?? extractRowKeysForResource(viewsBlock, resource);
    if (!localCols) continue;

    const localSet = new Set(localCols);
    const remoteSet = new Set(remoteCols);

    const missing = remoteCols.filter((c) => !localSet.has(c));
    const extra = localCols.filter((c) => !remoteSet.has(c));
    if (missing.length || extra.length) {
      columnMismatches.push({ resource, missing, extra });
    }
  }

  if (columnMismatches.length === 0) {
    console.log("Column check OK: Row keys in src/types/database.ts match live Supabase column sets");
    return;
  }

  console.error("Column mismatch between live Supabase and src/types/database.ts:");
  for (const m of columnMismatches) {
    console.error(`\n- ${m.resource}`);
    if (m.missing.length) {
      console.error(`  missing locally: ${m.missing.join(", ")}`);
    }
    if (m.extra.length) {
      console.error(`  extra locally: ${m.extra.join(", ")}`);
    }
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


