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
}

export interface ChannelData {
  title: string;
  description: string;
  link: string;
  image: string;
}

export interface FetchPodcastOptions {
  rssUrl?: string;
  /** Upsert new episodes into this EmDash (admin URL). */
  emdash: { url: string; token?: string; dryRun?: boolean };
}
