#!/usr/bin/env node
// GON-183 (CUT-1) preflight: run it before the cutover (GON-214 step 2), from the GON-183 branch, while PUBLIC_SITE_LIVE is still false.
// READ-ONLY against production: HTTP GET/HEAD, one READ ONLY SQL transaction, `gh api` reads, Cloudflare API GETs.
// It never sets a variable, secret, route or DNS record. Secrets are read from the environment and never printed.
//
//   node apps/web/scripts/cutover/preflight.mjs [--url <origin of the deployed growgen-web>] [--build] [--no-db] [--no-gh]
//
//   --url <origin>   the host `growgen-web` serves today (the soak host): checks ads.txt, noindex and the locked-down paths on it
//   --build          also run a production build with PUBLIC_SITE_LIVE=true into dist-preflight/ (DERIVE_READONLY=1, no cache writes)
//                    and inspect it: post-build must pass, robots/canonical/sitemap/RSS must name growgen.xyz only
//   --no-db / --no-gh  skip the checks that need a database URL / an authenticated `gh` (they become SKIP)
//
// Environment (names only): CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE (or DERIVE_DATABASE_URL, same value): production
// SESSION pooler string, ideally the SELECT-only `growgen_ci_readonly` role (runbooks/ci.md) so the database itself refuses writes,
// including from EmDash's prerender connection; CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID) with Workers Scripts and Workers Builds
// read for the legacy auto-build check.
// Exit 0 = no failures. MANUAL lines are things the script could not verify: do them by hand before continuing.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CANONICAL_ORIGIN, REQUIRED_VARS, RETIRED_HOST, adsTxtOk, canonicalHref, checkLivePage, checkRobotsLive, hasNoindexMeta, http, offOrigin, ogUrl, parseJsonc, printResults, result, sitemapLocs, stagingIsOn } from "./lib.mjs";

const webRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(webRoot, "../..");
const HYPERDRIVE_ENV = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
const { values } = parseArgs({
	options: {
		url: { type: "string" },
		build: { type: "boolean", default: false },
		"no-db": { type: "boolean", default: false },
		"no-gh": { type: "boolean", default: false },
		help: { type: "boolean", short: "h", default: false },
	},
});
if (values.help) {
	console.log("Usage: node apps/web/scripts/cutover/preflight.mjs [--url <soak origin>] [--build] [--no-db] [--no-gh]");
	process.exit(0);
}
const results = [];

// One database URL, resolved once. Two different values are ambiguous (the staging query and the build would read different databases).
const dbUrls = [process.env.DERIVE_DATABASE_URL, process.env[HYPERDRIVE_ENV]].filter(Boolean);
const dbAmbiguous = new Set(dbUrls).size > 1;
const dbUrl = dbUrls[0];

// 1. Repo config: routes, site URL, deploy workflow. Always runs, needs nothing.
{
	const problems = [];
	const cfg = parseJsonc(readFileSync(resolve(webRoot, "wrangler.jsonc"), "utf8"));
	if (JSON.stringify(cfg.routes) !== JSON.stringify([{ pattern: "growgen.xyz", custom_domain: true }])) problems.push(`wrangler.jsonc routes are ${JSON.stringify(cfg.routes)}, expected exactly [{pattern: growgen.xyz, custom_domain: true}] (no www)`);
	if (cfg.vars?.PUBLIC_SITE_LIVE !== "false") problems.push('wrangler.jsonc vars.PUBLIC_SITE_LIVE is not "false"');
	const deploy = readFileSync(resolve(repoRoot, ".github/workflows/web-deploy.yml"), "utf8");
	if (!/^\s*EMDASH_SITE_URL:\s*https:\/\/growgen\.xyz\s*$/m.test(deploy)) problems.push("web-deploy.yml does not pass EMDASH_SITE_URL=https://growgen.xyz to the build");
	results.push(problems.length ? result("config: routes, site URL, web-deploy", "fail", `${problems.join("; ")} (run this from the GON-183 branch or after the merge)`) : result("config: routes, site URL, web-deploy", "pass", "routes=growgen.xyz (custom domain), EMDASH_SITE_URL=https://growgen.xyz"));
}

