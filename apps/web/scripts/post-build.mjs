// Run after `astro build`. Writes noindex headers + robots.txt into dist/client for non-production envs (D11).
// SITE_ENV=production (default when unset is NOT production: fail closed) leaves the build untouched.
import { appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const client = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/client");
const env = process.env.SITE_ENV ?? process.env.CLOUDFLARE_ENV ?? "testing";
if (!existsSync(client)) throw new Error(`missing ${client}; run astro build first`);
if (env === "production") {
	console.log("[post-build] production: indexable, nothing written");
} else {
	const headers = resolve(client, "_headers");
	const rule = "\n/*\n  X-Robots-Tag: noindex, nofollow\n";
	// Idempotent: the root deploy:testing:build script runs this again after `pnpm build`.
	if (!existsSync(headers) || !readFileSync(headers, "utf8").includes("X-Robots-Tag: noindex")) appendFileSync(headers, rule);
	writeFileSync(resolve(client, "robots.txt"), "User-agent: *\nDisallow: /\n");
	console.log(`[post-build] ${env}: wrote noindex _headers rule and disallow-all robots.txt`);
}
