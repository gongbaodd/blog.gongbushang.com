/**
 * Which admin build is running, and is it the latest published admin image (GON-273).
 *
 * The running build is `BUILD_SHA` / `BUILD_TIME`, baked into the image as ENV by the Dockerfile (build-args set in
 * .github/workflows/admin-image.yml). The latest build is the head_sha of the last SUCCESSFUL admin-image run on master, not the
 * master head: commits that touch no admin input (docs only) never build an image, so comparing against master would cry wolf.
 * The GitHub API answer is cached in memory for a few minutes (unauthenticated limit: 60 requests an hour per IP). An optional
 * read-only token in `ADMIN_VERSION_CHECK_TOKEN` raises that limit; it is never required and never rendered.
 */

export const REPO = "gongbaodd/blog.gongbushang.com";
export const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/workflows/admin-image.yml/runs?branch=master&status=success&per_page=1`;
export const CACHE_TTL_MS = 5 * 60_000;
export const FAILURE_TTL_MS = 60_000;
const TIMEOUT_MS = 5_000;
const SHA_RE = /^[0-9a-f]{40}$/;

export type VersionState =
	| { status: "dev" }
	| { status: "up-to-date"; running: string; builtAt?: string }
	| { status: "outdated"; running: string; latest: string; builtAt?: string }
	| { status: "unknown"; running: string; reason: string; builtAt?: string };

export interface BuildEnv {
	BUILD_SHA?: string;
	BUILD_TIME?: string;
	ADMIN_VERSION_CHECK_TOKEN?: string;
}

export const shortSha = (sha: string) => sha.slice(0, 7);

/** A full lowercase hex commit SHA, or undefined (unset, "unknown", anything else means a dev build). */
export function parseBuildSha(value: string | undefined): string | undefined {
	const v = value?.trim().toLowerCase();
	return v && SHA_RE.test(v) ? v : undefined;
}

export type LatestResult = { ok: true; sha: string } | { ok: false; reason: string };

/** Ask GitHub for the head_sha of the last successful admin-image run on master. Never throws. */
export async function fetchLatestSha(fetchImpl: typeof fetch = fetch, token?: string): Promise<LatestResult> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "growgen-admin-version-check",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	try {
		const res = await fetchImpl(RUNS_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (res.status === 403 || res.status === 429) return { ok: false, reason: "GitHub rate limit reached, try again later" };
		if (!res.ok) return { ok: false, reason: `GitHub answered ${res.status}` };
		const body = (await res.json()) as { workflow_runs?: { head_sha?: unknown }[] };
		const raw = body.workflow_runs?.[0]?.head_sha;
		const sha = parseBuildSha(typeof raw === "string" ? raw : undefined);
		return sha ? { ok: true, sha } : { ok: false, reason: "no successful admin-image run found" };
	} catch (error) {
		const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
		return { ok: false, reason: timedOut ? "GitHub did not answer in time" : "GitHub is unreachable" };
	}
}

/** Pure state logic. `latest` is the lookup result (not needed, and ignored, for a dev build). */
export function resolveVersionState(env: BuildEnv, latest: LatestResult | undefined): VersionState {
	const running = parseBuildSha(env.BUILD_SHA);
	if (!running) return { status: "dev" };
	const builtAt = env.BUILD_TIME?.trim() || undefined;
	if (!latest) return { status: "unknown", running, reason: "not checked", builtAt };
	if (!latest.ok) return { status: "unknown", running, reason: latest.reason, builtAt };
	return latest.sha === running ? { status: "up-to-date", running, builtAt } : { status: "outdated", running, latest: latest.sha, builtAt };
}

export type VersionChecker = (env: BuildEnv, now?: number) => Promise<VersionState>;

/** Caches the lookup in memory: successes for CACHE_TTL_MS, failures for FAILURE_TTL_MS (so an outage is not hammered). */
export function createVersionChecker(fetchImpl: typeof fetch = fetch): VersionChecker {
	let cached: { at: number; ttl: number; result: LatestResult } | undefined;
	let inflight: Promise<LatestResult> | undefined;
	return async (env, now = Date.now()) => {
		if (!parseBuildSha(env.BUILD_SHA)) return resolveVersionState(env, undefined);
		if (!cached || now - cached.at >= cached.ttl) {
			inflight ??= fetchLatestSha(fetchImpl, env.ADMIN_VERSION_CHECK_TOKEN?.trim() || undefined).finally(() => {
				inflight = undefined;
			});
			const result = await inflight;
			cached = { at: now, ttl: result.ok ? CACHE_TTL_MS : FAILURE_TTL_MS, result };
		}
		return resolveVersionState(env, cached.result);
	};
}

export function describeVersion(state: VersionState): { headline: string; detail: string } {
	switch (state.status) {
		case "dev":
			return { headline: "dev build", detail: "No commit is baked into this build, so there is nothing to compare." };
		case "up-to-date":
			return { headline: "Up to date", detail: `Running sha-${shortSha(state.running)}, the latest published admin image.` };
		case "outdated":
			return {
				headline: `A newer admin image is available (sha-${shortSha(state.latest)}), redeploy on Altare`,
				detail: `Running sha-${shortSha(state.running)}.`,
			};
		case "unknown":
			return {
				headline: `Couldn't check for the latest version (${state.reason})`,
				detail: `Running sha-${shortSha(state.running)}. This does not mean it is current.`,
			};
	}
}
