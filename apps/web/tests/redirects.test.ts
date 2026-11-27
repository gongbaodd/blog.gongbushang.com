import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { tagSlug } from "../src/lib/legacy-url.ts";
import { loadLegacyRedirects, loadLegacyUrls, normalizePath } from "./built-paths.ts";

const here = dirname(fileURLToPath(import.meta.url));
const publicRedirects = readFileSync(resolve(here, "../public/_redirects"), "utf8");
const rules = publicRedirects.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/));

describe("legacy redirects (GON-240)", () => {
	test("every entry of legacy-redirects.txt is a 301 rule in public/_redirects and an old URL in legacy-urls.txt", () => {
		const legacy = new Set(loadLegacyUrls().map(normalizePath));
		const list = loadLegacyRedirects();
		expect(list.length).toBeGreaterThan(0);
		for (const [from, to] of list) {
			expect(rules).toContainEqual([from, to, "301"]);
			expect(legacy.has(normalizePath(from))).toBe(true);
		}
	});

	test("the c# tag moved to c-sharp, page and ndjson", () => {
		expect(tagSlug("c#")).toBe("c-sharp");
		const list = loadLegacyRedirects();
		expect(list).toContainEqual(["/tag/c%23/", "/tag/c-sharp/"]);
		expect(list).toContainEqual(["/api/tag/c%23/0.ndjson", "/api/tag/c-sharp/0.ndjson"]);
	});

	test("no legacy tag URL other than the redirected ones needs encoding (so no other slug mapping is required)", () => {
		const moved = new Set(loadLegacyRedirects().map(([f]) => normalizePath(f)));
		const bad = loadLegacyUrls().filter((u) => /^\/(api\/)?tag\//.test(u) && /[#?%]/.test(decodeURI(u).replace(/%23/g, "#")) && !moved.has(normalizePath(u)));
		expect(bad).toEqual([]);
	});
});
