// Read published posts from EmDash and turn them into the legacy `MetadataEntry` shape (content-prepare's
// `extractDataFields`: title, plain-text content, category/tag/series links, isShort), reusing the legacy code.
import type pg from "pg";
import { buildPostEmbeddingText } from "./lib/embedding/embedding-text.ts";
import { buildSeriesNameMap, extractDataFields, type FrontmatterData } from "./lib/content/data-field.ts";
import type { MetadataEntry } from "./lib/content/types.ts";
import { createHash } from "node:crypto";
import { assertUniquePostUrls, resolvePostId } from "../../src/lib/post-id.ts";

export interface PostRow {
	id: string;
	legacy_id: string;
	body_md: string | null;
	featured_image: string | null;
	terms: { name: string; slug: string; label: string }[];
}

export interface Hint {
	tag_order: string[];
	city_order: string[];
	/** Legacy cover EmDash does not carry yet (used only while the post has no featured_image). */
	cover?: { url: string; alt: string };
}

export interface DerivedPost {
	legacyId: string;
	/** Legacy `MetadataEntry` fields (id = legacy id, href = the real post path). */
	entry: MetadataEntry;
	/** Original-case tag labels in pinned order. */
	tagLabels: string[];
	/** City strings in pinned order. */
	cities: string[];
	cover?: { url: string; alt: string };
	embeddingText: string;
	/** sha256 of the embedding input text: the cache key. */
	contentHash: string;
}

type RawPostRow = Omit<PostRow, "legacy_id"> & { legacy_id: string | null; slug: string; published_at: string | null };

/**
 * Resolve each row's id (GON-269): `legacy_id` for an imported post, else `YYYY/MM/DD/<slug>` from `published_at` (same rule as
 * apps/web/src/lib/content.ts mapPost). Rows that were never published get no id and are skipped. A duplicate id fails the build.
 */
export function resolvePostRows(raw: RawPostRow[]): PostRow[] {
	const rows: PostRow[] = [];
	for (const { slug, published_at, legacy_id, ...rest } of raw) {
		// An imported post keeps `legacy_id` byte for byte (derive cache keys); only a post without one gets a synthetic id.
		const id = legacy_id !== null ? legacy_id : resolvePostId({ slug, publishedAt: published_at });
		if (id) rows.push({ ...rest, legacy_id: id });
	}
	// Same rule as the web build (content.ts getAllPosts): the caches, /api/cards and /api/relates are keyed by the id alone, without
	// the category, so two posts with the same id clash even when their categories differ.
	assertUniquePostUrls(rows.map((r) => ({ key: r.legacy_id, entry: r.id })), "id");
	return rows;
}

/** Published, non-deleted posts (imported, or created in the admin and published), read in a READ ONLY transaction. */
export async function readPosts(client: pg.Client): Promise<PostRow[]> {
	await client.query("begin read only");
	try {
		const r = await client.query(`
			select p.id, p.legacy_id, p.slug, p.published_at, p.body_md, p.featured_image,
			       coalesce(json_agg(json_build_object('name', t.name, 'slug', t.slug, 'label', t.label))
			                filter (where t.id is not null), '[]'::json) as terms
			from ec_posts p
			left join content_taxonomies ct on ct.collection = 'posts' and ct.entry_id = p.id and ct.deleted_at is null
			left join taxonomies t on t.id = ct.taxonomy_id
			where p.status = 'published' and p.deleted_at is null and (p.legacy_id is not null or p.published_at is not null)
			group by p.id
			order by p.legacy_id nulls last, p.published_at, p.id`);
		return resolvePostRows(r.rows);
	} finally {
		await client.query("rollback");
	}
}

/** Pinned order first (hint), unknown labels after, alphabetically for determinism. */
export function orderLike(items: string[], pinned: string[] | undefined, key = (s: string) => s.toLowerCase()): string[] {
	const rank = new Map((pinned ?? []).map((s, i) => [key(s), i]));
	return [...items].sort((a, b) => (rank.get(key(a)) ?? Infinity) - (rank.get(key(b)) ?? Infinity) || a.localeCompare(b));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function buildPosts(rows: PostRow[], hints: Map<string, Hint>): Promise<DerivedPost[]> {
	// Series display name rule (legacy buildSeriesNameMap): only a label that differs from the slug counts as a name.
	const parsed = rows.map((row) => {
		const terms = (name: string) => row.terms.filter((t) => t.name === name);
		const category = terms("category")[0]?.slug;
		if (!category) throw new Error(`post ${row.legacy_id} has no category term`);
		const s = terms("series")[0];
		const hint = hints.get(row.legacy_id);
		const tagLabels = orderLike(terms("tag").map((t) => t.label || t.slug), hint?.tag_order);
		const cities = orderLike(terms("city").map((t) => t.label || t.slug), hint?.city_order, (s) => s);
		const series = s ? { slug: s.slug, ...(s.label && s.label !== s.slug ? { name: s.label } : {}) } : undefined;
		const fm: FrontmatterData = { category, tag: tagLabels, series, city: cities.length ? cities : undefined };
		const img = row.featured_image ? (JSON.parse(row.featured_image) as { src?: string; alt?: string }) : undefined;
		return { row, fm, tagLabels, cities, cover: img?.src ? { url: img.src, alt: img.alt ?? "" } : hint?.cover ? { url: hint.cover.url, alt: hint.cover.alt } : undefined };
	});
	const seriesNames = buildSeriesNameMap(parsed.map((p) => ({ series: p.fm.series })));
	const out: DerivedPost[] = [];
	for (const { row, fm, tagLabels, cities, cover } of parsed) {
		const body = row.body_md ?? "";
		const fields = await extractDataFields(row.legacy_id, fm, body, seriesNames);
		const entry: MetadataEntry = { file: row.legacy_id, hash: "", ...fields };
		const embeddingText = buildPostEmbeddingText(entry);
		out.push({ legacyId: row.legacy_id, entry, tagLabels, cities, cover, embeddingText, contentHash: sha256(embeddingText) });
	}
	return out;
}
