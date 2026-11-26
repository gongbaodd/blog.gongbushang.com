// GON-183 (CUT-1): pure helpers shared by preflight.mjs and smoke.mjs, kept free of I/O so cutover.test.ts can pin them.
// Nothing in this directory writes to production: preflight reads (HTTP GET/HEAD, a READ ONLY SQL transaction, `gh` reads),
// smoke only does HTTP GET/HEAD.

export const CANONICAL_ORIGIN = "https://growgen.xyz";
/** The retired soak hostname. Never allowed in a live page or sitemap. Built from parts so the repo has no literal for it. */
export const RETIRED_HOST = ["next", "growgen", "xyz"].join(".");

/** GitHub `production` environment variables that must exist before go-live (names only; values are never printed). */
export const REQUIRED_VARS = [
	"PUBLIC_MIXPANEL_TOKEN",
	"PUBLIC_MIXPANEL_API_HOST",
	"PUBLIC_ADSENSE_ENABLED",
	"PUBLIC_ADSENSE_CONSENT_READY",
	"PUBLIC_ADSENSE_SLOT_ID",
];

/** Parse JSONC (comments and trailing commas) without touching `//` inside strings. */
export function parseJsonc(text) {
	let out = "";
	let inStr = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inStr) {
			out += c;
			if (c === "\\") out += text[++i];
			else if (c === '"') inStr = false;
		} else if (c === '"') {
			inStr = true;
			out += c;
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
		} else if (c === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i++;
		} else out += c;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/**
 * Legacy-list paths that are not a plain 200 on the live site, with the statuses accepted. Both the legacy site and the soak site
 * answer the same for these (checked 2026-11-27): `/404.html` redirects to `/404`, and the two `c%23` (tag `c#`) URLs are 404
 * (EmDash does not decode `c#` in term routes, knowledge.md).
 */
export function acceptedStatuses(path) {
	if (path === "/404.html") return [200, 307, 308];
	if (/c%23/i.test(path)) return [200, 404];
	return [200];
}

/** Result helper. status: pass | fail | manual (needs owner eyes) | skip (not run, say why). */
export const result = (name, status, detail = "") => ({ name, status, detail });

export function robotsMetaTags(html) {
	const head = html.split(/<\/head>/i)[0];
	return (head.match(/<meta\b[^>]*>/gi) ?? []).filter((t) => /\bname=(?:["']robots["']|robots\b)/i.test(t));
}

export const hasNoindexMeta = (html) => robotsMetaTags(html).some((t) => /\bcontent=(?:["'][^"']*noindex|noindex)/i.test(t));

const attr = (tag, name) => {
	const m = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
	return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

export function canonicalHref(html) {
	const head = html.split(/<\/head>/i)[0];
	const tag = (head.match(/<link\b[^>]*>/gi) ?? []).find((t) => attr(t, "rel") === "canonical");
	return tag ? attr(tag, "href") : null;
}

export function ogUrl(html) {
	const head = html.split(/<\/head>/i)[0];
	const tag = (head.match(/<meta\b[^>]*>/gi) ?? []).find((t) => attr(t, "property") === "og:url");
	return tag ? attr(tag, "content") : null;
}

/** robots.txt of a live site: allows crawling, never a bare `Disallow: /`, and names the sitemap on `origin`. */
export function checkRobotsLive(text, origin = CANONICAL_ORIGIN) {
	const problems = [];
	if (/^\s*Disallow:\s*\/\s*$/im.test(text)) problems.push("contains a blanket `Disallow: /`");
	if (!/^\s*Allow:\s*\/\s*$/im.test(text)) problems.push("has no `Allow: /`");
	const sm = [...text.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
	if (sm.length === 0) problems.push("has no `Sitemap:` line");
	for (const s of sm) if (!s.startsWith(`${origin}/`)) problems.push(`Sitemap line points off ${origin}: ${s}`);
	return problems;
}

/** Problems with a rendered page when the site is live on `origin`. `path` is the page path (for canonical). */
export function checkLivePage(html, headers, origin = CANONICAL_ORIGIN, path = "/") {
	const problems = [];
	const xrt = headers?.get ? headers.get("x-robots-tag") : headers?.["x-robots-tag"];
	if (xrt && /noindex|nofollow/i.test(xrt)) problems.push(`X-Robots-Tag: ${xrt}`);
	if (hasNoindexMeta(html)) problems.push("meta robots says noindex");
	const canon = canonicalHref(html);
	const want = new URL(path, origin).href;
	if (canon !== want) problems.push(`canonical is ${canon ?? "missing"}, expected ${want}`);
	const og = ogUrl(html);
	if (og) {
		let ogOrigin = null;
		try {
			ogOrigin = new URL(og).origin;
		} catch {
			/* invalid URL, reported below */
		}
		if (ogOrigin !== origin) problems.push(`og:url is off-origin: ${og}`);
	}
	if (html.includes(RETIRED_HOST)) problems.push(`page mentions the retired host ${RETIRED_HOST}`);
	return problems;
}

/** All <loc> values (sitemap, sitemap index). */
export const sitemapLocs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

export const offOrigin = (urls, origin = CANONICAL_ORIGIN) => urls.filter((u) => !u.startsWith(`${origin}/`));

/** ads.txt must carry a Google (AdSense) DIRECT line. */
export const adsTxtOk = (text) => /^\s*google\.com\s*,\s*pub-\d+\s*,\s*DIRECT\b/im.test(text);

/** EmDash stores option values as JSON text; "staging on" is JSON true / "true" / 1. Missing row = off. */
export function stagingIsOn(rawValue) {
	if (rawValue == null) return false;
	let v = rawValue;
	if (typeof v === "string") {
		try {
			v = JSON.parse(v);
		} catch {
			/* keep the raw string */
		}
	}
	return v === true || v === 1 || v === "true" || v === "1";
}

/** Run `fn` over `items` with bounded concurrency; results keep input order. */
export async function pool(items, limit, fn) {
	const out = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (i < items.length) {
				const idx = i++;
				out[idx] = await fn(items[idx], idx);
			}
		}),
	);
	return out;
}

export function printResults(results, log = console.log) {
	const tag = { pass: "PASS  ", fail: "FAIL  ", manual: "MANUAL", skip: "SKIP  " };
	for (const r of results) log(`${tag[r.status]} ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
	const n = (s) => results.filter((r) => r.status === s).length;
	log(`\n${n("pass")} passed, ${n("fail")} failed, ${n("manual")} need the owner, ${n("skip")} skipped`);
	return n("fail") === 0;
}

/** Fetch with a timeout; never follows redirects (a redirect on go-live day is itself a finding). */
export async function http(url, { method = "GET", timeoutMs = 20000 } = {}) {
	const ctl = new AbortController();
	const t = setTimeout(() => ctl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { method, redirect: "manual", signal: ctl.signal, headers: { "user-agent": "growgen-cutover-check/1" } });
		const text = method === "HEAD" ? "" : await res.text();
		return { ok: true, status: res.status, headers: res.headers, text };
	} catch (e) {
		return { ok: false, status: 0, headers: new Headers(), text: "", error: e instanceof Error ? e.message : String(e) };
	} finally {
		clearTimeout(t);
	}
}
