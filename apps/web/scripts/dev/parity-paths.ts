// Prints per-group missing/extra counts of dist/client vs tests/legacy-route-groups.json.
// Usage: pnpm --filter web exec node --experimental-strip-types scripts/dev/parity-paths.ts
import { builtPaths, loadGroups } from "../../tests/built-paths.ts";

const { groups } = loadGroups();
const built = builtPaths();
const dec = (p: string) => {
	try {
		return decodeURI(p);
	} catch {
		return p;
	}
};
const builtDec = new Set([...built].map(dec));
const all = new Set(Object.values(groups).flatMap((g) => g.paths.map(dec)));
console.log("group".padEnd(14), "legacy".padStart(6), "missing".padStart(8));
for (const [name, g] of Object.entries(groups)) {
	const missing = g.paths.filter((p) => !builtDec.has(dec(p)));
	console.log(name.padEnd(14), String(g.paths.length).padStart(6), String(missing.length).padStart(8), missing.slice(0, 3).join(" "));
}
const extra = [...builtDec].filter((p) => !all.has(p) && !p.startsWith("/_astro/") && !p.startsWith("/_emdash/"));
console.log(`built files: ${built.size}; not in legacy list: ${extra.length}`, extra.slice(0, 10));
