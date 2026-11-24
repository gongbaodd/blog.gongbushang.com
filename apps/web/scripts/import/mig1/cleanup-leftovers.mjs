#!/usr/bin/env node
/**
 * MIG-1b: remove the local starter and spike leftovers (REST only).
 *
 *   node apps/web/scripts/import/mig1/cleanup-leftovers.mjs --url http://localhost:4332          # list only
 *   node apps/web/scripts/import/mig1/cleanup-leftovers.mjs --url http://localhost:4332 --execute
 *
 * Terms: deleted only if no legacy post (any post with a legacy_id) is assigned to them. The check
 * reads each legacy post's term assignments from EmDash, so it reflects the live data.
 * Posts: the two spike posts (slugs in SPIKE_SLUGS) are soft-deleted, then permanently removed.
 * Listing always runs first and prints every item before anything is deleted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS, loadYaml, walk } from "../mig0/lib.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const URL_BASE = opt("--url", "http://localhost:4332").replace(/\/$/, "");
const EXECUTE = args.includes("--execute");
const TOKEN = process.env.EMDASH_TOKEN;

const TERM_CANDIDATES = [
  { name: "category", slug: "general" },
  { name: "category", slug: "updates" },
  { name: "tag", slug: "starter" },
  { name: "tag", slug: "example" },
  { name: "tag", slug: "diagram" }, // listed only to show it is kept (legacy uses it)
  { name: "tag", slug: "uml" },
  { name: "tag", slug: "math" },
];
const SPIKE_SLUGS = ["md-spike", "spike-draft"];

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(URL_BASE);
let cookie;
async function api(method, path) {
  const headers = { "x-emdash-request": "1", "content-type": "application/json" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  else if (isLocal) {
    if (!cookie) {
      const r = await fetch(`${URL_BASE}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
      cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
      await r.text().catch(() => {});
    }
    headers.cookie = cookie;
  }
  const res = await fetch(`${URL_BASE}/_emdash/api${path}`, { method, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message ?? ""}`.trim());
  return json.data ?? json;
}

async function allPosts() {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ limit: "100", status: "all" });
    if (cursor) q.set("cursor", cursor);
    const page = await api("GET", `/content/posts?${q}`);
    out.push(...(page.items ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

// Term slugs that legacy posts use, from the legacy source (not from EmDash), per taxonomy.
const legacyTermUse = { category: new Set(), tag: new Set() };
{
  const yaml = loadYaml();
  for (const rel of walk(DOCS).filter((p) => /\.mdx?$/i.test(p))) {
    const m = readFileSync(join(DOCS, ...rel.split("/")), "utf8").match(/(?:^﻿?|^\s*\n)---([\s\S]*?\n)---/);
    if (!m) continue;
    const d = yaml.parse(m[1]) ?? {};
    if (d.category) legacyTermUse.category.add(String(d.category));
    for (const t of d.tag ?? []) legacyTermUse.tag.add(String(t).toLowerCase());
  }
}

// Live check: which legacy posts (by legacy_id) hold each candidate term.
const liveLegacyHolders = new Map();
const posts = await allPosts();
const legacyPosts = posts.filter((p) => p.data?.legacy_id);
for (const p of legacyPosts) {
  for (const name of ["category", "tag"]) {
    const r = await api("GET", `/content/posts/${p.id}/terms/${name}`);
    for (const t of r.terms ?? []) {
      const key = `${name}:${t.slug}`;
      liveLegacyHolders.set(key, (liveLegacyHolders.get(key) ?? 0) + 1);
    }
  }
}

const plan = { terms: [], posts: [] };
for (const c of TERM_CANDIDATES) {
  const key = `${c.name}:${c.slug}`;
  const legacyUse = legacyTermUse[c.name].has(c.slug);
  const holders = liveLegacyHolders.get(key) ?? 0;
  const list = await api("GET", `/taxonomies/${c.name}/terms`);
  const term = (list.terms ?? []).find((t) => t.slug === c.slug);
  const row = { ...c, exists: Boolean(term), count: term?.count ?? 0, legacyPostsUsing: holders, legacySourceUses: legacyUse };
  row.delete = Boolean(term) && !legacyUse && holders === 0;
  plan.terms.push(row);
}

for (const slug of SPIKE_SLUGS) {
  const hit = posts.find((p) => p.slug === slug && !p.data?.legacy_id);
  if (hit) plan.posts.push({ id: hit.id, slug, status: hit.status, title: hit.data?.title });
}

console.log("TERMS (taxonomy, slug, exists, count, legacy source uses, legacy posts holding it, action):");
for (const t of plan.terms) {
  console.log(`  ${t.name} ${JSON.stringify(t.slug)} exists=${t.exists} count=${t.count} legacySource=${t.legacySourceUses} legacyLive=${t.legacyPostsUsing} -> ${t.delete ? "DELETE" : "keep"}`);
}
console.log("POSTS (spike, no legacy_id):");
for (const p of plan.posts) console.log(`  ${p.slug} id=${p.id} status=${p.status} title=${JSON.stringify(p.title)} -> DELETE (soft, then permanent)`);
if (!plan.posts.length) console.log("  none found");

if (!EXECUTE) {
  console.log("list only (pass --execute to delete)");
  process.exit(0);
}

for (const p of plan.posts) {
  await api("DELETE", `/content/posts/${p.id}`);
  await api("DELETE", `/content/posts/${p.id}/permanent`);
  console.log(`deleted post ${p.slug}`);
}
for (const t of plan.terms.filter((x) => x.delete)) {
  await api("DELETE", `/taxonomies/${t.name}/terms/${t.slug}`);
  console.log(`deleted term ${t.name} ${t.slug}`);
}
console.log("done");
