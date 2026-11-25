// Assemble the build inputs the pages and APIs read (same shapes as the legacy scripts/derive/index.ts):
//   src/generated/legacy-data.json, src/generated/rss-items.json, public/api/posts/{all,umap}.json,
//   public/api/gallery/trace/*.svg (podcast and gallery still come from the content submodule until MIG-3).
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ColorSet, Location, Xy } from "./cache.ts";
import type { DerivedPost } from "./posts.ts";
import { RELATES_LIMIT, findNearest, type Candidate } from "./relates.ts";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const noDash = (id: string) => id.replaceAll("-", "");

export interface Extras {
	podcast: Record<string, any>[];
	podcastChannel: unknown;
	gallery: unknown[];
	traceFiles: string[];
	galleryDir?: string;
}

/** Podcast episodes (with embeddings), channel and gallery from the legacy generated dir. Empty when the dir is missing. */
export function readExtras(dir: string): Extras {
	const x: Extras = { podcast: [], podcastChannel: null, gallery: [], traceFiles: [] };
	if (existsSync(resolve(dir, "podcast"))) {
		x.podcast = readdirSync(resolve(dir, "podcast"))
			.filter((f) => f.endsWith(".json") && !f.startsWith("."))
			.map((f) => readJson(resolve(dir, "podcast", f)));
	}
	if (existsSync(resolve(dir, "podcast.json"))) x.podcastChannel = readJson(resolve(dir, "podcast.json")).channel ?? null;
	if (existsSync(resolve(dir, "gallery.json"))) x.gallery = readJson(resolve(dir, "gallery.json")).images ?? [];
	if (existsSync(resolve(dir, "gallery"))) {
		x.galleryDir = resolve(dir, "gallery");
		x.traceFiles = readdirSync(x.galleryDir).filter((f) => f.endsWith(".svg"));
	}
	return x;
}

export interface AssembleInput {
	posts: DerivedPost[];
	vectors: Map<string, number[]>;
	coordinates: Record<string, Xy>;
	colors: Map<string, ColorSet>;
	geocodes: Map<string, Location>;
	extras: Extras;
	source: string;
}

export function assemble(input: AssembleInput) {
	const { posts, vectors, coordinates: coords, colors, geocodes, extras, source } = input;

	const meta = posts
		.map((p) => {
			const e: Record<string, any> = { ...p.entry };
			if (p.cover) e.cover = p.cover;
			const cs = p.cover && colors.get(p.cover.url);
			if (cs) e.colorSet = cs;
			if (p.cities.length) e.locations = p.cities.flatMap((c) => (geocodes.has(c) ? [geocodes.get(c)!] : []));
			const v = vectors.get(p.legacyId);
			if (v) e.embeddings = v;
			if (coords[p.legacyId]) e.umap2D = coords[p.legacyId];
			return e;
		})
		.sort((a, b) => {
			const ka = a.file.replaceAll("/", "-") + ".json", kb = b.file.replaceAll("/", "-") + ".json";
			return ka < kb ? -1 : ka > kb ? 1 : 0;
		});

	const out: Record<string, any> = { source, posts: {}, podcast: [], podcastChannel: extras.podcastChannel, podcastRelated: {}, gallery: extras.gallery, traceFiles: extras.traceFiles, umapPosts: 0 };

	for (const e of meta) {
		const rec: Record<string, any> = {};
		if (e.cover) rec.cover = e.cover;
		if (e.colorSet) rec.colorSet = e.colorSet;
		if (e.umap2D) rec.umap2D = e.umap2D;
		if (e.tags?.length) rec.tags = e.tags.map((t: { label: string }) => t.label);
		if (e.city?.length) rec.city = e.city;
		if (e.locations?.length) rec.locations = e.locations;
		let rel = findNearest<Candidate & Record<string, any>>(e as any, meta as any, RELATES_LIMIT);
		if (e.isShort && rel.length === 0) rel = findNearest({ ...e, isShort: false } as any, meta as any, RELATES_LIMIT);
		rec.relates = rel.map((r) => noDash(r.id));
		out.posts[noDash(e.id)] = rec;
	}

	// /api/posts/all.json (search index) and the RSS items: plain-text content from the same extraction as content-prepare.
	const search = meta
		.map((e) => ({ id: e.id, href: e.href, title: e.title, date: new Date(e.date), content: e.content, category: e.category, tags: e.tags, series: e.series, city: e.city }))
		.sort((a, b) => b.date.getTime() - a.date.getTime());
	// substring can cut a surrogate pair; toWellFormed keeps the bundler's JSON parser happy (see legacy-data.mjs).
	const rssItems = search.map((p) => ({ title: p.title, href: p.href, date: p.date.toISOString(), description: (p.content.substring(0, 200) + "...").toWellFormed() }));
	out.umapPosts = meta.filter((e) => e.umap2D).length;
	const umapPosts = meta.filter((e) => e.umap2D).map(({ id, href, title, date, category, umap2D }) => ({ id, href, title, date, category, umap2D }));

	out.podcast = extras.podcast
		.map((ep) => (coords[ep.id] ? { ...ep, umap2D: coords[ep.id] } : ep))
		.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

	// "More to discover" on episode pages: 4 nearest episodes (same rule as the legacy getStaticPaths).
	const candidates = out.podcast.map((e: any) => ({ ...e, category: { label: "podcast" } }));
	for (const e of candidates) out.podcastRelated[e.id] = findNearest(e, candidates, 4).map((r: any) => r.id);

	const pod = out.podcast.filter((e: any) => e.umap2D).map(({ id, link, title, pubDate, umap2D }: any) => ({ id, href: link, title, date: pubDate, category: { label: "podcast", href: "/podcast" }, umap2D }));
	const umap = { posts: [...umapPosts, ...pod].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) };

	return { out, search, rssItems, umap };
}

export function writeOutputs(root: string, r: ReturnType<typeof assemble>, extras: Extras) {
	const apiDir = resolve(root, "public/api");
	rmSync(resolve(apiDir, "gallery"), { recursive: true, force: true });
	rmSync(resolve(apiDir, "posts"), { recursive: true, force: true });
	mkdirSync(resolve(apiDir, "posts"), { recursive: true });
	writeFileSync(resolve(apiDir, "posts/all.json"), JSON.stringify({ posts: r.search }));
	writeFileSync(resolve(apiDir, "posts/umap.json"), JSON.stringify(r.umap));
	if (extras.galleryDir) {
		const dest = resolve(apiDir, "gallery/trace");
		mkdirSync(dest, { recursive: true });
		for (const f of extras.traceFiles) copyFileSync(resolve(extras.galleryDir, f), resolve(dest, f));
	}
	const target = resolve(root, "src/generated/legacy-data.json");
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, JSON.stringify(r.out));
	writeFileSync(resolve(dirname(target), "rss-items.json"), JSON.stringify(r.rssItems));
}
