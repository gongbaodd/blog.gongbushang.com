import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneEmbeddings, pruneTraces } from "./cache.ts";
import { buildEpisodes, isPlaceholderSvg, parseDate, placeholderSvg, resolveTraces, type DerivedGalleryImage, type PodcastRow } from "./media.ts";

const palette = vi.hoisted(() => vi.fn());
vi.mock("../../../../packages/image-metadata/src/get-palette.ts", () => ({ getPaletteColorSet: palette }));

const ep = (over: Partial<PodcastRow> = {}): PodcastRow => ({
	legacy_id: "e1",
	title: "T",
	link: null,
	pub_date: "2024-04-28T07:30:00.000Z",
	description: null,
	summary: null,
	duration: null,
	audio_url: null,
	image_url: null,
	color_set: null,
	...over,
});

afterEach(() => vi.restoreAllMocks());

describe("prune guards", () => {
	const client = () => {
		const query = vi.fn(async () => ({ rowCount: 3, rows: [] }));
		return { query, c: { query } as never };
	};
	it("never prunes embeddings or traces when the read returned 0 items", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { query, c } = client();
		expect(await pruneEmbeddings(c, [], "podcast_embeddings")).toBe(0);
		expect(await pruneEmbeddings(c, [])).toBe(0);
		expect(await pruneTraces(c, [])).toBe(0);
		expect(query).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledTimes(3);
	});
	it("still prunes against a non-empty keep set", async () => {
		const { query, c } = client();
		expect(await pruneEmbeddings(c, ["a"], "podcast_embeddings")).toBe(3);
		expect(query).toHaveBeenCalledOnce();
	});
});

describe("buildEpisodes", () => {
	it("warns for an episode keyed by slug/id instead of legacy_id, and keeps it", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = buildEpisodes([ep({ legacy_id: "my-slug", legacy_missing: true })]);
		expect(out.map((e) => e.legacyId)).toEqual(["my-slug"]);
		expect(warn.mock.calls[0]![0]).toContain("no legacy_id");
	});
	it("uses created_at (never 1970) for a null pub_date and warns", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = buildEpisodes([ep({ pub_date: "2026-11-25 10:00:00", pub_missing: true })]);
		expect(out[0]!.episode.pubDate).toBe("Wed, 25 Nov 2026 10:00:00 GMT");
		expect(warn.mock.calls[0]![0]).toContain("creation date");
	});
	it("skips an episode whose date does not parse at all, with a warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(buildEpisodes([ep({ pub_date: null }), ep({ legacy_id: "x", pub_date: "nonsense" })])).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(2);
	});
	it("skips a later episode whose fallback key duplicates an earlier one", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = buildEpisodes([ep({ legacy_id: "same" }), ep({ legacy_id: "same", title: "Other", legacy_missing: true })]);
		expect(out).toHaveLength(1);
		expect(out[0]!.episode.title).toBe("T");
		expect(warn.mock.calls.some((c) => String(c[0]).includes("duplicate"))).toBe(true);
	});
	it("parseDate reads SQL timestamps as UTC", () => {
		expect(parseDate("2026-11-25 10:00:00")?.toISOString()).toBe("2026-11-25T10:00:00.000Z");
		expect(parseDate("")).toBeNull();
	});
});

