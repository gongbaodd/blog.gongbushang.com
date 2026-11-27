// Podcast episodes and gallery images from EmDash (collections `podcasts` and `gallery`, MIG-3), plus their derived data:
//   episodes: embedding (derived.podcast_embeddings; text = title|podcast|summary), colour set (cover_colors, only when
//             the CMS has no color_set), nearest-neighbour ids and UMAP (assembled in outputs.ts)
//   gallery:  frozen trace SVG cache + colour set (derived.gallery_traces, key = image URL); an image with no cached trace
//             gets a placeholder SVG (PORT-8b part 3: nothing is traced any more)
// Read with plain SQL in a READ ONLY transaction, like posts. Same legacy JSON key order as the old generated files,
// so /api/podcast/*.ndjson stays byte-identical.
import { createHash } from "node:crypto";
import type pg from "pg";
import { buildPodcastEmbeddingText } from "./lib/embedding/embedding-text.ts";
import { getPaletteColorSet } from "./lib/palette/get-palette.ts";
import { loadTraces, PLACEHOLDER_MARK, pruneTraces, type ColorSet, type TraceRow } from "./cache.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface PodcastRow {
	legacy_id: string;
	title: string;
	link: string | null;
	pub_date: string | null;
	/** True when `legacy_id` was empty and the key fell back to the EmDash slug/id. */
	legacy_missing?: boolean;
	/** True when `pub_date` was empty and fell back to the entry's created_at. */
	pub_missing?: boolean;
	description: string | null;
	summary: string | null;
	duration: string | null;
	audio_url: string | null;
	image_url: string | null;
	color_set: ColorSet | null;
}

export interface GalleryRow {
	legacy_id: string;
	legacy_missing?: boolean;
	file: string | null;
	hash: string | null;
	image_url: string;
	doc: string | null;
	added_at: string | null;
	color_set: ColorSet | null;
}

async function readOnly<T>(client: pg.Client, sql: string): Promise<T[]> {
	await client.query("begin read only");
	try {
		return (await client.query(sql)).rows;
	} finally {
		await client.query("rollback");
	}
}

/**
 * Published, non-deleted episodes. An episode created in the admin has no `legacy_id`: it is keyed by its slug (then
 * id) instead of being dropped, and a null `pub_date` falls back to `created_at`; `buildEpisodes` warns about both.
 */
export const readPodcastRows = (client: pg.Client) =>
	readOnly<PodcastRow>(
		client,
		`select coalesce(legacy_id, slug, id) as legacy_id, (legacy_id is null) as legacy_missing,
		        title, link, coalesce(pub_date, created_at) as pub_date, (pub_date is null) as pub_missing,
		        description, summary, duration, audio_url, image_url, color_set
		 from ec_podcasts where status = 'published' and deleted_at is null order by 1`,
	);

export const readGalleryRows = (client: pg.Client) =>
	readOnly<GalleryRow>(
		client,
		`select coalesce(legacy_id, slug, id) as legacy_id, (legacy_id is null) as legacy_missing,
		        file, hash, image_url, doc, added_at, color_set
		 from ec_gallery where status = 'published' and deleted_at is null and image_url is not null order by 1`,
	);

/**
 * Cache keep-sets. Embeddings and traces are pruned against every entry that still EXISTS in EmDash (any status), not
 * only the published ones: unpublishing an episode must not throw away an embedding that took an LM Studio run to
 * compute. Only entries gone from EmDash (deleted) lose their cache rows.
 */
export const readPodcastKeys = async (client: pg.Client) =>
	(await readOnly<{ k: string }>(client, `select coalesce(legacy_id, slug, id) as k from ec_podcasts where deleted_at is null`)).map((r) => r.k);

export const readGalleryUrls = async (client: pg.Client) =>
	(await readOnly<{ u: string }>(client, `select image_url as u from ec_gallery where deleted_at is null and image_url is not null`)).map((r) => r.u);

