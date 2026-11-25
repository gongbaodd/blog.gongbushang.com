import type { ColorSet } from "image-metadata";

export interface Episode {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
  summary: string;
  duration: string;
  audioUrl: string;
  image: string;
  colorSet?: ColorSet;
  embeddings?: number[];
}

export interface ChannelData {
  title: string;
  description: string;
  link: string;
  image: string;
}

export interface PodcastData {
  channel: ChannelData;
  episodes: Episode[];
  lastUpdated?: string;
}

export interface FetchPodcastOptions {
  rssUrl?: string;
  outputFile: string;
  episodeDir: string;
  baseDir: string;
  /** MIG-3: upsert new episodes into this EmDash (admin URL) instead of writing JSON. */
  emdash?: { url: string; token?: string; dryRun?: boolean };
}
