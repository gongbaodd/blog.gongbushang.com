// `fetch-podcast --emdash <admin url>` (MIG-3): upsert new RSS episodes into the EmDash `podcasts` collection instead of
// writing generated JSON. Colours, embeddings, related episodes and the UMAP layout are NOT computed here: the web build
// derives them (apps/web/scripts/derive). Only episodes missing from EmDash (by legacy_id = episode id) are created;
// existing entries are never touched, so edits made in the admin survive. The legacy JSON path is unchanged.
//
// Transport: apps/web/scripts/lib/emdash-rest.mjs (shared with `apps/web/scripts/schema`, not a copy). It refuses to send
// credentials to a non-https URL unless the host is localhost/127.0.0.1. Auth: EMDASH_TOKEN bearer, EMDASH_HEADERS
// ("Name: Value" lines, Cloudflare Access service tokens), or the localhost dev bypass (`pnpm admin:local`).
import { PODCAST_CHANNEL } from "../../../apps/web/src/lib/podcast-channel.ts";
import { createClient, type EmdashClient } from "../../../apps/web/scripts/lib/emdash-rest.mjs";
import type { ChannelData, Episode } from "./types.ts";

export interface EmdashOptions {
  url: string;
  token?: string;
  dryRun?: boolean;
}

export interface EmdashResult {
  created: string[];
  existing: number;
  /** Episodes not written because the RSS pubDate did not parse. */
  skipped: string[];
}

/** ISO form of the RSS pubDate, or undefined when it does not parse (the episode is then skipped, never written with null). */
export function pubDateIso(ep: Pick<Episode, "pubDate">): string | undefined {
  const d = new Date(ep.pubDate);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Warnings for RSS channel fields that differ from apps/web/src/lib/podcast-channel.ts (the site's constant). */
export function channelDrift(channel: Pick<ChannelData, "title" | "description" | "image">): string[] {
  const out: string[] = [];
  for (const k of ["title", "description", "image"] as const) {
    if (channel[k] !== PODCAST_CHANNEL[k]) {
      out.push(
        `RSS channel ${k} differs from apps/web/src/lib/podcast-channel.ts: ${JSON.stringify(channel[k])} (site constant: ${JSON.stringify(PODCAST_CHANNEL[k])})`,
      );
    }
  }
  return out;
}

/** Episode -> `podcasts` fields (schema: apps/web/scripts/schema/apply.mjs). `pub_date` is only set when it parses. */
export function episodeToFields(ep: Episode): Record<string, unknown> {
  const pub = pubDateIso(ep);
  return {
    title: ep.title,
    legacy_id: ep.id,
    link: ep.link || null,
    ...(pub ? { pub_date: pub } : {}),
    description: ep.description ?? "",
    summary: ep.summary ?? "",
    duration: ep.duration ?? "",
    audio_url: ep.audioUrl || null,
    image_url: ep.image || null,
    ...(ep.colorSet ? { color_set: ep.colorSet } : {}),
  };
}

export async function upsertEpisodesIntoEmdash(
  episodes: Episode[],
  options: EmdashOptions,
  deps: { client?: EmdashClient } = {},
): Promise<EmdashResult> {
  const client = deps.client ?? createClient({ url: options.url, token: options.token });
  // Every entry (drafts included) keyed by legacy_id: an episode that exists in any status is never re-created.
  const { byLegacy } = await client.listByLegacyId("podcasts");

  const created: string[] = [];
  const skipped: string[] = [];
  for (const ep of episodes) {
    if (byLegacy.has(ep.id)) continue;
    if (pubDateIso(ep) === undefined) {
      console.warn(`WARNING: skipping episode "${ep.title}" (${ep.id}): RSS pubDate ${JSON.stringify(ep.pubDate)} does not parse`);
      skipped.push(ep.id);
      continue;
    }
    if (!options.dryRun) {
      const r = await client.api("POST", "/content/podcasts", { slug: ep.id, data: episodeToFields(ep) });
      const id = r?.item?.id ?? r?.id;
      await client.api("POST", `/content/podcasts/${id}/publish`, {}); // REST create leaves a draft
    }
    created.push(ep.id);
    console.log(`${options.dryRun ? "would create" : "created"} podcast episode in EmDash: ${ep.title}`);
  }
  return { created, existing: episodes.length - created.length - skipped.length, skipped };
}
