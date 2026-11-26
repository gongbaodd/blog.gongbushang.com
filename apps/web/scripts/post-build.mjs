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
//  2. No page that says noindex is listed in the sitemap.
{
	const ROBOTS_RE = /<meta\b[^>]*\bname=(?:["']robots["']|robots\b)/gi;
	const NOINDEX_RE = /<meta\b[^>]*\bname=["']?robots["']?[^>]*\bcontent=["'][^"']*noindex/i;
	const robotsCount = (html) => (html.split(/<\/head>/i)[0].match(ROBOTS_RE) ?? []).length;
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
				if (NOINDEX_RE.test(html.split(/<\/head>/i)[0])) noindexPaths.push(p.slice(client.length).replace(/index\.html$/, "").replace(/\.html$/, "/"));
			}
		}
	};
	walk(client);
	if (dup.length) throw new Error(`[post-build] ${dup.length} page(s) with more than one <meta name="robots">:\n  ${dup.slice(0, 20).join("\n  ")}`);
	const n404 = existsSync(resolve(client, "404.html")) ? robotsCount(readFileSync(resolve(client, "404.html"), "utf8")) : 0;
	// Non-live builds also get the X-Robots-Tag header; the 404 meta tag is what the page itself says.
	if (n404 !== 1) throw new Error(`[post-build] 404.html must carry exactly one <meta name="robots">, found ${n404}`);
	const sitemap = resolve(client, "sitemap-0.xml");
	if (existsSync(sitemap)) {
		const locs = new Set([...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname));
		const bad = noindexPaths.filter((p) => locs.has(p) || locs.has(p.replace(/\/$/, "")));
		if (bad.length) throw new Error(`[post-build] ${bad.length} noindex page(s) listed in sitemap-0.xml:\n  ${bad.slice(0, 20).join("\n  ")}`);
	}
	console.log(`[post-build] robots meta check: ${pages} HTML pages, none with more than one tag; 404 has one; ${noindexPaths.length} noindex page(s), none in the sitemap`);
}
