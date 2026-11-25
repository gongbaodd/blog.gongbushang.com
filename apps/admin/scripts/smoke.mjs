#!/usr/bin/env node
// Smoke test for the built admin (INF-9): boots `scripts/start.mjs` against LOCAL Supabase and checks
//   1. dist/ does not contain DATABASE_URL (no credential baked at build time)
//   2. /healthz answers 200
//   3. a gated path (/_emdash/admin/setup, no SETUP_TOKEN) answers 404
//   4. Cloudflare Access enforce mode: no JWT -> 403 on /_emdash/admin, /_emdash/api/manifest, /_emdash/api/auth/me (before EmDash
//      runs: no redirects/401s); /healthz stays 200. Misconfigured Access -> 503 everywhere except /healthz.
//   5. startup refusals: no DATABASE_URL, production without ADMIN_CONFIRM_PRODUCTION, SITE_ENV=local with a remote database
// Usage: pnpm --filter admin build && pnpm --filter admin smoke   (needs `pnpm db:start`). Never touches testing/production.
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = process.env.SMOKE_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):/.test(LOCAL)) throw new Error("smoke only runs against local Supabase");
const failures = [];
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
	if (!ok) failures.push(name);
};

function walk(dir, out = []) {
	for (const f of readdirSync(dir)) {
		const p = join(dir, f);
		statSync(p).isDirectory() ? walk(p, out) : out.push(p);
	}
	return out;
}
const pw = new URL(LOCAL).password;
const leaked = walk(join(root, "dist")).filter((f) => {
	const t = readFileSync(f, "utf8");
	return t.includes(LOCAL) || t.includes(`:${pw}@`);
});
check("dist/ holds no DATABASE_URL credential", leaked.length === 0, leaked.join(", "));

const freePort = () =>
	new Promise((ok) => {
		const s = net.createServer().listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => ok(port));
		});
	});

