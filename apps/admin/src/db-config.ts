/**
 * Runtime database configuration for the Node admin (D12, INF-9 review).
 *
 * `astro build` serializes the integration config into dist/, so the URL given to `postgres()` in astro.config.mjs must never be
 * a real credential: it is `PLACEHOLDER_DATABASE_URL` and the real `DATABASE_URL` is read from the environment when the server
 * creates its pool. A missing `DATABASE_URL` at runtime throws (fail closed) instead of falling back to the build-time value.
 */
export const PLACEHOLDER_DATABASE_URL = "postgresql://placeholder:placeholder@placeholder.invalid:5432/placeholder";

/** Pool size: the admin is one user, and Supabase Free session-pooler slots are scarce (shared with CI and CLI). */
export const POOL_MAX = 3;

/** Loopback (local Supabase) = no TLS. Anything else (Supabase session pooler) = TLS, as in start.mjs and scripts/derive/db.ts. */
export function sslFor(url: string): false | { rejectUnauthorized: false } {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		return { rejectUnauthorized: false };
	}
	return /^(localhost|127\.0\.0\.1|\[?::1\]?|host\.docker\.internal)$/.test(host) ? false : { rejectUnauthorized: false };
}

export interface RuntimeDialectConfig {
	connectionString: string;
	ssl: false | { rejectUnauthorized: false };
	pool: { max: number };
}

export function runtimeDialectConfig(env: NodeJS.ProcessEnv = process.env): RuntimeDialectConfig {
	const url = env.DATABASE_URL?.trim();
	if (!url) throw new Error("DATABASE_URL is not set: refusing to start without an explicit database (no build-time fallback).");
	return { connectionString: url, ssl: sslFor(url), pool: { max: POOL_MAX } };
}
