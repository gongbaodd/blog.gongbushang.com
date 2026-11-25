// Podcast episodes and gallery images from EmDash (collections `podcasts` and `gallery`, MIG-3), plus their derived data:
//   episodes: embedding (derived.podcast_embeddings; text = title|podcast|summary), colour set (cover_colors, only when
//             the CMS has no color_set), nearest-neighbour ids and UMAP (assembled in outputs.ts)
//   gallery:  trace SVG + colour set (derived.gallery_traces, key = image URL)
// Read with plain SQL in a READ ONLY transaction, like posts. Same legacy JSON key order as the old generated files,
// so /api/podcast/*.ndjson stays byte-identical.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import { buildPodcastEmbeddingText } from "../../../../packages/metadata-embedding/src/embedding.ts";
import { getColorSet } from "../../../../packages/image-metadata/src/get-color-set.ts";
import { loadTraces, pruneTraces, upsertTrace, type ColorSet, type TraceRow } from "./cache.ts";

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
	for (const r of rows) {
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
	return rows.map((r) => {
		if (r.legacy_missing) console.warn(`[derive] WARNING: gallery image ${r.image_url} has no legacy_id; keyed by its EmDash slug/id "${r.legacy_id}"`);
		// colorSet stays between doc and addedAt (legacy key order); undefined is dropped by JSON.stringify.
		const entry: DerivedGalleryImage["entry"] = { id: r.legacy_id, file: r.file ?? r.legacy_id, hash: r.hash ?? "", image: r.image_url, doc: r.doc ?? "", colorSet: r.color_set?.bgColor ? r.color_set : undefined };
		if (r.added_at) entry.addedAt = r.added_at;
		return { entry, traceFile: `${r.legacy_id.replaceAll("/", "-")}.svg` };
	});
}

export interface TraceResult {
	/** image URL -> SVG text, for every gallery image that has one. */
	svgByUrl: Map<string, string>;
	reused: number;
	traced: number;
	failed: string[];
	seconds: number;
}

/**
 * Trace SVG for every gallery image, cached by image URL (derived.gallery_traces). Only new URLs are fetched from
 * Cloudinary and traced (sobel + potrace, the legacy `getColorSet`); the colour set fills `entry.colorSet` when the CMS has none.
 */
export async function resolveTraces(c: pg.Client, gallery: DerivedGalleryImage[], extract = true, concurrency = 4, keepUrls?: string[]): Promise<TraceResult> {
	const t0 = Date.now();
	const cache = await loadTraces(c);
	const urls = [...new Set(gallery.map((g) => g.entry.image))];
	const todo = urls.filter((u) => !cache.has(u));
	const failed: string[] = [];
	let traced = 0;
	if (extract && todo.length) {
		const dir = mkdtempSync(join(tmpdir(), "derive-trace-"));
		try {
			const queue = [...todo];
			let n = 0;
			const worker = async () => {
				for (let u = queue.shift(); u; u = queue.shift()) {
					try {
						const sub = join(dir, String(n++));
						const colorSet = await getColorSet(u, { relPath: "t", saveTraceToDir: sub });
						const svg = readFileSync(join(sub, "t.svg"), "utf8");
						if (!colorSet.bgColor && !colorSet.titleColor) throw new Error("no palette");
						const row: TraceRow = { svg, colorSet };
						await upsertTrace(c, u, row);
						cache.set(u, row);
						traced++;
						console.log(`[derive] traced ${u}`);
					} catch (err) {
						failed.push(u);
						console.warn(`[derive] WARNING: gallery trace failed for ${u}: ${(err as Error).message}`);
					}
				}
			};
			await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}
	await pruneTraces(c, keepUrls ? [...new Set([...keepUrls, ...urls])] : urls);
	const svgByUrl = new Map<string, string>();
	for (const g of gallery) {
		const t = cache.get(g.entry.image);
		if (!t) continue;
		svgByUrl.set(g.entry.image, t.svg);
		if (!g.entry.colorSet) g.entry.colorSet = t.colorSet;
	}
	if (todo.length && !extract) console.warn(`[derive] WARNING: ${todo.length} gallery image(s) have no trace (DERIVE_SKIP_COLORS=1)`);
	return { svgByUrl, reused: urls.length - todo.length, traced, failed, seconds: (Date.now() - t0) / 1000 };
}

