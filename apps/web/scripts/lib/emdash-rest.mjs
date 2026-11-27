/**
 * Minimal EmDash REST client shared by `scripts/podcast` (`pnpm fetch:podcast`).
 * Same transport as `scripts/schema/apply.mjs` (the two copies are
 * deliberate: those files are scripts, not a package). Auth, in order: a bearer token, `EMDASH_HEADERS`
 * (newline-separated "Name: Value", Cloudflare Access service tokens), the localhost dev bypass.
 */
export function createClient({ url, token, headers: extra } = {}) {
  const base = (url ?? process.env.EMDASH_URL ?? "http://127.0.0.1:4322").replace(/\/$/, "");
  const bearer = token ?? process.env.EMDASH_TOKEN;
  const extraHeaders = { ...(extra ?? {}) };
  for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) extraHeaders[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  // Parsed, not pattern-matched: `http://localhost:80@evil.com` has hostname evil.com, and userinfo is rejected outright.
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`invalid EmDash URL ${JSON.stringify(base)}`);
  }
  if (parsed.username || parsed.password) throw new Error("EmDash URL must not contain userinfo (user:password@host)");
  const isLocal = /^https?:$/.test(parsed.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  let cookie;

  // Credentials (bearer token, Access service-token headers) only travel over https, or to a local dev server.
  const hasCredentials = Boolean(bearer) || Object.keys(extraHeaders).length > 0;
  if (hasCredentials && !isLocal && parsed.protocol !== "https:") {
    throw new Error(`refusing to send EmDash credentials to non-https URL ${base} (only https, or localhost/127.0.0.1, is allowed)`);
  }

  async function api(method, path, body) {
    const headers = { ...extraHeaders, "content-type": "application/json", "x-emdash-request": "1" };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    else if (isLocal) {
      if (!cookie) {
        const r = await fetch(`${base}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
        cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
        await r.text().catch(() => {});
      }
      if (cookie) headers.cookie = cookie;
    }
    const res = await fetch(`${base}/_emdash/api${path}`, {
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

  /** Every entry of a collection (drafts included), keyed by data.legacy_id. Duplicates are reported. */
  async function listByLegacyId(collection) {
    const byLegacy = new Map();
    const dupes = [];
    let cursor;
    do {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const page = await api("GET", `/content/${collection}?${q}`);
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

  return { base, isLocal, api, listByLegacyId };
}

export const isoOrNull = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
export const same = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));

/**
 * Idempotent upsert by legacy_id. `existing` is the entry from listByLegacyId (or undefined).
 * Creates, publishes; updates only when a field differs (then publishes again), and only
 * when `update` is true (otherwise "differs"). Returns "created" | "updated" | "differs" | "unchanged".
 */
export async function upsert(client, collection, slug, data, existing, { dry = false, update = true } = {}) {
  if (!existing) {
    if (dry) return { action: "created", id: null };
    const created = await client.api("POST", `/content/${collection}`, { slug, data });
    const id = created?.item?.id ?? created?.id;
    await client.api("POST", `/content/${collection}/${id}/publish`, {}); // REST create leaves a draft
    return { action: "created", id };
  }
  const changed = Object.keys(data).filter((k) => !same(existing.data?.[k], data[k]));
  const notPublished = existing.status !== "published";
  const slugChanged = existing.slug !== slug;
  if (!changed.length && !notPublished && !slugChanged) return { action: "unchanged", id: existing.id };
  if (!update) return { action: "differs", id: existing.id, changed }; // never overwrite admin edits unless asked
  if (dry) return { action: "updated", id: existing.id, changed };
  const body = { data };
  if (slugChanged) body.slug = slug;
  await client.api("PUT", `/content/${collection}/${existing.id}`, body);
  await client.api("POST", `/content/${collection}/${existing.id}/publish`, {});
  return { action: "updated", id: existing.id, changed };
}
