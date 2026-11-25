import { beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/src/analytics", () => ({ track }));

import { trackSearchOpened, trackSearchPerformed, trackSearchResultClicked } from "./tracking";

describe("search tracking", () => {
	beforeEach(() => track.mockClear());

	it("search_opened carries the source", () => {
		trackSearchOpened("hotkey");
		expect(track).toHaveBeenCalledWith("search_opened", { source: "hotkey" });
	});

	it("search_result_clicked has rank, slug and trimmed query; omits empty query", () => {
		trackSearchResultClicked(3, 42, "  astro ");
		expect(track).toHaveBeenLastCalledWith("search_result_clicked", { rank: 3, slug: "42", query: "astro" });
		trackSearchResultClicked(1, "a/b", "   ");
		expect(track).toHaveBeenLastCalledWith("search_result_clicked", { rank: 1, slug: "a/b" });
	});

	it("search_performed needs >=2 chars and a new query", () => {
		expect(trackSearchPerformed("a", "", 5)).toBe("");
		expect(track).not.toHaveBeenCalled();
		expect(trackSearchPerformed(" ab ", "", 5)).toBe("ab");
		expect(track).toHaveBeenCalledWith("search_performed", { query: "ab", query_length: 2, result_count: 5 });
		track.mockClear();
		expect(trackSearchPerformed("ab", "ab", 5)).toBe("ab");
		expect(track).not.toHaveBeenCalled();
	});
});
