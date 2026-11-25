// Helpers for URL-parity checks (QA-1): public paths of a built `dist/client` vs legacy snapshots.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DIST_CLIENT = resolve(here, "../dist/client");
export const LEGACY_GROUPS_PATH = resolve(here, "legacy-route-groups.json");
export const LEGACY_URLS_PATH = resolve(here, "legacy-urls.txt");

export interface RouteGroup {
	count: number;
	paths: string[];
}

export interface RouteGroups {
	generated?: string;
	source?: Record<string, unknown>;
	total?: number;
	groups: Record<string, RouteGroup>;
}

export const loadGroups = (filePath = LEGACY_GROUPS_PATH): RouteGroups =>
	JSON.parse(readFileSync(filePath, "utf8")) as RouteGroups;

/** Load non-empty, non-comment paths from `legacy-urls.txt` (or another snapshot file). */
export function loadLegacyUrls(filePath = LEGACY_URLS_PATH): string[] {
	return readFileSync(filePath, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Canonical comparison key for a URL path. Deliberately strict:
 * - ensures a leading `/` and collapses duplicate slashes
 * - percent-decodes with `decodeURI` (reserved escapes such as `%23` and `%2F` stay encoded, so
 *   `/tag/c%23` is compared as written and never turns into a fragment); invalid escapes stay raw
 * - does NOT touch the trailing slash: `/about/` (directory page) and `/about` or `/about.html`
 *   are different public URLs and never match each other
 * - applies no Unicode normalization: legacy and built names come from the same slug function and
 *   the full snapshot compares equal without it (see "real legacy snapshot" tests)
 */
export function normalizePath(p: string): string {
	let s = p.trim();
	if (!s.startsWith("/")) s = "/" + s;
	s = s.replace(/\/+/g, "/");
	try {
		return decodeURI(s);
	} catch {
		return s;
	}
}

/** Infrastructure files every Cloudflare/Astro build emits that legacy never listed. */
const INFRA_EXACT = new Set(["/.assetsignore", "/_headers", "/_redirects", "/_routes.json", "/sitemap.xml"]);

/** Build/runtime infrastructure paths excluded from unexpected-extra checks. */
export function isInfraPath(p: string): boolean {
	const norm = p.startsWith("/") ? p : "/" + p;
	if (INFRA_EXACT.has(norm)) return true;
	if (norm.startsWith("/_astro/") || norm === "/_astro") return true;
	if (norm.startsWith("/_emdash/") || norm === "/_emdash") return true;
	return norm.split("/").some((seg) => seg.startsWith("_noop"));
}

const POST_RE = /^\/[^/]+\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/$/;
const POST_API_RE = /^\/api\/(?:cards|relates)\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\.json$/;

/** `YYYYMMDD` of a post-shaped path (post page or its `/api/cards|relates` file), else null. */
export function postDateKey(p: string): string | null {
	const n = normalizePath(p);
	const m = POST_RE.exec(n) ?? POST_API_RE.exec(n);
	return m ? m[1] + m[2] + m[3] : null;
}

/** Latest post-page date (`YYYYMMDD`) among the legacy URLs: the legacy snapshot's "now". */
export function latestLegacyPostDate(legacy: Iterable<string>): string {
	let max = "";
	for (const p of legacy) {
		if (!POST_RE.test(normalizePath(p))) continue;
		const k = postDateKey(p);
		if (k && k > max) max = k;
	}
	return max;
}

/** Public URL path of every file under `dir` (`a/b/index.html` -> `/a/b/`; other files keep their name). */
export function builtPaths(dir = DIST_CLIENT): Set<string> {
	const out = new Set<string>();
	if (!existsSync(dir) || !statSync(dir).isDirectory()) return out;
	const walk = (d: string) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.isFile()) {
				const rel = "/" + relative(dir, p).split("\\").join("/");
				out.add(rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel);
			}
		}
	};
	walk(dir);
	return out;
}

/** Legacy paths missing from the build and built paths outside `allLegacy` (exact normalized comparison, infra files ignored). */
export function diffGroup(legacyPaths: string[], built: Set<string>, allLegacy: Set<string>) {
	const builtNorm = new Set([...built].map((p) => normalizePath(p)));
	const legacyNorm = new Set(legacyPaths.map((p) => normalizePath(p)));
	const missing = legacyPaths.filter((p) => !builtNorm.has(normalizePath(p)));
	const allLegacyNorm = new Set([...allLegacy].map((p) => normalizePath(p)));
	const extra = [...built]
		.filter((p) => !isInfraPath(p) && !allLegacyNorm.has(normalizePath(p)))
		.sort();
	return { missing, extra, legacyNorm, builtNorm, allLegacyNorm };
}
