#!/usr/bin/env node
// Production entrypoint for the Node admin (D12, INF-9). Carries the INF-7 / INF-5 safety rails into the Docker path:
//   - DATABASE_URL is required (no build-time fallback); only ?sslmode= is accepted as a query parameter.
//   - the target is identified by Supabase project ref (SUPABASE_PRODUCTION_REF vs the `postgres.<ref>` pooler user), not by the
//     SITE_ENV label alone: a production ref always needs ADMIN_CONFIRM_PRODUCTION=yes and Cloudflare Access.
//   - SITE_ENV=local with a remote database is refused unless ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL=yes.
//   - the database identity is probed and logged before the server starts listening; secrets are never printed.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { connectionConfig, evaluateStartup } from "./safety.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../dist/server/entry.mjs");
const die = (msg) => {
	console.error(`[admin] ${msg}`);
	process.exit(1);
};

// Pin the listen host: the Node adapter otherwise falls back to the host baked in at build time.
process.env.HOST = (process.env.HOST ?? "").trim() || "127.0.0.1";
const plan = evaluateStartup(process.env);
if (plan.errors.length > 0) die(`refusing to start:\n  - ${plan.errors.join("\n  - ")}`);
if (!existsSync(entry)) die(`${entry} not found: run \`pnpm --filter admin build\` first`);
// Tell the request-time Access gate that this process targets production even if SITE_ENV says otherwise.
// An operator-set ADMIN_REQUIRE_ACCESS=1 is kept (OR, never cleared).
if (plan.requireAccess) process.env.ADMIN_REQUIRE_ACCESS = "1";

const url = process.env.DATABASE_URL.trim();
// sslmode is stripped from the URL and our computed ssl object always applies (pg would otherwise let sslmode override it).
const db = new pg.Client({ ...connectionConfig(process.env), connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
try {
	await db.connect();
	const r = await db.query(
		"select current_database() as db, current_user as usr, (select count(*)::int from information_schema.tables where table_name = '_emdash_404_log') as emdash",
	);
	const row = r.rows[0];
	console.log(
		`[admin] DB IDENTITY: SITE_ENV=${plan.siteEnv.toUpperCase()}${plan.effectiveProduction ? " (PRODUCTION TARGET)" : ""} -> ${plan.target} (database=${row.db}, role=${row.usr}, emdash schema ${row.emdash ? "present" : "absent: first request migrates"})`,
	);
} catch (e) {
	die(`could not connect to ${plan.target}: ${String(e.message).split(url)[0].slice(0, 200)}`);
} finally {
	await db.end().catch(() => {});
}
if (plan.effectiveProduction) {
	console.log(
		`[admin] PRODUCTION: editing the live database; Cloudflare Access ${plan.requireAccess ? "REQUIRED (HOST=" + plan.host + ")" : "not required (listening on loopback " + plan.host + " only)"}.`,
	);
}

await import(entry);
