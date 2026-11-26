#!/usr/bin/env node
/**
 * Idempotent content-model definition for any EmDash environment (CMS-1).
 *
 *   node scripts/schema/apply.mjs -u http://localhost:4330 [--check] [--json]
 *   EMDASH_URL=https://… EMDASH_TOKEN=… node scripts/schema/apply.mjs
 *
 * Uses the same remote REST API as `emdash schema` / `emdash taxonomy` (the CLI is a thin client over
 * it) because the CLI cannot set `unique`, widget options, or create taxonomy definitions.
 * Existing collections, fields and taxonomies are never modified or deleted; re-running is a no-op.
 *
 * Auth (same order as the CLI): --token / EMDASH_TOKEN, EMDASH_HEADERS (newline-separated
 * "Name: Value", e.g. Cloudflare Access service tokens), or the localhost dev bypass.
 */

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (...names) => {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i >= 0 && args[i + 1]) return args[i + 1];
  }
};
const BASE = (opt("-u", "--url") ?? process.env.EMDASH_URL ?? "http://localhost:4322").replace(/\/$/, "");
const TOKEN = opt("-t", "--token") ?? process.env.EMDASH_TOKEN;
const CHECK = flag("--check");

// ---------------------------------------------------------------------------------------------
// Model. Field `type` values are EmDash field types. `legacy_*` fields hold the legacy key so
// MIG-1 imports are idempotent (look up by legacy_id) and URLs can be rebuilt exactly.
// ---------------------------------------------------------------------------------------------
const str = (slug, label, extra = {}) => ({ slug, label, type: "string", ...extra });
const text = (slug, label, extra = {}) => ({ slug, label, type: "text", ...extra });

const COLLECTIONS = [
  {
    // Exists from the starter seed (title, featured_image, content, excerpt). Not recreated.
    slug: "posts",
    label: "Posts",
    labelSingular: "Post",
    supports: ["drafts", "revisions", "preview", "search", "seo"],
    urlPattern: "/posts/{slug}",
    fields: [
      str("legacy_id", "Legacy ID", { unique: true, indexed: true }), // YYYY/MM/DD/<glob slug>
      str("legacy_date", "Legacy date (YYYY-MM-DD)", { indexed: true, validation: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }),
      text("body_md", "Body (Markdown)", { options: { rows: 30 } }),
      { slug: "adsense", label: "AdSense", type: "boolean" },
      { slug: "series_number", label: "Series number", type: "number" },
      { slug: "legacy_frontmatter_extra", label: "Legacy frontmatter (extra keys, type)", type: "json" },
    ],
  },
  {
    // Podcast episode id (e.g. `--e2iv0jd`) is the content slug and legacy_id => /podcast/<id>/.
    // `embeddings` / `umap2D` are derived by the data pipeline and are not stored in the CMS.
    slug: "podcasts",
    label: "Podcasts",
    labelSingular: "Podcast episode",
    supports: ["drafts", "revisions", "search"],
    urlPattern: "/podcast/{slug}",
    fields: [
      str("title", "Title", { required: true, searchable: true }),
      str("legacy_id", "Legacy episode ID", { unique: true, indexed: true }),
      { slug: "link", label: "Spotify link", type: "url" },
      { slug: "pub_date", label: "Published", type: "datetime", indexed: true, required: true }, // fresh envs only: apply never alters existing fields
      text("description", "Description (HTML)", { searchable: true }),
      text("summary", "Summary", { searchable: true }),
      str("duration", "Duration (HH:MM:SS)"),
      { slug: "audio_url", label: "Audio URL", type: "url" },
      { slug: "image_url", label: "Cover URL", type: "url" },
      { slug: "color_set", label: "Colour set {bgColor,titleColor}", type: "json" },
    ],
  },
  {
    // Legacy gallery id is `MM/DD/name` (contains slashes): slug = id with "/" -> "-" (same rule as
    // the legacy trace SVG basename); legacy_id keeps the original.
    slug: "gallery",
    label: "Gallery",
    labelSingular: "Gallery image",
    supports: ["drafts"],
    routable: false,
    fields: [
      str("title", "Title", { required: true }),
      str("legacy_id", "Legacy ID", { unique: true, indexed: true }),
      str("file", "File key"),
      str("hash", "Content hash"),
      { slug: "image_url", label: "Image URL (Cloudinary)", type: "url" },
      str("doc", "Doc path (/YYYY/MM/DD/slug or /podcast/<id>)", { indexed: true }),
      { slug: "added_at", label: "Added at", type: "datetime" },
      { slug: "color_set", label: "Colour set {bgColor,titleColor}", type: "json" },
    ],
  },
];

