#!/usr/bin/env node
// Guard for the local `deploy:production:build` (INF-7, INF-10). The build prerenders from the DB named by
// CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE, but the Astro Cloudflare adapter lets `.dev.vars` override that
// variable. There is no `env.production` block any more (the top level IS production), so wrangler reads `.dev.vars` for this
// build: refuse to build while it sets the Hyperdrive variable, otherwise a "production" build could silently prerender from
// the local database. CI has no `.dev.vars` and is unaffected.
//   node scripts/admin/check-build-env.mjs production
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const KEY = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
const env = process.argv[2];
const web = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => (existsSync(resolve(web, f)) ? parseEnv(readFileSync(resolve(web, f), "utf8")) : null);

if (env !== "production") {
	console.error("usage: check-build-env.mjs production   (the only remote build target since INF-10)");
	process.exit(2);
}
if (read(".dev.vars")?.[KEY]) {
	console.error(
		`[build-env] apps/web/.dev.vars sets ${KEY}, which would override the production database during the build.\n` +
			`            Move it away for the build (mv apps/web/.dev.vars apps/web/.dev.vars.off) or delete that line, then run the build again.`,
	);
	process.exit(1);
}
console.log(`[build-env] ok: no .dev.vars override of ${KEY}`);
