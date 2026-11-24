// QA-1 seed: for every route group whose story has landed, the built `dist/client` must contain every
// legacy path (built ⊇ legacy). Skipped when there is no build. Run `pnpm --filter web build` first.
import { describe, expect, test } from "vitest";
import { DIST_CLIENT, builtPaths, diffGroup, loadGroups } from "../../tests/built-paths";
import { existsSync } from "node:fs";

/** Groups owned by landed stories. Add a group here when its story merges. */
const DONE = ["post", "category", "tag", "series", "year", "world", "api/*"] as const;

const hasBuild = existsSync(DIST_CLIENT);
const { groups } = loadGroups();
const built = hasBuild ? builtPaths() : new Set<string>();
const everyLegacy = new Set(Object.values(groups).flatMap((g) => g.paths));

describe.skipIf(!hasBuild)("built paths contain every legacy path", () => {
	for (const name of DONE) {
		test(`${name}: 0 missing`, () => {
			const { missing } = diffGroup(groups[name].paths, built, everyLegacy);
			if (missing.length) console.warn(`[route-parity] ${name}: ${missing.length} missing, e.g. ${missing.slice(0, 5).join(" ")}`);
			expect(missing).toEqual([]);
		});
	}

	test("no built HTML page is outside the legacy URL list", () => {
		const legacy = new Set([...everyLegacy].map((p) => decodeURI(p)));
		const extra = [...built]
			.filter((p) => p.endsWith("/") && !p.startsWith("/_emdash/") && !p.startsWith("/_astro/"))
			.filter((p) => !legacy.has(decodeURI(p)));
		if (extra.length) console.warn(`[route-parity] ${extra.length} built pages not in legacy-urls.txt, e.g. ${extra.slice(0, 5).join(" ")}`);
		expect(extra).toEqual([]);
	});
});