// 2. EmDash "staging" option is off (READ ONLY transaction).
const STAGING = "EmDash staging option is off";
if (values["no-db"]) results.push(result(STAGING, "skip", "--no-db"));
else if (!dbUrl) results.push(result(STAGING, "manual", `no database URL in the environment (export ${HYPERDRIVE_ENV}, the production session pooler string). Check admin Settings, staging, by hand`));
else if (dbAmbiguous) results.push(result(STAGING, "fail", `DERIVE_DATABASE_URL and ${HYPERDRIVE_ENV} are both set and differ: unset one`));
else {
	try {
		const { connect } = await import("../derive/db.ts");
		const client = await connect(dbUrl);
		try {
			await client.query("begin read only");
			const r = await client.query("select value from options where name = 'site:staging'");
			await client.query("rollback");
			const on = r.rows.length > 0 && stagingIsOn(r.rows[0].value);
			results.push(on ? result(STAGING, "fail", "site:staging is ON: admin Settings, turn off staging") : result(STAGING, "pass", r.rows.length ? "site:staging is off" : "no site:staging row (off)"));
		} finally {
			await client.end();
		}
	} catch (e) {
		results.push(result(STAGING, "fail", `query failed: ${e instanceof Error ? e.message : e}`));
	}
}

// 3. GitHub `production` environment variables: the analytics/ads set is present and PUBLIC_SITE_LIVE is not yet true.
const GHV = "GitHub production variables";
if (values["no-gh"]) results.push(result(GHV, "skip", "--no-gh"));
else {
	const gh = spawnSync("gh", ["api", "--paginate", "repos/{owner}/{repo}/environments/production/variables", "--jq", ".variables[] | [.name, .value] | @tsv"], { encoding: "utf8", cwd: repoRoot });
	if (gh.status !== 0) results.push(result(GHV, "manual", `gh api failed (${(gh.stderr || gh.error?.message || "").split("\n")[0].slice(0, 120)}). Run \`gh variable list --env production\` by hand`));
	else {
		const vars = new Map(gh.stdout.split("\n").filter(Boolean).map((l) => l.split("\t")));
		const missing = REQUIRED_VARS.filter((n) => !(vars.get(n) ?? "").trim());
		const live = vars.get("PUBLIC_SITE_LIVE");
		const problems = [];
		if (missing.length) problems.push(`unset or empty: ${missing.join(", ")}`);
		if (live === "true") problems.push("PUBLIC_SITE_LIVE is already true (preflight expects false until step 4)");
		if (vars.get("EMDASH_SITE_URL") && vars.get("EMDASH_SITE_URL") !== CANONICAL_ORIGIN) problems.push("a production EMDASH_SITE_URL variable is set to a different origin");
		results.push(problems.length ? result(GHV, "fail", problems.join("; ")) : result(GHV, "pass", `${REQUIRED_VARS.length} analytics/ads variables set; PUBLIC_SITE_LIVE=${live ?? "unset"}`));
	}
}

// 4. The deployed Worker: ads.txt served, still not live (noindex), admin locked down.
if (!values.url) results.push(result("deployed Worker checks", "manual", "pass --url <origin growgen-web serves today> to check ads.txt, noindex and /_emdash/admin"));
else {
	const origin = values.url.replace(/\/+$/, "");
	const ads = await http(`${origin}/ads.txt`);
	results.push(ads.status === 200 && adsTxtOk(ads.text) ? result("ads.txt is served", "pass") : result("ads.txt is served", "fail", `status ${ads.status}${ads.status === 200 ? ", no google.com DIRECT line" : ""}`));
	const home = await http(`${origin}/`);
	const xrt = home.headers.get("x-robots-tag") ?? "";
	results.push(home.status === 200 && /noindex/i.test(xrt) ? result("deployed site is still not live (noindex)", "pass") : result("deployed site is still not live (noindex)", "fail", `status ${home.status}, x-robots-tag "${xrt}": PUBLIC_SITE_LIVE must stay false until step 4`));
	const adm = await http(`${origin}/_emdash/admin`);
	results.push(adm.status === 404 ? result("deployed /_emdash/admin is 404", "pass") : result("deployed /_emdash/admin is 404", "fail", `status ${adm.status}`));
}

