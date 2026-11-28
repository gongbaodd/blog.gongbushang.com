import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { tagSlug } from "../src/lib/legacy-url.ts";
import { expandRedirectTarget, isRedirectPattern, loadLegacyRedirects, loadLegacyUrls, matchRedirectPattern, normalizePath, RETIRED_POST_RE } from "./built-paths.ts";

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
			// A literal source is an old URL of legacy-urls.txt; a placeholder source must match at least one of them (or be the
			// no-trailing-slash twin of a rule that does).
			if (!isRedirectPattern(from)) expect(legacy.has(normalizePath(from))).toBe(true);
			else if (from.endsWith("/")) expect([...legacy].some((u) => matchRedirectPattern(from, u))).toBe(true);
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

describe("post URL redirects (GON-270)", () => {
	const categories = ["book", "fe", "life", "movie", "music", "plan", "sport", "tech", "tv"];
	const legacyPosts = loadLegacyUrls().filter((u) => RETIRED_POST_RE.test(u));

	test("each of the 9 categories has a 301 rule, with and without the trailing slash", () => {
		for (const c of categories) {
			expect(rules).toContainEqual([`/${c}/:year/:month/:day/:slug/`, "/:year/:month/:day/:slug/", "301"]);
			expect(rules).toContainEqual([`/${c}/:year/:month/:day/:slug`, "/:year/:month/:day/:slug/", "301"]);
		}
	});

	test("every one of the 995 legacy post URLs is redirected to its date + slug tail", () => {
		expect(legacyPosts.length).toBe(995);
		const patterns = rules.filter(([from]) => isRedirectPattern(from));
		for (const url of legacyPosts) {
			const hits = patterns.filter(([from]) => matchRedirectPattern(from, url));
			expect(hits.length, url).toBe(1);
			const target = expandRedirectTarget(hits[0][1], matchRedirectPattern(hits[0][0], url)!);
			expect(target, url).toBe("/" + url.split("/").slice(2).join("/"));
		}
	});

	test("rules stay within the Cloudflare limits (2000 static, 100 dynamic, 1000 characters each)", () => {
		const dynamic = rules.filter(([from]) => isRedirectPattern(from) || from.includes("*"));
		expect(rules.length - dynamic.length).toBeLessThanOrEqual(2000);
		expect(dynamic.length).toBeLessThanOrEqual(100);
		for (const r of rules) expect(r.join(" ").length).toBeLessThanOrEqual(1000);
	});

	test("the placeholder matcher is one segment per placeholder", () => {
		expect(matchRedirectPattern("/tech/:year/:month/:day/:slug/", "/tech/2025/02/21/x/")).toEqual({ year: "2025", month: "02", day: "21", slug: "x" });
		expect(matchRedirectPattern("/tech/:year/:month/:day/:slug/", "/tech/2025/02/21/x/y/")).toBeNull();
		expect(matchRedirectPattern("/tech/:year/:month/:day/:slug/", "/fe/2025/02/21/x/")).toBeNull();
		expect(matchRedirectPattern("/tech/:year/:month/:day/:slug/", "/tech/2025/02/21/")).toBeNull();
	});
});
