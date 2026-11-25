// ONE-OFF (MIG-3): seed the derived cache for podcast episodes and gallery images from the legacy generated data
// (content submodule), so the first derive run neither re-embeds 150 episodes nor re-traces 75 Cloudinary images.
// Run after the MIG-3 import has put the episodes and images into EmDash (and after derive:migrate):
//   pnpm --filter web derive:seed:media            (dry run)
//   pnpm --filter web derive:seed:media -- --write
// A vector is seeded only if the legacy episode title and summary equal the EmDash ones (the embedding input), and a
// trace only if the legacy image URL equals the EmDash one, so a seeded row is always valid for what it is cached against.
// Safe to re-run (upserts). Never touches EmDash tables. Independent of derive:seed (posts), which must not be re-run
// just for this.
// Model tag: the legacy vectors came from LM Studio, so they are always tagged with the LM Studio model id
// (resolveModel()), independent of DERIVE_EMBED_PROVIDER/DERIVE_EMBED_MODEL; under Workers AI they are re-embedded in
// one run and stay usable as a fallback (same content_hash) if that cannot finish.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { upsertEmbedding, upsertTrace } from "./cache.ts";
import { SCHEMA, connect, describeTarget, resolveConnectionString, schemaReady, webRoot } from "./db.ts";
import { buildEpisodes, buildGallery, readGalleryRows, readPodcastRows } from "./media.ts";

const write = process.argv.includes("--write");
const dir = resolve(webRoot, process.env.LEGACY_GENERATED_DIR || "../../src/content/generated");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
if (!existsSync(resolve(dir, "podcast"))) {
	console.error(`[seed:media] no legacy generated data in ${dir} (git submodule update --init src/content)`);
	process.exit(1);
}
const legacyEp = new Map<string, any>(
	readdirSync(resolve(dir, "podcast")).filter((f) => f.endsWith(".json") && !f.startsWith(".")).map((f) => readJson(resolve(dir, "podcast", f))).map((e) => [e.id, e]),
);
const legacyGallery = new Map<string, any>(readJson(resolve(dir, "gallery.json")).images.map((i: any) => [i.id, i]));

const url = resolveConnectionString();
const client = await connect(url);
try {
	if (!(await schemaReady(client))) throw new Error(`schema "${SCHEMA}" (incl. the MIG-3 tables) missing in ${describeTarget(url)}: run derive:migrate first`);
	const model = resolveModel();
	const episodes = buildEpisodes(await readPodcastRows(client));
	const gallery = buildGallery(await readGalleryRows(client));
	if (!episodes.length || !gallery.length) throw new Error(`EmDash holds ${episodes.length} episodes and ${gallery.length} gallery images: run the MIG-3 import first`);

	let epSeeded = 0, epSkipped = 0, trSeeded = 0, trSkipped = 0;
	for (const e of episodes) {
		const l = legacyEp.get(e.legacyId);
		if (!l || !Array.isArray(l.embeddings) || l.embeddings.length === 0 || l.title !== e.episode.title || l.summary !== e.episode.summary) {
			epSkipped++;
			continue;
		}
		epSeeded++;
		if (write) await upsertEmbedding(client, e.legacyId, e.contentHash, model, l.embeddings, "podcast_embeddings");
	}
	for (const g of gallery) {
		const l = legacyGallery.get(g.entry.id);
		const svgPath = resolve(dir, "gallery", g.traceFile);
		if (!l || l.image !== g.entry.image || !l.colorSet?.bgColor || !existsSync(svgPath)) {
			trSkipped++;
			continue;
		}
		trSeeded++;
		if (write) await upsertTrace(client, g.entry.image, { svg: readFileSync(svgPath, "utf8"), colorSet: l.colorSet });
	}
	console.log(`[seed:media] ${write ? "WROTE" : "dry run"} to ${describeTarget(url)} schema "${SCHEMA}": ${epSeeded} podcast embeddings (${epSkipped} skipped), ${trSeeded} gallery traces (${trSkipped} skipped)`);
} finally {
	await client.end();
}