// 5. A build with PUBLIC_SITE_LIVE=true passes post-build and names growgen.xyz everywhere.
const BUILD = "live build passes post-build";
if (!values.build) results.push(result(BUILD, "skip", "pass --build (a few minutes, needs the database URL)"));
else if (!dbUrl) results.push(result(BUILD, "manual", `no database URL in the environment (${HYPERDRIVE_ENV})`));
else if (dbAmbiguous) results.push(result(BUILD, "fail", `DERIVE_DATABASE_URL and ${HYPERDRIVE_ENV} are both set and differ: unset one`));
else if (/^\s*CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE\s*=/m.test(existsSync(resolve(webRoot, ".dev.vars")) ? readFileSync(resolve(webRoot, ".dev.vars"), "utf8") : "")) {
	// The Astro adapter copies .dev.vars into process.env, where it overrides the variable above (runbooks/admin.md): the build would read the wrong database.
	results.push(result(BUILD, "fail", "apps/web/.dev.vars sets the Hyperdrive connection variable and would override the production URL: move it away for this run"));
} else {
	const out = "dist-preflight";
	const deployCfg = resolve(webRoot, ".wrangler/deploy/config.json"); // astro build repoints this at the output dir
	const savedDeployCfg = existsSync(deployCfg) ? readFileSync(deployCfg) : null;
	const env = { ...process.env, PUBLIC_SITE_LIVE: "true", DERIVE_READONLY: "1", EMDASH_SITE_URL: CANONICAL_ORIGIN, ASTRO_OUT_DIR: `./${out}`, SITE_ENV: "production", [HYPERDRIVE_ENV]: dbUrl };
	try {
		rmSync(resolve(webRoot, out), { recursive: true, force: true });
		const b = spawnSync("pnpm", ["--filter", "web", "build"], { cwd: repoRoot, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
		const log = `${b.stdout}\n${b.stderr}`;
		if (b.status !== 0 || /runtime init failed/.test(log)) {
			const why = log.split("\n").filter((l) => /\[post-build\]|Error|error/.test(l)).slice(-3).join(" | ").slice(0, 400);
			results.push(result(BUILD, "fail", `build exit ${b.status}: ${why}`));
		} else {
			results.push(result(BUILD, "pass", "PUBLIC_SITE_LIVE=true, DERIVE_READONLY=1"));
			results.push(inspectBuild(resolve(webRoot, out, "client")));
		}
	} finally {
		rmSync(resolve(webRoot, out), { recursive: true, force: true });
		if (savedDeployCfg) {
			mkdirSync(dirname(deployCfg), { recursive: true });
			writeFileSync(deployCfg, savedDeployCfg);
		} else rmSync(deployCfg, { force: true });
	}
}

function inspectBuild(client) {
	const NAME = "live build output names growgen.xyz only";
	const problems = [];
	const read = (p) => (existsSync(resolve(client, p)) ? readFileSync(resolve(client, p), "utf8") : null);
	const robots = read("robots.txt");
	if (robots == null) problems.push("no robots.txt");
	else problems.push(...checkRobotsLive(robots).map((p) => `robots.txt ${p}`));
	const home = read("index.html");
	if (home == null) problems.push("no index.html");
	else problems.push(...checkLivePage(home, {}, CANONICAL_ORIGIN, "/").map((p) => `index.html: ${p}`));
	const headers = read("_headers");
	if (headers && /noindex/i.test(headers)) problems.push("_headers still carries a noindex rule");
	for (const f of ["sitemap-index.xml", "sitemap-0.xml", "sitemap.xml"]) {
		const xml = read(f);
		if (xml == null) {
			problems.push(`no ${f}`);
			continue;
		}
		const locs = sitemapLocs(xml);
		if (locs.length === 0) problems.push(`${f} has no <loc>`);
		const bad = offOrigin(locs);
		if (bad.length) problems.push(`${f} has ${bad.length} off-origin <loc>, e.g. ${bad[0]}`);
	}
	const rss = read("rss.xml");
	if (rss == null) problems.push("no rss.xml");
	else {
		const links = [...rss.matchAll(/<link>\s*([^<\s]+)\s*<\/link>/g)].map((m) => m[1]);
		if (links.length < 2) problems.push("rss.xml has no item links");
		const bad = offOrigin(links).filter((l) => l !== CANONICAL_ORIGIN);
		if (bad.length) problems.push(`rss.xml has ${bad.length} off-origin link(s), e.g. ${bad[0]}`);
	}
	const ads = read("ads.txt");
	if (!ads || !adsTxtOk(ads)) problems.push("ads.txt missing or has no google.com DIRECT line");
	let pages = 0;
	let withRetired = 0;
	let withWww = 0;
	let offCanon = 0;
	let withNoindex = 0;
	const walk = (d) => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = resolve(d, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".html")) {
				pages++;
				const h = readFileSync(p, "utf8");
				if (h.includes(RETIRED_HOST)) withRetired++;
				if (/\/\/www\.growgen\.xyz/.test(h)) withWww++;
				const c = canonicalHref(h);
				const o = ogUrl(h);
				if ((c && offOrigin([c]).length) || (o && offOrigin([o]).length && o !== CANONICAL_ORIGIN)) offCanon++;
				if (hasNoindexMeta(h)) withNoindex++;
			}
		}
	};
	walk(client);
	if (pages === 0) problems.push("no HTML pages built");
	if (withRetired) problems.push(`${withRetired} page(s) mention the retired host`);
	if (withWww) problems.push(`${withWww} page(s) mention www.growgen.xyz (there is no www)`);
	if (offCanon) problems.push(`${offCanon} page(s) have an off-origin canonical or og:url`);
	return problems.length ? result(NAME, "fail", problems.join("; ")) : result(NAME, "pass", `${pages} pages scanned; ${withNoindex} carry their own noindex (SEO panel and utility pages, expected)`);
}

