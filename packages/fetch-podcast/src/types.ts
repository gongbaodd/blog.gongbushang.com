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
  traceDir: string;
  baseDir: string;
}
