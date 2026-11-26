#!/usr/bin/env node
// Local EmDash admin against local / production (D12, INF-7).
//   node scripts/admin/start.mjs <local|production> [--port 4322] [--yes-production --unsafe-dev-server] [--check]
//   node scripts/admin/start.mjs stop
// Wired as `pnpm admin:local`, `pnpm admin:stop`, and the DEPRECATED `pnpm admin:production` (SEC-07: `astro dev` exposes
// EmDash's dev-bypass login, so production editing uses the Docker admin, docs/plan/emdash/runbooks/admin-docker.md; this
// launcher refuses production unless `--yes-production --unsafe-dev-server` are both passed).
//
// Why a generated dev-vars file: the Astro Cloudflare adapter copies `.dev.vars` values into process.env, and wrangler then
// prefers that over the real environment, so an exported CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE loses to a
// `.dev.vars` entry. Wrangler reads `.dev.vars.<CLOUDFLARE_ENV>` INSTEAD of `.dev.vars` when that file exists, so we select
// the `admin-<env>` blocks in wrangler.jsonc and write `.dev.vars.admin-<env>` (gitignored, mode 0600). `.dev.vars` itself is
// only ever read, never modified. Secrets are never printed.
//
// Astro 7 `astro dev` is a daemon (it detaches and the launcher exits 0), so this script starts it with `--background`,
// probes, and exits leaving the server running. The generated file stays until `admin:stop` (or the next start) so a wrangler
// restart can never fall back to `.dev.vars`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
	ENVS,
	GENERATED_HEADER,
	adminBrowserUrl,
	buildDevVars,
	dbHost,
	parseEnvText,
	productionLaunchGate,
	redact,
	resolveEnv,
	serializeDevVars,
} from "./lib.mjs";
import { pgClientConfig } from "./pg-tls.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const repoRoot = resolve(webDir, "../..");

const args = process.argv.slice(2);
const envName = args.find((a) => !a.startsWith("--"));
const flag = (n) => args.includes(`--${n}`);
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 4322;

