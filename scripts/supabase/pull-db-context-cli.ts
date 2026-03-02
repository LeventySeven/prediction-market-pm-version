import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

type ForeignKeyRef = {
  columns: string[];
  targetTable: string;
  targetColumns: string[];
};

type ColumnInfo = {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
  references: ForeignKeyRef | null;
};

type TableInfo = {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  foreignKeys: ForeignKeyRef[];
  checks: string[];
  indexes: string[];
  policies: string[];
  triggers: string[];
  rlsEnabled: boolean;
};

type ParsedContext = {
  extensions: string[];
  enums: Array<{ name: string; values: string[] }>;
  tables: Map<string, TableInfo>;
  views: string[];
  materializedViews: string[];
  functions: string[];
};

type OpenApi = {
  paths?: Record<string, unknown>;
  definitions?: Record<string, unknown>;
};

const normalizeRelation = (value: string): string =>
  value
    .trim()
    .replace(/^only\s+/i, "")
    .replace(/"/g, "")
    .replace(/[;,]+$/g, "")
    .replace(/\s+/g, " ");

const normalizeIdentifier = (value: string): string =>
  value.trim().replace(/"/g, "").replace(/,$/, "");

const splitIdentifierList = (value: string): string[] =>
  value
    .split(",")
    .map((v) => normalizeIdentifier(v))
    .filter(Boolean);

const splitTopLevelComma = (body: string): string[] => {
  const chunks: string[] = [];
  let start = 0;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    const prev = i > 0 ? body[i - 1] : "";

    if (ch === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      chunks.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = body.slice(start).trim();
  if (tail) chunks.push(tail);
  return chunks;
};

const parseForeignKeyInline = (value: string): ForeignKeyRef | null => {
  const m = value.match(/references\s+([^\s(]+)\s*\(([^)]+)\)/i);
  if (!m?.[1] || !m[2]) return null;
  return {
    columns: [],
    targetTable: normalizeRelation(m[1]),
    targetColumns: splitIdentifierList(m[2]),
  };
};

const parseTableConstraint = (
  def: string,
  table: TableInfo
) => {
  const raw = def.replace(/\s+/g, " ").trim();

  const pk = raw.match(/primary key\s*\(([^)]+)\)/i);
  if (pk?.[1]) {
    table.primaryKey = splitIdentifierList(pk[1]);
    return;
  }

  const uq = raw.match(/unique\s*\(([^)]+)\)/i);
  if (uq?.[1]) {
    table.uniqueConstraints.push(splitIdentifierList(uq[1]));
    return;
  }

  const fk = raw.match(/foreign key\s*\(([^)]+)\)\s*references\s+([^\s(]+)\s*\(([^)]+)\)/i);
  if (fk?.[1] && fk[2] && fk[3]) {
    table.foreignKeys.push({
      columns: splitIdentifierList(fk[1]),
      targetTable: normalizeRelation(fk[2]),
      targetColumns: splitIdentifierList(fk[3]),
    });
    return;
  }

  const ck = raw.match(/check\s*\((.+)\)$/i);
  if (ck?.[1]) {
    table.checks.push(ck[1].trim());
  }
};

