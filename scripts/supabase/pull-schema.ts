import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type OpenApi = {
  openapi?: string;
  swagger?: string;
  info?: unknown;
  paths?: Record<string, unknown>;
  definitions?: Record<string, unknown>;
};

type ColumnSnapshot = {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
};

type TableSnapshot = {
  name: string;
  columns: ColumnSnapshot[];
};

type SchemaSnapshot = {
  generatedAt: string;
  supabaseUrl: string;
  schema: "public";
  tables: Record<string, TableSnapshot>;
};

const env = (key: string) => {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
};

const getSupabaseUrl = () =>
  env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");

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
        lastErr = new Error(`HTTP ${res.status} ${res.statusText} from ${url}${text ? `: ${text.slice(0, 200)}` : ""}`);
        continue;
      }

      return (await res.json()) as OpenApi;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr ?? new Error("Failed to fetch OpenAPI schema from Supabase");
};

const refNameFromRef = (ref?: string) => {
  if (!ref) return null;
  const v2 = ref.match(/^#\/definitions\/(.+)$/);
  if (v2?.[1]) return v2[1];
  const v3 = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (v3?.[1]) return v3[1];
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getNested = (value: unknown, keys: string[]): unknown => {
  let cur: unknown = value;
  for (const k of keys) {
    if (!isRecord(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
};

const formatType = (prop: unknown) => {
  const t = isRecord(prop) && typeof prop.type === "string" ? prop.type : "unknown";
  const f = isRecord(prop) && typeof prop.format === "string" ? prop.format : null;
  return f ? `${t}(${f})` : t;
};

const buildSnapshot = (openapi: OpenApi, baseUrl: string): SchemaSnapshot => {
  const paths = openapi.paths ?? {};
  const definitions = openapi.definitions ?? {};

  const tableNames = Object.keys(paths)
    .map((p) => p.trim())
    .filter((p) => /^\/[a-z_][a-z0-9_]*$/i.test(p))
    .map((p) => p.slice(1));

  const tables: Record<string, TableSnapshot> = {};

  for (const table of tableNames) {
    const p = `/${table}`;
    const get = getNested(paths, [p, "get"]);
    const schemaRef =
      getNested(get, ["responses", "200", "schema", "items", "$ref"]) ??
      getNested(get, ["responses", "200", "schema", "$ref"]) ??
      null;

    const schemaName = typeof schemaRef === "string" ? refNameFromRef(schemaRef) : null;
    const schema = schemaName && isRecord(definitions) ? definitions[schemaName] : null;

    const props: Record<string, unknown> =
      isRecord(schema) && isRecord(schema.properties) ? (schema.properties as Record<string, unknown>) : {};
    const required: string[] =
      isRecord(schema) && Array.isArray(schema.required) ? (schema.required.filter((v) => typeof v === "string") as string[]) : [];
    const requiredSet = new Set(required);

    const columns: ColumnSnapshot[] = Object.entries(props).map(([name, prop]) => ({
      name,
      type: formatType(prop),
      nullable: isRecord(prop) && prop.nullable === true ? true : !requiredSet.has(name),
      description: isRecord(prop) && typeof prop.description === "string" ? prop.description : undefined,
    }));

    tables[table] = { name: table, columns };
  }

  return {
    generatedAt: new Date().toISOString(),
    supabaseUrl: baseUrl,
    schema: "public",
    tables,
  };
};

const extractSqlFunctionNames = async () => {
  const dir = path.join(process.cwd(), "db", "functions");
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const entries: { file: string; functions: string[] }[] = [];

    for (const file of files) {
      const full = path.join(dir, file);
      const sql = await readFile(full, "utf8");
      // Supports:
      // - create function place_bet_tx(...)
      // - create or replace function public.place_bet_tx(...)
      // - create or replace function "public"."place_bet_tx"(...)
      const fnRe =
        /create\s+(?:or\s+replace\s+)?function\s+(?:("?[a-zA-Z0-9_]+"?)\.)?(?:"([a-zA-Z0-9_]+)"|([a-zA-Z0-9_]+))\s*\(/gi;
      const fns = [...sql.matchAll(fnRe)]
        .map((m) => m[2] ?? m[3])
        .filter(Boolean);
      entries.push({ file: `db/functions/${file}`, functions: Array.from(new Set(fns)).sort() });
    }
    return entries;
  } catch {
    return [];
  }
};

const renderContext = async (snapshot: SchemaSnapshot) => {
  const resources = Object.values(snapshot.tables).sort((a, b) => a.name.localeCompare(b.name));
  const sqlFns = await extractSqlFunctionNames();

  const lines: string[] = [];
  lines.push(`# Supabase DB Context (public)`);
  lines.push("");
  lines.push(`Generated at: \`${snapshot.generatedAt}\``);
  lines.push(`Supabase URL: \`${snapshot.supabaseUrl}\``);
  lines.push("");
  lines.push(`Refresh: \`bun run supabase:schema\``);
  lines.push("");
  lines.push(`## Resources`);
  lines.push(`Total: **${resources.length}**`);
  lines.push("");

  for (const table of resources) {
    lines.push(`### \`${table.name}\``);
    if (!table.columns || table.columns.length === 0) {
      lines.push(`(No columns found in introspection output)`);
      lines.push("");
      continue;
    }

    for (const col of table.columns) {
      const flags: string[] = [];
      if (!col.nullable) flags.push("NOT NULL");
      if (col.description?.includes("<pk/>")) flags.push("PK");

      const fk = col.description?.match(/<fk\s+table='([^']+)'\s+column='([^']+)'\s*\/>/);
      if (fk) flags.push(`FK → ${fk[1]}.${fk[2]}`);

      const suffix = flags.length ? ` — ${flags.join(", ")}` : "";
      lines.push(`- \`${col.name}\`: \`${col.type}\`${suffix}`);
    }
    lines.push("");
  }

  if (sqlFns.length > 0) {
    lines.push(`## SQL functions in repo`);
    lines.push(`(These are the SQL files you deploy/apply in Supabase; names extracted from the repo, not from introspection.)`);
    lines.push("");
    for (const entry of sqlFns) {
      lines.push(`- \`${entry.file}\``);
      if (entry.functions.length === 0) {
        lines.push(`  - (no functions found)`);
      } else {
        for (const fn of entry.functions) lines.push(`  - \`${fn}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
};

async function main() {
  const rawUrl = getSupabaseUrl();
  const apiKey = getSupabaseApiKey();

  if (!rawUrl) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL in environment.");
    process.exit(1);
  }
  if (!apiKey) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment."
    );
    process.exit(1);
  }

  const baseUrl = normalizeBaseUrl(rawUrl);

  const openapi = await tryFetchOpenApi(baseUrl, apiKey);
  const snapshot = buildSnapshot(openapi, baseUrl);

  const outDir = path.join(process.cwd(), "supabase");
  await mkdir(outDir, { recursive: true });

  const context = await renderContext(snapshot);
  await writeFile(path.join(outDir, "DB_CONTEXT.md"), context);

  // Optional debug artifact (huge). Off by default.
  if (env("SUPABASE_WRITE_OPENAPI") === "1") {
    await writeFile(path.join(outDir, "openapi.public.json"), JSON.stringify(openapi, null, 2));
  }

  const tableCount = Object.keys(snapshot.tables).length;
  console.log(`Supabase DB context updated: ${tableCount} resources -> supabase/DB_CONTEXT.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


