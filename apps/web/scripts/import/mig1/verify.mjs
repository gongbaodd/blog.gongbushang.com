#!/usr/bin/env node
/**
 * MIG-1 verification: compares what EmDash holds with the manifest written by import.mjs.
 *
 *   node apps/web/scripts/import/mig1/verify.mjs --url http://localhost:4332 --manifest <file>
 *
 * Checks, for every manifest row: the entry exists once (by legacy_id), is published, and
 * sha256(data.body_md) equals the manifest's expected body hash (legacy_body_sha256 when
 * --rewrite=none, body_sha256 otherwise). Read-only.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const URL_BASE = opt("--url", "http://localhost:4332").replace(/\/$/, "");
const MANIFEST = opt("--manifest");
if (!MANIFEST) {
  console.error("--manifest <file> is required");
  process.exit(2);
}
const rows = JSON.parse(readFileSync(MANIFEST, "utf8")).filter((r) => r.action !== "planned");
const expectField = opt("--expect", "legacy_body_sha256"); // legacy_body_sha256 | body_sha256
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(URL_BASE);
let cookie;
async function api(path) {
  const headers = { "x-emdash-request": "1" };
  if (process.env.EMDASH_TOKEN) headers.authorization = `Bearer ${process.env.EMDASH_TOKEN}`;
  else if (isLocal) {
    if (!cookie) {
      const r = await fetch(`${URL_BASE}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
      cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
      await r.text().catch(() => {});
    }
    headers.cookie = cookie;
  }
  const res = await fetch(`${URL_BASE}/_emdash/api${path}`, { headers });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return json.data;
}

const byLegacy = new Map();
const dupes = [];
let cursor;
do {
  const page = await api(`/content/posts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  for (const item of page.items) {
    const lid = item.data?.legacy_id;
    if (!lid) continue;
    if (byLegacy.has(lid)) dupes.push(lid);
    byLegacy.set(lid, item);
  }
  cursor = page.nextCursor;
} while (cursor);

const problems = { missing: [], notPublished: [], bodyMismatch: [], duplicate: dupes };
let ok = 0;
for (const r of rows) {
  const item = byLegacy.get(r.legacy_id);
  if (!item) {
    problems.missing.push(r.legacy_id);
    continue;
  }
  if (item.status !== "published") problems.notPublished.push(r.legacy_id);
  const got = sha(item.data?.body_md ?? "");
  if (got !== r[expectField]) problems.bodyMismatch.push({ legacy_id: r.legacy_id, got });
  else ok++;
}
const summary = {
  checked: rows.length,
  bodyByteIdentical: ok,
  missing: problems.missing.length,
  notPublished: problems.notPublished.length,
  bodyMismatch: problems.bodyMismatch.length,
  duplicateLegacyIds: dupes.length,
  examples: Object.fromEntries(
    Object.entries(problems).map(([k, v]) => [k, v.slice(0, 3)]),
  ),
};
console.log(JSON.stringify(summary, null, 1));
process.exitCode = summary.missing || summary.notPublished || summary.bodyMismatch || summary.duplicateLegacyIds ? 1 : 0;
