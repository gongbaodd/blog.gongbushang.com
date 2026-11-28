// Run after `astro build`. Writes noindex headers + robots.txt into dist/client unless PUBLIC_SITE_LIVE=true (D11, INF-10).
// Only the exact value `true` leaves the build untouched; unset, `false`, `TRUE` and typos all fail closed. SITE_ENV is not consulted.
import { appendFileSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const client = resolve(dirname(fileURLToPath(import.meta.url)), "..", process.env.ASTRO_OUT_DIR || "dist", "client");
const live = process.env.PUBLIC_SITE_LIVE === "true";
if (!existsSync(client)) throw new Error(`missing ${client}; run astro build first`);
if (live) {
	console.log("[post-build] PUBLIC_SITE_LIVE=true: indexable, nothing written");
} else {
	const headers = resolve(client, "_headers");
	const rule = "\n/*\n  X-Robots-Tag: noindex, nofollow\n";
	// Idempotent: the root deploy:production:build script runs this again after `pnpm build`.
	if (!existsSync(headers) || !readFileSync(headers, "utf8").includes("X-Robots-Tag: noindex")) appendFileSync(headers, rule);
	writeFileSync(resolve(client, "robots.txt"), "User-agent: *\nDisallow: /\n");
	console.log(`[post-build] not live (PUBLIC_SITE_LIVE != true): wrote noindex _headers rule and disallow-all robots.txt`);
}

// GON-203 guards on the built HTML.
//  1. Every page carries at most ONE <meta name="robots"> in <head> (BaseHead and <EmDashHead> used to both emit one, e.g. on the
//     404), and the 404 carries exactly one.
//  2. The posts the SEO panel marks noindex and the utility noindex pages are never in the sitemap.
//  3. Unless EmDash's site-wide "staging" setting (Settings; `options` row `site:staging`) is on, no page that says noindex is in the
//     sitemap. With staging on, <EmDashHead> adds `noindex, nofollow` to EVERY page, so check 3 is skipped; a LIVE build
//     (PUBLIC_SITE_LIVE=true) must then fail, because staging would keep the whole site out of search engines.
{
	const { readNoindexIds } = await import("./seo/noindex-list.mjs");
	const ROBOTS_RE = /<meta\b[^>]*\bname=(?:["']robots["']|robots\b)/gi;
	const head = (html) => html.split(/<\/head>/i)[0];
	const robotsTags = (html) => head(html).match(/<meta\b[^>]*>/gi)?.filter((t) => /\bname=(?:["']robots["']|robots\b)/i.test(t)) ?? [];
	const isNoindex = (html) => robotsTags(html).some((t) => /\bcontent=(?:["'][^"']*noindex|noindex)/i.test(t));
	const robotsCount = (html) => (head(html).match(ROBOTS_RE) ?? []).length;
	const dup = [];
	const noindexPaths = [];
	let pages = 0;
	const walk = (dir) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = resolve(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".html")) {
				pages++;
				const html = readFileSync(p, "utf8");
				const n = robotsCount(html);
				if (n > 1) dup.push(`${p.slice(client.length)} (${n})`);
				if (isNoindex(html)) noindexPaths.push(p.slice(client.length).replace(/index\.html$/, "").replace(/\.html$/, "/"));
			}
		}
	};
	walk(client);
	if (dup.length) throw new Error(`[post-build] ${dup.length} page(s) with more than one <meta name="robots">:\n  ${dup.slice(0, 20).join("\n  ")}`);
	const n404 = existsSync(resolve(client, "404.html")) ? robotsCount(readFileSync(resolve(client, "404.html"), "utf8")) : 0;
	if (n404 !== 1) throw new Error(`[post-build] 404.html must carry exactly one <meta name="robots">, found ${n404}`);

	// Site-wide noindex = the home page says noindex although it never asks for it itself (EmDash staging).
	const indexHtml = existsSync(resolve(client, "index.html")) ? readFileSync(resolve(client, "index.html"), "utf8") : "";
	const siteWideNoindex = isNoindex(indexHtml);
	if (siteWideNoindex && live) {
		throw new Error(
			'[post-build] PUBLIC_SITE_LIVE=true, but the home page carries <meta name="robots" content="noindex...">: EmDash "staging" is on ' +
				"(admin Settings, `options` row `site:staging`). Turn staging off before cutover, then rebuild.",
		);
	}

	const sitemap = resolve(client, "sitemap-0.xml");
	let locs = new Set();
	if (existsSync(sitemap)) {
		const dec = (x) => {
			try {
				return decodeURIComponent(x);
			} catch {
				return x;
			}
		};
		locs = new Set([...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => dec(new URL(m[1]).pathname)));
	}
	const inSitemap = (p) => locs.has(p) || locs.has(p.replace(/\/$/, ""));
	// Always: SEO-panel noindex posts and the utility pages.
	const ids = readNoindexIds();
	const always = [...locs].filter((l) => /^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/.test(l) && ids.has(l.replace(/^\//, "").replace(/\/$/, "")));
	for (const u of ["/404/", "/cv/", "/gemini/", "/hero-gallery/", "/umap/"]) if (inSitemap(u)) always.push(u);
	if (always.length) throw new Error(`[post-build] noindex page(s) listed in sitemap-0.xml:\n  ${always.slice(0, 20).join("\n  ")}`);
	// Not under site-wide staging: any page whose own HTML says noindex.
	if (!siteWideNoindex) {
		const bad = noindexPaths.filter(inSitemap);
		if (bad.length) throw new Error(`[post-build] ${bad.length} noindex page(s) listed in sitemap-0.xml:\n  ${bad.slice(0, 20).join("\n  ")}`);
	}
	console.log(
		`[post-build] robots meta check: ${pages} HTML pages, none with more than one tag; 404 has one; ${noindexPaths.length} noindex page(s)` +
			(siteWideNoindex ? " (site-wide: EmDash staging is on; blanket sitemap check skipped)" : ", none in the sitemap"),
	);
}
