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

function safeDecodeSegment(seg: string): string {
	try {
		return decodeURIComponent(seg);
	} catch {
		try {
			return decodeURI(seg);
		} catch {
			return seg;
		}
	}
}

/**
 * Canonical comparison key for a URL path:
 * - ensures leading `/` and collapses duplicate slashes
 * - percent-decodes each segment safely and normalizes Unicode to NFC
 * - strips trailing `/` on non-root paths so `/about` and `/about/` match
 */
export function normalizePath(p: string, opts: { stripTrailingSlash?: boolean } = {}): string {
	const stripTrailingSlash = opts.stripTrailingSlash ?? true;
	let s = p.trim();
	if (!s.startsWith("/")) s = "/" + s;
	s = s.replace(/\/+/g, "/");
	s = s
		.split("/")
		.map(safeDecodeSegment)
		.join("/")
		.normalize("NFC");
	if (stripTrailingSlash && s.length > 1 && s.endsWith("/")) {
		s = s.slice(0, -1);
	}
	return s;
}

/** Build/runtime infrastructure paths excluded from unexpected-extra checks. */
export function isInfraPath(p: string): boolean {
	const norm = p.startsWith("/") ? p : "/" + p;
	if (norm.startsWith("/_astro/") || norm === "/_astro") return true;
	if (norm.startsWith("/_emdash/") || norm === "/_emdash") return true;
	return norm.split("/").some((seg) => seg.startsWith("_noop"));
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

/** Legacy paths missing from the build and unexpected built paths outside `allLegacy` (compared normalized). */
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
