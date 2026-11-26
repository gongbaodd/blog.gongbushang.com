#!/usr/bin/env node
/**
 * Build-safe EmDash type generator for `apps/web/emdash-env.d.ts` (CMS-4).
 *
 * Why a wrapper around `emdash types`?
 * In `emdash@1.6.0`:
 *   1. `emdash types` is strictly an HTTP REST client (`GET /_emdash/api/schema?format=typescript`).
 *      It has no `--from-config` / Postgres flag and exits 1 whenever a dev server is not running.
 *   2. The REST endpoint emits bare `export interface ...` blocks into `.emdash/types.ts` and omits
 *      `/// <reference types="emdash/locals" />` and `declare module "emdash" { interface EmDashCollections }`.
 *   3. `emdash`'s offline helper (`project-env-types`) only runs SQLite `:memory:` against `seed/seed.json`
 *      and would drop our CMS-1 collections (`podcasts`, `gallery`) and custom `posts` fields.
 *
 * Resolution order:
 *   1. Live EmDash HTTP server (when `-u/--url` or `EMDASH_URL` is set): reads `GET /_emdash/api/schema`.
 *   2. Direct Postgres introspection (read-only query on `_emdash_collections` + `_emdash_fields`, using
 *      `--db`, `DERIVE_DATABASE_URL`, `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`,
 *      `.dev.vars`, or `wrangler.jsonc` — same order as `scripts/derive/db.ts`).
 *   3. Offline fallback: if `--from-schema` is passed or `emdash-env.d.ts` does not exist, renders from
 *      the canonical CMS-1 + starter schema below; otherwise warns and exits 0 using the committed file
 *      (unless `--strict` is set).
 *
 * Output format matches EmDash's `generateTypesFile()` byte-for-byte so `astro dev` produces zero diff.
 *
 * Usage:
 *   node scripts/gen-types.mjs [--url http://localhost:4322] [--token <tok>] [--output emdash-env.d.ts]
 *   node scripts/gen-types.mjs --from-schema [--check]
 *   node scripts/gen-types.mjs [--check] [--strict]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const webRoot = resolve(__dirname, "..");

const HYPERDRIVE_ENV_KEY = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
const PASCAL_CASE_SPLIT_PATTERN = /[_\-\s]+/;

/**
 * Canonical CMS-1 + starter schema (`apps/web/seed/seed.json` + `apps/web/scripts/schema/apply.mjs`).
 * Collections are ordered alphabetically by slug to match EmDash's `SchemaRegistry.listCollections()`.
 */
export const CANONICAL_COLLECTIONS = [
  {
    slug: "gallery",
    fields: [
      { slug: "title", type: "string", required: true },
      { slug: "legacy_id", type: "string", required: false },
      { slug: "file", type: "string", required: false },
      { slug: "hash", type: "string", required: false },
      { slug: "image_url", type: "url", required: false },
      { slug: "doc", type: "string", required: false },
      { slug: "added_at", type: "datetime", required: false },
      { slug: "color_set", type: "json", required: false },
    ],
  },
  {
    slug: "pages",
    fields: [
      { slug: "title", type: "string", required: true },
      { slug: "content", type: "portableText", required: false },
    ],
  },
  {
    slug: "podcasts",
    fields: [
      { slug: "title", type: "string", required: true },
      { slug: "legacy_id", type: "string", required: false },
      { slug: "link", type: "url", required: false },
      { slug: "pub_date", type: "datetime", required: false },
      { slug: "description", type: "text", required: false },
      { slug: "summary", type: "text", required: false },
      { slug: "duration", type: "string", required: false },
      { slug: "audio_url", type: "url", required: false },
      { slug: "image_url", type: "url", required: false },
      { slug: "color_set", type: "json", required: false },
    ],
  },
  {
    slug: "posts",
    fields: [
      { slug: "title", type: "string", required: true },
      { slug: "featured_image", type: "image", required: false },
      { slug: "content", type: "portableText", required: false },
      { slug: "excerpt", type: "text", required: false },
      { slug: "legacy_id", type: "string", required: false },
      { slug: "legacy_date", type: "string", required: false },
      { slug: "body_md", type: "text", required: false },
      { slug: "adsense", type: "boolean", required: false },
      { slug: "series_number", type: "number", required: false },
      { slug: "legacy_frontmatter_extra", type: "json", required: false },
    ],
  },
];

