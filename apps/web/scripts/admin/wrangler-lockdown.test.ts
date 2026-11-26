// D12 / INF-7: the deployed Worker must not serve the EmDash admin or API. Asset misses still reach the Worker (verified with `wrangler tail`), so src/worker.ts 404s /_emdash/* (src/lib/lockdown.ts). This only guards the wrangler side: assets with
// `not_found_handling: "404-page"` and `run_worker_first: false` answer every unknown path (incl. /_emdash/*) with the static 404
// page without invoking the Worker. If someone re-adds `run_worker_first`, this fails.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Strip // and /* *\/ comments and trailing commas without touching strings (URLs contain `//`). */
function parseJsonc(text: string): any {
	let out = "";
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '"') {
			let j = i + 1;
			while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
			out += text.slice(i, j + 1);
			i = j;
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
		} else if (c === "/" && text[i + 1] === "*") {
			i = text.indexOf("*/", i + 2) + 1;
		} else out += c;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const cfg = parseJsonc(readFileSync(resolve(webDir, "wrangler.jsonc"), "utf8"));
// Blocks that can be deployed: only the top level (production; INF-10 removed env.testing). admin-* envs are `astro dev` only.
const deployable: [string, any][] = [["production (top level)", cfg]];

describe("Worker lockdown (D12)", () => {
	it.each(deployable)("%s: assets are served first, the Worker never sees /_emdash/*", (_name, block) => {
		const assets = block.assets ?? cfg.assets; // `assets` is inherited by env blocks
		expect(assets.not_found_handling).toBe("404-page");
		expect(assets.run_worker_first).toBe(false); // explicit, so a `/_emdash/*` rule cannot come back unnoticed
	});

	it("does not route /_emdash or /.well-known to the Worker anywhere", () => {
		expect(JSON.stringify(cfg)).not.toMatch(/"run_worker_first":\s*(\[|true)/);
	});

	it("keeps the cron trigger (scheduled publishing and Supabase keep-alive still need the Worker)", () => {
		expect(cfg.triggers.crons.length).toBeGreaterThan(0);
	});

	it("has exactly two environments: no testing env block, only local/production admin dev envs (INF-10)", () => {
		expect(Object.keys(cfg.env).sort()).toEqual(["admin-local", "admin-production"]);
		expect(JSON.stringify(cfg)).not.toMatch(/testing/i);
	});

	it("binds the promoted production Hyperdrive and KV, not placeholders (INF-10)", () => {
		expect(cfg.hyperdrive[0].id).toBe("319cee5eca8a4c47a00b2091cff565f3");
		expect(cfg.kv_namespaces[0].id).toBe("55d3e3f70475477a9eef931679726407");
	});

	it("disables workers.dev and preview URLs and serves only the custom domain (SEC-12, INF-10)", () => {
		expect(cfg.workers_dev).toBe(false);
		expect(cfg.preview_urls).toBe(false);
		expect(cfg.routes).toEqual([{ pattern: "growgen.xyz", custom_domain: true }]);
	});

	it("ships non-live: PUBLIC_SITE_LIVE must stay \"false\" until CUT-1, SITE_ENV is production", () => {
		expect(cfg.vars.SITE_ENV).toBe("production");
		expect(cfg.vars.PUBLIC_SITE_LIVE).toBe("false");
	});

	it("defines the local-admin envs the admin scripts select", () => {
		for (const name of ["admin-local", "admin-production"]) {
			expect(cfg.env[name]).toBeDefined();
			expect(cfg.env[name].hyperdrive[0].binding).toBe("HYPERDRIVE");
		}
	});
});