const parseColumnDef = (def: string): ColumnInfo | null => {
  const m = def.match(/^((?:"[^"]+")|(?:[a-zA-Z_][a-zA-Z0-9_$]*))\s+([\s\S]+)$/);
  if (!m?.[1] || !m[2]) return null;

  const name = normalizeIdentifier(m[1]);
  const rest = m[2].trim();

  const typeMatch = rest.match(
    /^(.+?)(?=\s+(?:collate|default|generated|not|null|constraint|primary|unique|references|check)\b|$)/i
  );
  const type = (typeMatch?.[1] ?? rest).trim();

  const defaultMatch = rest.match(/\bdefault\s+(.+?)(?=\s+(?:collate|generated|not|null|constraint|primary|unique|references|check)\b|$)/i);

  const references = parseForeignKeyInline(rest);

  return {
    name,
    type,
    notNull: /\bnot\s+null\b/i.test(rest),
    defaultValue: defaultMatch?.[1]?.trim() ?? null,
    isPrimaryKey: /\bprimary\s+key\b/i.test(rest),
    isUnique: /\bunique\b/i.test(rest),
    references,
  };
};

const parseCreateTables = (sql: string): Map<string, TableInfo> => {
  const tables = new Map<string, TableInfo>();
  const re = /create\s+table(?:\s+if\s+not\s+exists)?\s+([^\s(]+)\s*\(([^]*?)\)\s*;/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const relation = normalizeRelation(m[1] ?? "");
    const body = m[2] ?? "";
    if (!relation) continue;

    const table: TableInfo = {
      name: relation,
      columns: [],
      primaryKey: [],
      uniqueConstraints: [],
      foreignKeys: [],
      checks: [],
      indexes: [],
      policies: [],
      triggers: [],
      rlsEnabled: false,
    };

    const defs = splitTopLevelComma(body);
    for (const defRaw of defs) {
      const def = defRaw.trim();
      if (!def) continue;

      if (/^(constraint\s+\S+\s+)?(primary\s+key|unique|foreign\s+key|check)\b/i.test(def)) {
        parseTableConstraint(def, table);
        continue;
      }

      const col = parseColumnDef(def);
      if (col) table.columns.push(col);
    }

    tables.set(relation, table);
  }

  for (const table of tables.values()) {
    if (table.primaryKey.length === 0) {
      const inline = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
      if (inline.length > 0) table.primaryKey = inline;
    }

    for (const col of table.columns) {
      if (col.references) {
        table.foreignKeys.push({
          columns: [col.name],
          targetTable: col.references.targetTable,
          targetColumns: col.references.targetColumns,
        });
      }
      if (col.isUnique) {
        table.uniqueConstraints.push([col.name]);
      }
    }
  }

  return tables;
};

const parseStatements = (sql: string, re: RegExp): string[] => {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const statement = (m[0] ?? "").replace(/\s+/g, " ").trim();
    if (statement) found.push(statement);
  }
  return found;
};

const uniqSorted = (items: string[]): string[] => Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));

