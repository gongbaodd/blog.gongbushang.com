// GON-203: posts the editor marked "noindex" in the EmDash SEO panel must not be in the sitemap. Static assets are served
// without waking the Worker (run_worker_first: false), so this is decided at build time:
//   write-noindex.ts (pre-build, reads `_emdash_seo` read-only) -> apps/web/.astro/seo-noindex.json -> the @astrojs/sitemap `filter`.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const NOINDEX_FILE = resolve(import.meta.dirname, "../../.astro/seo-noindex.json");

/** Legacy ids (`YYYY/MM/DD/slug`) of noindex posts. Warns (and returns an empty set) when the pre-build step did not run. */
export function readNoindexIds(file = NOINDEX_FILE) {
	if (!existsSync(file)) {
		console.warn(`[seo] ${file} is missing (scripts/seo/write-noindex.ts did not run): no post is excluded from the sitemap`);
		return new Set();
	}
	try {
		const data = JSON.parse(readFileSync(file, "utf8"));
		if (!Array.isArray(data.legacyIds)) throw new Error("no legacyIds array");
		return new Set(data.legacyIds.filter((x) => typeof x === "string"));
	} catch (err) {
		console.warn(`[seo] ${file} is corrupt (${err instanceof Error ? err.message : err}): no post is excluded from the sitemap`);
		return new Set();
	}
}

/** True when `page` (absolute sitemap URL) is `/<category>/<legacyId>/` of a noindex post. */
export function isNoindexedPage(page, legacyIds) {
	let path;
	try {
		path = new URL(page).pathname;
	} catch {
		path = page;
	}
	const m = /^\/[^/]+\/(\d{4}\/\d{2}\/\d{2}\/[^/]+)\/?$/.exec(path);
	if (!m) return false;
	let id = m[1];
	try {
		id = decodeURIComponent(id);
	} catch {
		/* keep raw */
	}
	return legacyIds.has(id);
}
