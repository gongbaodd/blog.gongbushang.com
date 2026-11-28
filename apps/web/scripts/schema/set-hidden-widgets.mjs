#!/usr/bin/env node
/**
 * One-time schema step: hide the legacy and seed fields from the posts editor (GON-269).
 *
 *   node apps/web/scripts/schema/set-hidden-widgets.mjs -u http://localhost:4322            # set the widget on the 4 fields
 *   node apps/web/scripts/schema/set-hidden-widgets.mjs -u http://localhost:4322 --check    # report only (exit 1 when a change is pending)
 *   node apps/web/scripts/schema/set-hidden-widgets.mjs -u http://localhost:4322 --revert   # clear the widgets (fields show again)
 *
 * Sets `widget: "post-fields:hidden"` (the `post-fields` plugin in apps/admin, a widget that renders nothing) on posts.legacy_id,
 * posts.legacy_date, posts.content and posts.excerpt. Only `_emdash_fields.widget` changes: no column is dropped, no value is touched
 * (never delete these fields: `legacy_id`/`legacy_date` are the only copy of the 995 imported URLs and dates). Idempotent.
 * `apply.mjs` / seed.json already set the widget for fresh databases; this is the step for a database created before GON-269.
 *
 * Run it AFTER the admin with the `post-fields` plugin is deployed (otherwise EmDash falls back to the default input, harmless).
 * Safety: a non-loopback URL (the production admin) is refused unless `--yes-remote` is passed. Auth is the same as apply.mjs:
 * --token / EMDASH_TOKEN, EMDASH_HEADERS (Cloudflare Access service token headers), or the localhost dev bypass.
 */

export const WIDGET = "post-fields:hidden";
const COLLECTION = "posts";
export const FIELDS = ["legacy_id", "legacy_date", "content", "excerpt"];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (...names) => {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i >= 0 && args[i + 1]) return args[i + 1];
  }
};

/** Decide what to do from the field's current widget. Pure, for the unit test. */
export function planWidgetChange(currentWidget, { revert = false } = {}) {
  const target = revert ? null : WIDGET;
  const current = currentWidget ?? null;
  return current === target ? { action: "none", target } : { action: "update", target, from: current };
}

export const isLoopback = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

async function main() {
  const BASE = (opt("-u", "--url") ?? process.env.EMDASH_URL ?? "http://localhost:4322").replace(/\/$/, "");
  const TOKEN = opt("-t", "--token") ?? process.env.EMDASH_TOKEN;
  const CHECK = flag("--check");
  const REVERT = flag("--revert");
  const local = isLoopback(BASE);
  if (!local && !flag("--yes-remote")) {
    console.error(`Refusing to change a non-local EmDash (${BASE}). Pass --yes-remote to confirm the production step.`);
    process.exit(2);
  }

  let cookie;
  const extraHeaders = {};
  for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) extraHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  async function api(method, path, body) {
    const headers = { ...extraHeaders, "content-type": "application/json", "x-emdash-request": "1" };
    if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
    else if (local) {
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
      redirect: "manual",
    });
    // Cloudflare Access answers an unauthenticated request with a 302 to its login page (HTML). Never read that as "no fields".
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`${method} ${path} -> ${res.status} redirect to ${new URL(res.headers.get("location") ?? "", BASE).host}: not authenticated (set EMDASH_TOKEN and EMDASH_HEADERS)`);
    }
    if (!(res.headers.get("content-type") ?? "").includes("json")) {
      throw new Error(`${method} ${path} -> ${res.status} ${res.headers.get("content-type") ?? "no content-type"}, expected JSON: not authenticated or not an EmDash admin`);
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`);
    return json?.data ?? json;
  }

  const readFields = async () => {
    const c = await api("GET", `/schema/collections/${COLLECTION}?includeFields=true`);
    return c?.item?.fields ?? c?.fields ?? [];
  };

  console.log(`EmDash hidden post fields -> ${BASE}${CHECK ? " (check only)" : ""}${REVERT ? " (revert)" : ""}`);
  const fields = await readFields();
  let pending = 0;
  for (const slug of FIELDS) {
    const field = fields.find((f) => f.slug === slug);
    if (!field) throw new Error(`${COLLECTION}.${slug} does not exist; run apply.mjs and the seed first`);
    const plan = planWidgetChange(field.widget, { revert: REVERT });
    if (plan.action === "none") {
      console.log(`ok      ${COLLECTION}.${slug} widget = ${plan.target ?? "(default)"}`);
      continue;
    }
    pending++;
    console.log(`${CHECK ? "WOULD" : "UPDATE"}  ${COLLECTION}.${slug} widget ${plan.from ?? "(default)"} -> ${plan.target ?? "(default)"}`);
    if (CHECK) continue;
    await api("PUT", `/schema/collections/${COLLECTION}/fields/${slug}`, { widget: plan.target });
  }
  if (CHECK) process.exit(pending ? 1 : 0);
  if (pending) {
    const after = await readFields();
    const target = REVERT ? null : WIDGET;
    for (const slug of FIELDS) {
      const now = after.find((f) => f.slug === slug);
      if ((now?.widget ?? null) !== target) throw new Error(`verification failed: ${COLLECTION}.${slug} widget is ${now?.widget ?? "(default)"}`);
    }
    console.log(`done    verified ${FIELDS.length} fields`);
  }
}

// Run only when executed directly (the unit test imports planWidgetChange).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
