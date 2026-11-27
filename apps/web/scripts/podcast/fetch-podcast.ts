import { parseStringPromise } from "xml2js";
import { channelDrift, upsertEpisodesIntoEmdash } from "./emdash.ts";
import type { ChannelData, Episode, FetchPodcastOptions } from "./types.ts";

const DEFAULT_RSS_URL = "https://anchor.fm/s/f483db10/podcast/rss";

function getEpisodeSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || "unknown";
  } catch {
    return "unknown";
  }
}

function parseDuration(duration: string): string {
  if (!duration) return "";

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;

  const [, hours, minutes, seconds] = match;
  const parts: string[] = [];

  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.join(" ");
}

async function fetchRssFeed(rssUrl: string) {
  console.log(`📡 Fetching RSS from ${rssUrl}...`);
  const response = await fetch(rssUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`);
  }

  const xml = await response.text();
  const data = await parseStringPromise(xml);

  return data.rss.channel[0];
}

function parseEpisode(item: Record<string, unknown>, index: number): Episode {
  const title = (item.title as string[] | undefined)?.[0] || "Untitled";
  const link =
    (item.link as string[] | undefined)?.[0] || (item.guid as string[] | undefined)?.[0] || "";
  const pubDate = (item.pubDate as string[] | undefined)?.[0] || new Date().toISOString();
  const description =
    (item.description as string[] | undefined)?.[0] ||
    (item.summary as string[] | undefined)?.[0] ||
    "";
  const summary = description.replace(/<[^>]*>/g, "").substring(0, 200);

  const durationRaw = (item["itunes:duration"] as string[] | undefined)?.[0];
  const duration = durationRaw ? parseDuration(durationRaw) : "";

  const image =
    (item["itunes:image"] as Array<{ $?: { href?: string } }> | undefined)?.[0]?.$?.href ||
    (item.image as Array<{ url?: string[] }> | undefined)?.[0]?.url?.[0] ||
    "";

  const audioUrl =
    (item.enclosure as Array<{ $?: { url?: string } }> | undefined)?.[0]?.$?.url || "";

  const id = link ? getEpisodeSlug(link) : `ep-${index}`;

  return {
    id,
    title,
    link,
    pubDate,
    description: description.trim(),
    summary: summary.trim(),
    duration,
    audioUrl,
    image,
  };
}

export async function fetchAndProcessPodcast(options: FetchPodcastOptions): Promise<void> {
  const rssUrl = options.rssUrl ?? DEFAULT_RSS_URL;
  const channel = await fetchRssFeed(rssUrl);

  const channelData: ChannelData = {
    title: channel.title?.[0] || "Podcast",
    description: channel.description?.[0] || "",
    link: channel.link?.[0] || "",
    image: channel.image?.[0]?.url?.[0] || channel["itunes:image"]?.[0]?.["$"]?.href || "",
  };

  console.log(`✅ Channel: ${channelData.title}`);

  const items = channel.item || [];
  const rssEpisodes = items.map((item: Record<string, unknown>, idx: number) =>
    parseEpisode(item, idx),
  );
  console.log(`📻 Found ${rssEpisodes.length} episodes in RSS`);

  // No JSON, no local embeddings/UMAP. The web build (apps/web/scripts/derive) derives colours, embeddings,
  // related episodes and the UMAP layout from the CMS.
  for (const w of channelDrift(channelData)) console.warn(`WARNING: ${w}`);
  const r = await upsertEpisodesIntoEmdash(rssEpisodes, options.emdash);
  console.log(`✨ EmDash ${options.emdash.url}: ${r.created.length} new episode(s), ${r.existing} already present, ${r.skipped.length} skipped`);
}
