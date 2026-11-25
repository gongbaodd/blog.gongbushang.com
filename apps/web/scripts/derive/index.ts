// PORT-8: derive everything computable from the CMS content, before `astro build` (replaces the former scripts/legacy-data.mjs).
//
//   EmDash posts (Postgres, read-only)  ->  embeddings (cached in derived.post_embeddings, only changed posts re-embed)
//                                       ->  relates, UMAP layout (derived.umap_state), search index, RSS items,
//                                           cover colours (derived.cover_colors), geocodes (derived.geocodes)
//                                       ->  src/generated/*.json + public/api/posts/*.json (same shapes as before)
// Podcast and gallery data still come from the content submodule (LEGACY_GENERATED_DIR) until MIG-3.
// Nothing generated is committed. Runs locally or in GitHub Actions: uses Cloudflare Workers AI when configured,
// falls back to local LM Studio if running, or cache hits only (new posts without embeddings are left out of
// related posts and /umap, D10).
//
// Env: CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE | DERIVE_DATABASE_URL  database (read-only for content)
//      LEGACY_GENERATED_DIR   podcast/gallery source (default ../../src/content/generated)
//      DERIVE_EMBED           auto (default) | require | skip | fake (tests only)
//      DERIVE_EMBED_PROVIDER  auto (default: workers-ai if configured, else local) | workers-ai | local
//      DERIVE_EMBED_MODEL     override embedding model key (default @cf/qwen/qwen3-embedding-0.6b for workers-ai)
//      DERIVE_EMBED_MAX       positive integer cap on stale posts embedded per run (chunked backfill within daily quotas)
//      CF_ACCOUNT_ID | CLOUDFLARE_ACCOUNT_ID  Cloudflare account ID for Workers AI embeddings
//      CF_AI_TOKEN | CLOUDFLARE_AI_API_TOKEN | CLOUDFLARE_API_TOKEN  Cloudflare API token for Workers AI embeddings
//      DERIVE_SKIP_COLORS=1   do not extract cover colours (cache hits only)
//      DERIVE_PARITY_LEGACY=1 only posts the legacy metadata knows (the 3 .mdx posts were never indexed); for parity comparisons
//      DERIVE_SCHEMA          cache schema name (default derived)
//      ALLOW_EMPTY_DATA=1     build without podcast/gallery data and without posts
//      GOOGLE_API_KEY         geocode city strings that are not cached yet
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
process.env.TZ ||= "Europe/Tallinn"; // the legacy snapshot's build TZ: post dates are local midnights (PORT-3)

const { webRoot } = await import("./db.ts");
const dir = resolve(webRoot, process.env.LEGACY_GENERATED_DIR || "../../src/content/generated");

// Guard (DATA-1, kept): refuse to build with the podcast/gallery data missing (no silent empty podcast, gallery, hero).
{
	const n = existsSync(resolve(dir, "podcast")) ? readdirSync(resolve(dir, "podcast")).filter((f) => f.endsWith(".json") && !f.startsWith(".")).length : 0;
	if (n === 0 && process.env.ALLOW_EMPTY_DATA !== "1") {
		console.error(`[derive] ERROR: no generated data in ${dir} (podcast/*.json missing or empty).\n  Run "git submodule update --init src/content" (or set LEGACY_GENERATED_DIR) or set ALLOW_EMPTY_DATA=1 to build without podcast, gallery and hero traces.`);
		process.exit(1);
	}
}

const { connect, describeTarget, resolveConnectionString, schemaReady, SCHEMA } = await import("./db.ts");
const { buildPosts, readPosts } = await import("./posts.ts");
const { loadHints, pruneEmbeddings, saveHints } = await import("./cache.ts");
const { embedPosts } = await import("./embed.ts");
const { resolveColors, resolveGeocodes } = await import("./enrich.ts");
const { resolveUmap } = await import("./umap.ts");
const { assemble, readExtras, writeOutputs } = await import("./outputs.ts");

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
		const md = resolve(dir, "metadata");
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
	const emb = await embedPosts(client, posts, mode);
	const pruned = await pruneEmbeddings(client, posts.map((p) => p.legacyId));
	console.log(`[derive] embeddings (${emb.provider}, ${emb.model}): ${emb.reused} cached, ${emb.embedded.length} embedded, ${emb.missing.length} missing, ${pruned} pruned (${lap(t)})`);

	t = Date.now();
	const extras = readExtras(dir);
	const corpus = [
		...posts.flatMap((p) => (emb.vectors.has(p.legacyId) ? [{ key: p.legacyId, embeddings: emb.vectors.get(p.legacyId)! }] : [])),
		...extras.podcast.filter((e) => Array.isArray(e.embeddings) && e.embeddings.length).map((e) => ({ key: e.id as string, embeddings: e.embeddings as number[] })),
	];
	const um = await resolveUmap(client, corpus);
	console.log(`[derive] umap: ${um.status}, ${um.count} points (${lap(t)})`);

	t = Date.now();
	const colors = await resolveColors(client, posts, process.env.DERIVE_SKIP_COLORS !== "1");
	const geo = await resolveGeocodes(client, posts);
	console.log(`[derive] colors: ${colors.reused} cached, ${colors.extracted} extracted, ${colors.failed.length} failed; geocodes: ${geo.reused} cached, ${geo.fetched} fetched, ${geo.missing.length} missing (${lap(t)})`);

	t = Date.now();
	const result = assemble({ posts, vectors: emb.vectors, coordinates: um.coordinates, colors: colors.colors, geocodes: geo.byCity, extras, source: `derive:${describeTarget(url)}` });
	writeOutputs(webRoot, result, extras);
	console.log(`[derive] ${Object.keys(result.out.posts).length} post records, ${result.out.podcast.length} podcast episodes, ${result.out.gallery.length} gallery images, ${result.out.umapPosts} posts on the UMAP; wrote outputs in ${lap(t)}; total ${lap(t0)}`);
} finally {
	await client.end();
}
