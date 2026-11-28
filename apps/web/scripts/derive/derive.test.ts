import { describe, expect, it } from "vitest";
import { fakeEmbedding } from "./embed.ts";
import { assemble, type Extras } from "./outputs.ts";
import { buildPosts, orderLike, resolvePostRows, type PostRow } from "./posts.ts";
import { corpusHashes } from "./cache.ts";
import { findNearest, type Candidate } from "./relates.ts";
import { resolveUmap } from "./umap.ts";

process.env.TZ = "Europe/Tallinn";

const row = (legacy_id: string, body: string, terms: PostRow["terms"], featured_image: string | null = null): PostRow => ({ id: legacy_id, legacy_id, body_md: body, featured_image, terms });
const term = (name: string, slug: string, label = slug) => ({ name, slug, label });

describe("relates (legacy nearest.ts)", () => {
	const mk = (id: string, e: number[] | undefined, cat = "tech", extra: Partial<Candidate> = {}): Candidate => ({ id, category: { label: cat }, embeddings: e, ...extra });
	it("ranks by cosine distance within the category and honours the limit", () => {
		const all = [mk("a", [1, 0]), mk("b", [0.9, 0.1]), mk("c", [0, 1]), mk("d", [1, 0], "life")];
		expect(findNearest(all[0]!, all, 2).map((x) => x.id)).toEqual(["b", "c"]);
	});
	it("falls back to UMAP distance, then the rest, for posts without embeddings", () => {
		const all = [mk("a", undefined, "tech", { umap2D: [0, 0] }), mk("b", undefined, "tech", { umap2D: [5, 5] }), mk("c", undefined, "tech", { umap2D: [1, 1] }), mk("d", undefined)];
		expect(findNearest(all[0]!, all, 8).map((x) => x.id)).toEqual(["c", "b", "d"]);
	});
	it("short posts relate to short posts only", () => {
		const all = [mk("a", [1, 0], "tech", { isShort: true }), mk("b", [1, 0], "tech", { isShort: false }), mk("c", [0, 1], "tech", { isShort: true })];
		expect(findNearest(all[0]!, all, 8).map((x) => x.id)).toEqual(["c"]);
	});
});

describe("posts -> legacy metadata entries", () => {
	const rows = [
		row("2020/01/02/a-post", "# Hello World\n\nSome **bold** text with a [link](https://x.y).", [term("category", "tech"), term("tag", "react", "React"), term("tag", "css", "CSS"), term("series", "s1", "S One"), term("city", "tallinn-estonia", "Tallinn, Estonia")]),
		row("2020/01/03/no-heading", "just text", [term("category", "life")]),
	];
	it("derives title, plain-text content, links, isShort like content-prepare", async () => {
		const [a, b] = await buildPosts(rows, new Map());
		expect(a!.entry).toMatchObject({
			id: "2020/01/02/a-post",
			href: "/2020/01/02/a-post",
			title: "Hello World",
			category: { label: "tech", href: "/tech" },
			series: { label: "S One", href: "/series/s1" },
			city: ["Tallinn, Estonia"],
			isShort: true,
		});
		expect(a!.entry.content).toBe("Hello World\n\nSome bold text with a link.");
		expect(a!.entry.tags).toEqual([{ label: "css", href: "/tag/css" }, { label: "react", href: "/tag/react" }]);
		expect(b!.entry.title).toBe("no heading"); // legacy rule: slug with dashes as spaces
		expect(b!.entry.series).toBeUndefined();
	});
	it("pins tag order from the hint and keeps the cache key stable", async () => {
		const hint = new Map([["2020/01/02/a-post", { tag_order: ["react", "css"], city_order: [] }]]);
		const [a] = await buildPosts(rows, hint);
		expect(a!.entry.tags.map((t) => t.label)).toEqual(["react", "css"]);
		const [a2] = await buildPosts(rows, hint);
		expect(a2!.contentHash).toBe(a!.contentHash);
		const [changed] = await buildPosts([row("2020/01/02/a-post", rows[0]!.body_md + "\nmore", rows[0]!.terms)], hint);
		expect(changed!.contentHash).not.toBe(a!.contentHash);
		const [noHint] = await buildPosts(rows, new Map());
		expect(noHint!.contentHash).not.toBe(a!.contentHash); // tag order is part of the embedding text
	});
	it("orderLike: pinned first, unknown after, alphabetical", () => {
		expect(orderLike(["c", "A", "b"], ["b"])).toEqual(["b", "A", "c"]);
	});
	it("a series label equal to its slug is not a name", async () => {
		const [p] = await buildPosts([row("2020/01/04/x", "# X", [term("category", "fe"), term("series", "same", "same")])], new Map());
		expect(p!.entry.series).toEqual({ label: "same", href: "/series/same" });
	});
});

