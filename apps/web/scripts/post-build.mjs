// Run after `astro build`. Writes noindex headers + robots.txt into dist/client for non-production envs (D11).
// SITE_ENV=production (default when unset is NOT production: fail closed) leaves the build untouched.
import { appendFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const client = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/client");
const env = process.env.SITE_ENV ?? process.env.CLOUDFLARE_ENV ?? "testing";
if (!existsSync(client)) throw new Error(`missing ${client}; run astro build first`);
if (env === "production") {
	console.log("[post-build] production: indexable, nothing written");
} else {
	appendFileSync(resolve(client, "_headers"), "\n/*\n  X-Robots-Tag: noindex, nofollow\n");
	writeFileSync(resolve(client, "robots.txt"), "User-agent: *\nDisallow: /\n");
	console.log(`[post-build] ${env}: wrote noindex _headers rule and disallow-all robots.txt`);
}
