// Typed access to the compact legacy generated data written by scripts/legacy-data.mjs
// (cover colors, UMAP, nearest-neighbour relates, podcast episodes, gallery).
// Missing file (no legacy submodule at build time) -> empty data; APIs degrade instead of failing.
// TODO DATA-1: replace with EmDash-backed data and delete this module.

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
	gallery: GalleryEntry[];
}

const EMPTY: LegacyData = { source: null, posts: {}, podcast: [], gallery: [] };

const mods = import.meta.glob("../generated/legacy-data.json", { eager: true, import: "default" });

export const legacy: LegacyData = (Object.values(mods)[0] as LegacyData | undefined) ?? EMPTY;

/** Legacy post record by legacy id (records are keyed dash-less, see scripts/legacy-data.mjs). */
export const postRecord = (id: string): LegacyPostRecord | undefined => legacy.posts[id.replaceAll("-", "")];