async function boot(env, script = "scripts/start.mjs") {
	const port = await freePort();
	const child = spawn("node", [script], {
		cwd: root,
		env: { PATH: process.env.PATH, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), SESSION_DRIVER: "memory", ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let log = "";
	child.stdout.on("data", (d) => (log += d));
	child.stderr.on("data", (d) => (log += d));
	const base = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 60; i++) {
		if (child.exitCode !== null) break;
		try {
			if ((await fetch(`${base}/healthz`)).ok) return { child, base, log: () => log };
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}
	child.kill();
	return { child, base, log: () => log, failed: true };
}

const local = await boot({ DATABASE_URL: LOCAL, SITE_ENV: "local" });
check("local boots", !local.failed, local.log().slice(-300));
if (!local.failed) {
	const h = await fetch(`${local.base}/healthz`);
	check("/healthz 200", h.status === 200 && (await h.json()).ok === true);
	const g = await fetch(`${local.base}/_emdash/admin/setup`, { redirect: "manual" });
	check("gated /_emdash/admin/setup is 404 without SETUP_TOKEN", g.status === 404, `HTTP ${g.status}`);
	check("DB identity logged", /DB IDENTITY: SITE_ENV=LOCAL/.test(local.log()));
}
local.child.kill();

const GATED = ["/_emdash/admin", "/_emdash/api/manifest", "/_emdash/api/auth/me"];
const probe = async (label, extraEnv, expected) => {
	const srv = await boot({ DATABASE_URL: LOCAL, SITE_ENV: "local", ...extraEnv });
	check(`${label}: boots`, !srv.failed, srv.log().slice(-200));
	if (!srv.failed) {
		for (const p of GATED) {
			const r = await fetch(`${srv.base}${p}`, { redirect: "manual" });
			check(`${label}: ${p} -> ${expected}`, r.status === expected, `HTTP ${r.status}`);
		}
		const h = await fetch(`${srv.base}/healthz`);
		check(`${label}: /healthz stays 200`, h.status === 200);
	}
	srv.child.kill();
};
await probe("access enforce, no JWT", { CF_ACCESS_TEAM_DOMAIN: "smoke-team", CF_ACCESS_AUD: "smoke-aud" }, 403);
await probe("operator ADMIN_REQUIRE_ACCESS=1 kept (HOST=0.0.0.0, no Access config)", { ADMIN_REQUIRE_ACCESS: "1", HOST: "0.0.0.0" }, 503);
await probe("access misconfigured", { CF_ACCESS_TEAM_DOMAIN: "evil.example.com", CF_ACCESS_AUD: "smoke-aud" }, 503);

const noDb = spawnSync("node", ["scripts/start.mjs"], { cwd: root, env: { PATH: process.env.PATH, SITE_ENV: "local" }, encoding: "utf8" });
check("refuses to start without DATABASE_URL", noDb.status !== 0 && /DATABASE_URL is not set/.test(noDb.stderr));

const REF = "abcdefghij1234567890";
const prodUrl = `postgresql://postgres.${REF}:pw@aws-0-eu.pooler.supabase.com:5432/postgres`;
const run = (env) => spawnSync("node", ["scripts/start.mjs"], { cwd: root, env: { PATH: process.env.PATH, ...env }, encoding: "utf8" });
const noConfirm = run({ SITE_ENV: "production", DATABASE_URL: prodUrl, SUPABASE_PRODUCTION_REF: REF, HOST: "0.0.0.0" });
check("production refuses without ADMIN_CONFIRM_PRODUCTION=yes", noConfirm.status !== 0 && /ADMIN_CONFIRM_PRODUCTION/.test(noConfirm.stderr));
const mislabeled = run({ SITE_ENV: "local", ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL: "yes", DATABASE_URL: prodUrl, SUPABASE_PRODUCTION_REF: REF });
check("production ref under SITE_ENV=local still needs confirmation", mislabeled.status !== 0 && /ADMIN_CONFIRM_PRODUCTION/.test(mislabeled.stderr));
const remoteLocal = run({ SITE_ENV: "local", DATABASE_URL: prodUrl });
check("SITE_ENV=local with a remote database is refused", remoteLocal.status !== 0 && /remote host/.test(remoteLocal.stderr));
const badParam = run({ SITE_ENV: "testing", DATABASE_URL: `${prodUrl}?host=evil.example.com` });
check("unknown URL query params are refused", badParam.status !== 0 && /unsupported query/.test(badParam.stderr));

const bad = (label, r, re) => check(label, r.status !== 0 && re.test(r.stderr), r.stderr.split("\n")[1] ?? "");
const T = "tttttttttt1234567890";
const testingUrl = `postgresql://postgres.${T}:pw@aws-0-eu.pooler.supabase.com:5432/postgres`;
const refs = { SUPABASE_PRODUCTION_REF: REF, SUPABASE_TESTING_REF: T };
bad("remote sslmode=disable is refused", run({ SITE_ENV: "testing", ...refs, DATABASE_URL: `${testingUrl}?sslmode=disable` }), /sslmode/);
bad("remote sslmode=no-verify is refused", run({ SITE_ENV: "testing", ...refs, DATABASE_URL: `${testingUrl}?sslmode=no-verify` }), /sslmode/);
bad("testing + production-ref URL + no refs is refused", run({ SITE_ENV: "testing", DATABASE_URL: prodUrl }), /SUPABASE_PRODUCTION_REF/);
bad("blank DATABASE_CA_CERT is refused", run({ SITE_ENV: "testing", ...refs, DATABASE_URL: testingUrl, DATABASE_CA_CERT: "  " }), /blank/);
bad("unreadable DATABASE_CA_CERT file is refused", run({ SITE_ENV: "testing", ...refs, DATABASE_URL: testingUrl, DATABASE_CA_CERT: "/nonexistent/ca.pem" }), /could not be read/);

// dist/server/entry.mjs run directly (no launcher): the runtime rules still apply (pool is lazy, so no DB is contacted).
const direct = await boot({ SITE_ENV: "testing", DATABASE_URL: prodUrl, HOST: "127.0.0.1" }, "dist/server/entry.mjs");
check("direct entry.mjs boots", !direct.failed, direct.log().slice(-200));
if (!direct.failed) {
	for (const p of GATED) {
		const r = await fetch(`${direct.base}${p}`, { redirect: "manual" });
		check(`direct entry.mjs, prod-ref URL under testing label: ${p} -> 503`, r.status === 503, `HTTP ${r.status}`);
	}
}
direct.child.kill();

process.exit(failures.length ? 1 : 0);
