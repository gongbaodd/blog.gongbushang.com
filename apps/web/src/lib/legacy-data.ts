// Typed access to the compact data written by scripts/derive/index.ts from EmDash + the derived cache
// (cover colors, UMAP, nearest-neighbour relates, podcast episodes, gallery). Nothing here reads the legacy content
// submodule since MIG-3. The name is historical (the shapes are the legacy ones, which keeps the APIs byte-identical).
// Missing file (derive did not run) -> empty data; APIs degrade instead of failing.

export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

export interface LegacyPostRecord {
  cover?: { url: string; alt?: string };
  colorSet?: ColorSet;
  umap2D?: [number, number];
  /** Frontmatter order (lowercase labels); EmDash does not keep per-entry term order. */
  tags?: string[];
  /** Frontmatter order, original strings (e.g. "Tallinn, Estonia"). */
  city?: string[];
  locations?: { latitude: number; longitude: number }[];
  /** Legacy ids of the nearest posts (embedding / UMAP rank), already limited to 8. */
  relates?: string[];
}

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
  colorSet?: ColorSet;
  embeddings?: number[];
  umap2D?: [number, number];
}

export interface PodcastChannel {
  title: string;
  description?: string;
  link?: string;
  image?: string;
}

export interface GalleryEntry {
  id: string;
  file: string;
  hash: string;
  image: string;
  doc: string;
  addedAt?: string;
  colorSet?: ColorSet;
}

export interface LegacyData {
  source: string | null;
  posts: Record<string, LegacyPostRecord>;
  /** Newest first. */
  podcast: PodcastEpisode[];
  /** Episode id -> ids of the 4 nearest episodes ("More to discover"). */
  podcastRelated: Record<string, string[]>;
  gallery: GalleryEntry[];
  /** Basenames of the traced gallery SVGs written to public/api/gallery/trace. */
  traceFiles: string[];
  /** Subset of `traceFiles` that are placeholder rects, not real traces (new images after PORT-8b part 3). */
  placeholderTraceFiles?: string[];
}

const EMPTY: LegacyData = {
  source: null,
  posts: {},
  podcast: [],
  podcastRelated: {},
  gallery: [],
  traceFiles: [],
  placeholderTraceFiles: [],
};

const mods = import.meta.glob("../generated/legacy-data.json", { eager: true, import: "default" });

export const legacy: LegacyData = (Object.values(mods)[0] as LegacyData | undefined) ?? EMPTY;

/** Legacy post record by legacy id (records are keyed dash-less, see scripts/derive/index.ts). */
export const postRecord = (id: string): LegacyPostRecord | undefined =>
  legacy.posts[id.replaceAll("-", "")];
