#!/usr/bin/env node
/**
 * Idempotent: creates the EmDash menu "social" from seed/social-links.json when it does not
 * exist. An existing menu (even with edited or removed items) is never touched.
 *
 *   EMDASH_URL=https://… EMDASH_TOKEN=… node scripts/schema/apply-social-menu.mjs [--check]
 *   (or EMDASH_HEADERS with Cloudflare Access service tokens, same as apply.mjs)
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const BASE = (process.env.EMDASH_URL ?? "http://localhost:4322").replace(/\/$/, "");
const TOKEN = process.env.EMDASH_TOKEN;
const extra = {};
for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
  const i = line.indexOf(":");
  if (i > 0) extra[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE);
let cookie;

async function api(method, path, body) {
  const headers = { ...extra, "content-type": "application/json", "x-emdash-request": "1" };
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

const links = JSON.parse(readFileSync(new URL("../../seed/social-links.json", import.meta.url), "utf8"));
console.log(`EmDash social menu -> ${BASE}${CHECK ? " (check only)" : ""}`);

let exists = true;
try {
  await api("GET", "/menus/social");
} catch (e) {
  if (e.status !== 404) throw e;
  exists = false;
}
if (exists) {
  console.log("exists  menu social (left unchanged)");
  process.exit(0);
}
if (CHECK) {
  console.log("missing menu social");
  process.exit(1);
}
await api("POST", "/menus", { name: "social", label: "Social links" });
for (const l of links) {
  await api("POST", "/menus/social/items", {
    type: "custom",
    label: l.label,
    customUrl: l.url,
    target: "_blank",
    cssClasses: l.icon,
    sortOrder: l.sortOrder,
  });
  console.log(`created item ${l.label}`);
}
console.log("done");
