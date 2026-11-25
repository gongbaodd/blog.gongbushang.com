// ONE-OFF: seed the derived cache from the legacy generated data (content submodule), so the first derive run does not
// re-embed 992 posts. Matches legacy metadata to EmDash posts by dash-less id (21 legacy ids use an older slugger) and
// seeds an embedding only when the derived embedding input text equals the legacy one (same title, category, series,
// tags, cities and plain-text content), so a seeded vector is always valid for the content it is cached against.
//   pnpm --filter web derive:seed            (dry run)
//   pnpm --filter web derive:seed -- --write
// Safe to re-run (upserts). Never touches EmDash tables.
process.env.TZ ||= "Europe/Tallinn";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { computeUmapInputHash } from "../../../../packages/metadata-embedding/src/apply-umap.ts";
import { computeUmapParamsHash } from "../../../../packages/metadata-embedding/src/umap-params.ts";
import { resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { saveHints, saveUmapState, upsertColor, upsertEmbedding, upsertGeocode, type Xy } from "./cache.ts";
import { SCHEMA, connect, describeTarget, resolveConnectionString, schemaReady, webRoot } from "./db.ts";
import { buildPosts, readPosts, type Hint } from "./posts.ts";

const write = process.argv.includes("--write");
const dir = resolve(webRoot, process.env.LEGACY_GENERATED_DIR || "../../src/content/generated");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const noDash = (s: string) => s.replaceAll("-", "");

const metaDir = resolve(dir, "metadata");
if (!existsSync(metaDir)) {
	console.error(`[seed] no legacy metadata in ${metaDir} (git submodule update --init src/content)`);
	process.exit(1);
}
const legacy = readdirSync(metaDir)
	.filter((f) => f.endsWith(".json") && !f.startsWith("."))
	.map((f) => readJson(resolve(metaDir, f)));
const state = readJson(resolve(metaDir, ".umap-state.json")) as { inputHash: string; count: number; paramsHash: string; coordinates: Record<string, Xy> };
const podcast = existsSync(resolve(dir, "podcast"))
	? readdirSync(resolve(dir, "podcast")).filter((f) => f.endsWith(".json") && !f.startsWith(".")).map((f) => readJson(resolve(dir, "podcast", f)))
	: [];

// Sanity: the hash function and float32 round trip reproduce the legacy state hash from the legacy files.
const legacyCorpus = [...legacy.map((e) => ({ key: e.file as string, embeddings: e.embeddings as number[] })), ...podcast.map((e) => ({ key: e.id as string, embeddings: e.embeddings as number[] }))];
const legacyHashOk = computeUmapInputHash(legacyCorpus) === state.inputHash;
console.log(`[seed] legacy: ${legacy.length} posts, ${podcast.length} episodes, state count ${state.count}; input hash reproduced from files: ${legacyHashOk}`);

const byKey = new Map(legacy.map((e) => [noDash(e.file as string), e]));
const client = await connect();
const url = resolveConnectionString();
try {
	if (!(await schemaReady(client))) throw new Error(`schema "${SCHEMA}" missing in ${describeTarget(url)}: run derive:migrate first`);
	const rows = await readPosts(client);
	const hints = new Map<string, Hint>(legacy.map((e) => [e.file as string, { tag_order: (e.tags ?? []).map((t: any) => t.label), city_order: e.city ?? [] }]));
	// Re-key the hints to the EmDash legacy ids.
	const emHints = new Map<string, Hint>();
	for (const r of rows) {
		const e = byKey.get(noDash(r.legacy_id));
		if (!e) continue;
		const noCms = !(r.featured_image && JSON.parse(r.featured_image).src);
		emHints.set(r.legacy_id, { ...hints.get(e.file)!, ...(noCms && e.cover?.url ? { cover: { url: e.cover.url, alt: e.cover.alt ?? "" } } : {}) });
	}
	const posts = await buildPosts(rows, emHints);
	const model = resolveModel();

	const diff: Record<string, number> = {};
	const bump = (k: string) => (diff[k] = (diff[k] ?? 0) + 1);
	const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	const seeded: { id: string; legacyKey: string }[] = [];
	const unmatched: string[] = [];
	let colors = 0, geos = 0;

	if (write) await client.query("begin");
	for (const p of posts) {
		const e = byKey.get(noDash(p.legacyId));
		if (!e) { unmatched.push(p.legacyId); continue; }
		const d = p.entry;
		// A post without a heading takes its title from the slug: legacy used the old slug ("dontstarveconsole"), EmDash keeps
		// the dashes ("dont starve console"). Accept that difference so the one-off vector (and the UMAP layout) is kept.
		const flat = (t: string) => t.replace(/[\s-]/g, "").toLowerCase();
		const same = { title: d.title === e.title || flat(d.title) === flat(e.title), content: d.content === e.content, category: d.category.label === e.category.label, series: (d.series?.label ?? "") === (e.series?.label ?? ""), tags: eq(d.tags.map((t) => t.label), (e.tags ?? []).map((t: any) => t.label)), city: eq(d.city ?? [], e.city ?? []) };
		const bad = Object.entries(same).filter(([, ok]) => !ok).map(([k]) => k);
		bad.forEach(bump);
		if (bad.length || !Array.isArray(e.embeddings) || e.embeddings.length !== 1024) { unmatched.push(`${p.legacyId} (${bad.join(",") || "no embedding"})`); continue; }
		seeded.push({ id: p.legacyId, legacyKey: e.file });
		if (write) await upsertEmbedding(client, p.legacyId, p.contentHash, model, e.embeddings);
		if (p.cover && e.colorSet?.bgColor && (p.cover.url === e.cover?.url || !emHints.get(p.legacyId)?.cover)) { colors++; if (write) await upsertColor(client, p.cover.url, e.colorSet); }
		if (e.city?.length && e.locations?.length === e.city.length) {
			for (let i = 0; i < e.city.length; i++) { geos++; if (write) await upsertGeocode(client, e.city[i], e.locations[i]); }
		}
	}
	if (write) await saveHints(client, posts.filter((p) => emHints.has(p.legacyId)).map((p) => ({ legacyId: p.legacyId, tags: p.tagLabels, cities: p.cities, cover: emHints.get(p.legacyId)?.cover })), true);

	// UMAP layout: re-key legacy coordinates to the EmDash ids and hash the corpus the way derive will.
	const idOf = new Map(seeded.map((s) => [s.legacyKey, s.id]));
	const emb = new Map(legacy.map((e) => [e.file as string, e.embeddings as number[]]));
	const corpus = [
		...seeded.map((s) => ({ key: s.id, embeddings: emb.get(s.legacyKey)! })),
		...podcast.map((e) => ({ key: e.id as string, embeddings: e.embeddings as number[] })),
	];
	const coordinates: Record<string, Xy> = {};
	for (const [k, xy] of Object.entries(state.coordinates)) {
		const key = idOf.get(k) ?? (podcast.some((e) => e.id === k) ? k : undefined);
		if (key) coordinates[key] = xy;
	}
	const complete = corpus.every((c) => coordinates[c.key]) && Object.keys(coordinates).length === corpus.length;
	if (write && complete) {
		await saveUmapState(client, { inputHash: computeUmapInputHash(corpus), paramsHash: computeUmapParamsHash(), count: corpus.length, coordinates });
	}
	if (write) await client.query("commit");

	console.log(`[seed] ${write ? "WROTE" : "dry run"} to ${describeTarget(url)} schema "${SCHEMA}": ${seeded.length} embeddings, ${colors} cover colours, ${geos} geocodes, ${emHints.size} hints; UMAP layout ${complete ? `${corpus.length} points` : "NOT seeded (corpus and legacy coordinates differ)"}`);
	console.log(`[seed] legacy params hash equal to current: ${state.paramsHash === computeUmapParamsHash()}`);
	console.log(`[seed] field mismatches: ${JSON.stringify(diff)}; not seeded (${unmatched.length}): ${unmatched.slice(0, 10).join("; ")}${unmatched.length > 10 ? "; ..." : ""}`);
} catch (err) {
	if (write) await client.query("rollback").catch(() => {});
	throw err;
} finally {
	await client.end();
}
