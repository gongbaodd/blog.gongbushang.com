#!/usr/bin/env node
// GON-183 (CUT-1) post-switch smoke test: run it right after `growgen-web` claims growgen.xyz (GON-214 step 6).
// Read-only: HTTP GET/HEAD against the public origin, nothing else. Exit 0 = all automatic checks pass, 1 = a failure.
//
//   node apps/web/scripts/cutover/smoke.mjs [--origin https://growgen.xyz] [--parity full|sample|off] [--concurrency 12]
//
// Parity (`--parity full`, default) requests every path in tests/legacy-urls.txt (about 4,900, all static assets, no Worker
// invocation) and fails if any is not a 200. Checks that need a human (Mixpanel consent opt-in/opt-out, search, Search Console) are
// listed at the end as MANUAL and do not affect the exit code.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { CANONICAL_ORIGIN, RETIRED_HOST, acceptedStatuses, adsTxtOk, checkLivePage, checkRobotsLive, http, offOrigin, pool, printResults, result, sitemapLocs } from "./lib.mjs";

const { values } = parseArgs({
	options: {
		origin: { type: "string", default: CANONICAL_ORIGIN },
		parity: { type: "string", default: "full" },
		concurrency: { type: "string", default: "12" },
		help: { type: "boolean", short: "h", default: false },
	},
});
if (values.help) {
	console.log("Usage: node apps/web/scripts/cutover/smoke.mjs [--origin <origin>] [--parity full|sample|off] [--concurrency <n>]");
	process.exit(0);
}
const origin = values.origin.replace(/\/+$/, "");
if (!["full", "sample", "off"].includes(values.parity) || !(Number(values.concurrency) >= 1)) {
	console.error("--parity must be full|sample|off and --concurrency a number >= 1");
	process.exit(2);
}
if (origin.includes(RETIRED_HOST)) {
	console.error("refusing: that host is retired, smoke the public origin");
	process.exit(2);
}
const results = [];
const add = (name, problems, okDetail = "") => results.push(problems.length ? result(name, "fail", problems.join("; ")) : result(name, "pass", okDetail));
const u = (p) => `${origin}${p}`;

// 1. Home page: 200, indexable, canonical on the origin.
const home = await http(u("/"));
add("GET / is 200", home.status === 200 ? [] : [`status ${home.status} ${home.error ?? ""}`.trim()]);
if (home.status === 200) {
	add("home page is indexable and canonical", checkLivePage(home.text, home.headers, origin, "/"));
	results.push(
		/mixpanel/i.test(home.text)
			? result("home page references Mixpanel", "pass")
			: result("home page references Mixpanel", "manual", "not found in the HTML; if the token variable is set, check the consent banner by hand"),
	);
}

// 2. robots.txt, sitemap index and sitemap files. The sample post below comes from the sitemap, so it is indexable by construction.
let samplePost;
const robots = await http(u("/robots.txt"));
add("robots.txt allows crawling and names the sitemap", robots.status === 200 ? checkRobotsLive(robots.text, origin) : [`status ${robots.status}`]);
const idx = await http(u("/sitemap-index.xml"));
add("sitemap-index.xml is 200", idx.status === 200 ? [] : [`status ${idx.status}`]);
if (idx.status === 200) {
	const children = sitemapLocs(idx.text);
	const problems = offOrigin(children, origin).map((x) => `off-origin: ${x}`);
	if (children.length === 0) problems.push("no <loc> entries");
	let urls = 0;
	for (const child of offOrigin(children, origin).length ? [] : children.slice(0, 5)) {
		const sm = await http(child);
		if (sm.status !== 200) {
			problems.push(`${child} is ${sm.status}`);
			continue;
		}
		const locs = sitemapLocs(sm.text);
		urls += locs.length;
		if (locs.length === 0) problems.push(`${child} has no URLs`);
		if (!samplePost) samplePost = locs.map((l) => l.slice(origin.length)).find((p) => /^\/[a-z]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/.test(p));
		const bad = offOrigin(locs, origin);
		if (bad.length) problems.push(`${bad.length} off-origin URL(s) in ${child}, e.g. ${bad[0]}`);
	}
	add("sitemap URLs are all on the origin", problems, `${urls} URLs`);
}

