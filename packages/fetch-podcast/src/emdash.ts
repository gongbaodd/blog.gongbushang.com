// `fetch-podcast --emdash <admin url>` (MIG-3): upsert new RSS episodes into the EmDash `podcasts` collection instead of
// writing generated JSON. Colours, embeddings, related episodes and the UMAP layout are NOT computed here: the web build
// derives them (apps/web/scripts/derive). Only episodes missing from EmDash (by legacy_id = episode id) are created;
// existing entries are never touched, so edits made in the admin survive. The legacy JSON path is unchanged.
//
// Auth (same as `emdash` CLI / apps/web/scripts/import/mig3/rest.mjs): EMDASH_TOKEN bearer, EMDASH_HEADERS
// ("Name: Value" lines, Cloudflare Access service tokens), or the localhost dev bypass (`pnpm admin:local`).
import type { Episode } from "./types.ts";

export interface EmdashOptions {
  url: string;
  token?: string;
  dryRun?: boolean;
}

export interface EmdashResult {
  created: string[];
  existing: number;
}

/** Episode -> `podcasts` fields (schema: apps/web/scripts/schema/apply.mjs). */
export function episodeToFields(ep: Episode): Record<string, unknown> {
  const pub = new Date(ep.pubDate);
  return {
    title: ep.title,
    legacy_id: ep.id,
    link: ep.link || null,
    pub_date: Number.isNaN(pub.getTime()) ? null : pub.toISOString(),
    description: ep.description ?? "",
    summary: ep.summary ?? "",
    duration: ep.duration ?? "",
    audio_url: ep.audioUrl || null,
    image_url: ep.image || null,
    ...(ep.colorSet ? { color_set: ep.colorSet } : {}),
  };
}

export async function upsertEpisodesIntoEmdash(episodes: Episode[], options: EmdashOptions): Promise<EmdashResult> {
  const base = options.url.replace(/\/$/, "");
  const token = options.token ?? process.env.EMDASH_TOKEN;
  const extra: Record<string, string> = {};
  for (const line of (process.env.EMDASH_HEADERS ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) extra[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base);
  let cookie: string | undefined;

  async function api(method: string, path: string, body?: unknown): Promise<any> {
    const headers: Record<string, string> = { ...extra, "content-type": "application/json", "x-emdash-request": "1" };
    if (token) headers.authorization = `Bearer ${token}`;
    else if (isLocal) {
      if (!cookie) {
        const r = await fetch(`${base}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
        cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
        await r.text().catch(() => {});
      }
      if (cookie) headers.cookie = cookie;
    }
    const res = await fetch(`${base}/_emdash/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`.trim());
    return json?.data ?? json;
  }

  const known = new Set<string>();
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const page = await api("GET", `/content/podcasts?${q}`);
    for (const item of page.items ?? []) if (item.data?.legacy_id) known.add(item.data.legacy_id);
    cursor = page.nextCursor ?? page.next_cursor ?? undefined;
  } while (cursor);

  const created: string[] = [];
  for (const ep of episodes) {
    if (known.has(ep.id)) continue;
    if (!options.dryRun) {
      const r = await api("POST", "/content/podcasts", { slug: ep.id, data: episodeToFields(ep) });
      const id = r?.item?.id ?? r?.id;
      await api("POST", `/content/podcasts/${id}/publish`, {}); // REST create leaves a draft
    }
    created.push(ep.id);
    console.log(`${options.dryRun ? "would create" : "created"} podcast episode in EmDash: ${ep.title}`);
  }
  return { created, existing: episodes.length - created.length };
}
