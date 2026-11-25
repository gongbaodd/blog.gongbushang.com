#!/usr/bin/env node
// SEC-02: fail if the admin build output contains the canary DATABASE_URL pieces.
// Run after `DATABASE_URL='postgresql://leakcheck_user:LEAKCHECK_SECRET@db.example.invalid:5432/postgres' pnpm --filter admin build`.
// Matches are reported by file path only; the matched text is never printed.
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = process.argv[2] ? resolve(process.argv[2]) : join(here, "..", "dist");

const MARKERS = ["LEAKCHECK_SECRET", "leakcheck_user", "db.example.invalid"];

async function* walk(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (entry.isFile()) yield full;
	}
}

try {
	const info = await stat(dist);
	if (!info.isDirectory()) throw new Error("not a directory");
} catch {
	console.error(`check-no-baked-secrets: ${dist} not found; run the admin build first.`);
	process.exit(2);
}

const leaks = [];
let scanned = 0;
for await (const file of walk(dist)) {
	scanned++;
	const text = await readFile(file, "latin1");
	for (const marker of MARKERS) {
		if (text.includes(marker)) leaks.push({ file: relative(process.cwd(), file), marker });
	}
}

if (scanned === 0) {
	console.error(`check-no-baked-secrets: no files under ${dist}; the build output is empty.`);
	process.exit(2);
}

if (leaks.length > 0) {
	console.error("check-no-baked-secrets: build output contains a baked database credential marker:");
	for (const { file, marker } of leaks) console.error(`  - ${file} (marker ${marker})`);
	process.exit(1);
}

console.log(`check-no-baked-secrets: OK (${scanned} files scanned, no markers found).`);
