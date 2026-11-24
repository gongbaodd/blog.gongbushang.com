// Build-time guard (run before `astro build`). wrangler `assets.not_found_handling: "404-page"` with
// `run_worker_first: ["/_emdash/*"]` means static misses never reach the Worker (Free plan, 10 ms CPU),
// so every public route under src/pages must be prerendered. Fails if any page/endpoint lacks
// `export const prerender = true`. EmDash's own `/_emdash/*` routes are injected, not in src/pages.
// Add a path to ALLOW_SSR only for a deliberately SSR route (currently none).
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOW_SSR = [];
const pagesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/pages");
const EXT = new Set([".astro", ".ts", ".js", ".mjs", ".tsx", ".jsx", ".md", ".mdx"]);

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = resolve(dir, e.name);
		if (e.isDirectory()) return walk(p);
		return EXT.has(extname(e.name)) ? [p] : [];
	});
}

const bad = [];
for (const file of walk(pagesDir)) {
	const rel = relative(pagesDir, file);
	if (rel.split("/").some((seg) => seg.startsWith("_"))) continue; // Astro ignores _-prefixed files
	if (rel.startsWith("_emdash/") || ALLOW_SSR.includes(rel)) continue;
	const src = readFileSync(file, "utf8");
	if (!/^\s*export\s+const\s+prerender\s*=\s*true\b/m.test(src)) bad.push(rel);
}

if (bad.length) {
	console.error(
		`[check-static-routes] These routes are not prerendered (they would 404 in production; static assets never wake the Worker):\n  - ${bad.join("\n  - ")}\nAdd \`export const prerender = true\` or list them in ALLOW_SSR (and run the Worker first for them in wrangler.jsonc).`,
	);
	process.exit(1);
}
console.log("[check-static-routes] ok: all src/pages routes are prerendered");
