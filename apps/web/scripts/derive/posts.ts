// Read published posts from EmDash and turn them into the legacy `MetadataEntry` shape (content-prepare's
// `extractDataFields`: title, plain-text content, category/tag/series links, isShort), reusing the legacy code.
import type pg from "pg";
import { buildPostEmbeddingText } from "../../../../packages/metadata-embedding/src/embedding.ts";
import { buildSeriesNameMap, extractDataFields, type FrontmatterData } from "./lib/content/data-field.ts";
import type { MetadataEntry } from "./lib/content/types.ts";
import { createHash } from "node:crypto";

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

/** Published, non-deleted, migrated posts, read in a READ ONLY transaction. */
export async function readPosts(client: pg.Client): Promise<PostRow[]> {
	await client.query("begin read only");
	try {
		const r = await client.query(`
			select p.id, p.legacy_id, p.body_md, p.featured_image,
			       coalesce(json_agg(json_build_object('name', t.name, 'slug', t.slug, 'label', t.label))
			                filter (where t.id is not null), '[]'::json) as terms
			from ec_posts p
			left join content_taxonomies ct on ct.collection = 'posts' and ct.entry_id = p.id and ct.deleted_at is null
			left join taxonomies t on t.id = ct.taxonomy_id
			where p.status = 'published' and p.deleted_at is null and p.legacy_id is not null
			group by p.id
			order by p.legacy_id`);
		return r.rows;
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
