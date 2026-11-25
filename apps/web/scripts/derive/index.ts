// PORT-8: derive everything computable from the CMS content, before `astro build` (replaces the former scripts/legacy-data.mjs).
//
//   EmDash posts (Postgres, read-only)  ->  embeddings (cached in derived.post_embeddings, only changed posts re-embed)
//                                       ->  relates, UMAP layout (derived.umap_state), search index, RSS items,
//                                           cover colours (derived.cover_colors), geocodes (derived.geocodes)
//                                       ->  src/generated/*.json + public/api/posts/*.json (same shapes as before)
//   EmDash podcasts (read-only) -> episode embeddings (derived.podcast_embeddings), nearest episodes, UMAP corpus
//   EmDash gallery  (read-only) -> frozen trace cache + colours (derived.gallery_traces; placeholder SVG when uncached) -> public/api/gallery/trace/*.svg
// Nothing is read from the legacy content submodule (MIG-3), except with DERIVE_PARITY_LEGACY=1 (parity checks only).
// Nothing generated is committed. Runs locally or in GitHub Actions: uses Cloudflare Workers AI when configured,
// falls back to local LM Studio if running, or cache hits only (new posts without embeddings are left out of
// related posts and /umap, D10). A provider switch re-embeds everything in one run; if that cannot finish, the old-model
// vectors stay in use (never a smaller corpus).
//
// Env: CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE | DERIVE_DATABASE_URL  database (read-only for content)
//      LEGACY_GENERATED_DIR   only for DERIVE_PARITY_LEGACY=1 (default ../../src/content/generated)
//      DERIVE_EMBED           auto (default) | require | skip | fake (tests only)
//      DERIVE_EMBED_PROVIDER  auto (default: workers-ai if configured, else local) | workers-ai | local
//      DERIVE_EMBED_MODEL     override embedding model key (validated charset; default @cf/qwen/qwen3-embedding-0.6b for workers-ai)
//      CF_ACCOUNT_ID | CLOUDFLARE_ACCOUNT_ID  Cloudflare account ID for Workers AI embeddings
//      CF_AI_TOKEN | CLOUDFLARE_AI_API_TOKEN  Workers-AI-scoped API token (CLOUDFLARE_API_TOKEN is never used)
//      DERIVE_SKIP_COLORS=1   do not extract cover colours (cache hits only)
//      DERIVE_PARITY_LEGACY=1 only posts the legacy metadata knows (the 3 .mdx posts were never indexed); for parity comparisons
//      DERIVE_SCHEMA          cache schema name (default derived)
//      ALLOW_EMPTY_DATA=1     build without posts, podcast episodes and gallery images
//      GOOGLE_API_KEY         geocode city strings that are not cached yet
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Extras } from "./outputs.ts";
process.env.TZ ||= "Europe/Tallinn"; // the legacy snapshot's build TZ: post dates are local midnights (PORT-3)

const { webRoot } = await import("./db.ts");

const { connect, describeTarget, resolveConnectionString, schemaReady, SCHEMA } = await import("./db.ts");
const { buildPosts, readPosts } = await import("./posts.ts");
const { loadHints, pruneEmbeddings, saveHints } = await import("./cache.ts");
const { embedPosts, finalizeEmbeddings } = await import("./embed.ts");
const { resolveColors, resolveGeocodes } = await import("./enrich.ts");
const { resolveUmap } = await import("./umap.ts");
const { assemble, writeOutputs } = await import("./outputs.ts");
const { buildEpisodes, buildGallery, readGalleryRows, readGalleryUrls, readPodcastKeys, readPodcastRows, resolveTraces } = await import("./media.ts");