const die = (msg, code = 1) => {
	console.error(`[admin] ${msg}`);
	process.exit(code);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probePort = (p) =>
	new Promise((ok) => {
		const s = net.connect({ port: p, host: "127.0.0.1" });
		s.once("connect", () => (s.destroy(), ok(true)));
		s.once("error", () => ok(false));
	});
const astro = (...a) => spawnSync("pnpm", ["exec", "astro", ...a], { cwd: webDir, encoding: "utf8" });
const lastLine = (r) => ((r.stdout ?? "") + (r.stderr ?? "")).trim().split("\n").pop() || "";

/** Remove generated dev-vars files (only ones carrying our header). */
function removeGenerated() {
	for (const f of readdirSync(webDir)) {
		if (!/^\.dev\.vars\.admin-/.test(f)) continue;
		const p = resolve(webDir, f);
		if (readFileSync(p, "utf8").startsWith(GENERATED_HEADER)) unlinkSync(p);
	}
}

if (envName === "stop") {
	console.log(`[admin] astro dev stop: ${lastLine(astro("dev", "stop")) || "done"}`);
	removeGenerated();
	console.log("[admin] removed generated .dev.vars.admin-* files");
	process.exit(0);
}

if (!envName || !ENVS[envName]) die("usage: start.mjs <local|production> [--port N] [--yes-production] [--check] | stop", 2);
if (!Number.isInteger(port) || port < 1024) die("invalid --port");
// SEC-07: production through `astro dev` is deprecated. `--check` starts no server, so it only needs --yes-production.
const flagNames = args.filter((a) => a.startsWith("--")).map((a) => a.slice(2));
const gate = productionLaunchGate(envName, flag("check") ? [...flagNames, "unsafe-dev-server"] : flagNames);
if (!gate.ok) die(gate.message, gate.code);
if (gate.warning && !flag("check")) console.warn(`[admin] ${gate.warning}`);
const cfg = ENVS[envName];

// ---- 1. load env (read only) -------------------------------------------------------------------------------------------
const envFile = process.env.GROWGEN_ENV_FILE || resolve(repoRoot, ".env");
const readIf = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
if (!existsSync(envFile)) die(`env file not found: ${envFile} (set GROWGEN_ENV_FILE or create the repo-root .env)`);
const dotEnv = parseEnvText(readIf(envFile));
const devVars = parseEnvText(readIf(resolve(webDir, ".dev.vars")));

const resolved = resolveEnv(envName, dotEnv, devVars);
if (!resolved.ok) {
	die(
		resolved.error ??
			`missing ${resolved.missing.join(" / ")} in ${envFile}. ` +
				(envName === "production"
					? "Not generating a production key: create one deliberately (`pnpm exec emdash secrets generate`), back it up, and add it to .env under that name."
					: "Add it to the repo-root .env."),
	);
}
const vars = buildDevVars(envName, resolved, dotEnv, devVars);
const secretValues = [resolved.url, ...Object.values(vars)];
const safe = (s) => redact(s, secretValues);

if (flag("check")) {
	console.log(`[admin] check ok: env=${envName} cloudflareEnv=${cfg.cloudflareEnv} db=${dbHost(resolved.url)} port=${port}`);
	process.exit(0);
}

// ---- 2. stop OUR astro dev daemon (apps/web lock), make sure the port is free -------------------------------------------
console.log(`[admin] astro dev stop: ${safe(lastLine(astro("dev", "stop")) || "nothing running")}`);
removeGenerated();
for (let i = 0; i < 20 && (await probePort(port)); i++) await sleep(500);
if (await probePort(port)) {
	const who = spawnSync("lsof", [`-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], { encoding: "utf8" }).stdout.replace(/\n/g, " ");
	die(`port ${port} is still in use by another process (${who.trim() || "unknown"}). Not killing it; stop it or pass --port.`);
}

// ---- 3. generated dev-vars file ----------------------------------------------------------------------------------------
const devVarsPath = resolve(webDir, `.dev.vars.${cfg.cloudflareEnv}`);
const hyperUrl = resolved.url;
vars.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = hyperUrl;
secretValues.push(hyperUrl);
if (existsSync(devVarsPath)) die(`${devVarsPath} exists and was not generated by this script; move it away first.`);
writeFileSync(devVarsPath, serializeDevVars(vars), { mode: 0o600 });
chmodSync(devVarsPath, 0o600);

// ---- 4. start astro dev (daemon) ---------------------------------------------------------------------------------------
const fail = (msg) => {
	if (flag("keep")) die(`${msg} (--keep: server left running for debugging)`);
	astro("dev", "stop");
	removeGenerated();
	die(msg);
};
const started = spawnSync("pnpm", ["exec", "astro", "dev", "--background", "--port", String(port), "--host", "127.0.0.1"], {
	cwd: webDir,
	encoding: "utf8",
	env: {
		...process.env,
		CLOUDFLARE_ENV: cfg.cloudflareEnv,
		SITE_ENV: cfg.siteEnv,
		CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: hyperUrl,
		...(vars.EMDASH_ENCRYPTION_KEY ? { EMDASH_ENCRYPTION_KEY: vars.EMDASH_ENCRYPTION_KEY } : {}),
	},
});
if (started.status !== 0) fail(`astro dev failed to start: ${safe(lastLine(started))}`);
console.log(`[admin] ${safe(lastLine(started))}`.slice(0, 200));

// ---- 5. wait for the port, then probe which DB answers -----------------------------------------------------------------
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 240 && !(await probePort(port)); i++) await sleep(500);
if (!(await probePort(port))) fail("dev server did not open its port within 120 s");

// Which DB does the dev server really read? Supavisor rewrites application_name and query text, so connections cannot be
// attributed from the DB side, and site content can coincide across envs. Instead use a nonce: request a path that cannot
// exist, EmDash logs the 404 into `_emdash_404_log` of the database it is connected to, and we look for that exact path in
// the INTENDED database. One harmless 404-log row is written to the target DB per start. Fails closed on any error.
// SEC-09: remote DBs are verified against the Supabase root CA (scripts/certs/prod-ca-2021.crt or DATABASE_CA_CERT); loopback: no TLS.
let dbConfig;
try {
	dbConfig = pgClientConfig(resolved.url);
	secretValues.push(dbConfig.connectionString);
} catch (e) {
	fail(`cannot set up TLS for the ${envName} database: ${safe(String(e.message))}`);
}
const nonce = `/zz-admin-probe-${randomBytes(6).toString("hex")}`;
let problem = "";
let status = "";
try {
	// the first request also initialises the EmDash runtime (migrations/seed apply on a fresh DB)
	const res = await fetch(`${base}${nonce}`, { signal: AbortSignal.timeout(180_000), redirect: "manual" });
	status = `HTTP ${res.status}`;
	await res.arrayBuffer();
} catch (e) {
	problem = `could not reach the dev server (${safe(String(e.message))})`;
}
if (!problem) {
	const db = new pg.Client({ ...dbConfig, connectionTimeoutMillis: 15_000, statement_timeout: 15_000 });
	try {
		await db.connect();
		let found = 0;
		for (let i = 0; i < 10 && !found; i++) {
			found = (await db.query(`select count(*)::int as n from _emdash_404_log where path = $1`, [nonce])).rows[0].n;
			if (!found) await sleep(1000);
		}
		if (!found) problem = `the 404 for ${nonce} (${status}) was not logged in the ${envName} database, so the server is reading a different database (or logging is off)`;
	} catch (e) {
		problem = `could not query the ${envName} database (${safe(String(e.message))})`;
	} finally {
		await db.end().catch(() => {});
	}
}
if (problem) fail(`PROBE FAILED: ${problem}. The server was stopped.`);

console.log(
	`\n[admin] PROBE OK: this dev server wrote its probe 404 (${nonce}) into the ${envName.toUpperCase()} database ${dbHost(resolved.url)}\n` +
		`[admin] admin:  ${adminBrowserUrl(port)}/_emdash/admin   (open localhost, not 127.0.0.1: passkeys are bound to the hostname)\n` +
		`[admin] site:   ${adminBrowserUrl(port)}/\n` +
		`[admin] publish dispatch: ${vars.GITHUB_DISPATCH_TOKEN ? "token present" : "NO GITHUB_DISPATCH_TOKEN (publish will not rebuild the site)"}, repo ${vars.GITHUB_DISPATCH_REPO ?? "unset"}\n` +
		`[admin] running in the background. Stop with: pnpm admin:stop   (logs: pnpm --filter web exec astro dev logs)`,
);
