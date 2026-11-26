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

// GON-203 guard: every built HTML page carries at most ONE <meta name="robots"> (BaseHead and <EmDashHead> used to both emit one,
// e.g. on the 404). Duplicate/conflicting robots directives make crawlers pick the most restrictive and hide bugs.
{
	const ROBOTS_RE = /<meta\s[^>]*name=["']robots["']/gi;
	const dup = [];
	let pages = 0;
	const walk = (dir) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = resolve(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".html")) {
				pages++;
				const n = (readFileSync(p, "utf8").match(ROBOTS_RE) ?? []).length;
				if (n > 1) dup.push(`${p.slice(client.length)} (${n})`);
			}
		}
	};
	walk(client);
	if (dup.length) throw new Error(`[post-build] ${dup.length} page(s) with more than one <meta name="robots">:\n  ${dup.slice(0, 20).join("\n  ")}`);
	console.log(`[post-build] robots meta check: ${pages} HTML pages, none with more than one tag`);
}
