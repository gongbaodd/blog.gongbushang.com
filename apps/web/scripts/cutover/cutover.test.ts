// GON-183 (CUT-1): pins the cutover config (growgen.xyz only, no www, no retired host) and the preflight/smoke helpers.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { acceptedStatuses, adsTxtOk, canonicalHref, checkLivePage, checkRobotsLive, offOrigin, parseJsonc, pool, RETIRED_HOST, sitemapLocs, stagingIsOn } from "./lib.mjs";

const web = resolve(import.meta.dirname, "../..");
const repo = resolve(web, "../..");
const O = "https://growgen.xyz";

describe("cutover config", () => {
	it("wrangler routes: growgen.xyz only, no www", () => {
		const cfg = parseJsonc(readFileSync(resolve(web, "wrangler.jsonc"), "utf8"));
		expect(cfg.routes).toEqual([{ pattern: "growgen.xyz", custom_domain: true }]);
		expect(cfg.vars.PUBLIC_SITE_LIVE).toBe("false");
	});

	it("web-deploy passes EMDASH_SITE_URL=https://growgen.xyz to the build", () => {
		const wf = readFileSync(resolve(repo, ".github/workflows/web-deploy.yml"), "utf8");
		expect(wf).toMatch(/^\s*EMDASH_SITE_URL:\s*https:\/\/growgen\.xyz\s*$/m);
	});

	it("astro.config.mjs defaults `site` to growgen.xyz", () => {
		const cfg = readFileSync(resolve(web, "astro.config.mjs"), "utf8");
		expect(cfg).toContain('process.env.SITE_URL || "https://growgen.xyz"');
	});

	it("no public page builder hardcodes another host", () => {
		for (const f of ["src/pages/robots.txt.ts", "src/pages/sitemap.xml.ts", "src/pages/rss.xml.ts", "src/layouts/Global.astro", "src/lib/seo.ts"]) {
			const src = readFileSync(resolve(web, f), "utf8");
			expect(src).not.toContain(RETIRED_HOST);
			expect(src).not.toMatch(/www\.growgen\.xyz/);
		}
	});
});

describe("cutover helpers", () => {
	it("robots.txt: live form passes, soak form fails, off-origin sitemap fails", () => {
		expect(checkRobotsLive(`User-agent: *\nAllow: /\nDisallow: /_emdash/\n\nSitemap: ${O}/sitemap-index.xml\n`, O)).toEqual([]);
		expect(checkRobotsLive("User-agent: *\nDisallow: /\n", O).length).toBeGreaterThan(0);
		expect(checkRobotsLive(`User-agent: *\nAllow: /\nSitemap: https://${RETIRED_HOST}/sitemap-index.xml\n`, O)[0]).toMatch(/off/);
	});

	it("live page: canonical, noindex and retired host are caught", () => {
		const ok = `<html><head><link rel="canonical" href="${O}/a/"><meta property="og:url" content="${O}/a/"></head></html>`;
		expect(checkLivePage(ok, new Headers(), O, "/a/")).toEqual([]);
		const bad = `<html><head><meta name="robots" content="noindex, nofollow"><link rel="canonical" href="https://${RETIRED_HOST}/a/"></head></html>`;
		const p = checkLivePage(bad, new Headers({ "x-robots-tag": "noindex, nofollow" }), O, "/a/");
		expect(p.join("|")).toMatch(/X-Robots-Tag/);
		expect(p.join("|")).toMatch(/meta robots/);
		expect(p.join("|")).toMatch(/canonical/);
		expect(p.join("|")).toMatch(/retired host/);
	});

	it("canonicalHref handles attribute order and quotes", () => {
		expect(canonicalHref(`<head><link href='${O}/x/' rel=canonical></head>`)).toBe(`${O}/x/`);
	});

	it("sitemap helpers", () => {
		const xml = `<urlset><url><loc>${O}/a/</loc></url><url><loc>https://other.test/b/</loc></url></urlset>`;
		expect(offOrigin(sitemapLocs(xml), O)).toEqual(["https://other.test/b/"]);
	});

	it("parseJsonc strips comments and trailing commas but not // inside strings", () => {
		expect(parseJsonc('{ // c\n "a": "http://x", /* b */ "b": [1,], }')).toEqual({ a: "http://x", b: [1] });
	});

	it("parity exceptions are explicit", () => {
		expect(acceptedStatuses("/404.html")).toContain(307);
		expect(acceptedStatuses("/tag/c%23/")).toContain(404);
		expect(acceptedStatuses("/about/")).toEqual([200]);
	});

	it("og:url on the bare origin is accepted", () => {
		const html = `<head><link rel="canonical" href="${O}/"><meta property="og:url" content="${O}"></head>`;
		expect(checkLivePage(html, new Headers(), O, "/")).toEqual([]);
	});

	it("ads.txt", () => {
		expect(adsTxtOk("google.com, pub-7617483459228974, DIRECT, f08c47fec0942fa0")).toBe(true);
		expect(adsTxtOk("")).toBe(false);
	});

	it("staging option parsing", () => {
		expect(stagingIsOn(null)).toBe(false);
		expect(stagingIsOn("false")).toBe(false);
		expect(stagingIsOn(false)).toBe(false);
		expect(stagingIsOn("true")).toBe(true);
		expect(stagingIsOn(true)).toBe(true);
		expect(stagingIsOn("1")).toBe(true);
	});

	it("pool keeps order and respects the limit", async () => {
		let running = 0;
		let max = 0;
		const out = await pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
			running++;
			max = Math.max(max, running);
			await new Promise((r) => setTimeout(r, 5));
			running--;
			return n * 2;
		});
		expect(out).toEqual([2, 4, 6, 8, 10, 12]);
		expect(max).toBeLessThanOrEqual(2);
	});
});
