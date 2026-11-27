#!/usr/bin/env node
/**
 * One-time schema step for the Markdown editor widget (GON-249).
 *
 *   node apps/web/scripts/schema/set-body-widget.mjs -u http://localhost:4322            # set the widget on posts.body_md
 *   node apps/web/scripts/schema/set-body-widget.mjs -u http://localhost:4322 --check    # report only (exit 1 when a change is pending)
 *   node apps/web/scripts/schema/set-body-widget.mjs -u http://localhost:4322 --revert   # clear the widget (back to the default textarea)
 *
 * `apply.mjs` never modifies existing fields, so a database created before GON-249 needs this PATCH. The field type stays `text`, so the
 * stored bytes are untouched: only `_emdash_fields.widget` changes. The widget itself ships in apps/admin (plugin `markdown-editor`).
 *
 * Safety: a non-loopback URL (the production admin) is refused unless `--yes-remote` is passed. Auth is the same as apply.mjs:
 * --token / EMDASH_TOKEN, EMDASH_HEADERS (Cloudflare Access service token headers), or the localhost dev bypass.
 */

export const WIDGET = "markdown-editor:markdownEditor";
const COLLECTION = "posts";
const FIELD = "body_md";

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
    const res = await fetch(`${BASE}/_emdash/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`);
    return json?.data ?? json;
  }

  console.log(`EmDash body_md widget -> ${BASE}${CHECK ? " (check only)" : ""}${REVERT ? " (revert)" : ""}`);
  const collection = await api("GET", `/schema/collections/${COLLECTION}?includeFields=true`);
  const field = (collection?.item?.fields ?? collection?.fields ?? []).find((f) => f.slug === FIELD);
  if (!field) throw new Error(`${COLLECTION}.${FIELD} does not exist; run apply.mjs first`);
  if (field.type !== "text") throw new Error(`${COLLECTION}.${FIELD} is type ${field.type}, expected text`);

  const plan = planWidgetChange(field.widget, { revert: REVERT });
  if (plan.action === "none") {
    console.log(`ok      ${COLLECTION}.${FIELD} widget = ${plan.target ?? "(default)"}`);
    return;
  }
  console.log(`${CHECK ? "WOULD" : "UPDATE"}  ${COLLECTION}.${FIELD} widget ${plan.from ?? "(default)"} -> ${plan.target ?? "(default)"}`);
  if (CHECK) process.exit(1);
  await api("PUT", `/schema/collections/${COLLECTION}/fields/${FIELD}`, { widget: plan.target });
  const after = await api("GET", `/schema/collections/${COLLECTION}?includeFields=true`);
  const now = (after?.item?.fields ?? after?.fields ?? []).find((f) => f.slug === FIELD);
  if ((now?.widget ?? null) !== plan.target) throw new Error(`verification failed: widget is ${now?.widget ?? "(default)"}`);
  console.log(`done    verified ${COLLECTION}.${FIELD} widget = ${plan.target ?? "(default)"}`);
}

// Run only when executed directly (the unit test imports planWidgetChange).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
