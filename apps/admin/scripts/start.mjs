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
import { connectionConfig, evaluateStartup, withDbRetry } from "./safety.mjs";

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
const safeMessage = (e) => String(e?.message ?? e).split(url)[0].slice(0, 200);
// sslmode is stripped from the URL and our computed ssl object always applies (pg would otherwise let sslmode override it).
// A pg.Client cannot reconnect, so every attempt gets a fresh one. Transient network errors (e.g. EAI_AGAIN while the
// container's DNS comes up) are retried with backoff; permanent ones (auth, missing DB, TLS) exit at once (GON-274).
const probe = async () => {
	const db = new pg.Client({ ...connectionConfig(process.env), connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
	try {
		await db.connect();
		const r = await db.query(
			"select current_database() as db, current_user as usr, (select count(*)::int from information_schema.tables where table_name = '_emdash_404_log') as emdash",
		);
		return r.rows[0];
	} finally {
		await db.end().catch(() => {});
	}
};
try {
	const row = await withDbRetry(probe, {
		onRetry: (e, attempt, delay) =>
			console.warn(`[admin] DB check attempt ${attempt} failed (${e.code ?? "no code"}: ${safeMessage(e)}); retrying in ${delay / 1000}s`),
	});
	console.log(
		`[admin] DB IDENTITY: SITE_ENV=${plan.siteEnv.toUpperCase()}${plan.effectiveProduction ? " (PRODUCTION TARGET)" : ""} -> ${plan.target} (database=${row.db}, role=${row.usr}, emdash schema ${row.emdash ? "present" : "absent: first request migrates"})`,
	);
} catch (e) {
	die(`could not connect to ${plan.target}: ${safeMessage(e)}`);
}
if (plan.effectiveProduction) {
	console.log(
		`[admin] PRODUCTION: editing the live database; Cloudflare Access ${plan.requireAccess ? "REQUIRED (HOST=" + plan.host + ")" : "not required (listening on loopback " + plan.host + " only)"}.`,
	);
}

// Optional Cloudflare Tunnel (GON-212). With CF_TUNNEL_TOKEN set, run `cloudflared` next to the server so a host that only gives
// the container an IP:port can still serve admin.growgen.xyz. The tunnel's public hostname must point at http://localhost:<PORT>.
// The token goes to the child via its environment (TUNNEL_TOKEN), never argv or logs, and is removed from this process's env.
// HOST stays as configured (0.0.0.0 in the image), so the origin Access JWT check stays on for a production target.
const tunnelToken = (process.env.CF_TUNNEL_TOKEN ?? "").trim();
delete process.env.CF_TUNNEL_TOKEN;
if (tunnelToken) {
	const { spawn } = await import("node:child_process");
	const childEnv = { ...process.env, TUNNEL_TOKEN: tunnelToken };
	for (const k of ["DATABASE_URL", "EMDASH_ENCRYPTION_KEY", "CLOUDINARY_API_SECRET", "GITHUB_DISPATCH_TOKEN", "SETUP_TOKEN"]) delete childEnv[k];
	const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "run"], { env: childEnv, stdio: ["ignore", "inherit", "inherit"] });
	tunnel.on("error", (e) => die(`cloudflared failed to start: ${e.message}`));
	// Without the tunnel the admin is unreachable; exit so the host restarts the container.
	tunnel.on("exit", (code, signal) => die(`cloudflared exited (code=${code}, signal=${signal})`));
	for (const sig of ["SIGTERM", "SIGINT"]) process.once(sig, () => { tunnel.kill(sig); process.exit(0); });
	console.log("[admin] Cloudflare Tunnel: cloudflared started");
}

await import(entry);