function pascalCase(str) {
  return str
    .split(PASCAL_CASE_SPLIT_PATTERN)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function singularize(str) {
  if (str.endsWith("ies")) return str.slice(0, -3) + "y";
  if (
    str.endsWith("es") &&
    (str.endsWith("sses") || str.endsWith("xes") || str.endsWith("ches") || str.endsWith("shes"))
  ) {
    return str.slice(0, -2);
  }
  if (str.endsWith("s") && !str.endsWith("ss")) return str.slice(0, -1);
  return str;
}

function uniqueInterfaceNames(collections) {
  const used = new Set();
  const names = new Map();
  for (const collection of collections) {
    const base = pascalCase(singularize(collection.slug));
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base}${suffix}`;
      suffix++;
    }
    used.add(name);
    names.set(collection.slug, name);
  }
  return names;
}

function fieldTypeToTypeScript(field) {
  switch (field.type) {
    case "string":
    case "text":
    case "slug":
    case "url":
    case "datetime":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "select": {
      const options = field.validation?.options;
      if (Array.isArray(options) && options.length > 0) {
        return options.map((o) => `"${o}"`).join(" | ");
      }
      return "string";
    }
    case "multiSelect": {
      const options = field.validation?.options;
      if (Array.isArray(options) && options.length > 0) {
        return `(${options.map((o) => `"${o}"`).join(" | ")})[]`;
      }
      return "string[]";
    }
    case "portableText":
      return "PortableTextBlock[]";
    case "image": {
      const media =
        "{ id: string; src?: string; alt?: string; caption?: string; width?: number; height?: number; filename?: string; mimeType?: string; blurhash?: string; dominantColor?: string; focalX?: number; focalY?: number; provider?: string; previewUrl?: string; meta?: Record<string, unknown> }";
      return `${media.slice(0, -2)}; darkVariant?: ${media} }`;
    }
    case "file":
      return "{ id: string; url?: string; src?: string; filename?: string; mimeType?: string; size?: number; provider?: string; meta?: Record<string, unknown> }";
    case "reference":
      return "string";
    case "json":
      return "unknown";
    case "blocks":
      return "unknown[]";
    default:
      return "unknown";
  }
}

function isStoragelessField(field) {
  return field.type === "reference" && Boolean(field.validation?.relation);
}

/**
 * Render `emdash-env.d.ts` matching EmDash 1.6.0's `generateTypesFile()` byte-for-byte.
 */
export function renderEnvTypes(collections) {
  const lines = [];
  lines.push(`// Generated by EmDash on dev server start`);
  lines.push(`// Do not edit manually`);
  lines.push(``);
  lines.push(`/// <reference types="emdash/locals" />`);
  lines.push(``);

  const needsPortableText = collections.some((c) =>
    (c.fields ?? []).some((f) => f.type === "portableText"),
  );
  const withReferences = collections.filter((c) => (c.fields ?? []).some(isStoragelessField));
  const imports = ["BylineSummary", "ContentBylineCredit", "TaxonomyTerm"];
  if (needsPortableText) imports.push("PortableTextBlock");
  if (withReferences.length > 0) imports.push("ReferencePage");
  lines.push(`import type { ${imports.join(", ")} } from "emdash";`);
  lines.push(``);

  const interfaceNames = uniqueInterfaceNames(collections);
  for (const collection of collections) {
    const interfaceName = interfaceNames.get(collection.slug);
    lines.push(`export interface ${interfaceName} {`);
    lines.push(`  id: string;`);
    lines.push(`  slug: string | null;`);
    lines.push(`  status: string;`);
    for (const field of collection.fields ?? []) {
      if (isStoragelessField(field)) continue;
      const optional = field.required ? "" : "?";
      lines.push(`  ${field.slug}${optional}: ${fieldTypeToTypeScript(field)};`);
    }
    lines.push(`  createdAt: Date;`);
    lines.push(`  updatedAt: Date;`);
    lines.push(`  publishedAt: Date | null;`);
    lines.push(`  byline?: BylineSummary | null;`);
    lines.push(`  bylines?: ContentBylineCredit[];`);
    lines.push(`  terms?: Record<string, TaxonomyTerm[]>;`);
    lines.push(`}`);
    lines.push(``);
  }

  lines.push(`declare module "emdash" {`);
  lines.push(`  interface EmDashCollections {`);
  for (const collection of collections) {
    lines.push(`    ${collection.slug}: ${interfaceNames.get(collection.slug)};`);
  }
  lines.push(`  }`);
  lines.push(`}`);
  return lines.join("\n");
}

