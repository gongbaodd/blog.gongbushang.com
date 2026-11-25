#!/usr/bin/env node
/**
 * MIG-1: legacy post importer (local run first).
 *
 *   node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332 [--limit N] [--dry-run]
 *        [--rewrite=none|map] [--concurrency 4] [--source <_docs dir>] [--upload-result <json>]
 *
 * Reads the legacy `src/content/_docs` markdown (default: the MAIN legacy checkout, see mig0/lib.mjs)
 * and upserts every post into EmDash through the remote REST API (the same API as `emdash content`).
 *
 * Idempotent: posts are keyed on `legacy_id` (`unique` is not enforced by the DB, so the whole
 * collection is listed once per run and matched in memory before any create). Re-running updates
 * changed posts and leaves the rest untouched. All posts are created published (drafts included).
 *
 * --rewrite=none (default): body_md is byte-identical to the legacy body, featured_image is unset.
 * --rewrite=map: only references whose Cloudinary upload succeeded are rewritten, using
 *   mig2/rewrite-map.json. Success is read from --upload-result (default
 *   mig2/upload-result.json): an object { "<public_id>": { "status": "uploaded" | "exists" | ... } },
 *   the same shape as mig2's upload-index.json. Without that file the run stops.
 *
 * Body contract: body_md = the text Astro's glob loader gives as `entry.body` (the source with its
 * `---` frontmatter block removed, the newline after the closing fence kept). The legacy page
 * renders this whole body, H1 included, so the H1 stays. The sha256 of body_md is written to the
 * manifest for verification.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOCS, globId, loadSlugger, loadYaml, walk } from "../mig0/lib.mjs";
import { DELIVERY_BASE } from "../mig2/lib.mjs";
import { cloudinaryPublicId } from "./cloudinary-id.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG2 = join(HERE, "..", "mig2");
const PNPM = join(process.env.LEGACY_ROOT ?? "/Volumes/MacData/github/blog.gongbushang.com", "node_modules/.pnpm");

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("-")) return args[i + 1];
  return dflt;
};
const URL_BASE = (opt("--url", process.env.EMDASH_URL ?? "http://localhost:4332")).replace(/\/$/, "");
const LIMIT = opt("--limit") ? Number(opt("--limit")) : Infinity;
const DRY = flag("--dry-run");
const MATCH = opt("--match", ""); // substring of legacy_id, for targeted tests
const FORCE = flag("--force"); // overwrite entries edited in the admin since our last import
const REWRITE = opt("--rewrite", "none");
const CONCURRENCY = Math.max(1, Math.min(4, Number(opt("--concurrency", "4"))));
const SOURCE = opt("--source", DOCS);
const UPLOAD_RESULT = opt("--upload-result", join(MIG2, "upload-result.json"));
const TOKEN = opt("--token", process.env.EMDASH_TOKEN);
const RUN_TAG = `${new URL(URL_BASE).host.replace(/[^a-z0-9]+/gi, "-")}-${REWRITE}`;
const OUT_DIR = join(tmpdir(), "mig1");
const LOG_FILE = join(OUT_DIR, `${RUN_TAG}.log`);
// A dry run writes its own manifest so it never replaces the record of a real run.
const MANIFEST = join(OUT_DIR, `${RUN_TAG}${flag("--dry-run") ? ".dry-run" : ""}.manifest.json`);

if (!["none", "map"].includes(REWRITE)) {
  console.error(`--rewrite must be none or map (got ${REWRITE})`);
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });
const t0 = Date.now();
const logLine = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`;
  appendFileSync(LOG_FILE, `${line}\n`);
};
const say = (msg) => {
  console.log(msg);
  logLine(msg);
};

// ---------------------------------------------------------------------------------------------
// Legacy parsing (mirrors Astro 7.3.3: @astrojs/internal-helpers parseFrontmatter, "remove" mode)
// ---------------------------------------------------------------------------------------------
const FRONTMATTER_RE = /(?:^﻿?|^\s*\n)(?:---|\+\+\+)([\s\S]*?\n)(?:---|\+\+\+)/;
const KNOWN_KEYS = new Set(["type", "category", "adsense", "tag", "series", "cover", "city"]);

// Same rule as legacy packages/utils/city.ts citySlug().
export function citySlug(city) {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*,\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const PLAIN_TEXT = async () => {
  const fromMd = await import(
    pathToFileURL(join(PNPM, "mdast-util-from-markdown@2.0.3/node_modules/mdast-util-from-markdown/index.js")).href
  );
  const toStr = await import(
    pathToFileURL(join(PNPM, "mdast-util-to-string@4.0.0/node_modules/mdast-util-to-string/index.js")).href
  );
  return { fromMd: fromMd.fromMarkdown, toString: toStr.toString };
};

/** First heading text in document order (legacy `title()` fallback), or undefined. */
function firstHeading(body, md) {
  const tree = md.fromMd(body);
  let found;
  const visit = (node) => {
    if (found !== undefined || !node) return;
    if (node.type === "heading") {
      found = md.toString(node);
      return;
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(tree);
  return found;
}

function parseLegacy(text, yaml) {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { data: {}, body: text, hasFrontmatter: false, fence: null };
  const raw = m[1];
  const fence = text.slice(m.index, m.index + m[0].length).match(/^\s*\n?(---|\+\+\+)/)?.[1] ?? "---";
  const data = yaml.parse(raw) ?? {};
  const body = text.replace(`${fence}${raw}${fence}`, "");
  return { data, body, hasFrontmatter: true, fence };
}

// ---------------------------------------------------------------------------------------------
// Image mapping (--rewrite=map only)
// ---------------------------------------------------------------------------------------------
const rewriteMap = JSON.parse(readFileSync(join(MIG2, "rewrite-map.json"), "utf8"));
let uploadOk = null;
if (REWRITE === "map") {
  if (!existsSync(UPLOAD_RESULT)) {
    console.error(`--rewrite=map needs ${UPLOAD_RESULT}; uploads are pending owner action. Stopping.`);
    process.exit(2);
  }
  const res = JSON.parse(readFileSync(UPLOAD_RESULT, "utf8"));
  uploadOk = new Set(
    Object.entries(res)
      .filter(([, v]) => ["uploaded", "exists"].includes(v?.status))
      .map(([id]) => id),
  );
}

/** Returns the rewrite pairs [{ raw, url, publicId }] for a legacy post path, applying only uploaded assets. */
function rewritePairsFor(rel) {
  if (REWRITE !== "map") return [];
  const entry = rewriteMap.posts[rel];
  if (!entry) return [];
  const pairs = [];
  for (const [raw, url] of Object.entries(entry)) {
    if (!url.startsWith(DELIVERY_BASE)) continue;
    const publicId = url.slice(DELIVERY_BASE.length);
    if (!uploadOk.has(publicId)) continue;
    pairs.push({ raw, url, publicId });
  }
  return pairs;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


function rewriteBody(body, pairs) {
  let out = body;
  let count = 0;
  for (const p of [...pairs].sort((a, b) => b.raw.length - a.raw.length)) {
    const re = new RegExp(`(?<=^|[(\\s"'<=])${escapeRe(p.raw)}(?=$|[)\\s"'>])`, "g");
    out = out.replace(re, () => {
      count++;
      return p.url;
    });
  }
  return { body: out, count };
}

// ---------------------------------------------------------------------------------------------
// Build the desired state for every legacy post
// ---------------------------------------------------------------------------------------------
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function loadPosts() {
  const slug = await loadSlugger();
  const yaml = loadYaml();
  const md = await PLAIN_TEXT();
  const rels = walk(SOURCE).filter((p) => /\.mdx?$/i.test(p));
  const posts = [];
  for (const rel of rels) {
    const parts = rel.split("/");
    const [y, mo, d] = parts;
    const text = readFileSync(join(SOURCE, ...parts), "utf8");
    const legacy = parseLegacy(text, yaml);
    const legacyId = globId(rel, slug);
    const anomalies = [];
    if (!legacy.hasFrontmatter) anomalies.push("no-frontmatter");
    if (legacy.fence === "+++") anomalies.push("toml-frontmatter");
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(mo) || !/^\d{2}$/.test(d)) anomalies.push("folder-not-date");
    const extraKeys = Object.keys(legacy.data).filter((k) => !KNOWN_KEYS.has(k));
    if (extraKeys.length) anomalies.push(`extra-keys:${extraKeys.join("+")}`);

    // Title: legacy title() uses frontmatter title (never present, schema strips it), else first heading,
    // else the last id segment with dashes turned into spaces.
    let title = firstHeading(legacy.body, md);
    let titleSource = "heading";
    if (title === undefined || title.trim() === "") {
      title = legacyId.slice(legacyId.lastIndexOf("/") + 1).replace(/-/g, " ");
      titleSource = "slug-fallback";
      anomalies.push("title-fallback");
    }

    const data = legacy.data;
    const series = data.series && typeof data.series === "object" ? data.series : undefined;
    const tags = (data.tag ?? []).map((t) => String(t).toLocaleLowerCase());
    const cities = (data.city ?? []).map((c) => String(c));
    const citySlugs = cities.map((c) => citySlug(c));
    if (citySlugs.some((s) => s === "")) anomalies.push("empty-city-slug");

    // Cover: featured_image only when the reference is applied (rewrite map + upload succeeded).
    let featured = null;
    let coverState = "none";
    if (data.cover && typeof data.cover.url === "string") {
      const raw = data.cover.url.trim();
      const pairs = rewritePairsFor(rel);
      const hit = pairs.find((p) => p.raw === raw);
      const mapped = Boolean(rewriteMap.posts[rel]?.[raw]);
      if (hit) {
        coverState = "rewritten";
        featured = { provider: "cloudinary", id: hit.publicId, src: hit.url, alt: data.cover.alt ?? "" };
      } else if (raw.startsWith(DELIVERY_BASE)) {
        // Already on our Cloudinary cloud: no upload needed, so it is set directly (MIG-1b decision).
        const publicId = cloudinaryPublicId(raw);
        if (!publicId) anomalies.push("cloudinary-cover-id-empty");
        if (/\/[A-Za-z]{1,3}_[^/]*\//.test(new URL(raw).pathname.replace(/^\/[^/]+\/image\/upload\//, "/"))) {
          anomalies.push("cloudinary-cover-transform-stripped");
        }
        coverState = "cloudinary-direct";
        featured = { provider: "cloudinary", id: publicId, src: raw, alt: data.cover.alt ?? "" };
      } else if (mapped) {
        coverState = "map-entry-not-applied";
      } else {
        coverState = "no-map-entry";
      }
    }

    // Body: legacy text, optionally with applied rewrites.
    let body = legacy.body;
    let rewriteCount = 0;
    const pairs = rewritePairsFor(rel);
    if (pairs.length) {
      const r = rewriteBody(body, pairs);
      body = r.body;
      rewriteCount = r.count;
      // Applied refs that still appear verbatim (boundary miss) are reported, not silently kept.
      const residual = pairs.filter((p) => body.includes(p.raw) && !body.includes(p.url)).length;
      if (residual) anomalies.push(`rewrite-residual:${residual}`);
    }

    posts.push({
      rel,
      rawTags: (data.tag ?? []).map((t) => String(t)),
      isMdx: /\.mdx$/i.test(rel),
      legacyId,
      contentSlug: legacyId.replace(/\//g, "-"),
      legacyDate: `${y}-${mo}-${d}`,
      title,
      titleSource,
      body,
      bodySha256: sha256(body),
      legacyBodySha256: sha256(legacy.body),
      data: {
        title,
        legacy_id: legacyId,
        legacy_date: `${y}-${mo}-${d}`,
        body_md: body,
        adsense: data.adsense === true,
        series_number: series?.number !== undefined ? Number(series.number) : null,
        legacy_frontmatter_extra: { type: data.type ?? null, ...Object.fromEntries(extraKeys.map((k) => [k, data[k]])) },
        featured_image: featured,
      },
      taxonomies: {
        category: data.category ? [String(data.category)] : [],
        tag: [...new Set(tags)],
        series: series?.slug ? [String(series.slug)] : [],
        city: [...new Set(citySlugs.filter(Boolean))],
      },
      terms: {
        category: data.category ? { slug: String(data.category), label: String(data.category) } : null,
        tag: tags.map((t) => ({ slug: t, label: t })),
        series: series?.slug ? { slug: String(series.slug), label: series.name ?? String(series.slug) } : null,
        city: cities.map((c) => ({ slug: citySlug(c), label: c })),
      },
      coverState,
      coverRaw: data.cover?.url ?? null,
      rewriteCount,
      anomalies,
    });
  }
  posts.sort((a, b) => a.legacyId.localeCompare(b.legacyId));
  return posts;
}

// ---------------------------------------------------------------------------------------------
// REST client (same auth as schema/apply.mjs: bearer token, EMDASH_HEADERS, or localhost dev bypass)
// ---------------------------------------------------------------------------------------------
const extraHeaders = {};
for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
  const i = line.indexOf(":");
  if (i > 0) extraHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(URL_BASE);
let cookie;

async function api(method, path, body) {
  const headers = { ...extraHeaders, "content-type": "application/json", "x-emdash-request": "1" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  else if (isLocal) {
    if (!cookie) {
      const r = await fetch(`${URL_BASE}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
      cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
      await r.text().catch(() => {});
    }
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(`${URL_BASE}/_emdash/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`.trim());
    err.status = res.status;
    throw err;
  }
  return json?.data ?? json;
}

/** All posts in the collection (drafts included), keyed by data.legacy_id. Duplicates are reported. */
async function listExistingPosts() {
  const byLegacy = new Map();
  const dupes = [];
  let cursor;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const page = await api("GET", `/content/posts?${q}`);
    for (const item of page.items ?? []) {
      const lid = item.data?.legacy_id;
      if (!lid) continue;
      if (byLegacy.has(lid)) dupes.push({ legacy_id: lid, ids: [byLegacy.get(lid).id, item.id] });
      else byLegacy.set(lid, item);
    }
    cursor = page.nextCursor ?? page.next_cursor ?? undefined;
  } while (cursor);
  return { byLegacy, dupes };
}

/** Flattens a taxonomy term list (children may be nested) into a Map slug -> term. */
function flattenTerms(terms, out = new Map()) {
  for (const t of terms ?? []) {
    out.set(t.slug, t);
    flattenTerms(t.children, out);
  }
  return out;
}

async function listTerms(name) {
  const r = await api("GET", `/taxonomies/${name}/terms`);
  return flattenTerms(r.terms ?? r.items ?? []);
}

async function currentTerms(id, name) {
  const r = await api("GET", `/content/posts/${id}/terms/${name}`);
  return (r.terms ?? r.items ?? []).map((t) => t.slug).sort();
}

const same = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** Compares the fields the importer owns (all of them, so a removed value is cleared). null and undefined both mean "unset". */
function dataDiff(existing, desired) {
  const changed = [];
  for (const k of Object.keys(desired)) {
    const a = existing[k] ?? null;
    const b = desired[k] ?? null;
    if (k === "adsense") {
      if (Boolean(a) !== Boolean(b)) changed.push(k);
    } else if (!same(a, b)) changed.push(k);
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Import stamp and overwrite guard (MIG-1b)
//
// Every write stores legacy_frontmatter_extra._import.hash = sha256 of the owned fields and the
// taxonomy sets we wrote. On the next run the stored content is hashed the same way: if it still
// matches the stamp, nobody edited it since our write and we may update it; if it differs, someone
// edited it in the admin, so we skip it unless --force is given.
// ---------------------------------------------------------------------------------------------
const TAX_NAMES = ["category", "tag", "series", "city"];

function normOwned(d) {
  const extra = { ...(d.legacy_frontmatter_extra ?? {}) };
  delete extra._import;
  const fi = d.featured_image;
  return {
    title: d.title ?? null,
    legacy_id: d.legacy_id ?? null,
    legacy_date: d.legacy_date ?? null,
    body_md: d.body_md ?? null,
    adsense: Boolean(d.adsense),
    series_number: d.series_number ?? null,
    legacy_frontmatter_extra: extra,
    featured_image: fi ? { provider: fi.provider ?? null, id: fi.id ?? null, src: fi.src ?? null, alt: fi.alt ?? "" } : null,
  };
}

/** Hash over owned fields + taxonomy slugs, the same way for what we wrote and what is stored. */
function ownedHash(d, terms) {
  const tax = Object.fromEntries(TAX_NAMES.map((n) => [n, [...(terms[n] ?? [])].sort()]));
  return sha256(JSON.stringify(sortKeys({ data: normOwned(d), terms: tax })));
}

/** The data we write: owned fields plus the stamp (no timestamp, so re-runs produce the same value). */
function withStamp(data, taxonomies) {
  const h = ownedHash(data, taxonomies);
  return { ...data, legacy_frontmatter_extra: { ...data.legacy_frontmatter_extra, _import: { hash: h } } };
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
/**
 * Display label per tag slug (MIG-1c). Legacy keeps each post's frontmatter casing in `data.tag` (JSON
 * cards and NDJSON) and lowercases it only for links, badges and tag pages. EmDash stores one label per
 * term, so the label is the casing most posts use for that slug. Ties go to the casing seen first in
 * legacy_id order (code-point compare, not locale). The slug stays lowercase and never changes.
 * Computed over all posts so that --limit and --match runs agree with a full run.
 */
export function tagLabelMap(posts) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const counts = new Map(); // slug -> Map(raw casing -> count), insertion order = first seen
  for (const p of [...posts].sort((a, b) => cmp(a.legacyId, b.legacyId))) {
    for (const raw of new Set(p.rawTags)) {
      const slug = raw.toLocaleLowerCase();
      if (!counts.has(slug)) counts.set(slug, new Map());
      const byRaw = counts.get(slug);
      byRaw.set(raw, (byRaw.get(raw) ?? 0) + 1);
    }
  }
  const labels = new Map();
  for (const [slug, byRaw] of counts) {
    let best;
    let bestCount = 0;
    for (const [raw, n] of byRaw) {
      if (n > bestCount) {
        best = raw;
        bestCount = n;
      }
    }
    labels.set(slug, best);
  }
  return labels;
}

async function main() {
  const yamlPosts = await loadPosts();
  // MIG-1c: one label per tag term (see tagLabelMap). Posts keep their slugs; only labels change.
  const tagLabels = tagLabelMap(yamlPosts);
  for (const p of yamlPosts) p.terms.tag = p.terms.tag.map((t) => ({ slug: t.slug, label: tagLabels.get(t.slug) ?? t.label }));
  const matched = MATCH ? yamlPosts.filter((p) => p.legacyId.includes(MATCH)) : yamlPosts;
  const posts = matched.slice(0, LIMIT === Infinity ? undefined : LIMIT);

  // Counts of anomalies and cover states across ALL 995 posts (for the report), then the selected subset.
  const anomalyCounts = {};
  for (const p of yamlPosts) for (const a of p.anomalies) anomalyCounts[a.split(":")[0]] = (anomalyCounts[a.split(":")[0]] ?? 0) + 1;
  const coverCounts = {};
  for (const p of yamlPosts) coverCounts[p.coverState] = (coverCounts[p.coverState] ?? 0) + 1;
  const bodyRewriteTotal = yamlPosts.reduce((s, p) => s + p.rewriteCount, 0);
  say(`loaded ${yamlPosts.length} legacy posts (${yamlPosts.filter((p) => p.isMdx).length} mdx), selected ${posts.length}; rewrite=${REWRITE}`);

  // Term plan: union of everything the selected posts reference, with the first label seen.
  const termPlan = new Map(); // name -> Map(slug -> label)
  for (const p of posts) {
    for (const [name, list] of Object.entries(p.terms)) {
      const items = Array.isArray(list) ? list : list ? [list] : [];
      for (const t of items) {
        if (!termPlan.has(name)) termPlan.set(name, new Map());
        const m = termPlan.get(name);
        if (!m.has(t.slug)) m.set(t.slug, t.label);
      }
    }
  }
  const termCount = [...termPlan.values()].reduce((s, m) => s + m.size, 0);

  if (DRY) {
    say(`dry-run: ${posts.length} posts, ${termCount} distinct terms (${[...termPlan].map(([n, m]) => `${n}:${m.size}`).join(", ")})`);
    const casedTags = [...tagLabels].filter(([slug, label]) => label !== slug).length;
    const multiCase = [...new Map(yamlPosts.flatMap((p) => p.rawTags).map((r) => [r, r.toLocaleLowerCase()]))].length;
    say(`tag labels (all posts): ${tagLabels.size} slugs, ${casedTags} with a non-lowercase label; ${multiCase} distinct raw spellings`);
    say(`anomalies (all posts): ${JSON.stringify(anomalyCounts)}`);
    for (const key of Object.keys(anomalyCounts)) {
      const ex = yamlPosts.filter((p) => p.anomalies.some((a) => a.startsWith(key))).slice(0, 3).map((p) => p.legacyId);
      say(`  examples ${key}: ${JSON.stringify(ex)}`);
    }
    for (const key of ["no-map-entry", "map-entry-not-applied", "cloudinary-no-map-entry"]) {
      const ex = yamlPosts.filter((p) => p.coverState === key).slice(0, 3).map((p) => `${p.legacyId} cover=${p.coverRaw}`);
      say(`  examples cover ${key}: ${JSON.stringify(ex)}`);
    }
    say(`cover states (all posts): ${JSON.stringify(coverCounts)}; body refs that would be rewritten (selected): ${posts.reduce((s, p) => s + p.rewriteCount, 0)}`);
    writeFileSync(MANIFEST, JSON.stringify(posts.map(manifestRow), null, 1));
    say(`manifest: ${MANIFEST}`);
    return;
  }

  // 1. Taxonomy terms: create missing (exact slug + label).
  const termCreated = { category: 0, tag: 0, series: 0, city: 0 };
  const termExisting = {};
  const termIndex = {};
  // MIG-1c: only tag labels are reconciled on existing terms (slug never changes). Other taxonomies
  // keep their labels as before; a mismatch there is logged, not changed.
  const RELABEL = new Set(["tag"]);
  let termRelabeled = 0;
  const termMismatch = {};
  for (const [name, wanted] of termPlan) {
    termIndex[name] = await listTerms(name);
    termExisting[name] = termIndex[name].size;
    for (const [slug, label] of wanted) {
      const have = termIndex[name].get(slug);
      if (have) {
        if (have.label === label) continue;
        if (!RELABEL.has(name)) {
          termMismatch[name] = (termMismatch[name] ?? 0) + 1;
          logLine(`term label differs (not changed) ${name} ${JSON.stringify(slug)} stored=${JSON.stringify(have.label)} wanted=${JSON.stringify(label)}`);
          continue;
        }
        await api("PUT", `/taxonomies/${name}/terms/${encodeURIComponent(slug)}`, { label });
        termIndex[name].set(slug, { ...have, label });
        termRelabeled++;
        logLine(`term relabeled ${name} ${JSON.stringify(slug)} ${JSON.stringify(have.label)} -> ${JSON.stringify(label)}`);
        continue;
      }
      await api("POST", `/taxonomies/${name}/terms`, { slug, label });
      termIndex[name].set(slug, { slug, label });
      termCreated[name] = (termCreated[name] ?? 0) + 1;
      logLine(`term created ${name} ${JSON.stringify(slug)} label=${JSON.stringify(label)}`);
    }
  }
  say(
    `terms: created ${JSON.stringify(termCreated)} terms-relabeled ${termRelabeled} label-mismatch-not-changed ${JSON.stringify(termMismatch)} (already present before run: ${JSON.stringify(termExisting)})`,
  );

  // 2. Posts.
  const { byLegacy, dupes } = await listExistingPosts();
  if (dupes.length) say(`WARN duplicate legacy_id rows in EmDash: ${dupes.length} (first: ${JSON.stringify(dupes[0])})`);
  say(`existing posts in EmDash: ${byLegacy.size}`);

  const stats = { created: 0, updated: 0, unchanged: 0, failed: 0, skippedEdited: 0, adopted: 0, forced: 0 };
  const manifest = [];
  const failures = [];
  let done = 0;

  async function handle(p) {
    try {
      const existing = byLegacy.get(p.legacyId);
      const taxonomies = p.taxonomies;
      const writeData = withStamp(p.data, taxonomies);
      if (!existing) {
        const created = await api("POST", "/content/posts", {
          slug: p.contentSlug,
          data: writeData,
          taxonomies,
        });
        const id = created?.item?.id ?? created?.id;
        // REST create leaves the entry as a draft; publish explicitly (all legacy posts are live).
        await api("POST", `/content/posts/${id}/publish`, {});
        stats.created++;
        logLine(`created ${p.legacyId} id=${id}`);
        manifest.push(row(p, "created", id));
        return;
      }
      const id = existing.id;
      const now = {};
      for (const name of TAX_NAMES) now[name] = await currentTerms(id, name);

      // Overwrite guard: stored content must still hash to our stamp, else it was edited in the admin.
      const stamp = existing.data?.legacy_frontmatter_extra?._import?.hash;
      const storedHash = ownedHash(existing.data ?? {}, now);
      let forced = false;
      if (stamp !== undefined && storedHash !== stamp) {
        if (!FORCE) {
          stats.skippedEdited++;
          logLine(`skipped-edited ${p.legacyId} id=${id} (stored content differs from import stamp)`);
          manifest.push(row(p, "skipped-edited", id, [], "edited in admin since last import"));
          return;
        }
        forced = true;
        stats.forced++;
      }
      const adopted = stamp === undefined;

      const changed = dataDiff(existing.data ?? {}, writeData);
      const slugChanged = existing.slug !== p.contentSlug;
      const notPublished = existing.status !== "published";
      const termChanges = TAX_NAMES.filter((name) => !same(now[name], [...p.taxonomies[name]].sort()));
      if (!changed.length && !termChanges.length && !slugChanged && !notPublished) {
        stats.unchanged++;
        manifest.push(row(p, "unchanged", id));
        return;
      }
      const body = { data: writeData, taxonomies };
      if (slugChanged) body.slug = p.contentSlug;
      await api("PUT", `/content/posts/${id}`, body);
      // An edit to a live entry is a draft revision until published; publish so the live row matches.
      await api("POST", `/content/posts/${id}/publish`, {});
      if (adopted) stats.adopted++;
      stats.updated++;
      const why = [adopted ? "adopt-stamp" : "", forced ? "forced" : ""].filter(Boolean).join(",");
      logLine(`updated ${p.legacyId} id=${id} fields=${changed.join(",") || "-"} terms=${termChanges.join(",") || "-"} slug=${slugChanged} status=${existing.status} ${why}`);
      manifest.push(row(p, "updated", id, changed.concat(termChanges.map((t) => `terms:${t}`)), why || undefined));
    } catch (e) {
      stats.failed++;
      failures.push({ legacy_id: p.legacyId, error: String(e.message ?? e).slice(0, 300) });
      logLine(`FAILED ${p.legacyId}: ${e.message}`);
      manifest.push(row(p, "failed", null, [], String(e.message ?? e).slice(0, 300)));
    }
  }

  const queue = [...posts];
  const progressEvery = 50;
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      await handle(p);
      done++;
      if (done % progressEvery === 0 || done === posts.length) {
        say(`progress ${done}/${posts.length} created=${stats.created} updated=${stats.updated} unchanged=${stats.unchanged} failed=${stats.failed} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  const summary = {
    url: URL_BASE,
    rewrite: REWRITE,
    processed: posts.length,
    ...stats,
    termsCreated: termCreated,
    "terms-relabeled": termRelabeled,
    seconds: Math.round((Date.now() - t0) / 1000),
    manifest: MANIFEST,
    log: LOG_FILE,
    anomalyCountsAllPosts: anomalyCounts,
    coverCountsAllPosts: coverCounts,
    bodyRefsRewritten: bodyRewriteTotal,
  };
  say(`SUMMARY ${JSON.stringify(summary)}`);
  if (failures.length) say(`FAILURES ${JSON.stringify(failures.slice(0, 20))}`);
  process.exitCode = stats.failed ? 1 : 0;
}

function row(p, action, id, changed = [], error) {
  return {
    legacy_id: p.legacyId,
    slug: p.contentSlug,
    id,
    action,
    body_sha256: p.bodySha256,
    legacy_body_sha256: p.legacyBodySha256,
    changed,
    ...(error ? { error } : {}),
  };
}
function manifestRow(p) {
  return row(p, "planned", null);
}

main().catch((e) => {
  logLine(`FATAL ${e.stack ?? e}`);
  console.error(e);
  process.exit(1);
});
