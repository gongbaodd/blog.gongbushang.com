// Reads and writes of the derived cache tables (supabase/migrations/20261125000000_derived_schema.sql).
import { createHash } from "node:crypto";
import type pg from "pg";
import { computeUmapInputHash, type UmapCorpusEntry } from "../../../../packages/metadata-embedding/src/apply-umap.ts";
import { computeUmapParamsHash } from "../../../../packages/metadata-embedding/src/umap-params.ts";
import { fromVector, q, toVector } from "./db.ts";
import type { Hint } from "./posts.ts";

export type Xy = [number, number];
export interface ColorSet {
	bgColor: string;
	titleColor: string;
}
export interface Location {
	latitude: number;
	longitude: number;
}
export interface UmapState {
	inputHash: string;
	paramsHash: string;
	count: number;
	coordinates: Record<string, Xy>;
}

// ---- hints ----
export async function loadHints(c: pg.Client): Promise<Map<string, Hint>> {
	const r = await c.query(`select legacy_id, tag_order, city_order, cover from ${q("post_hints")}`);
	return new Map(r.rows.map((x) => [x.legacy_id, { tag_order: x.tag_order, city_order: x.city_order, ...(x.cover ? { cover: x.cover } : {}) }]));
}

export async function saveHints(c: pg.Client, rows: { legacyId: string; tags: string[]; cities: string[]; cover?: { url: string; alt: string } }[], overwrite = false) {
	for (const r of rows) {
		await c.query(
			`insert into ${q("post_hints")} (legacy_id, tag_order, city_order, cover) values ($1, $2, $3, $4::jsonb)
			 on conflict (legacy_id) do ${overwrite ? "update set tag_order = excluded.tag_order, city_order = excluded.city_order, cover = excluded.cover, updated_at = now()" : "nothing"}`,
			[r.legacyId, r.tags, r.cities, r.cover ? JSON.stringify(r.cover) : null],
		);
	}
}

// ---- embeddings ----
export async function embeddingIndex(c: pg.Client) {
	const r = await c.query(`select legacy_id, content_hash, model from ${q("post_embeddings")}`);
	return new Map<string, { contentHash: string; model: string }>(r.rows.map((x) => [x.legacy_id, { contentHash: x.content_hash, model: x.model }]));
}

export async function upsertEmbedding(c: pg.Client, legacyId: string, contentHash: string, model: string, v: number[]) {
	await c.query(
		`insert into ${q("post_embeddings")} (legacy_id, content_hash, model, embedding) values ($1, $2, $3, $4::extensions.vector)
		 on conflict (legacy_id) do update set content_hash = excluded.content_hash, model = excluded.model, embedding = excluded.embedding, updated_at = now()`,
		[legacyId, contentHash, model, toVector(v)],
	);
}

/** Valid vectors only (hash and model match the current content). */
export async function loadEmbeddings(c: pg.Client, valid: Map<string, { contentHash: string; model: string }>) {
	const r = await c.query(`select legacy_id, content_hash, model, embedding::text as v from ${q("post_embeddings")}`);
	const out = new Map<string, number[]>();
	for (const x of r.rows) {
		const want = valid.get(x.legacy_id);
		if (want && want.contentHash === x.content_hash && want.model === x.model) out.set(x.legacy_id, fromVector(x.v));
	}
	return out;
}

export async function pruneEmbeddings(c: pg.Client, keep: string[]) {
	const r = await c.query(`delete from ${q("post_embeddings")} where legacy_id <> all($1::text[])`, [keep]);
	await c.query(`delete from ${q("post_hints")} where legacy_id <> all($1::text[])`, [keep]);
	return r.rowCount ?? 0;
}

// ---- cover colours ----
export async function loadColors(c: pg.Client): Promise<Map<string, ColorSet>> {
	const r = await c.query(`select cover_url, bg_color, title_color from ${q("cover_colors")}`);
	return new Map(r.rows.map((x) => [x.cover_url, { bgColor: x.bg_color, titleColor: x.title_color }]));
}

export async function upsertColor(c: pg.Client, url: string, cs: ColorSet) {
	await c.query(
		`insert into ${q("cover_colors")} (cover_url, bg_color, title_color) values ($1, $2, $3)
		 on conflict (cover_url) do update set bg_color = excluded.bg_color, title_color = excluded.title_color, updated_at = now()`,
		[url, cs.bgColor, cs.titleColor],
	);
}

export async function pruneColors(c: pg.Client, keepUrls: string[]) {
	return (await c.query(`delete from ${q("cover_colors")} where cover_url <> all($1::text[])`, [keepUrls])).rowCount ?? 0;
}

// ---- geocodes ----
export async function loadGeocodes(c: pg.Client): Promise<Map<string, Location>> {
	const r = await c.query(`select city, latitude, longitude from ${q("geocodes")}`);
	return new Map(r.rows.map((x) => [x.city, { latitude: x.latitude, longitude: x.longitude }]));
}

export async function upsertGeocode(c: pg.Client, city: string, l: Location) {
	await c.query(
		`insert into ${q("geocodes")} (city, latitude, longitude) values ($1, $2, $3)
		 on conflict (city) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = now()`,
		[city, l.latitude, l.longitude],
	);
}

// ---- UMAP ----
export async function loadUmapState(c: pg.Client): Promise<UmapState | undefined> {
	const r = await c.query(`select input_hash, params_hash, count, coordinates from ${q("umap_state")} where id = 'blog'`);
	const x = r.rows[0];
	return x && { inputHash: x.input_hash, paramsHash: x.params_hash, count: x.count, coordinates: x.coordinates };
}

export async function saveUmapState(c: pg.Client, s: UmapState) {
	await c.query(
		`insert into ${q("umap_state")} (id, input_hash, params_hash, count, coordinates) values ('blog', $1, $2, $3, $4::jsonb)
		 on conflict (id) do update set input_hash = excluded.input_hash, params_hash = excluded.params_hash, count = excluded.count,
		   coordinates = excluded.coordinates, updated_at = now()`,
		[s.inputHash, s.paramsHash, s.count, JSON.stringify(s.coordinates)],
	);
}

/** Same corpus hash the legacy `.umap-state.json` used (sorted keys, embeddings joined by commas). */
export const corpusHashes = (corpus: UmapCorpusEntry[]) => ({ inputHash: computeUmapInputHash(corpus), paramsHash: computeUmapParamsHash() });

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
