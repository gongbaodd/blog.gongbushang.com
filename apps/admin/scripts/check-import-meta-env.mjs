#!/usr/bin/env node
// SEC-02 static guard. Astro's env plugin inlines every private variable that appears in a `import.meta.env` expression
// that is not a plain property access (`import.meta.env?.X`, `import.meta.env[k]`, bare `import.meta.env`), so the whole
// environment object can end up in dist/. This fails when any such use appears in the admin sources or in the shared
// apps/web files that the admin image compiles. Only `import.meta.env.<NAME>` is allowed.
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const ROOTS = [
	join(repoRoot, "apps/admin/src"),
	join(repoRoot, "apps/web/src/lib/cloudinary-media"),
	join(repoRoot, "apps/web/src/lib/lockdown.ts"),
	join(repoRoot, "apps/web/src/plugins/rebuild-on-publish"),
];
const EXTS = /\.(?:[cm]?[jt]sx?|astro|mdx?)$/;
const BAD = /import\.meta\.env(?!\.)/g;

async function* walk(path) {
	const info = await stat(path);
	if (info.isFile()) {
		if (EXTS.test(path)) yield path;
		return;
	}
	for (const entry of await readdir(path, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		yield* walk(join(path, entry.name));
	}
}

const offenders = [];
let scanned = 0;
for (const root of ROOTS) {
	for await (const file of walk(root)) {
		scanned++;
		const lines = (await readFile(file, "utf8")).split("\n");
		lines.forEach((line, i) => {
			BAD.lastIndex = 0;
			if (BAD.test(line)) offenders.push(`${relative(repoRoot, file)}:${i + 1}`);
		});
	}
}

if (offenders.length > 0) {
	console.error("check-import-meta-env: use import.meta.env.<NAME> only (no ?., [], or bare import.meta.env):");
	for (const o of offenders) console.error(`  - ${o}`);
	process.exit(1);
}
console.log(`check-import-meta-env: OK (${scanned} files scanned).`);
