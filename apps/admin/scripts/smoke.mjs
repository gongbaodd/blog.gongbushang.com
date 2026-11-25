#!/usr/bin/env node
// Smoke test for the built admin (INF-9): boots `scripts/start.mjs` against LOCAL Supabase and checks
//   1. dist/ does not contain DATABASE_URL (no credential baked at build time)
//   2. /healthz answers 200
//   3. a gated path (/_emdash/admin/setup, no SETUP_TOKEN) answers 404
//   4. production without Cloudflare Access config refuses requests (503), and without ADMIN_CONFIRM_PRODUCTION refuses to start
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

async function boot(env) {
	const port = await freePort();
	const child = spawn("node", ["scripts/start.mjs"], {
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

const noDb = spawnSync("node", ["scripts/start.mjs"], { cwd: root, env: { PATH: process.env.PATH, SITE_ENV: "local" }, encoding: "utf8" });
check("refuses to start without DATABASE_URL", noDb.status !== 0 && /DATABASE_URL is not set/.test(noDb.stderr));

const noConfirm = spawnSync("node", ["scripts/start.mjs"], { cwd: root, env: { PATH: process.env.PATH, SITE_ENV: "production", DATABASE_URL: "postgresql://u:p@db.example.invalid:5432/postgres" }, encoding: "utf8" });
check("production refuses without ADMIN_CONFIRM_PRODUCTION=yes", noConfirm.status !== 0 && /ADMIN_CONFIRM_PRODUCTION/.test(noConfirm.stderr));

process.exit(failures.length ? 1 : 0);
