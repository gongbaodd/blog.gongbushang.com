#!/usr/bin/env node
// Guard for local `deploy:testing:build` (INF-7). A build with CLOUDFLARE_ENV=testing prerenders from the DB named by
// CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE, but the Astro Cloudflare adapter lets `.dev.vars` override that
// variable. Wrangler reads `.dev.vars.testing` INSTEAD of `.dev.vars` when it exists, so require it (or a `.dev.vars` that
// does not set the Hyperdrive variable). CI has neither file and is unaffected.
//   node scripts/admin/check-build-env.mjs testing
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const KEY = "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE";
const env = process.argv[2];
const web = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => (existsSync(resolve(web, f)) ? parseEnv(readFileSync(resolve(web, f), "utf8")) : null);

if (!env) {
	console.error("usage: check-build-env.mjs <env>");
	process.exit(2);
}
if (!read(`.dev.vars.${env}`) && read(".dev.vars")?.[KEY]) {
	console.error(
		`[build-env] apps/web/.dev.vars sets ${KEY}, which would override the ${env} database during the build.\n` +
			`            Create apps/web/.dev.vars.${env} (wrangler then ignores .dev.vars) containing ${KEY}=<${env} pooler url> and EMDASH_ENCRYPTION_KEY=<${env} key>.`,
	);
	process.exit(1);
}
console.log(`[build-env] ok: no .dev.vars override of ${KEY} for ${env}`);
