import { afterEach, describe, expect, it, vi } from "vitest";
import { pruneEmbeddings, pruneTraces } from "./cache.ts";
import { buildEpisodes, parseDate, type PodcastRow } from "./media.ts";

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
