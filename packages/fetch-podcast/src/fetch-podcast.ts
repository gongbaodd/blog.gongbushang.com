import fs from "node:fs/promises";
import path from "node:path";
import { parseStringPromise } from "xml2js";
import { getColorSet } from "image-metadata";
import { applyBlogUmapCorpus } from "metadata-embedding";
import { isEmbeddingServerRunning } from "post-embedding";
import { syncEpisodeEmbeddings } from "./sync-embeddings.ts";
import type {
  ChannelData,
  Episode,
  FetchPodcastOptions,
  PodcastData,
} from "./types.ts";

const DEFAULT_RSS_URL = "https://anchor.fm/s/f483db10/podcast/rss";

const EMBEDDING_SERVER_ERROR =
  "Embedding server is not running. Start LM Studio, run `uv sync --package embedding`, and ensure the embedding model is loaded.";

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
  options: Pick<
    FetchPodcastOptions,
    "baseDir" | "traceDir" | "useDepthPrep"
  >,
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
          useDepthPrep: options.useDepthPrep ?? false,
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

async function regenerateAllEpisodeTraces(
  options: Pick<
    FetchPodcastOptions,
    "traceDir" | "baseDir" | "useDepthPrep"
  >,
): Promise<void> {
  let files: string[];
  try {
    files = await fs.readdir(options.traceDir);
  } catch {
    console.log("No podcast trace directory found.");
    return;
  }

  let count = 0;
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(options.traceDir, file), "utf-8");
    const episode = JSON.parse(raw) as Episode;
    if (!episode.image) continue;

    await getColorSet(episode.image, {
      baseDir: options.baseDir,
      relPath: episode.id,
      saveTraceToDir: options.traceDir,
      useDepthPrep: options.useDepthPrep ?? false,
    });
    count++;
    console.log(`🎨 Regenerated trace: ${episode.id}`);
  }

  console.log(
    `\n✏️ Regenerated ${count} podcast trace(s) in ${options.traceDir}`,
  );
}

async function loadExistingPodcast(
  outputFile: string,
  episodeDir: string,
): Promise<PodcastData | null> {
  try {
    const raw = await fs.readFile(outputFile, "utf-8");
    const manifest = JSON.parse(raw) as Partial<PodcastData>;
    if (!manifest.channel) return null;

    let episodes: Episode[] = [];
    if (manifest.episodes && Array.isArray(manifest.episodes)) {
      episodes = manifest.episodes;
    } else {
      const files = await fs.readdir(episodeDir);
      for (const file of files) {
        if (!file.endsWith(".json") || file.startsWith(".")) continue;
        const episodeRaw = await fs.readFile(
          path.join(episodeDir, file),
          "utf-8",
        );
        episodes.push(JSON.parse(episodeRaw) as Episode);
      }
    }

    return {
      channel: manifest.channel,
      episodes,
      lastUpdated: manifest.lastUpdated,
    };
  } catch {
    return null;
  }
}

async function episodeNeedsEmbedding(traceDir: string): Promise<boolean> {
  let files: string[];
  try {
    files = await fs.readdir(traceDir);
  } catch {
    return false;
  }

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const raw = await fs.readFile(path.join(traceDir, file), "utf-8");
    const episode = JSON.parse(raw) as Episode;
    if (!Array.isArray(episode.embeddings) || episode.embeddings.length === 0) {
      return true;
    }
  }

  return false;
}

export async function fetchAndProcessPodcast(
  options: FetchPodcastOptions,
): Promise<void> {
  const {
    useDepthPrep = false,
    regenerateTraces = false,
    tracesOnly = false,
  } = options;

  await fs.mkdir(options.traceDir, { recursive: true });

  if (tracesOnly || regenerateTraces) {
    await regenerateAllEpisodeTraces(options);
    if (tracesOnly) {
      return;
    }
  }

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

  const existing = await loadExistingPodcast(
    options.outputFile,
    options.traceDir,
  );
  const existingIds = existing
    ? new Set(existing.episodes.map((ep) => ep.id))
    : new Set<string>();

  const newEpisodes = rssEpisodes.filter((ep: Episode) => !existingIds.has(ep.id));
  const existingEpisodes = existing
    ? existing.episodes.filter((ep) =>
        rssEpisodes.some((rss: Episode) => rss.id === ep.id),
      )
    : [];

  if (newEpisodes.length > 0) {
    console.log(
      `📥 ${existingEpisodes.length} existing, ${newEpisodes.length} new`,
    );

    const enrichedNew = await enrichEpisodesWithColors(newEpisodes, {
      baseDir: options.baseDir,
      traceDir: options.traceDir,
      useDepthPrep,
    });

    const manifest = {
      channel: channelData,
      lastUpdated: new Date().toISOString(),
    };

    await fs.writeFile(
      options.outputFile,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    for (const episode of enrichedNew) {
      const episodePath = path.join(options.traceDir, `${episode.id}.json`);
      await fs.writeFile(
        episodePath,
        JSON.stringify(episode, null, 2),
        "utf-8",
      );
    }

    console.log(
      `\n✨ Podcast manifest saved to ${options.outputFile} (${newEpisodes.length} new episode(s) added)`,
    );
    console.log(`📁 Episode JSON + trace SVGs saved to ${options.traceDir}/`);
  } else {
    console.log("✅ No new episodes; podcast data unchanged.");
  }

  if (await episodeNeedsEmbedding(options.traceDir)) {
    const embeddingServerRunning = await isEmbeddingServerRunning();
    if (!embeddingServerRunning) {
      throw new Error(EMBEDDING_SERVER_ERROR);
    }
    const embeddedCount = await syncEpisodeEmbeddings(options.traceDir);
    if (embeddedCount > 0) {
      console.log(`🧠 Embedded ${embeddedCount} podcast episode(s)`);
    }
  }

  await applyBlogUmapCorpus(options.baseDir);
}