describe("gallery traces (frozen cache, PORT-8b part 3)", () => {
	const img = (id: string, image: string, colorSet?: { bgColor: string; titleColor: string }): DerivedGalleryImage => ({
		entry: { id, file: id, hash: "", image, doc: "", colorSet },
		traceFile: `${id.replaceAll("/", "-")}.svg`,
	});
	/** Fake pg client: gallery_traces select returns `cached`; every other statement is recorded. */
	const client = (cached: { image_url: string; svg: string; bg_color: string; title_color: string }[]) => {
		const query = vi.fn(async (sql: string) => (/^\s*select/i.test(sql) ? { rows: cached, rowCount: cached.length } : { rows: [], rowCount: 0 }));
		return { query, c: { query } as never };
	};
	const REAL = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

	it("placeholderSvg is deterministic, tiny, and falls back to neutral grey", () => {
		expect(placeholderSvg("#AABBCC")).toBe(placeholderSvg("#aabbcc"));
		expect(placeholderSvg("#aabbcc")).toContain('fill="#aabbcc"');
		expect(placeholderSvg("")).toContain('fill="#808080"');
		expect(placeholderSvg("red; x")).toContain('fill="#808080"'); // never injects markup
		expect(placeholderSvg("#123").length).toBeLessThan(250);
		expect(isPlaceholderSvg(placeholderSvg())).toBe(true);
		expect(isPlaceholderSvg(REAL)).toBe(false);
	});

	it("serves a cached trace untouched and never traces, fetches or writes", async () => {
		palette.mockReset();
		const { query, c } = client([{ image_url: "https://img/a.jpg", svg: REAL, bg_color: "#111111", title_color: "x" }]);
		const g = [img("01/02/a", "https://img/a.jpg")];
		const r = await resolveTraces(c, g);
		expect(r.svgByUrl.get("https://img/a.jpg")).toBe(REAL);
		expect(r.placeholderUrls.size).toBe(0);
		expect(r).toMatchObject({ reused: 1, placeholders: 0 });
		expect(g[0]!.entry.colorSet).toEqual({ bgColor: "#111111", titleColor: "x" });
		expect(palette).not.toHaveBeenCalled();
		expect(query.mock.calls.some(([sql]) => /insert/i.test(String(sql)))).toBe(false);
	});

	it("an uncached image gets a placeholder in its extracted bgColor, which is cached for the next build", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		palette.mockReset().mockResolvedValue({ bgColor: "#334455", titleColor: "t" });
		const { query, c } = client([]);
		const g = [img("03/04/new", "https://img/new.jpg")];
		const r = await resolveTraces(c, g);
		expect(r.svgByUrl.get("https://img/new.jpg")).toBe(placeholderSvg("#334455"));
		expect([...r.placeholderUrls]).toEqual(["https://img/new.jpg"]);
		expect(r.placeholders).toBe(1);
		expect(g[0]!.entry.colorSet).toEqual({ bgColor: "#334455", titleColor: "t" });
		expect(query.mock.calls.filter(([sql]) => /insert/i.test(String(sql)))).toHaveLength(1);
	});

	it("uses the CMS colour set without extraction, and grey when colours are skipped or fail", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		palette.mockReset().mockRejectedValue(new Error("boom"));
		const { c } = client([]);
		const g = [img("a/b/cms", "https://img/cms.jpg", { bgColor: "#010203", titleColor: "t" }), img("a/b/skip", "https://img/skip.jpg"), img("a/b/fail", "https://img/fail.jpg")];
		const skipped = await resolveTraces(c, g.slice(0, 2), false);
		expect(skipped.svgByUrl.get("https://img/cms.jpg")).toBe(placeholderSvg("#010203"));
		expect(skipped.svgByUrl.get("https://img/skip.jpg")).toBe(placeholderSvg());
		expect(palette).not.toHaveBeenCalled();
		const failed = await resolveTraces(c, [g[2]!], true);
		expect(failed.failed).toEqual(["https://img/fail.jpg"]);
		expect(failed.svgByUrl.get("https://img/fail.jpg")).toBe(placeholderSvg());
	});

	it("an empty gallery read never prunes the cache; a non-empty one does", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const empty = client([{ image_url: "https://img/a.jpg", svg: REAL, bg_color: "", title_color: "" }]);
		await resolveTraces(empty.c, [], true, 4, []);
		expect(empty.query.mock.calls.some(([sql]) => /delete/i.test(String(sql)))).toBe(false);
		const full = client([]);
		await resolveTraces(full.c, [], true, 4, ["https://img/a.jpg"]);
		expect(full.query.mock.calls.some(([sql]) => /delete/i.test(String(sql)))).toBe(true);
	});
});