// 6. The legacy `growgen` Worker must not auto-build on pushes (Workers Builds paused). The Builds API is addressed by the Worker's
// script tag, so resolve it first. Only an explicit "all triggers paused" passes; every unexpected answer is MANUAL, never a pass.
{
	const NAME = "legacy growgen Worker auto-build is paused";
	const token = process.env.CLOUDFLARE_API_TOKEN;
	const account = process.env.CLOUDFLARE_ACCOUNT_ID || "2c1ea12e37cd89d9a6f6a62c6798d3a0";
	const manual = "Dashboard, Workers & Pages, growgen, Settings, Builds: confirm the Git trigger is paused or disconnected (GON-213)";
	const api = async (path) => {
		const ctl = new AbortController();
		const t = setTimeout(() => ctl.abort(), 20000);
		try {
			const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: ctl.signal });
			return { status: res.status, body: await res.json().catch(() => null) };
		} finally {
			clearTimeout(t);
		}
	};
	if (!token) results.push(result(NAME, "manual", `no CLOUDFLARE_API_TOKEN in the environment. ${manual}`));
	else {
		try {
			const scripts = await api("/workers/scripts");
			const script = Array.isArray(scripts.body?.result) ? scripts.body.result.find((s) => s.id === "growgen") : null;
			const tag = script?.tag;
			if (!tag) results.push(result(NAME, "manual", `could not resolve the growgen script tag (API ${scripts.status}). ${manual}`));
			else {
				const t = await api(`/builds/workers/${tag}/triggers`);
				const triggers = t.body?.result;
				if (t.status !== 200 || !Array.isArray(triggers) || triggers.length === 0) results.push(result(NAME, "manual", `Builds API answered ${t.status} with ${Array.isArray(triggers) ? "no triggers" : "an unexpected body"}; cannot tell paused from absent. ${manual}`));
				else {
					const active = triggers.filter((x) => x.deleted_on == null && x.paused !== true && x.enabled !== false);
					results.push(active.length ? result(NAME, "fail", `${active.length} of ${triggers.length} trigger(s) active`) : result(NAME, "pass", `${triggers.length} trigger(s), all paused`));
				}
			}
		} catch (e) {
			results.push(result(NAME, "manual", `API call failed (${e instanceof Error ? e.message : e}). ${manual}`));
		}
	}
}

process.exit(printResults(results) ? 0 : 1);
