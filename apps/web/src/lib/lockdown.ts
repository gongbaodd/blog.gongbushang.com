/**
 * Worker lockdown (D12, INF-7). The admin runs locally (`pnpm admin:<env>`), so a deployed Worker must not serve the EmDash
 * admin, REST API or OAuth discovery. `assets.not_found_handling` does NOT keep asset misses away from the Worker (verified on
 * testing with `wrangler tail`: misses invoke it), so src/worker.ts answers these paths with a bare 404 before EmDash runs.
 * Pure and dependency-free so it can be unit tested.
 */

/** Decode, lowercase and collapse slashes so `/%5Femdash`, `/_EMDASH` and `//_emdash` cannot bypass the check. */
export function normalizePath(pathname: string): string | null {
	try {
		return decodeURIComponent(pathname).toLowerCase().replace(/\/{2,}/g, "/");
	} catch {
		return null;
	}
}

const LOCKED = [/^\/_emdash(\/|$)/, /^\/\.well-known\/oauth/];

/** True when a deployed Worker must refuse the path. Undecodable paths are refused too. */
export function isLockedPath(pathname: string): boolean {
	const p = normalizePath(pathname);
	return p === null || LOCKED.some((re) => re.test(p));
}