/** EmDash timestamps are ISO strings or SQL `YYYY-MM-DD HH:MM:SS` (UTC, no zone); null when unparseable. */
export function parseDate(s: string | null | undefined): Date | null {
	if (!s) return null;
	const iso = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(\.\d+)?$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d;
}

export interface DerivedEpisode {
	legacyId: string;
	/** Legacy episode JSON (key order: id,title,link,pubDate,description,summary,duration,audioUrl,image,colorSet), without embeddings/umap2D. */
	episode: Record<string, unknown> & { id: string; image?: string; colorSet?: ColorSet };
	embeddingText: string;
	contentHash: string;
}

export function buildEpisodes(rows: PodcastRow[]): DerivedEpisode[] {
	const out: DerivedEpisode[] = [];
	const seen = new Set<string>();
	for (const r of rows) {
		// The slug/id fallback can collide with another episode's legacy_id: keep the first (rows are ordered by key), skip the rest.
		if (seen.has(r.legacy_id)) {
			console.warn(`[derive] WARNING: duplicate podcast key "${r.legacy_id}" ("${r.title}"); skipped, the first entry wins`);
			continue;
		}
		seen.add(r.legacy_id);
		if (r.legacy_missing) console.warn(`[derive] WARNING: podcast episode "${r.title}" has no legacy_id; keyed by its EmDash slug/id "${r.legacy_id}"`);
		const date = parseDate(r.pub_date);
		if (!date) {
			console.warn(`[derive] WARNING: podcast episode "${r.title}" (${r.legacy_id}) has no usable pub_date (${JSON.stringify(r.pub_date)}); skipped. Set "Published" in the admin.`);
			continue;
		}
		if (r.pub_missing) console.warn(`[derive] WARNING: podcast episode "${r.title}" (${r.legacy_id}) has no pub_date; using its creation date ${date.toISOString()}`);
		const episode: DerivedEpisode["episode"] = {
			id: r.legacy_id,
			title: r.title,
			link: r.link ?? "",
			pubDate: date.toUTCString(), // legacy RSS form, "Sun, 28 Apr 2024 07:30:00 GMT"
			description: r.description ?? "",
			summary: r.summary ?? "",
			duration: r.duration ?? "",
			audioUrl: r.audio_url ?? "",
			image: r.image_url ?? "",
		};
		if (r.color_set?.bgColor) episode.colorSet = r.color_set;
		const embeddingText = buildPodcastEmbeddingText({ title: r.title, summary: r.summary ?? "" });
		out.push({ legacyId: r.legacy_id, episode, embeddingText, contentHash: sha256(embeddingText) });
	}
	return out;
}

export interface DerivedGalleryImage {
	/** Legacy gallery.json entry (key order: id,file,hash,image,doc,colorSet,addedAt). `colorSet` is filled by resolveTraces when the CMS has none. */
	entry: { id: string; file: string; hash: string; image: string; doc: string; colorSet?: ColorSet; addedAt?: string };
	/** Basename of the trace SVG (`MM-DD-name.svg`). */
	traceFile: string;
}

export function buildGallery(rows: GalleryRow[]): DerivedGalleryImage[] {
	const seen = new Set<string>();
	const unique = rows.filter((r) => {
		if (!seen.has(r.legacy_id)) return seen.add(r.legacy_id);
		console.warn(`[derive] WARNING: duplicate gallery key "${r.legacy_id}" (${r.image_url}); skipped, the first entry wins`);
		return false;
	});
	return unique.map((r) => {
		if (r.legacy_missing) console.warn(`[derive] WARNING: gallery image ${r.image_url} has no legacy_id; keyed by its EmDash slug/id "${r.legacy_id}"`);
		// colorSet stays between doc and addedAt (legacy key order); undefined is dropped by JSON.stringify.
		const entry: DerivedGalleryImage["entry"] = { id: r.legacy_id, file: r.file ?? r.legacy_id, hash: r.hash ?? "", image: r.image_url, doc: r.doc ?? "", colorSet: r.color_set?.bgColor ? r.color_set : undefined };
		if (r.added_at) entry.addedAt = r.added_at;
		return { entry, traceFile: `${r.legacy_id.replaceAll("/", "-")}.svg` };
	});
}

