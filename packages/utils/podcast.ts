import fs from "node:fs";
import path from "node:path";
import { PODCAST_COVER_DIR, PODCAST_JSON } from "../consts/config.js";
import type { T_PROPS } from "./post";

export interface PodcastEpisode extends Record<string, unknown> {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  summary?: string;
  duration?: string;
  audioUrl?: string;
  image?: string;
  colorSet?: {
    bgColor: string;
    titleColor: string;
    trace?: string;
  };
  trace?: string;
}

export interface PodcastData {
  channel: { title: string; description?: string; link?: string; image?: string };
  episodes: PodcastEpisode[];
  lastUpdated?: string;
}

const EMPTY_PODCAST_DATA: PodcastData = {
  channel: { title: "" },
  episodes: [],
};

function readPodcastEpisodes(): PodcastEpisode[] {
  const podcastDir = path.join(process.cwd(), PODCAST_COVER_DIR);
  if (!fs.existsSync(podcastDir)) return [];

  return fs
    .readdirSync(podcastDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(podcastDir, file), "utf-8");
      return JSON.parse(raw) as PodcastEpisode;
    })
    .sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );
}

export function readPodcastData(): PodcastData {
  try {
    const podcastPath = path.join(process.cwd(), PODCAST_JSON);
    if (!fs.existsSync(podcastPath)) return EMPTY_PODCAST_DATA;

    const manifest = JSON.parse(
      fs.readFileSync(podcastPath, "utf-8"),
    ) as Partial<PodcastData>;
    const episodes =
      manifest.episodes && manifest.episodes.length > 0
        ? manifest.episodes
        : readPodcastEpisodes();

    return {
      channel: manifest.channel ?? EMPTY_PODCAST_DATA.channel,
      episodes,
      lastUpdated: manifest.lastUpdated,
    };
  } catch (error) {
    console.warn("Could not read podcast data:", error);
    return EMPTY_PODCAST_DATA;
  }
}

export function readPodcastCoverSvg(episodeSlug: string): string | undefined {
  try {
    const svgPath = path.join(process.cwd(), PODCAST_COVER_DIR, `${episodeSlug}.svg`);
    if (!fs.existsSync(svgPath)) return undefined;
    return fs.readFileSync(svgPath, "utf-8");
  } catch {
    return undefined;
  }
}

function episodeSlug(id: string): string {
  const part = id.split("/").pop();
  return part || id.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Processes podcast data by enriching episodes with trace data from SVG files.
 * Similar to sortPostsByDate, this function transforms raw podcast data into
 * the final podcast data structure.
 *
 * @returns Array of episodes enriched with trace data
 */
export function processPodcastEpisodes(): PodcastEpisode[] {
  const episodesData = readPodcastData().episodes;

  return episodesData.map((ep) => {
    if (!ep.image) return ep as PodcastEpisode;

    const slug = episodeSlug(ep.id as string);
    const trace = readPodcastCoverSvg(slug);
    if (!trace) return ep as PodcastEpisode;

    return { ...ep, trace } as PodcastEpisode;
  });
}

/**
 * Maps podcast episodes to post structure for filtering.
 * Each episode is transformed into a post-like object with category='podcast'.
 *
 * @returns Array of podcast episodes mapped to post structure
 */
export function mapPodcastEpisodesToPosts(): T_PROPS[] {
  const episodes = processPodcastEpisodes();

  return episodes.map((episode) => ({
    id: episode.id,
    collection: "blog",
    data: {
      title: episode.title,
      category: "podcast",
      description: episode.description || episode.summary || "",
      summary: episode.summary,
      date: new Date(episode.pubDate),
      duration: episode.duration,
      audioUrl: episode.audioUrl,
      image: episode.image,
      link: episode.link,
      colorSet: episode.colorSet,
      trace: episode.trace,
      body: episode.description || episode.summary || "",
    },
  }));
}
