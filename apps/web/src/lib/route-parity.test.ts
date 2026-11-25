// QA-1: for every route group whose story has landed, the built `dist/client` must contain every
// legacy path (built ⊇ legacy), via the one shared implementation `runParityCheck` (tests/parity.ts,
// also behind `pnpm --filter web parity`). Skipped when there is no build: run `pnpm --filter web build` first.
import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import { DIST_CLIENT } from "../../tests/built-paths";
import { runParityCheck } from "../../tests/parity";

/** Groups owned by landed stories. Add a group here when its story merges. */
const DONE = ["post", "category", "tag", "series", "year", "world", "api/*", "podcast", "resume", "static", "gallery", "other", "rss/sitemap"] as const;

/** Paths of a DONE group that a later story owns (kept visible here so they are not forgotten). */
const OWNED_LATER: Record<string, string[]> = {};

const hasBuild = existsSync(DIST_CLIENT);

describe.skipIf(!hasBuild)("built paths contain every legacy path", () => {
	for (const name of DONE) {
		test(`${name}: 0 missing`, () => {
			const report = runParityCheck({ dir: DIST_CLIENT, groups: [name], allowMissing: OWNED_LATER[name] ?? [] });
			const missing = report.groups.flatMap((g) => g.missing);
			if (missing.length) console.warn(`[route-parity] ${name}: ${missing.length} missing, e.g. ${missing.slice(0, 5).join(" ")}`);
			expect(missing).toEqual([]);
		});
	}

	test("no built page or file is outside the legacy URL list (infra files and new posts excepted)", () => {
		const report = runParityCheck({ dir: DIST_CLIENT, all: true, failOnExtra: true, allowExtra: [fileURLToPath(new URL("../../tests/parity-allow-extra.txt", import.meta.url))] });
		if (report.extraPaths.length) console.warn(`[route-parity] ${report.extraPaths.length} built paths not in legacy-urls.txt, e.g. ${report.extraPaths.slice(0, 5).join(" ")}`);
		expect(report.extraPaths).toEqual([]);
	});
});