const t0 = Date.now();
const lap = (t: number) => ((Date.now() - t) / 1000).toFixed(1) + "s";
const url = resolveConnectionString();
const client = await connect(url);
try {
	if (!(await schemaReady(client))) {
		console.error(`[derive] ERROR: schema "${SCHEMA}" is missing in ${describeTarget(url)}. Apply it first: pnpm --filter web derive:migrate  (docs/plan/emdash/runbooks/data.md)`);
		process.exit(1);
	}

	let t = Date.now();
	let rows = await readPosts(client);
	if (process.env.DERIVE_PARITY_LEGACY === "1") {
		const md = resolve(webRoot, process.env.LEGACY_GENERATED_DIR || "../../src/content/generated", "metadata");
		const known = new Set(readdirSync(md).filter((f) => f.endsWith(".json") && !f.startsWith(".")).map((f) => JSON.parse(readFileSync(resolve(md, f), "utf8")).file.replaceAll("-", "")));
		rows = rows.filter((r) => known.has(r.legacy_id.replaceAll("-", "")));
	}
	if (rows.length === 0 && process.env.ALLOW_EMPTY_DATA !== "1") {
		console.error(`[derive] ERROR: no published posts with a legacy_id in ${describeTarget(url)} (wrong database, or the import has not run). Set ALLOW_EMPTY_DATA=1 to build without posts.`);
		process.exit(1);
	}
	const hints = await loadHints(client);
	const posts = await buildPosts(rows, hints);
	await saveHints(client, posts.filter((p) => !hints.has(p.legacyId)).map((p) => ({ legacyId: p.legacyId, tags: p.tagLabels, cities: p.cities })));
	console.log(`[derive] ${posts.length} posts read from ${describeTarget(url)} in ${lap(t)}`);

	t = Date.now();
	const mode = (process.env.DERIVE_EMBED || "auto") as "auto" | "require" | "skip" | "fake";
	const session = {};
	const emb = await embedPosts(client, posts, mode, { session });
	const pruned = await pruneEmbeddings(client, posts.map((p) => p.legacyId));

	// Podcast episodes and gallery images (EmDash `podcasts`, `gallery`).
	t = Date.now();
	const episodes = buildEpisodes(await readPodcastRows(client));
	const galleryImages = buildGallery(await readGalleryRows(client));
	if ((episodes.length === 0 || galleryImages.length === 0) && process.env.ALLOW_EMPTY_DATA !== "1") {
		console.error(`[derive] ERROR: ${episodes.length} podcast episode(s) and ${galleryImages.length} gallery image(s) in ${describeTarget(url)} (wrong database, or the MIG-3 import has not run: node apps/web/scripts/import/mig3/import.mjs). Set ALLOW_EMPTY_DATA=1 to build without them.`);
		process.exit(1);
	}
	const pemb = await embedPosts(client, episodes, mode, { session }, "podcast_embeddings");
	await finalizeEmbeddings(client, [emb, pemb]);
	console.log(`[derive] embeddings (${emb.provider}, ${emb.model}): ${emb.reused} cached, ${emb.embedded.length} embedded, ${emb.missing.length} missing, ${emb.staleModel.length} kept from a previous model, ${pruned} pruned (${lap(t)})`);
	// Keep embeddings of every episode that still exists in EmDash (drafts/unpublished too); an empty read never prunes.
	const prunedEp = await pruneEmbeddings(client, await readPodcastKeys(client), "podcast_embeddings");
	console.log(`[derive] podcast: ${episodes.length} episodes, embeddings: ${pemb.reused} cached, ${pemb.embedded.length} embedded, ${pemb.missing.length} missing, ${pemb.staleModel.length} kept from a previous model, ${prunedEp} pruned (${lap(t)})`);

	t = Date.now();
	const extras: Extras = {
		podcast: episodes.map((e) => (pemb.vectors.has(e.legacyId) ? { ...e.episode, embeddings: pemb.vectors.get(e.legacyId)! } : e.episode)),
		gallery: [],
		traces: new Map(),
	};
	const corpus = [
		...posts.flatMap((p) => (emb.vectors.has(p.legacyId) ? [{ key: p.legacyId, embeddings: emb.vectors.get(p.legacyId)! }] : [])),
		...episodes.flatMap((e) => (pemb.vectors.has(e.legacyId) ? [{ key: e.legacyId, embeddings: pemb.vectors.get(e.legacyId)! }] : [])),
	];
	const um = await resolveUmap(client, corpus);
	console.log(`[derive] umap: ${um.status}, ${um.count} points (${lap(t)})`);

	t = Date.now();
	const epCoverUrls = episodes.flatMap((e) => (e.episode.colorSet || !e.episode.image || !/^https?:\/\//.test(e.episode.image) ? [] : [e.episode.image]));
	const colors = await resolveColors(client, posts, process.env.DERIVE_SKIP_COLORS !== "1", epCoverUrls);
	for (const e of episodes) if (!e.episode.colorSet && e.episode.image && colors.colors.has(e.episode.image)) e.episode.colorSet = colors.colors.get(e.episode.image)!;
	const geo = await resolveGeocodes(client, posts);
	console.log(`[derive] colors: ${colors.reused} cached, ${colors.extracted} extracted, ${colors.failed.length} failed; geocodes: ${geo.reused} cached, ${geo.fetched} fetched, ${geo.missing.length} missing (${lap(t)})`);

	t = Date.now();
	const tr = await resolveTraces(client, galleryImages, process.env.DERIVE_SKIP_COLORS !== "1", 4, await readGalleryUrls(client));
	extras.gallery = galleryImages.map((g) => g.entry);
	extras.placeholderTraces = new Set();
	for (const g of galleryImages) {
		if (!tr.svgByUrl.has(g.entry.image)) continue;
		extras.traces.set(g.traceFile, tr.svgByUrl.get(g.entry.image)!);
		if (tr.placeholderUrls.has(g.entry.image)) extras.placeholderTraces.add(g.traceFile);
	}
	console.log(`[derive] gallery: ${galleryImages.length} images, traces: ${tr.reused} cached, ${tr.placeholders} placeholders, 0 traced, ${tr.failed.length} colour failures (${lap(t)})`);

	t = Date.now();
	const result = assemble({ posts, vectors: emb.vectors, coordinates: um.coordinates, colors: colors.colors, geocodes: geo.byCity, extras, source: `derive:${describeTarget(url)}` });
	writeOutputs(webRoot, result, extras);
	console.log(`[derive] ${Object.keys(result.out.posts).length} post records, ${result.out.podcast.length} podcast episodes, ${result.out.gallery.length} gallery images, ${result.out.umapPosts} posts on the UMAP; wrote outputs in ${lap(t)}; total ${lap(t0)}`);
} finally {
	await client.end();
}