describe("assemble (legacy-data.json, search index, rss, umap)", () => {
	const extras: Extras = { podcast: [{ id: "ep1", title: "E1", link: "/podcast/ep1", pubDate: "2020-02-01T00:00:00Z", embeddings: [0, 1] }], gallery: [], traces: new Map([["01-02-a.svg", "<svg/>"], ["03-04-b.svg", "<svg data-placeholder=\"1\"/>"]]), placeholderTraces: new Set(["03-04-b.svg"]) };
	it("produces the shapes the pages read", async () => {
		const posts = await buildPosts(
			[
				row("2020/01/02/one", "# One\n\nalpha", [term("category", "tech"), term("tag", "t", "T"), term("city", "x", "Tallinn")], JSON.stringify({ src: "https://img/1.jpg", alt: "a" })),
				row("2020/01/03/two", "# Two\n\nbeta", [term("category", "tech")]),
			],
			new Map(),
		);
		const r = assemble({
			posts,
			vectors: new Map([["2020/01/02/one", [1, 0]], ["2020/01/03/two", [0.9, 0.1]]]),
			coordinates: { "2020/01/02/one": [1, 2], "2020/01/03/two": [3, 4], ep1: [5, 6] },
			colors: new Map([["https://img/1.jpg", { bgColor: "#111", titleColor: "x" }]]),
			geocodes: new Map([["Tallinn", { latitude: 59.4, longitude: 24.7 }]]),
			extras,
			source: "test",
		});
		expect(r.out.posts["2020/01/02/one"]).toEqual({
			cover: { url: "https://img/1.jpg", alt: "a" },
			colorSet: { bgColor: "#111", titleColor: "x" },
			umap2D: [1, 2],
			tags: ["t"],
			city: ["Tallinn"],
			locations: [{ latitude: 59.4, longitude: 24.7 }],
			relates: ["2020/01/03/two"],
		});
		expect(r.search.map((p) => p.id)).toEqual(["2020/01/03/two", "2020/01/02/one"]); // newest first
		expect(r.rssItems[0]).toMatchObject({ title: "Two", href: "/2020/01/03/two", description: "Two\n\nbeta..." });
		expect(r.umap.posts.map((p: any) => p.id)).toEqual(["ep1", "2020/01/03/two", "2020/01/02/one"]); // newest first, podcast included
		expect(r.out.podcast[0].umap2D).toEqual([5, 6]);
		expect(r.out.umapPosts).toBe(2);
		expect(r.out.traceFiles).toEqual(["01-02-a.svg", "03-04-b.svg"]);
		expect(r.out.placeholderTraceFiles).toEqual(["03-04-b.svg"]);
	});
	it("a post without an embedding is left out of relates but stays in search and rss", async () => {
		const posts = await buildPosts([row("2020/01/02/one", "# One\n\nalpha", [term("category", "tech")]), row("2020/01/03/new", "# New\n\nfresh", [term("category", "tech")])], new Map());
		const r = assemble({ posts, vectors: new Map([["2020/01/02/one", [1, 0]]]), coordinates: {}, colors: new Map(), geocodes: new Map(), extras: { ...extras, podcast: [] }, source: "t" });
		expect(r.out.posts["2020/01/02/one"].relates).toEqual(["2020/01/03/new"]); // rest bucket
		expect(r.search).toHaveLength(2);
		expect(r.rssItems).toHaveLength(2);
		expect(r.out.umapPosts).toBe(0);
	});
});

