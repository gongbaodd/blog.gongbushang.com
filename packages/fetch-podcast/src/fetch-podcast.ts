import fs from "node:fs/promises";
import { parseStringPromise } from "xml2js";
import { getColorSet } from "image-metadata";
import type {
  ChannelData,
  Episode,
  FetchPodcastOptions,
  PodcastData,
} from "./types.ts";

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
    (item.link as string[] | undefined)?.[0] ||
    (item.guid as string[] | undefined)?.[0] ||
    "";
  const pubDate =
    (item.pubDate as string[] | undefined)?.[0] || new Date().toISOString();
  const description =
    (item.description as string[] | undefined)?.[0] ||
    (item.summary as string[] | undefined)?.[0] ||
    "";
  const summary = description.replace(/<[^>]*>/g, "").substring(0, 200);

  const durationRaw = (item["itunes:duration"] as string[] | undefined)?.[0];
  const duration = durationRaw ? parseDuration(durationRaw) : "";

  const image =
    (
      item["itunes:image"] as Array<{ $?: { href?: string } }> | undefined
    )?.[0]?.$?.href ||
    (item.image as Array<{ url?: string[] }> | undefined)?.[0]?.url?.[0] ||
    "";

  const audioUrl =
    (
      item.enclosure as Array<{ $?: { url?: string } }> | undefined
    )?.[0]?.$?.url || "";

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

async function enrichEpisodesWithColors(
  episodes: Episode[],
  options: Pick<FetchPodcastOptions, "baseDir" | "traceDir">,
): Promise<Episode[]> {
  const enrichedEpisodes: Episode[] = [];

  for (const episode of episodes) {
    try {
      if (episode.image) {
        console.log(`🎨 Processing colors for: ${episode.title}`);
        const colorSet = await getColorSet(episode.image, {
          baseDir: options.baseDir,
          relPath: episode.id,
          saveTraceToDir: options.traceDir,
        });
        enrichedEpisodes.push({ ...episode, colorSet });
      } else {
        enrichedEpisodes.push(episode);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️  Could not process colors for "${episode.title}": ${message}`,
      );
      enrichedEpisodes.push(episode);
    }
  }

  return enrichedEpisodes;
}

async function loadExistingPodcast(
  outputFile: string,
): Promise<PodcastData | null> {
  try {
    const raw = await fs.readFile(outputFile, "utf-8");
    const data = JSON.parse(raw) as PodcastData;
    if (data.episodes && Array.isArray(data.episodes)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchAndProcessPodcast(
  options: FetchPodcastOptions,
): Promise<void> {
  const rssUrl = options.rssUrl ?? DEFAULT_RSS_URL;
  const channel = await fetchRssFeed(rssUrl);

  const channelData: ChannelData = {
    title: channel.title?.[0] || "Podcast",
    description: channel.description?.[0] || "",
    link: channel.link?.[0] || "",
    image:
      channel.image?.[0]?.url?.[0] ||
      channel["itunes:image"]?.[0]?.["$"]?.href ||
      "",
  };

  console.log(`✅ Channel: ${channelData.title}`);

  const items = channel.item || [];
  const rssEpisodes = items.map((item: Record<string, unknown>, idx: number) =>
    parseEpisode(item, idx),
  );
  console.log(`📻 Found ${rssEpisodes.length} episodes in RSS`);

  const existing = await loadExistingPodcast(options.outputFile);
  const existingIds = existing
    ? new Set(existing.episodes.map((ep) => ep.id))
    : new Set<string>();

  const newEpisodes = rssEpisodes.filter((ep : Episode) => !existingIds.has(ep.id));
  const existingEpisodes = existing
    ? existing.episodes.filter((ep) =>
        rssEpisodes.some((rss : Episode) => rss.id === ep.id),
      )
    : [];

  if (newEpisodes.length === 0) {
    console.log("✅ No new episodes; podcast.json unchanged.");
    return;
  }

  console.log(
    `📥 ${existingEpisodes.length} existing, ${newEpisodes.length} new`,
  );

  const enrichedNew = await enrichEpisodesWithColors(newEpisodes, {
    baseDir: options.baseDir,
    traceDir: options.traceDir,
  });

  const mergedEpisodes = rssEpisodes
    .map((rss : Episode) => {
      const existingEp = existingEpisodes.find((e) => e.id === rss.id);
      if (existingEp) return existingEp;
      const newEp = enrichedNew.find((e) => e.id === rss.id);
      return newEp;
    })
    .filter(Boolean) as Episode[];

  const output: PodcastData = {
    channel: channelData,
    episodes: mergedEpisodes,
    lastUpdated: new Date().toISOString(),
  };

  await fs.writeFile(
    options.outputFile,
    JSON.stringify(output, null, 2),
    "utf-8",
  );
  console.log(
    `\n✨ Podcast data saved to ${options.outputFile} (${newEpisodes.length} new episode(s) added)`,
  );
  console.log(`📁 Trace SVGs saved to ${options.traceDir}/`);
}