// `category` and `tag` exist from the starter seed. Cardinality (single/multi) is not part of an
// EmDash taxonomy definition: "single" is enforced by the importer/templates (one term per post).
const TAXONOMIES = [
  { name: "category", label: "Categories", labelSingular: "Category", hierarchical: false, collections: ["posts"] },
  { name: "tag", label: "Tags", labelSingular: "Tag", hierarchical: false, collections: ["posts"] },
  { name: "series", label: "Series", labelSingular: "Series", hierarchical: false, collections: ["posts"] },
  { name: "city", label: "Cities", labelSingular: "City", hierarchical: false, collections: ["posts"] },
];

// ---------------------------------------------------------------------------------------------
let cookie;
const extraHeaders = {};
for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
  const i = line.indexOf(":");
  if (i > 0) extraHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);

async function api(method, path, body) {
  const headers = { ...extraHeaders, "content-type": "application/json", "x-emdash-request": "1" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  else if (isLocal) {
    if (!cookie) {
      const r = await fetch(`${BASE}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
      cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
      await r.text().catch(() => {});
    }
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(`${BASE}/_emdash/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`);
    err.status = res.status;
    throw err;
  }
  return json?.data ?? json;
}

const log = (kind, msg) => console.log(`${kind.padEnd(7)} ${msg}`);
let changes = 0;

async function ensureCollection(def) {
  let existing;
  try {
    existing = await api("GET", `/schema/collections/${def.slug}?includeFields=true`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const have = new Set((existing?.item?.fields ?? existing?.fields ?? []).map((f) => f.slug));
  if (!existing) {
    changes++;
    log(CHECK ? "WOULD" : "CREATE", `collection ${def.slug}`);
    if (CHECK) return;
    const { fields, ...rest } = def;
    await api("POST", "/schema/collections", rest);
  } else {
    log("ok", `collection ${def.slug}`);
  }
  for (const f of def.fields) {
    if (have.has(f.slug)) {
      log("ok", `  field ${def.slug}.${f.slug}`);
      continue;
    }
    changes++;
    log(CHECK ? "WOULD" : "ADD", `  field ${def.slug}.${f.slug} (${f.type})`);
    if (CHECK) continue;
    await api("POST", `/schema/collections/${def.slug}/fields`, { validation: null, ...f });
  }
}

async function ensureTaxonomy(def) {
  const list = await api("GET", "/taxonomies");
  const existing = (list.taxonomies ?? list).find?.((t) => t.name === def.name);
  if (existing) {
    const missing = def.collections.filter((c) => !(existing.collections ?? []).includes(c));
    log(missing.length ? "WARN" : "ok", `taxonomy ${def.name}${missing.length ? ` (not attached to: ${missing})` : ""}`);
    return;
  }
  changes++;
  log(CHECK ? "WOULD" : "CREATE", `taxonomy ${def.name}`);
  if (!CHECK) await api("POST", "/taxonomies", def);
}

console.log(`EmDash schema apply -> ${BASE}${CHECK ? " (check only)" : ""}`);
for (const c of COLLECTIONS) await ensureCollection(c);
for (const t of TAXONOMIES) await ensureTaxonomy(t);
console.log(`done: ${changes} change(s)${CHECK && changes ? " pending" : ""}`);
process.exit(CHECK && changes ? 1 : 0);
