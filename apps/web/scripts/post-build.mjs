// Run after `astro build`. Writes noindex headers + robots.txt into dist/client unless PUBLIC_SITE_LIVE=true (D11, INF-10).
// Only the exact value `true` leaves the build untouched; unset, `false`, `TRUE` and typos all fail closed. SITE_ENV is not consulted.
import { appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