function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function resolveDbUrl(explicitUrl) {
  if (explicitUrl) return explicitUrl;
  if (process.env.DERIVE_DATABASE_URL) return process.env.DERIVE_DATABASE_URL;
  if (process.env[HYPERDRIVE_ENV_KEY]) return process.env[HYPERDRIVE_ENV_KEY];

  const devVarsPath = resolve(webRoot, ".dev.vars");
  if (existsSync(devVarsPath)) {
    for (const line of readFileSync(devVarsPath, "utf8").split("\n")) {
      const m = new RegExp(`^${HYPERDRIVE_ENV_KEY}\\s*=\\s*(.*)$`).exec(line.trim());
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }

  const wranglerPath = resolve(webRoot, "wrangler.jsonc");
  if (existsSync(wranglerPath)) {
    const m = /"localConnectionString"\s*:\s*"([^"]+)"/.exec(readFileSync(wranglerPath, "utf8"));
    if (m) return m[1];
  }
  return undefined;
}

async function fetchCollectionsFromHttp(baseUrl, token) {
  const base = baseUrl.replace(/\/$/, "");
  const headers = { "x-emdash-request": "1" };
  for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (isLocal) {
    const r = await fetch(`${base}/_emdash/api/auth/dev-bypass`, {
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    await r.text().catch(() => {});
    if (cookie) headers.cookie = cookie;
  }

  const res = await fetch(`${base}/_emdash/api/schema`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`GET /_emdash/api/schema -> ${res.status}`);
  }
  const json = await res.json();
  const payload = json?.data ?? json;
  const collections = Array.isArray(payload?.collections) ? payload.collections : [];
  if (collections.length === 0) {
    throw new Error("EmDash API returned 0 collections");
  }
  return collections.toSorted((a, b) => a.slug.localeCompare(b.slug));
}

async function fetchCollectionsFromPostgres(connectionString) {
  const pgMod = await import("pg");
  const Client = pgMod.default?.Client ?? pgMod.Client;
  // SEC-09: CA-verified TLS for remote hosts, none for loopback (scripts/admin/pg-tls.mjs).
  const { pgClientConfig } = await import("./admin/pg-tls.mjs");
  const client = new Client({
    ...pgClientConfig(connectionString),
    connectionTimeoutMillis: 3000,
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const colRes = await client.query(
      `SELECT id, slug FROM "_emdash_collections" ORDER BY slug ASC`,
    );
    if (colRes.rows.length === 0) {
      throw new Error("no rows in _emdash_collections");
    }
    const fieldRes = await client.query(
      `SELECT collection_id, slug, type, required, validation
       FROM "_emdash_fields"
       ORDER BY collection_id ASC, sort_order ASC, created_at ASC`,
    );
    await client.query("COMMIT");

    const byCollection = new Map();
    for (const row of fieldRes.rows) {
      const list = byCollection.get(row.collection_id) ?? [];
      list.push({
        slug: row.slug,
        type: row.type,
        required: Boolean(row.required),
        validation: parseJsonMaybe(row.validation),
      });
      byCollection.set(row.collection_id, list);
    }

    return colRes.rows.map((row) => ({
      slug: row.slug,
      fields: byCollection.get(row.id) ?? [],
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const opt = (...names) => {
    for (const n of names) {
      const i = args.indexOf(n);
      if (i >= 0 && args[i + 1]) return args[i + 1];
    }
    return undefined;
  };

  if (flag("--help") || flag("-h")) {
    console.log(
      [
        "Usage: node scripts/gen-types.mjs [options]",
        "",
        "Options:",
        "  -u, --url <url>     EmDash server URL (or EMDASH_URL env)",
        "  -t, --token <tok>   Auth token (or EMDASH_TOKEN env)",
        "      --db <url>      Postgres connection string",
        "  -o, --output <path> Output path (default: emdash-env.d.ts)",
        "      --from-schema   Generate offline from canonical CMS-1 schema",
        "      --check         Verify output matches generated types without writing",
        "      --strict        Exit 1 when DB/server is unreachable instead of warning",
        "  -h, --help          Show this help",
      ].join("\n"),
    );
    return;
  }

  const outputPath = resolve(webRoot, opt("-o", "--output") ?? "emdash-env.d.ts");
  const checkOnly = flag("--check");
  const strict = flag("--strict");
  const fromSchema = flag("--from-schema");
  const emdashUrl = opt("-u", "--url") ?? process.env.EMDASH_URL;
  const emdashToken = opt("-t", "--token") ?? process.env.EMDASH_TOKEN;
  const explicitDb = opt("--db");

  let collections;
  let source;

  if (fromSchema) {
    collections = CANONICAL_COLLECTIONS;
    source = "canonical CMS-1 schema";
  } else {
    const errors = [];

    if (emdashUrl) {
      try {
        collections = await fetchCollectionsFromHttp(emdashUrl, emdashToken);
        source = `EmDash API (${emdashUrl})`;
      } catch (err) {
        errors.push(`HTTP ${emdashUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!collections) {
      const dbUrl = resolveDbUrl(explicitDb);
      if (dbUrl) {
        try {
          collections = await fetchCollectionsFromPostgres(dbUrl);
          const u = new URL(dbUrl);
          source = `Postgres (${u.hostname}:${u.port || "5432"}${u.pathname})`;
        } catch (err) {
          errors.push(`Postgres: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        errors.push("no Postgres connection string configured");
      }
    }

    if (!collections) {
      if (existsSync(outputPath) && !strict) {
        console.warn(
          `[gen-types] WARN: EmDash schema source unavailable (${errors.join("; ")}). Keeping committed ${outputPath}.`,
        );
        return;
      }
      if (strict) {
        console.error(
          `[gen-types] ERROR: EmDash schema source unavailable (${errors.join("; ")}).`,
        );
        process.exit(1);
      }
      console.warn(
        `[gen-types] WARN: ${outputPath} missing and DB unavailable (${errors.join("; ")}); generating from canonical CMS-1 schema.`,
      );
      collections = CANONICAL_COLLECTIONS;
      source = "canonical CMS-1 schema (offline fallback)";
    }
  }

  const rendered = renderEnvTypes(collections);
  const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : undefined;

  if (checkOnly) {
    if (existing !== rendered) {
      console.error(
        `[gen-types] OUT OF DATE: ${outputPath} differs from ${source}. Run \`node scripts/gen-types.mjs\` to update.`,
      );
      process.exit(1);
    }
    console.log(
      `[gen-types] ok: ${outputPath} matches ${source} (${collections.length} collections)`,
    );
    return;
  }

  if (existing === rendered) {
    console.log(
      `[gen-types] unchanged: ${outputPath} already matches ${source} (${collections.length} collections)`,
    );
    return;
  }

  writeFileSync(outputPath, rendered, "utf8");
  console.log(`[gen-types] wrote ${outputPath} from ${source} (${collections.length} collections)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[gen-types] ERROR:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
