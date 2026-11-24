// Distils the legacy build-time generated data (src/content/generated of the old site) into
//   - src/generated/legacy-data.json   compact lookup the prerendered pages/APIs import
//   - public/api/gallery/trace/*.svg, public/api/posts/{all,umap}.json   static copies
// Prerender runs inside workerd, which cannot read the disk, so this runs before `astro build`.
//
// TODO DATA-1: covers/color sets/UMAP/embeddings/podcast/gallery move into EmDash; delete this script then.
// Source dir: LEGACY_GENERATED_DIR (default ../../src/content/generated, the legacy submodule). If the
// directory is missing the output is empty and the build still works (APIs lose cover colors/relates/etc).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, process.env.LEGACY_GENERATED_DIR || "../../src/content/generated");
const RELATES_LIMIT = 8; // POST_COUNT_PER_PAGE / 2

const out = { source: null, posts: {}, podcast: [], gallery: [], umapPosts: 0 };
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const apiDir = resolve(root, "public/api");
rmSync(resolve(apiDir, "gallery"), { recursive: true, force: true });
rmSync(resolve(apiDir, "posts"), { recursive: true, force: true });

function cosineDistance(a, b) {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 1;
	return 1 - dot / Math.sqrt(na * nb);
}
const has = (e, len) => Array.isArray(e.embeddings) && e.embeddings.length > 0 && (len === undefined || e.embeddings.length === len);
// Same algorithm as legacy packages/utils/nearest.ts
function findNearest(target, candidates, limit) {
	const pool = candidates.filter((c) => c.id !== target.id && c.category.label === target.category.label && (!target.isShort || c.isShort === true));
	const dims = has(target) ? target.embeddings.length : undefined;
	const byE = [], byU = [], rest = [];
	for (const item of pool) {
		if (dims !== undefined && has(item, dims)) byE.push({ item, d: cosineDistance(target.embeddings, item.embeddings) });
		else if (target.umap2D && item.umap2D) byU.push({ item, d: Math.hypot(target.umap2D[0] - item.umap2D[0], target.umap2D[1] - item.umap2D[1]) });
		else rest.push(item);
	}
	const by = (a, b) => a.d - b.d;
	return [...byE.sort(by).map((x) => x.item), ...byU.sort(by).map((x) => x.item), ...rest].slice(0, limit);
}

if (existsSync(resolve(dir, "metadata"))) {
	out.source = dir;
	const statePath = resolve(dir, "metadata/.umap-state.json");
	const coords = existsSync(statePath) ? (readJson(statePath).coordinates ?? {}) : {};
	const files = readdirSync(resolve(dir, "metadata")).filter((f) => f.endsWith(".json") && !f.startsWith(".")).sort();
	const meta = files.map((f) => {
		const e = readJson(resolve(dir, "metadata", f));
		return coords[e.file] ? { ...e, umap2D: coords[e.file] } : e;
	});

	// Metadata ids use an older slugger (`fekitextension`); the href carries the real glob id.
	// Keys are dash-less because some metadata files predate a slug rename (`fekitextension` vs `fekit-extension`).
	const gid = (e) => e.href.replace(/^\/[^/]+\//, "").replaceAll("-", "");
	const gidOf = new Map(meta.map((e) => [e.id, gid(e)]));
	for (const e of meta) {
		const rec = {};
		if (e.cover) rec.cover = e.cover;
		if (e.colorSet) rec.colorSet = e.colorSet;
		if (e.umap2D) rec.umap2D = e.umap2D;
		if (e.tags?.length) rec.tags = e.tags.map((t) => t.label);
		if (e.city?.length) rec.city = e.city;
		if (e.locations?.length) rec.locations = e.locations;
		let rel = findNearest(e, meta, RELATES_LIMIT);
		if (e.isShort && rel.length === 0) rel = findNearest({ ...e, isShort: false }, meta, RELATES_LIMIT);
		rec.relates = rel.map((r) => gidOf.get(r.id));
		out.posts[gid(e)] = rec;
	}

	// /api/posts/all.json (search index) and /api/posts/umap.json, byte-for-byte what the legacy routes emitted
	mkdirSync(resolve(apiDir, "posts"), { recursive: true });
	const search = meta
		.map((e) => ({ id: e.id, href: e.href, title: e.title, date: new Date(e.date), content: e.content, category: e.category, tags: e.tags, series: e.series, city: e.city }))
		.sort((a, b) => b.date.getTime() - a.date.getTime());
	writeFileSync(resolve(apiDir, "posts/all.json"), JSON.stringify({ posts: search }));
	out.umapPosts = meta.filter((e) => e.umap2D).length;
	out._meta = meta.filter((e) => e.umap2D).map(({ id, href, title, date, category, umap2D }) => ({ id, href, title, date, category, umap2D }));
}

if (existsSync(resolve(dir, "podcast"))) {
	const statePath = resolve(dir, "metadata/.umap-state.json");
	const coords = existsSync(statePath) ? (readJson(statePath).coordinates ?? {}) : {};
	out.podcast = readdirSync(resolve(dir, "podcast"))
		.filter((f) => f.endsWith(".json") && !f.startsWith("."))
		.map((f) => {
			const ep = readJson(resolve(dir, "podcast", f));
			return coords[ep.id] ? { ...ep, umap2D: coords[ep.id] } : ep;
		})
		.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

if (out._meta) {
	const pod = out.podcast.filter((e) => e.umap2D).map(({ id, link, title, pubDate, umap2D }) => ({ id, href: link, title, date: pubDate, category: { label: "podcast", href: "/podcast" }, umap2D }));
	const posts = [...out._meta, ...pod].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	writeFileSync(resolve(apiDir, "posts/umap.json"), JSON.stringify({ posts }));
	delete out._meta;
}

if (existsSync(resolve(dir, "gallery.json"))) out.gallery = readJson(resolve(dir, "gallery.json")).images ?? [];
if (existsSync(resolve(dir, "gallery"))) {
	const dest = resolve(apiDir, "gallery/trace");
	mkdirSync(dest, { recursive: true });
	for (const f of readdirSync(resolve(dir, "gallery")).filter((f) => f.endsWith(".svg"))) copyFileSync(resolve(dir, "gallery", f), resolve(dest, f));
}

const target = resolve(root, "src/generated/legacy-data.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out));
console.log(
	out.source
		? `[legacy-data] ${Object.keys(out.posts).length} post records, ${out.podcast.length} podcast episodes, ${out.gallery.length} gallery images from ${dir}`
		: `[legacy-data] WARNING: ${dir} not found; wrote empty data (set LEGACY_GENERATED_DIR). Covers colors, relates, podcast and UMAP APIs will be empty.`,
);
