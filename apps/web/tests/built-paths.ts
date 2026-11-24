// Helpers for URL-parity checks (QA-1 seed): public paths of a built `dist/client` vs tests/legacy-route-groups.json.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DIST_CLIENT = resolve(here, "../dist/client");

export interface RouteGroups {
	groups: Record<string, { count: number; paths: string[] }>;
}

export const loadGroups = (): RouteGroups => JSON.parse(readFileSync(resolve(here, "legacy-route-groups.json"), "utf8"));

/** Public URL path of every file under `dir` (`a/b/index.html` -> `/a/b/`; other files keep their name). */
export function builtPaths(dir = DIST_CLIENT): Set<string> {
	const out = new Set<string>();
	const walk = (d: string) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) walk(p);
			else {
				const rel = "/" + relative(dir, p).split("\\").join("/");
				out.add(rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length) : rel);
			}
		}
	};
	if (existsSync(dir)) walk(dir);
	return out;
}

const norm = (p: string) => {
	try {
		return decodeURI(p);
	} catch {
		return p;
	}
};

/** Legacy paths missing from the build and built paths that were not in the legacy group (compared percent-decoded). */
export function diffGroup(legacyPaths: string[], built: Set<string>, allLegacy: Set<string>) {
	const builtNorm = new Set([...built].map(norm));
	const legacyNorm = new Set(legacyPaths.map(norm));
	const missing = legacyPaths.filter((p) => !builtNorm.has(norm(p)));
	const allLegacyNorm = new Set([...allLegacy].map(norm));
	return { missing, legacyNorm, builtNorm, allLegacyNorm };
}
