// Structural diff of the built /api/** files against the legacy dist.
// Usage: node scripts/dev/parity-api.mjs <legacy-dist> [new-dist=dist/client] [--examples]
// Per endpoint family: file counts, byte-identical files, item-count / id-sequence mismatches, and the
// most frequent differing JSON paths (array indexes folded to []).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const examples = process.argv.includes("--examples");
const legacyDist = resolve(args[0]);
const newDist = resolve(args[1] ?? "dist/client");

const walk = (d) =>
	readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(join(legacyDist, "api")).map((p) => "/" + relative(legacyDist, p));

const family = (f) => {
	const p = f.split("/");
	if (f.endsWith(".svg")) return "gallery/trace/*.svg";
	if (p[2] === "cards" && p[3]?.match(/^(latest|history)\.json$/)) return `cards/${p[3]}`;
	if (p[2] === "cards") return "cards/<id>.json";
	if (p[2] === "relates") return "relates/<id>.json";
	if (f.endsWith("peak.json")) return "<category>/peak.json";
	if (f.endsWith(".ndjson")) return `${p[2]}${["tag", "series", "year", "world"].includes(p[2]) && p.length > 4 ? "/<x>" : ""}/N.ndjson`.replace(/^(all|book|fe|life|movie|music|plan|sport|tech|tv)\//, "<category>/");
	return p.slice(2).join("/");
};

const sortKeys = (v) =>
	Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

function diffPaths(a, b, path, out) {
	if (JSON.stringify(a) === JSON.stringify(b)) return;
	if (Array.isArray(a) && Array.isArray(b)) {
		for (let i = 0; i < Math.max(a.length, b.length); i++) diffPaths(a[i], b[i], path + "[]", out);
		return;
	}
	if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], path + "." + k, out);
		return;
	}
	out.push(path);
}

const stats = new Map();
const get = (k) => {
	if (!stats.has(k)) stats.set(k, { files: 0, missing: 0, identical: 0, semantic: 0, countDiff: 0, idDiff: 0, orderOnlyDiff: 0, paths: new Map(), ex: [] });
	return stats.get(k);
};

for (const f of files) {
	const s = get(family(f));
	s.files++;
	const np = join(newDist, f);
	if (!existsSync(np)) {
		s.missing++;
		continue;
	}
	const a = readFileSync(join(legacyDist, f), "utf8");
	const b = readFileSync(np, "utf8");
	if (a === b) {
		s.identical++;
		continue;
	}
	if (f.endsWith(".svg")) {
		s.ex.push(f);
		continue;
	}
	let ja, jb;
	const nd = f.endsWith(".ndjson");
	try {
		ja = nd ? a.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(a);
		jb = nd ? b.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(b);
	} catch (e) {
		s.ex.push(`${f} (unparseable)`);
		continue;
	}
	if (JSON.stringify(sortKeys(ja)) === JSON.stringify(sortKeys(jb))) {
		s.semantic++; // same data, different key order
		continue;
	}
	const listA = nd ? ja : (ja.posts ?? ja.links ?? null);
	const listB = nd ? jb : (jb.posts ?? jb.links ?? null);
	if (Array.isArray(listA) && Array.isArray(listB)) {
		if (listA.length !== listB.length) s.countDiff++;
		const ids = (l) => l.map((x) => x.id ?? x.label);
		if (ids(listA).join() !== ids(listB).join()) {
			s.idDiff++;
			if ([...ids(listA)].sort().join() === [...ids(listB)].sort().join()) s.orderOnlyDiff++;
		}
	}
	const out = [];
	diffPaths(sortKeys(ja), sortKeys(jb), "", out);
	for (const p of out) s.paths.set(p, (s.paths.get(p) ?? 0) + 1);
	if (s.ex.length < 3) s.ex.push(f);
}

for (const [k, s] of [...stats].sort()) {
	console.log(
		`\n${k}: ${s.files} legacy files, missing ${s.missing}, byte-identical ${s.identical}, same-data-other-key-order ${s.semantic}, item-count diffs ${s.countDiff}, id-sequence diffs ${s.idDiff} (order-only ${s.orderOnlyDiff})`,
	);
	const top = [...s.paths].sort((a, b) => b[1] - a[1]).slice(0, 8);
	for (const [p, n] of top) console.log(`   ${String(n).padStart(5)} files differ at ${p}`);
	if (examples && s.ex.length) console.log("   e.g.", s.ex.slice(0, 3).join(" "));
}
