/**
 * Runtime database configuration for the Node admin (D12, INF-9 review).
 *
 * `astro build` serializes the integration config into dist/, so the URL given to `postgres()` in astro.config.mjs must never be
 * a real credential: it is `PLACEHOLDER_DATABASE_URL` and the real `DATABASE_URL` is read from the environment when the server
 * creates its pool. A missing `DATABASE_URL` at runtime throws (fail closed) instead of falling back to the build-time value.
 */
import { connectionConfig, evaluateStartup, sslOptionsFor as sslOptionsForUnchecked } from "../scripts/safety.mjs";

export const PLACEHOLDER_DATABASE_URL = "postgresql://placeholder:placeholder@placeholder.invalid:5432/placeholder";

/** Pool size: the admin is one user, and Supabase Free session-pooler slots are scarce (shared with CI and CLI). */
export const POOL_MAX = 3;

export type SslOptions = false | { rejectUnauthorized: boolean; ca?: string };

/**
 * Loopback (local Supabase) = no TLS. Anything else (Supabase session pooler) = TLS: verified (verify-full) when
 * DATABASE_CA_CERT is set (PEM text or a file path; production should set it), unverified otherwise, as in start.mjs.
 */
export function sslFor(url: string, env: NodeJS.ProcessEnv = process.env): SslOptions {
	return sslOptionsForUnchecked(url, env) as SslOptions;
}

export interface RuntimeDialectConfig {
	connectionString: string;
	ssl: SslOptions;
	pool: { max: number };
}

export function runtimeDialectConfig(env: NodeJS.ProcessEnv = process.env): RuntimeDialectConfig {
	const url = env.DATABASE_URL?.trim();
	if (!url) throw new Error("DATABASE_URL is not set: refusing to start without an explicit database (no build-time fallback).");
	// The same rules as scripts/start.mjs, so `node dist/server/entry.mjs` run directly is no less safe than the launcher.
	const plan = evaluateStartup(env) as { errors: string[] };
	if (plan.errors.length > 0) throw new Error(`refusing to connect:\n  - ${plan.errors.join("\n  - ")}`);
	const conn = connectionConfig(env) as { connectionString: string; ssl: SslOptions };
	return { connectionString: conn.connectionString, ssl: conn.ssl, pool: { max: POOL_MAX } };
}