const buildParsedContext = (sql: string): ParsedContext => {
  const tables = parseCreateTables(sql);

  const extensions = uniqSorted(
    parseStatements(sql, /create\s+extension(?:\s+if\s+not\s+exists)?\s+[^;]+;/gi)
      .map((stmt) => {
        const m = stmt.match(/create\s+extension(?:\s+if\s+not\s+exists)?\s+([^\s;]+)/i);
        return m?.[1] ? normalizeIdentifier(m[1]) : "";
      })
      .filter(Boolean)
  );

  const enums: Array<{ name: string; values: string[] }> = [];
  let em: RegExpExecArray | null;
  const enumRe = /create\s+type\s+([^\s]+)\s+as\s+enum\s*\(([^]*?)\)\s*;/gi;
  while ((em = enumRe.exec(sql)) !== null) {
    const name = normalizeRelation(em[1] ?? "");
    const values = splitTopLevelComma(em[2] ?? "")
      .map((v) => v.trim().replace(/^'/, "").replace(/'$/, ""))
      .filter(Boolean);
    if (name) enums.push({ name, values });
  }

  const views = uniqSorted(
    parseStatements(sql, /create\s+(?:or\s+replace\s+)?view\s+[^\s]+\s+as\s+[^;]+;/gi)
      .map((stmt) => {
        const m = stmt.match(/create\s+(?:or\s+replace\s+)?view\s+([^\s]+)\s+as/i);
        return m?.[1] ? normalizeRelation(m[1]) : "";
      })
      .filter(Boolean)
  );

  const materializedViews = uniqSorted(
    parseStatements(sql, /create\s+materialized\s+view\s+[^\s]+\s+as\s+[^;]+;/gi)
      .map((stmt) => {
        const m = stmt.match(/create\s+materialized\s+view\s+([^\s]+)\s+as/i);
        return m?.[1] ? normalizeRelation(m[1]) : "";
      })
      .filter(Boolean)
  );

  const functions = uniqSorted(
    parseStatements(sql, /create\s+(?:or\s+replace\s+)?function\s+[^\s(]+\s*\(/gi)
      .map((stmt) => {
        const m = stmt.match(/create\s+(?:or\s+replace\s+)?function\s+([^\s(]+)\s*\(/i);
        return m?.[1] ? normalizeRelation(m[1]) : "";
      })
      .filter(Boolean)
  );

  const indexRe = /create\s+(?:unique\s+)?index\s+[^;]+;/gi;
  let im: RegExpExecArray | null;
  while ((im = indexRe.exec(sql)) !== null) {
    const stmt = (im[0] ?? "").replace(/\s+/g, " ").trim();
    const onMatch = stmt.match(/\son\s+([^\s(]+)\s*(?:using\s+\w+\s*)?\(/i);
    const table = onMatch?.[1] ? normalizeRelation(onMatch[1]) : null;
    if (!table) continue;
    const target = tables.get(table);
    if (target) target.indexes.push(stmt);
  }

  const rlsRe = /alter\s+table(?:\s+only)?\s+([^\s]+)\s+enable\s+row\s+level\s+security\s*;/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rlsRe.exec(sql)) !== null) {
    const table = normalizeRelation(rm[1] ?? "");
    const target = tables.get(table);
    if (target) target.rlsEnabled = true;
  }

  const policyRe = /create\s+policy\s+[^;]+;/gi;
  let pm: RegExpExecArray | null;
  while ((pm = policyRe.exec(sql)) !== null) {
    const stmt = (pm[0] ?? "").replace(/\s+/g, " ").trim();
    const onMatch = stmt.match(/\son\s+([^\s]+)\s+/i);
    const table = onMatch?.[1] ? normalizeRelation(onMatch[1]) : null;
    if (!table) continue;
    const target = tables.get(table);
    if (target) target.policies.push(stmt);
  }

  const triggerRe = /create\s+trigger\s+[^;]+;/gi;
  let tm: RegExpExecArray | null;
  while ((tm = triggerRe.exec(sql)) !== null) {
    const stmt = (tm[0] ?? "").replace(/\s+/g, " ").trim();
    const onMatch = stmt.match(/\son\s+([^\s]+)\s+/i);
    const table = onMatch?.[1] ? normalizeRelation(onMatch[1]) : null;
    if (!table) continue;
    const target = tables.get(table);
    if (target) target.triggers.push(stmt);
  }

  for (const table of tables.values()) {
    table.uniqueConstraints = table.uniqueConstraints
      .map((cols) => cols.filter(Boolean))
      .filter((cols) => cols.length > 0)
      .sort((a, b) => a.join(",").localeCompare(b.join(",")));

    table.foreignKeys = table.foreignKeys
      .filter((fk) => fk.columns.length > 0 && fk.targetTable)
      .sort((a, b) => a.columns.join(",").localeCompare(b.columns.join(",")));

    table.indexes = uniqSorted(table.indexes);
    table.policies = uniqSorted(table.policies);
    table.triggers = uniqSorted(table.triggers);
    table.checks = uniqSorted(table.checks);
  }

  return {
    extensions,
    enums: enums.sort((a, b) => a.name.localeCompare(b.name)),
    tables,
    views,
    materializedViews,
    functions,
  };
};

const readLinkedProjectRef = async (cwd: string): Promise<string | null> => {
  const refFile = path.join(cwd, "supabase", ".temp", "project-ref");
  try {
    const raw = await readFile(refFile, "utf8");
    const cleaned = raw.trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
};

const parseProjectRefFromSupabaseUrl = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().trim();
    const suffix = ".supabase.co";
    if (!host.endsWith(suffix)) return null;
    const ref = host.slice(0, host.length - suffix.length).trim();
    if (!/^[a-z0-9]{10,}$/i.test(ref)) return null;
    return ref;
  } catch {
    return null;
  }
};

const getEnv = (name: string): string | null => {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getSupabaseApiKey = (): string | null =>
  getEnv("SUPABASE_SERVICE_ROLE_KEY") ??
  getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
  getEnv("SUPABASE_ANON_KEY");

const toBool = (value: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getNested = (value: unknown, keys: string[]): unknown => {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
};

const refNameFromRef = (ref?: string): string | null => {
  if (!ref) return null;
  const v2 = ref.match(/^#\/definitions\/(.+)$/);
  if (v2?.[1]) return v2[1];
  const v3 = ref.match(/^#\/components\/schemas\/(.+)$/);
  if (v3?.[1]) return v3[1];
  return null;
};

const formatOpenApiType = (prop: unknown): string => {
  if (!isRecord(prop)) return "unknown";
  const type = typeof prop.type === "string" ? prop.type : "unknown";
  const format = typeof prop.format === "string" ? prop.format : null;
  return format ? `${type}(${format})` : type;
};

const inferNotNull = (name: string, prop: unknown, requiredSet: Set<string>): boolean => {
  if (isRecord(prop) && prop.nullable === true) return false;
  return requiredSet.has(name);
};

const parseOpenApiFallback = (openapi: OpenApi): ParsedContext => {
  const tables = new Map<string, TableInfo>();
  const paths = isRecord(openapi.paths) ? openapi.paths : {};
  const definitions = isRecord(openapi.definitions) ? openapi.definitions : {};

  const tableNames = Object.keys(paths)
    .map((p) => p.trim())
    .filter((p) => /^\/[a-z_][a-z0-9_]*$/i.test(p))
    .map((p) => p.slice(1))
    .sort((a, b) => a.localeCompare(b));

  for (const tableName of tableNames) {
    const getNode = getNested(paths[`/${tableName}`], ["get"]);
    const schemaRef =
      getNested(getNode, ["responses", "200", "schema", "items", "$ref"]) ??
      getNested(getNode, ["responses", "200", "schema", "$ref"]);
    const schemaName = typeof schemaRef === "string" ? refNameFromRef(schemaRef) : null;
    const schema = schemaName ? definitions[schemaName] : undefined;

    const props = isRecord(schema) && isRecord(schema.properties)
      ? schema.properties
      : {};
    const required = isRecord(schema) && Array.isArray(schema.required)
      ? schema.required.filter((v): v is string => typeof v === "string")
      : [];
    const requiredSet = new Set(required);

    const columns: ColumnInfo[] = Object.entries(props)
      .map(([name, prop]) => ({
        name,
        type: formatOpenApiType(prop),
        notNull: inferNotNull(name, prop, requiredSet),
        defaultValue: null,
        isPrimaryKey: false,
        isUnique: false,
        references: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    tables.set(tableName, {
      name: tableName,
      columns,
      primaryKey: [],
      uniqueConstraints: [],
      foreignKeys: [],
      checks: [],
      indexes: [],
      policies: [],
      triggers: [],
      rlsEnabled: false,
    });
  }

  return {
    extensions: [],
    enums: [],
    tables,
    views: [],
    materializedViews: [],
    functions: [],
  };
};

const fetchOpenApi = async (supabaseUrl: string, apiKey: string): Promise<OpenApi> => {
  const baseUrl = normalizeBaseUrl(supabaseUrl);
  const candidates = [`${baseUrl}/rest/v1/`, `${baseUrl}/rest/v1`];

  let lastErr: Error | null = null;
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
    } catch (error) {
      lastErr = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastErr ?? new Error("Failed to fetch Supabase OpenAPI schema.");
};

const isDockerRequiredError = (message: string): boolean =>
  /docker daemon|failed to inspect docker image|docker desktop is a prerequisite/i.test(message);

const fetchSchemaDump = async (
  cwd: string,
  dumpPath: string,
  options: { supabaseUrl: string | null; projectRefFromEnv: string | null }
) => {
  const explicitDump = getEnv("SUPABASE_SCHEMA_DUMP_FILE");
  if (explicitDump) {
    const filePath = path.isAbsolute(explicitDump)
      ? explicitDump
      : path.join(cwd, explicitDump);
    return await readFile(filePath, "utf8");
  }

  await mkdir(path.dirname(dumpPath), { recursive: true });

  const args: string[] = ["db", "dump", "--schema", "public", "--file", dumpPath];
  const dbUrl = getEnv("SUPABASE_DB_URL");
  const password = getEnv("SUPABASE_DB_PASSWORD");
  const dbUser = getEnv("SUPABASE_DB_USER") ?? "postgres";
  const dbName = getEnv("SUPABASE_DB_NAME") ?? "postgres";
  const dbPort = getEnv("SUPABASE_DB_PORT") ?? "5432";
  const hasDerivedCreds = Boolean(options.projectRefFromEnv && password);

  if (dbUrl && dbUrl.length > 0) {
    args.push("--db-url", dbUrl);
  } else if (hasDerivedCreds) {
    const encodedPassword = encodeURIComponent(password);
    const dbUrlFromSupabaseUrl = `postgresql://${dbUser}:${encodedPassword}@db.${options.projectRefFromEnv}.supabase.co:${dbPort}/${dbName}?sslmode=require`;
    args.push("--db-url", dbUrlFromSupabaseUrl);
  }

  try {
    await execFileAsync("supabase", args, {
      cwd,
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Failed to run Supabase CLI dump (${args.join(" ")}).`,
        "Make sure one of these is true:",
        "1) SUPABASE_DB_URL is valid",
        "2) SUPABASE_DB_PASSWORD is set and NEXT_PUBLIC_SUPABASE_URL contains your Supabase project ref",
        "3) Supabase CLI is authenticated (`supabase login`) and project is linked (`supabase link --project-ref ...`)",
        `Original error: ${msg}`,
      ].join("\n")
    );
  }

  return await readFile(dumpPath, "utf8");
};

const renderMarkdown = (parsed: ParsedContext, meta: { generatedAt: string; projectRef: string | null; source: string; dumpFile: string; }) => {
  const tables = Array.from(parsed.tables.values()).sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = [];
  lines.push("# Supabase DB Context (public)");
  lines.push("");
  lines.push(`Generated at: \`${meta.generatedAt}\``);
  if (meta.projectRef) {
    lines.push(`Linked Project Ref: \`${meta.projectRef}\``);
  }
  lines.push(`Source: \`${meta.source}\``);
  lines.push(`Schema dump file: \`${meta.dumpFile}\``);
  lines.push("");

  lines.push("## Summary");
  lines.push(`- Extensions: **${parsed.extensions.length}**`);
  lines.push(`- Enums: **${parsed.enums.length}**`);
  lines.push(`- Tables: **${tables.length}**`);
  lines.push(`- Views: **${parsed.views.length}**`);
  lines.push(`- Materialized views: **${parsed.materializedViews.length}**`);
  lines.push(`- Functions: **${parsed.functions.length}**`);
  lines.push("");

  if (parsed.extensions.length > 0) {
    lines.push("## Extensions");
    for (const ext of parsed.extensions) lines.push(`- \`${ext}\``);
    lines.push("");
  }

  if (parsed.enums.length > 0) {
    lines.push("## Enums");
    for (const en of parsed.enums) {
      lines.push(`### \`${en.name}\``);
      if (en.values.length === 0) {
        lines.push("- (no values parsed)");
      } else {
        lines.push(`- Values: ${en.values.map((v) => `\`${v}\``).join(", ")}`);
      }
      lines.push("");
    }
  }

  lines.push("## Tables");
  if (tables.length === 0) {
    lines.push("(No tables parsed)");
    lines.push("");
  } else {
    for (const table of tables) {
      lines.push(`### \`${table.name}\``);
      lines.push(`- Columns: **${table.columns.length}**`);

      for (const col of table.columns) {
        const flags: string[] = [];
        if (col.notNull) flags.push("NOT NULL");
        if (col.defaultValue) flags.push(`DEFAULT ${col.defaultValue}`);
        if (table.primaryKey.includes(col.name) || col.isPrimaryKey) flags.push("PK");
        if (col.isUnique) flags.push("UNIQUE");

        const inlineFk = table.foreignKeys.find((fk) => fk.columns.length === 1 && fk.columns[0] === col.name);
        if (inlineFk) {
          flags.push(`FK -> ${inlineFk.targetTable}(${inlineFk.targetColumns.join(", ")})`);
        }

        const suffix = flags.length > 0 ? ` — ${flags.join(", ")}` : "";
        lines.push(`- \`${col.name}\`: \`${col.type}\`${suffix}`);
      }

      if (table.primaryKey.length > 0) {
        lines.push(`- Primary key: ${table.primaryKey.map((c) => `\`${c}\``).join(", ")}`);
      }

      if (table.uniqueConstraints.length > 0) {
        lines.push("- Unique constraints:");
        for (const uq of table.uniqueConstraints) {
          lines.push(`- (${uq.map((c) => `\`${c}\``).join(", ")})`);
        }
      }

      if (table.foreignKeys.length > 0) {
        lines.push("- Foreign keys:");
        for (const fk of table.foreignKeys) {
          lines.push(
            `- (${fk.columns.map((c) => `\`${c}\``).join(", ")}) -> \`${fk.targetTable}\` (${fk.targetColumns.map((c) => `\`${c}\``).join(", ")})`
          );
        }
      }

      if (table.checks.length > 0) {
        lines.push("- Check constraints:");
        for (const check of table.checks) lines.push(`- \`${check}\``);
      }

      if (table.indexes.length > 0) {
        lines.push("- Indexes:");
        for (const idx of table.indexes) lines.push(`- \`${idx}\``);
      }

      if (table.rlsEnabled || table.policies.length > 0) {
        lines.push(`- RLS enabled: ${table.rlsEnabled ? "yes" : "no"}`);
      }

      if (table.policies.length > 0) {
        lines.push("- Policies:");
        for (const policy of table.policies) lines.push(`- \`${policy}\``);
      }

      if (table.triggers.length > 0) {
        lines.push("- Triggers:");
        for (const trigger of table.triggers) lines.push(`- \`${trigger}\``);
      }

      lines.push("");
    }
  }

  lines.push("## Views");
  if (parsed.views.length === 0) lines.push("(No views parsed)");
  for (const view of parsed.views) lines.push(`- \`${view}\``);
  lines.push("");

  lines.push("## Materialized Views");
  if (parsed.materializedViews.length === 0) lines.push("(No materialized views parsed)");
  for (const view of parsed.materializedViews) lines.push(`- \`${view}\``);
  lines.push("");

  lines.push("## Functions");
  if (parsed.functions.length === 0) lines.push("(No functions parsed)");
  for (const fn of parsed.functions) lines.push(`- \`${fn}\``);
  lines.push("");

  lines.push("## Refresh");
  lines.push("- Run: `bun run supabase:context:cli`");
  lines.push("- Optional: set `SUPABASE_DB_URL` for non-interactive CI usage");
  lines.push("- Optional: set `SUPABASE_SCHEMA_DUMP_FILE=path/to/schema.sql` to rebuild from an existing dump");
  lines.push("");

  return `${lines.join("\n")}\n`;
};

async function main() {
  const cwd = process.cwd();
  const outPath = path.join(cwd, "supabase", "DB_CONTEXT.md");
  const dumpPath = path.join(cwd, "supabase", ".temp", "public_schema.dump.sql");
  const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const projectRefFromEnv = parseProjectRefFromSupabaseUrl(supabaseUrl);
  const apiKey = getSupabaseApiKey();

  let parsed: ParsedContext;
  let source: string;

  try {
    const sql = await fetchSchemaDump(cwd, dumpPath, {
      supabaseUrl,
      projectRefFromEnv,
    });
    parsed = buildParsedContext(sql);
    source = getEnv("SUPABASE_SCHEMA_DUMP_FILE")
      ? "existing schema dump file"
      : getEnv("SUPABASE_DB_URL")
        ? "supabase db dump --db-url"
        : projectRefFromEnv && getEnv("SUPABASE_DB_PASSWORD")
          ? "supabase db dump --db-url (derived from NEXT_PUBLIC_SUPABASE_URL)"
          : "supabase db dump (linked Supabase project)";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const requireSqlDump = toBool(getEnv("SUPABASE_CONTEXT_REQUIRE_SQL_DUMP")) || toBool(getEnv("CI"));
    if (requireSqlDump) {
      throw new Error(
        [
          "Supabase SQL dump mode is required in this environment; OpenAPI fallback is disabled.",
          "Set SUPABASE_DB_URL (or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL project ref) and ensure CLI auth is configured.",
          "",
          `Original error: ${message}`,
        ].join("\n")
      );
    }
    const canFallback = Boolean(supabaseUrl && apiKey);
    if (!canFallback) {
      const dockerHint = isDockerRequiredError(message)
        ? "Supabase CLI dump requires Docker in your current setup."
        : "Supabase CLI dump failed and OpenAPI fallback is not configured.";
      throw new Error(
        [
          dockerHint,
          "To run fallback without Docker/CLI auth, set:",
          "- NEXT_PUBLIC_SUPABASE_URL",
          "- SUPABASE_SERVICE_ROLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "",
          `Original error: ${message}`,
        ].join("\n")
      );
    }

    const openapi = await fetchOpenApi(supabaseUrl!, apiKey!);
    parsed = parseOpenApiFallback(openapi);
    source = isDockerRequiredError(message)
      ? "Supabase REST OpenAPI fallback (CLI requires Docker)"
      : "Supabase REST OpenAPI fallback (CLI dump failed)";
  }

  await mkdir(path.dirname(outPath), { recursive: true });

  const linkedProjectRef = await readLinkedProjectRef(cwd);
  const projectRef = projectRefFromEnv ?? linkedProjectRef;

  const markdown = renderMarkdown(parsed, {
    generatedAt: new Date().toISOString(),
    projectRef,
    source,
    dumpFile: path.relative(cwd, dumpPath),
  });

  await writeFile(outPath, markdown, "utf8");

  console.log(
    [
      "Supabase DB context updated from SQL schema dump.",
      `Tables: ${parsed.tables.size}`,
      `Views: ${parsed.views.length}`,
      `Functions: ${parsed.functions.length}`,
      `Output: ${path.relative(cwd, outPath)}`,
    ].join(" ")
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
