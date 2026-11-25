// Database access for the PORT-8 derive step: the same Postgres the build reads EmDash content from.
// EmDash content is read with plain SQL inside a READ ONLY transaction (no writes, no admin API, works in CI);
// the derived cache lives in its own schema (supabase/migrations/20261125000000_derived_schema.sql).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

export const webRoot = resolve(import.meta.dirname, "../..");

/** Schema holding the cache. Override only for tests (`DERIVE_SCHEMA=derived_test`). */
export const SCHEMA = (() => {
	const s = process.env.DERIVE_SCHEMA || "derived";
	if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`invalid DERIVE_SCHEMA "${s}"`);
	return s;
})();

const ENV_KEY = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";

function fromDevVars(): string | undefined {
	const p = resolve(webRoot, ".dev.vars");
	if (!existsSync(p)) return undefined;
	for (const line of readFileSync(p, "utf8").split("\n")) {
		const m = new RegExp(`^${ENV_KEY}\\s*=\\s*(.*)$`).exec(line.trim());
		if (m) return m[1]!.replace(/^["']|["']$/g, "");
	}
	return undefined;
}

function fromWrangler(): string | undefined {
	const p = resolve(webRoot, "wrangler.jsonc");
	if (!existsSync(p)) return undefined;
	return /"localConnectionString"\s*:\s*"([^"]+)"/.exec(readFileSync(p, "utf8"))?.[1];
}

/**
 * The connection string the build uses for EmDash: DERIVE_DATABASE_URL, else the Hyperdrive local connection
 * string (env, then apps/web/.dev.vars, then wrangler.jsonc), exactly the order `astro build` / wrangler resolve it.
 */
export function resolveConnectionString(): string {
	const url = process.env.DERIVE_DATABASE_URL || process.env[ENV_KEY] || fromDevVars() || fromWrangler();
	if (!url) throw new Error(`no database URL: set ${ENV_KEY} (or DERIVE_DATABASE_URL)`);
	return url;
}

export async function connect(url = resolveConnectionString()): Promise<pg.Client> {
	const host = new URL(url).hostname;
	const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
	// Supabase poolers present a certificate chain Node does not trust by default (docs/plan/emdash/runbooks/supabase.md).
	const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
	await client.connect();
	// Supabase defaults to 15 significant digits; geocodes must round-trip exactly.
	await client.query("set extra_float_digits = 3");
	return client;
}

/** Host + db only, safe to print. */
export const describeTarget = (url = resolveConnectionString()) => {
	const u = new URL(url);
	return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
};

export const q = (name: string) => `"${SCHEMA}"."${name}"`;

/** pgvector text form of a float array. */
export const toVector = (v: number[]) => `[${v.join(",")}]`;

/** pgvector stores float32; Math.fround restores the exact double the embedding model produced. */
export const fromVector = (s: string): number[] => JSON.parse(s).map(Math.fround);

export async function schemaReady(client: pg.Client): Promise<boolean> {
	// the PORT-8 tables and the MIG-3 ones (20261125010000_derived_podcast_gallery.sql)
	const r = await client.query("select to_regclass($1) as a, to_regclass($2) as b, to_regclass($3) as c", [`${SCHEMA}.post_embeddings`, `${SCHEMA}.podcast_embeddings`, `${SCHEMA}.gallery_traces`]);
	return r.rows[0].a !== null && r.rows[0].b !== null && r.rows[0].c !== null;
}