export interface TraceResult {
	/** image URL -> SVG text (cached trace, or the placeholder), for every gallery image. */
	svgByUrl: Map<string, string>;
	/** Image URLs whose SVG is the placeholder rather than a real trace. */
	placeholderUrls: Set<string>;
	reused: number;
	/** Images that had no cached trace and got a placeholder. */
	placeholders: number;
	failed: string[];
	seconds: number;
}

const NEUTRAL_GREY = "#808080";

/** Tiny deterministic stand-in for a trace: one solid rect in the image's `bgColor` (neutral grey when unknown or not a hex colour). */
export function placeholderSvg(bgColor?: string | null): string {
	const fill = bgColor && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(bgColor) ? bgColor.toLowerCase() : NEUTRAL_GREY;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" preserveAspectRatio="none" ${PLACEHOLDER_MARK}><rect width="16" height="9" fill="${fill}"/></svg>`;
}

export const isPlaceholderSvg = (svg: string): boolean => svg.includes(PLACEHOLDER_MARK);

/**
 * Trace SVG for every gallery image from the FROZEN cache (derived.gallery_traces, key = image URL). Nothing is traced any
 * more: an image with no cached trace gets a placeholder SVG at the same URL (`/api/gallery/trace/<name>.svg` never changes).
 * Its colour set is the CMS one, else the legacy palette extraction (colours only, no trace). Placeholders are not cached.
 */
export async function resolveTraces(c: pg.Client, gallery: DerivedGalleryImage[], extract = true, concurrency = 4, keepUrls?: string[]): Promise<TraceResult> {
	const t0 = Date.now();
	const cache = await loadTraces(c);
	const urls = [...new Set(gallery.map((g) => g.entry.image))];
	// A cached placeholder row (older build) counts as uncached: placeholders are never stored now, so their colour cannot go stale.
	const todo = urls.filter((u) => !cache.has(u) || isPlaceholderSvg(cache.get(u)!.svg));
	const cmsColors = new Map(gallery.flatMap((g) => (g.entry.colorSet ? [[g.entry.image, g.entry.colorSet] as const] : [])));
	const failed: string[] = [];
	const queue = [...todo];
	const worker = async () => {
		for (let u = queue.shift(); u; u = queue.shift()) {
			let colorSet: ColorSet | undefined = cmsColors.get(u);
			if (!colorSet && extract) {
				try {
					colorSet = await getPaletteColorSet(u);
					if (!colorSet.bgColor && !colorSet.titleColor) throw new Error("no palette");
				} catch (err) {
					colorSet = undefined;
					failed.push(u);
					console.warn(`[derive] WARNING: gallery colours failed for ${u}: ${(err as Error).message}`);
				}
			}
			// Never stored in gallery_traces: it would go stale and could shadow the real trace restored from a `content:pull --include-derived` sync.
			const row: TraceRow = { svg: placeholderSvg(colorSet?.bgColor), colorSet: colorSet ?? { bgColor: "", titleColor: "" } };
			cache.set(u, row);
			if (colorSet) console.log(`[derive] gallery placeholder ${u}`);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
	await pruneTraces(c, keepUrls ? [...new Set([...keepUrls, ...urls])] : urls);
	const svgByUrl = new Map<string, string>();
	const placeholderUrls = new Set<string>();
	for (const g of gallery) {
		const t = cache.get(g.entry.image);
		if (!t) continue;
		svgByUrl.set(g.entry.image, t.svg);
		if (isPlaceholderSvg(t.svg)) placeholderUrls.add(g.entry.image);
		if (!g.entry.colorSet && (t.colorSet.bgColor || t.colorSet.titleColor)) g.entry.colorSet = t.colorSet;
	}
	return { svgByUrl, placeholderUrls, reused: urls.length - todo.length, placeholders: todo.length, failed, seconds: (Date.now() - t0) / 1000 };
}