describe("fake embedder (tests only)", () => {
	it("is deterministic, 1024-d and unit length", () => {
		const v = fakeEmbedding("hello");
		expect(v).toHaveLength(1024);
		expect(fakeEmbedding("hello")).toEqual(v);
		expect(fakeEmbedding("hellO")).not.toEqual(v);
		expect(Math.hypot(...v)).toBeCloseTo(1, 4);
		expect(v.every((x) => Math.fround(x) === x)).toBe(true);
	});
});

describe("UMAP state", () => {
	const corpus = [
		{ key: "b", embeddings: [0, 1] },
		{ key: "a", embeddings: [1, 0] },
	];
	const client = (state?: any) => ({ query: async () => ({ rows: state ? [state] : [] }) }) as any;
	it("reuses the stored layout while the corpus hash is unchanged", async () => {
		const { inputHash, paramsHash } = corpusHashes([...corpus].sort((x, y) => x.key.localeCompare(y.key)));
		const r = await resolveUmap(client({ input_hash: inputHash, params_hash: paramsHash, count: 2, coordinates: { a: [1, 1], b: [2, 2] } }), corpus);
		expect(r.status).toBe("reused");
		expect(r.coordinates).toEqual({ a: [1, 1], b: [2, 2] });
	});
	it("keeps the previous layout when the binary is unavailable (never fails the build)", async () => {
		process.env.UMAP_BIN = "/nonexistent/umap";
		const r = await resolveUmap(client({ input_hash: "old", params_hash: "old", count: 3, coordinates: { a: [1, 1], gone: [9, 9] } }), corpus);
		delete process.env.UMAP_BIN;
		expect(r.status).toBe("stale");
		expect(r.coordinates).toEqual({ a: [1, 1] });
	});
	it("skips with fewer than two points", async () => {
		expect((await resolveUmap(client(), [corpus[0]!])).status).toBe("skipped");
	});
});

describe("post rows for posts created in the admin (GON-269)", () => {
	const raw = (o: Record<string, unknown>) => ({ id: "ulid", legacy_id: null, slug: "s", published_at: null, body_md: "", featured_image: null, terms: [], ...o }) as Parameters<typeof resolvePostRows>[0][number];
	it("keys imported posts by legacy_id and new ones by YYYY/MM/DD/<slug> (Tallinn date); skips unpublished", () => {
		const rows = resolvePostRows([
			raw({ id: "a", legacy_id: "2015/03/15/threejs", slug: "2015-03-15-threejs", published_at: "2026-11-27T10:00:00Z" }),
			raw({ id: "b", slug: "fresh", published_at: "2026-07-14T21:30:00.000Z" }),
			raw({ id: "c", slug: "never-published" }),
		]);
		expect(rows.map((r) => [r.id, r.legacy_id])).toEqual([["a", "2015/03/15/threejs"], ["b", "2026/07/15/fresh"]]);
		expect(rows[1]).not.toHaveProperty("slug");
	});
	it("keeps legacy_id exactly as stored (no trim), so derive cache keys do not change", () => {
		const rows = resolvePostRows([raw({ id: "a", legacy_id: " 2015/03/15/odd ", slug: "x", published_at: "2026-01-01T00:00:00Z" })]);
		expect(rows[0]!.legacy_id).toBe(" 2015/03/15/odd ");
	});
	it("fails on a duplicate id", () => {
		expect(() => resolvePostRows([raw({ id: "a", slug: "x", published_at: "2026-07-15T08:00:00Z" }), raw({ id: "b", slug: "x", published_at: "2026-07-15T09:00:00Z" })])).toThrow(/duplicate post id: 2026\/07\/15\/x/);
	});
});
