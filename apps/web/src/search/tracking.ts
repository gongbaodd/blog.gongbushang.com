import { track } from "@/src/analytics";

export type SearchSource = "button" | "hotkey";

export function trackSearchOpened(source: SearchSource) {
	track("search_opened", { source });
}

export function trackSearchResultClicked(rank: number, id: string | number, query: string) {
	const q = query.trim();
	track("search_result_clicked", {
		rank,
		slug: String(id),
		...(q ? { query: q } : {}),
	});
}

/** Fires once per distinct trimmed query of >= 2 chars; returns the new "last tracked" value. */
export function trackSearchPerformed(query: string, lastTracked: string, resultCount: number): string {
	const q = query.trim();
	if (q.length >= 2 && q !== lastTracked) {
		track("search_performed", { query: q, query_length: q.length, result_count: resultCount });
		return q;
	}
	return lastTracked;
}
