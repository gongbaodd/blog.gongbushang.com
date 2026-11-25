#!/usr/bin/env node
// Production entrypoint for the Node admin (D12, INF-9). Carries the INF-7 safety rails into the Docker path:
//   - DATABASE_URL is required (no build-time fallback) and TLS is used unless the host is loopback.
//   - SITE_ENV=production requires ADMIN_CONFIRM_PRODUCTION=yes (the analogue of `--yes-production`).
//   - the database identity is probed and logged before the server starts listening; secrets are never printed.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, "../dist/server/entry.mjs");
const die = (msg) => {
	console.error(`[admin] ${msg}`);
	process.exit(1);
};

const url = process.env.DATABASE_URL?.trim();
const siteEnv = process.env.SITE_ENV || "local";
if (!["local", "testing", "production"].includes(siteEnv)) die(`SITE_ENV must be local, testing or production (got "${siteEnv}")`);
if (!url) die("DATABASE_URL is not set");
if (!existsSync(entry)) die(`${entry} not found: run \`pnpm --filter admin build\` first`);
if (siteEnv === "production" && process.env.ADMIN_CONFIRM_PRODUCTION !== "yes") {
	die("SITE_ENV=production edits the LIVE production database.\n         Set ADMIN_CONFIRM_PRODUCTION=yes to confirm.");
}

let u;
try {
	u = new URL(url);
} catch {
	die("DATABASE_URL is not a valid URL");
}
const local = /^(localhost|127\.0\.0\.1|\[?::1\]?|host\.docker\.internal)$/.test(u.hostname);
if (siteEnv !== "local" && local) die(`SITE_ENV=${siteEnv} but DATABASE_URL points at a loopback/local host (${u.hostname}); refusing`);
const target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;

const db = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
try {
	await db.connect();
	const r = await db.query("select current_database() as db, current_user as usr, (select count(*)::int from information_schema.tables where table_name = '_emdash_404_log') as emdash");
	const row = r.rows[0];
	console.log(
		`[admin] DB IDENTITY: SITE_ENV=${siteEnv.toUpperCase()} -> ${target} (database=${row.db}, role=${row.usr}, emdash schema ${row.emdash ? "present" : "absent: first request migrates"})`,
	);
} catch (e) {
	die(`could not connect to ${target}: ${String(e.message).split(url)[0].slice(0, 200)}`);
} finally {
	await db.end().catch(() => {});
}
if (siteEnv === "production") console.log("[admin] PRODUCTION: editing the live database. Cloudflare Access is required (CF_ACCESS_AUD / CF_ACCESS_TEAM_DOMAIN).");

await import(entry);