// 3. Locked-down paths (D12): the public Worker serves no admin, no OAuth discovery.
for (const p of ["/_emdash/admin", "/_emdash/api/setup", "/.well-known/oauth-authorization-server"]) {
	const r = await http(u(p));
	const xrt = r.headers.get("x-robots-tag") ?? "";
	add(`${p} is 404 and not noindex-tagged`, [...(r.status === 404 ? [] : [`status ${r.status}`]), ...(/noindex/i.test(xrt) ? [`X-Robots-Tag: ${xrt} (the Worker's PUBLIC_SITE_LIVE var is still false)`] : [])]);
}

// 4. ads.txt and RSS.
const ads = await http(u("/ads.txt"));
add("ads.txt resolves with a Google DIRECT line", ads.status === 200 && adsTxtOk(ads.text) ? [] : [`status ${ads.status}, ${adsTxtOk(ads.text) ? "ok" : "no google.com DIRECT line"}`]);
const rss = await http(u("/rss.xml"));
{
	const problems = [];
	if (rss.status !== 200) problems.push(`status ${rss.status}`);
	else {
		if (!/<rss\b/.test(rss.text)) problems.push("not an RSS document");
		if (rss.text.includes(RETIRED_HOST)) problems.push("mentions the retired host");
		const links = [...rss.text.matchAll(/<link>\s*([^<\s]+)\s*<\/link>/g)].map((m) => m[1]);
		if (links.length < 2) problems.push("no item links");
		const bad = offOrigin(links, origin).filter((l) => l !== origin);
		if (bad.length) problems.push(`${bad.length} off-origin link(s), e.g. ${bad[0]}`);
	}
	add("rss.xml is valid and on the origin", problems);
}

// 5. Representative pages, each with canonical and no noindex. A post is taken from the legacy list.
const legacy = readFileSync(resolve(import.meta.dirname, "../../tests/legacy-urls.txt"), "utf8")
	.split("\n")
	.filter((l) => l && !l.startsWith("#"));
const post = samplePost ?? legacy.find((p) => /^\/[a-z]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(p));
for (const p of ["/about/", "/podcast/", "/world/", "/tags/", "/lab/", ...(post ? [post] : [])]) {
	const r = await http(u(p));
	add(`${p} is 200 and indexable`, r.status === 200 ? checkLivePage(r.text, r.headers, origin, p) : [`status ${r.status}`]);
}
// Utility pages that are noindex by design (scripts/post-build.mjs): only the status and the absence of the response header matter.
for (const p of ["/umap/", "/hero-gallery/"]) {
	const r = await http(u(p));
	const xrt = r.headers.get("x-robots-tag") ?? "";
	add(`${p} is 200 (meta noindex by design, no X-Robots-Tag)`, [...(r.status === 200 ? [] : [`status ${r.status}`]), ...(/noindex/i.test(xrt) ? [`X-Robots-Tag: ${xrt}`] : [])]);
}

// 6. Parity against the live origin.
if (values.parity !== "off") {
	const paths = values.parity === "sample" ? legacy.filter((_, i) => i % 25 === 0) : legacy;
	const statuses = await pool(paths, Number(values.concurrency) || 12, async (p) => {
		let r = await http(u(p), { method: "HEAD" });
		if (r.status === 0 || r.status === 405) r = await http(u(p));
		return r.status;
	});
	const all = paths.map((p, i) => ({ p, s: statuses[i] }));
	const missing = all.filter((x) => !acceptedStatuses(x.p).includes(x.s));
	const known = all.filter((x) => x.s !== 200 && acceptedStatuses(x.p).includes(x.s)).length;
	add(
		`parity: ${paths.length} legacy URLs answer 200`,
		missing.length ? [`${missing.length} not 200, e.g. ${missing.slice(0, 5).map((x) => `${x.p} (${x.s})`).join(", ")}`] : [],
		`${paths.length} URLs${known ? `, ${known} known non-200 (/404.html redirect, c# tag)` : ""}`,
	);
} else results.push(result("parity", "skip", "--parity off"));

results.push(result("search works, Mixpanel consent opt-in and opt-out work", "manual", "check in a browser (GON-214 step 6)"));
results.push(result("Search Console: verify growgen.xyz, submit /sitemap-index.xml", "manual", "GON-214 step 8"));
process.exit(printResults(results) ? 0 : 1);
