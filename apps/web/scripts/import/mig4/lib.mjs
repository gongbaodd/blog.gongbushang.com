import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const DEFAULT_LEGACY_ORIGIN = "https://growgen.xyz";
// The EmDash build emits the same canonical origin as legacy (SITE_URL), so no origin change is expected.
// Pass --new-origin when a build intentionally uses another origin (preview hosts must not leak into HTML).
export const DEFAULT_NEW_ORIGIN = DEFAULT_LEGACY_ORIGIN;
export const POST_URL_RE = /^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/;

const COUNT_SELECTORS = Object.freeze({
  katex: ".katex",
  mermaid: "pre.mermaid",
  code: "pre.astro-code",
  plantuml: "pre[data-language=plantuml]",
  iframe: "iframe",
  table: "table",
});

/** Hosts that must never appear in a production page: preview/dev origins. */
export const LEAKED_ORIGIN_RE =
  /^https?:\/\/(?:next\.growgen\.xyz|localhost|127\.0\.0\.1|\[::1\]|[^/?#]*\.(?:workers|pages)\.dev)(?::\d+)?(?:[/?#]|$)/i;

const ASTRO_IMG_RE = /^\/_astro\/(.+?)\.[A-Za-z0-9_-]{6,}(?:_[A-Za-z0-9_-]+)?\.[A-Za-z0-9]+$/;
const CLOUDINARY_UPLOAD_RE =
  /^(https?:\/\/res\.cloudinary\.com\/[^/?#]+\/(?:image|video)\/upload\/)([^?#]*)([?#].*)?$/;
const CLOUDINARY_VERSION_RE = /^v\d+$/;

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLESHEET_LINK_RE = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
const HREF_RE = /\bhref=["']([^"']+)["']/i;

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExtractedUrl(value) {
  return String(value ?? "").trim();
}

/** Selectors (containing `h1`) of every `display:none` rule in a CSS text. @media blocks count as unconditional. */
export function hiddenH1Selectors(css) {
  const out = [];
  const re = /([^{}@;]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (!/display\s*:\s*none/i.test(m[2])) continue;
    for (const sel of m[1].split(",")) {
      const t = sel.trim();
      if (t && /(^|[^\w-])h1\b/i.test(t)) out.push(t);
    }
  }
  return out;
}

const cssFileCache = new Map();
function hiddenSelectorsOfFile(file) {
  if (!cssFileCache.has(file)) {
    let sels = [];
    try {
      sels = hiddenH1Selectors(readFileSync(file, "utf8"));
    } catch {
      // unreadable stylesheet: ignore
    }
    cssFileCache.set(file, sels);
  }
  return cssFileCache.get(file);
}

/**
 * Extract structured DOM fields from a rendered post HTML document.
 *
 * `<style>`, `<script>` and `<template>` never contribute to text or headings. Scripts and styles are
 * cut out of the markup before parsing (cheaper, and no CSS parse noise); the `display:none` rules that
 * mention `h1` are kept to count *visible* h1 elements (legacy hides the post title with
 * `.content > h1 {display:none}`; a wrapper such as `<astro-slot>` stops that rule matching).
 * `options.distDir` resolves `<link rel=stylesheet>` files.
 *
 * Limits of this static visibility heuristic (it is not a browser): `display:none` rules inside `@media`
 * blocks are treated as unconditional; Tailwind utilities such as `hidden`/`md:hidden`, `visibility:hidden`,
 * `opacity:0`, `height:0` and hidden ancestors are NOT modelled; only `hidden`, an inline `display:none` and
 * stylesheet rules whose selector mentions `h1` (matched with `element.matches`) count as hidden.
 */
export function extractPostDom(html, options = {}) {
  const source = typeof html === "string" ? html : "";
  const hideSelectors = [];
  for (const m of source.matchAll(STYLE_RE)) hideSelectors.push(...hiddenH1Selectors(m[1]));
  if (options.distDir) {
    for (const m of source.matchAll(STYLESHEET_LINK_RE)) {
      const href = HREF_RE.exec(m[0])?.[1];
      if (href && href.startsWith("/") && !href.startsWith("//")) {
        hideSelectors.push(...hiddenSelectorsOfFile(join(options.distDir, href.split(/[?#]/)[0])));
      }
    }
  }
  const stripped = source.replace(SCRIPT_RE, "").replace(STYLE_RE, "");

  const dom = new JSDOM(stripped, { virtualConsole: new VirtualConsole() });
  try {
    const doc = dom.window.document;
    for (const el of [...doc.querySelectorAll("template,style,script")]) el.remove();

    const proseCandidates = [...doc.querySelectorAll("[class*='prose']")].filter(
      (el) => /content/i.test(el.className || "") && !el.querySelector("h1.__none"),
    );
    let contentRoot = "prose";
    let contentEl = proseCandidates[proseCandidates.length - 1];
    if (!contentEl) {
      contentEl = doc.querySelector("article");
      contentRoot = "article";
    }
    if (!contentEl) {
      contentEl = doc.querySelector("main");
      contentRoot = "main";
    }
    if (!contentEl) {
      contentEl = doc.body;
      contentRoot = "body";
    }

    const title = normalizeWhitespace(doc.querySelector("title")?.textContent ?? "");
    const h1 = normalizeWhitespace(doc.querySelector("h1")?.textContent ?? "");
    const description = normalizeWhitespace(
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    );
    const canonical = normalizeExtractedUrl(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    );

    const isHidden = (el) => {
      if (el.hasAttribute("hidden")) return true;
      if (/display\s*:\s*none/i.test(el.getAttribute("style") ?? "")) return true;
      for (const sel of hideSelectors) {
        try {
          if (el.matches(sel)) return true;
        } catch {
          // selector jsdom cannot parse: ignore
        }
      }
      return false;
    };
    const visibleH1s = [...doc.querySelectorAll("h1")].filter((el) => !isHidden(el));
    // Legacy hides every post-body h1 (the title is rendered by the page header), so for a faithful port
    // the number of visible h1 INSIDE the content root must equal legacy's (normally 0).
    const visibleContentH1s = visibleH1s.filter((el) => contentEl.contains(el));

    const headings = contentEl
      ? [...contentEl.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
          (h) => `${h.tagName}#${h.id || ""}:${normalizeWhitespace(h.textContent)}`,
        )
      : [];

    const links = contentEl
      ? [...contentEl.querySelectorAll("a[href]")]
          .map((a) => normalizeExtractedUrl(a.getAttribute("href")))
          .filter(Boolean)
      : [];

    const images = contentEl
      ? [...contentEl.querySelectorAll("img")]
          .map((img) => normalizeExtractedUrl(img.getAttribute("src")))
          .filter(Boolean)
      : [];

    const counts = {};
    for (const [key, selector] of Object.entries(COUNT_SELECTORS)) {
      counts[key] = contentEl ? contentEl.querySelectorAll(selector).length : 0;
    }

    const text = normalizeWhitespace(contentEl?.textContent ?? "");

    return {
      title,
      h1,
      description,
      canonical,
      headings,
      links,
      images,
      counts,
      text,
      contentRoot,
      visibleH1: visibleH1s.length,
      visibleContentH1: visibleContentH1s.length,
      visibleContentH1Texts: visibleContentH1s.slice(0, 5).map((el) => normalizeWhitespace(el.textContent)),
      visibleH1Texts: visibleH1s.slice(0, 5).map((el) => normalizeWhitespace(el.textContent)),
    };
  } finally {
    dom.window.close();
  }
}

/**
 * Same per-segment slug as Astro's glob loader (github-slugger): lowercase, drop punctuation, spaces -> "-".
 * rewrite-map keys are source file names ("2020/07/19/Study-surfing-in-Houhai,-Sanya.md") while the page URL
 * uses the slug ("study-surfing-in-houhai-sanya"); normalising both sides with it makes them meet.
 */
export function slugSegment(seg) {
  return String(seg)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function normalizePostKey(key) {
  if (!key) return "";
  const cleaned = String(key)
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.mdx?$/i, "")
    .split("/")
    .map((seg) => {
      let decoded = seg;
      try {
        decoded = decodeURIComponent(seg);
      } catch {
        // keep raw segment
      }
      return slugSegment(decoded);
    })
    .join("/");
  const parts = cleaned.split("/");
  // If key starts with a category prefix (/cat/yyyy/mm/dd/slug), drop category
  if (parts.length >= 5 && /^\d{4}$/.test(parts[1]) && /^\d{2}$/.test(parts[2])) {
    return parts.slice(1).join("/");
  }
  return cleaned;
}

function imageStem(ref) {
  const base = basename(String(ref).split(/[?#]/)[0]);
  const ext = extname(base);
  return (ext ? base.slice(0, -ext.length) : base).toLowerCase();
}

/**
 * Pre-indexes a mig2/rewrite-map.json object (or flat Record<string, string>)
 * for fast O(1) parity URL lookups across ~995 posts.
 */
export function buildRewriteLookup(rewriteMap) {
  if (!rewriteMap) {
    return { __isRewriteLookup: true, exact: new Map(), byPost: new Map(), stems: new Map() };
  }
  if (rewriteMap.__isRewriteLookup) return rewriteMap;

  const exact = new Map();
  const byPost = new Map();
  const stemCandidates = new Map();

  const addEntry = (postKey, fromUrl, toUrl) => {
    if (typeof fromUrl !== "string" || typeof toUrl !== "string") return;
    const from = fromUrl.trim();
    const to = toUrl.trim();
    if (!from || !to) return;

    if (!exact.has(from)) exact.set(from, to);

    const stem = from.startsWith("./") || from.startsWith("../") ? imageStem(from) : null;
    if (stem) {
      if (!stemCandidates.has(stem)) stemCandidates.set(stem, new Set());
      stemCandidates.get(stem).add(to);
    }

    if (postKey) {
      const normKey = normalizePostKey(postKey);
      let entry = byPost.get(normKey);
      if (!entry) {
        entry = { exact: new Map(), stems: new Map() };
        byPost.set(normKey, entry);
      }
      entry.exact.set(from, to);
      if (stem) entry.stems.set(stem, to);
    }
  };

  if (rewriteMap.posts && typeof rewriteMap.posts === "object") {
    for (const [postKey, mapping] of Object.entries(rewriteMap.posts)) {
      if (!mapping || typeof mapping !== "object") continue;
      for (const [fromUrl, toUrl] of Object.entries(mapping)) {
        addEntry(postKey, fromUrl, toUrl);
      }
    }
  } else if (typeof rewriteMap === "object") {
    for (const [fromUrl, toUrl] of Object.entries(rewriteMap)) {
      if (typeof toUrl === "string") addEntry("", fromUrl, toUrl);
    }
  }

  // Only keep globally unambiguous stems
  const stems = new Map();
  for (const [stem, targets] of stemCandidates.entries()) {
    if (targets.size === 1) {
      stems.set(stem, [...targets][0]);
    }
  }

  return { __isRewriteLookup: true, exact, byPost, stems };
}

function lookupRewrite(url, lookup, postPath) {
  if (!lookup) return url;
  const postKey = postPath ? normalizePostKey(postPath) : "";
  const postEntry = postKey ? lookup.byPost.get(postKey) : null;

  if (postEntry) {
    if (postEntry.exact.has(url)) return postEntry.exact.get(url);
    const astroMatch = url.match(ASTRO_IMG_RE);
    if (astroMatch) {
      const stem = astroMatch[1].toLowerCase();
      if (postEntry.stems.has(stem)) return postEntry.stems.get(stem);
    }
  }

  if (lookup.exact.has(url)) return lookup.exact.get(url);

  const astroMatch = url.match(ASTRO_IMG_RE);
  if (astroMatch) {
    const stem = astroMatch[1].toLowerCase();
    if (lookup.stems.has(stem)) return lookup.stems.get(stem);
  }

  return url;
}

function normalizeOriginString(origin) {
  if (!origin) return "";
  const trimmed = String(origin).trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Same rule as apps/web/src/lib/cloudinary.ts `optimizeCloudinaryUrl` (kept in sync by a test). */
export function optimizeCloudinaryUrl(url) {
  const match = CLOUDINARY_UPLOAD_RE.exec(url);
  if (!match) return url;
  const [, prefix, pathPart = "", suffix = ""] = match;
  if (pathPart === "") return url;
  const segments = pathPart.split("/");
  const boundary = segments.findIndex((seg) => CLOUDINARY_VERSION_RE.test(seg));
  const transformSection = boundary === -1 ? pathPart : segments.slice(0, boundary).join("/");
  const params = transformSection.split(/[/,]/);
  if (params.includes("f_auto") && params.includes("q_auto")) return url;
  return `${prefix}f_auto,q_auto/${pathPart}${suffix}`;
}

/**
 * ONE-SIDED mapping: what the new site should emit for a URL the legacy page contained.
 * The result is compared for exact equality with the new page's URL, so a new page that drops
 * `f_auto,q_auto`, keeps `/tag/c#`, leaks another origin or leaves a relative image path is flagged.
 * Steps (each recorded in `reasons`): `rewrite-map` (mig2 rehost), `origin` (legacy -> new origin),
 * `tag-hash` (`/tag/c#` -> `/tag/c%23`), `cloudinary-auto` (rehosted images only: `f_auto,q_auto` inserted).
 */
export function expectedNewUrl(legacyUrl, options = {}) {
  const {
    kind = "link",
    rewriteMap = null,
    postPath = "",
    legacyOrigin = DEFAULT_LEGACY_ORIGIN,
    newOrigin = DEFAULT_NEW_ORIGIN,
  } = options;
  const reasons = [];
  let out = String(legacyUrl ?? "").trim();
  if (!out) return { url: "", reasons };

  if (rewriteMap) {
    const rewritten = lookupRewrite(out, buildRewriteLookup(rewriteMap), postPath);
    if (rewritten !== out) {
      out = rewritten;
      reasons.push("rewrite-map");
    }
  }

  const from = normalizeOriginString(legacyOrigin);
  const to = normalizeOriginString(newOrigin);
  if (from && to && from.toLowerCase() !== to.toLowerCase()) {
    const lower = out.toLowerCase();
    const f = from.toLowerCase();
    if (lower === f || /^[/?#]/.test(lower.slice(f.length)) && lower.startsWith(f)) {
      out = to + out.slice(from.length);
      reasons.push("origin");
    }
  }

  const tagFixed = out.replace(/(\/tag\/[^/?#\s]+)#/gi, "$1%23");
  if (tagFixed !== out) {
    out = tagFixed;
    reasons.push("tag-hash");
  }

  // Only rehosted (rewrite-map) images get `f_auto,q_auto` added by the new site's renderer. A Cloudinary URL
  // that legacy already emitted keeps exactly the form legacy had (raw-HTML <img> are untouched on both sides).
  if (kind === "image" && reasons.includes("rewrite-map")) {
    const optimized = optimizeCloudinaryUrl(out);
    if (optimized !== out) {
      out = optimized;
      reasons.push("cloudinary-auto");
    }
  }
  return { url: out, reasons };
}

/**
 * Computes exact Levenshtein edit distance on strings after trimming common prefix/suffix.
 * Caps DP matrix dimension to `maxWindow` (default 1000) to guarantee fast execution on long posts.
 */
export function levenshteinDistance(a, b, maxWindow = 1000) {
  if (a === b) return { distance: 0, approx: false };
  const s1 = String(a ?? "");
  const s2 = String(b ?? "");

  let start = 0;
  const minLen = Math.min(s1.length, s2.length);
  while (start < minLen && s1.charCodeAt(start) === s2.charCodeAt(start)) {
    start++;
  }

  let end1 = s1.length;
  let end2 = s2.length;
  while (end1 > start && end2 > start && s1.charCodeAt(end1 - 1) === s2.charCodeAt(end2 - 1)) {
    end1--;
    end2--;
  }

  const mFull = end1 - start;
  const nFull = end2 - start;
  if (mFull === 0) return { distance: nFull, approx: false };
  if (nFull === 0) return { distance: mFull, approx: false };

  let approx = false;
  let strA = s1.slice(start, end1);
  let strB = s2.slice(start, end2);
  let tailPenalty = 0;

  if (strA.length > maxWindow || strB.length > maxWindow) {
    approx = true;
    const remA = Math.max(0, strA.length - maxWindow);
    const remB = Math.max(0, strB.length - maxWindow);
    tailPenalty = Math.abs(remA - remB);
    strA = strA.slice(0, maxWindow);
    strB = strB.slice(0, maxWindow);
  }

  // Ensure strB is the shorter string for O(min(m, n)) memory
  if (strA.length < strB.length) {
    [strA, strB] = [strB, strA];
  }

  const m = strA.length;
  const n = strB.length;
  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const chA = strA.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = chA === strB.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    [prev, curr] = [curr, prev];
  }

  return { distance: prev[n] + tailPenalty, approx };
}

function multisetDiff(legacyArr, newArr) {
  const newCounts = new Map();
  for (const item of newArr) {
    newCounts.set(item, (newCounts.get(item) ?? 0) + 1);
  }
  const missing = [];
  for (const item of legacyArr) {
    const c = newCounts.get(item) ?? 0;
    if (c > 0) newCounts.set(item, c - 1);
    else missing.push(item);
  }

  const legacyCounts = new Map();
  for (const item of legacyArr) {
    legacyCounts.set(item, (legacyCounts.get(item) ?? 0) + 1);
  }
  const extra = [];
  for (const item of newArr) {
    const c = legacyCounts.get(item) ?? 0;
    if (c > 0) legacyCounts.set(item, c - 1);
    else extra.push(item);
  }

  let reordered = false;
  if (missing.length === 0 && extra.length === 0 && legacyArr.length === newArr.length) {
    for (let i = 0; i < legacyArr.length; i++) {
      if (legacyArr[i] !== newArr[i]) {
        reordered = true;
        break;
      }
    }
  }

  return { missing, extra, reordered };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function diffScalar(legacyVal, newVal) {
  const a = legacyVal ?? "";
  const b = newVal ?? "";
  if (a === b) return { status: "match" };
  return { status: "flagged-diff", legacy: a, new: b };
}

function diffUrlScalar(legacyVal, newVal, normOptions) {
  const a = legacyVal ?? "";
  const b = newVal ?? "";
  const expected = expectedNewUrl(a, normOptions);
  if (expected.url === b) {
    return expected.reasons.length === 0
      ? { status: "match" }
      : { status: "expected-diff", legacy: a, new: b, reasons: expected.reasons };
  }
  return { status: "flagged-diff", legacy: a, new: b, expected: expected.url };
}

/** Exact comparison of what the new page should emit (mapped legacy URLs) against what it emits. */
function diffUrlList(legacyList, newList, normOptions, maxItems) {
  const a = Array.isArray(legacyList) ? legacyList : [];
  const b = Array.isArray(newList) ? newList : [];
  const mapped = a.map((u) => expectedNewUrl(u, normOptions));
  const expected = mapped.map((m) => m.url);
  const reasons = [...new Set(mapped.flatMap((m) => m.reasons))];

  if (arraysEqual(expected, b)) {
    if (reasons.length === 0) return { status: "match" };
    return {
      status: "expected-diff",
      count: a.length,
      rewrittenCount: mapped.filter((m) => m.reasons.length > 0).length,
      reasons,
    };
  }

  const { missing, extra, reordered } = multisetDiff(expected, b);
  return {
    status: "flagged-diff",
    legacyCount: a.length,
    newCount: b.length,
    missing: missing.slice(0, maxItems),
    extra: extra.slice(0, maxItems),
    missingTotal: missing.length,
    extraTotal: extra.length,
    reordered,
  };
}

/** New-page URLs on a preview/dev origin that the legacy page (mapped) does not itself contain. */
function diffLeakedOrigins(legacyDom, newDom, normOptions) {
  const expected = new Set([
    expectedNewUrl(legacyDom.canonical ?? "", normOptions).url,
    ...(legacyDom.links ?? []).map((u) => expectedNewUrl(u, { ...normOptions, kind: "link" }).url),
    ...(legacyDom.images ?? []).map((u) => expectedNewUrl(u, { ...normOptions, kind: "image" }).url),
  ]);
  const leaked = [newDom.canonical, ...(newDom.links ?? []), ...(newDom.images ?? [])].filter(
    (u) => typeof u === "string" && LEAKED_ORIGIN_RE.test(u) && !expected.has(u),
  );
  return leaked.length === 0 ? { status: "match" } : { status: "flagged-diff", leaked: [...new Set(leaked)].slice(0, 10) };
}

function diffHeadings(legacyList, newList, maxItems) {
  const a = Array.isArray(legacyList) ? legacyList : [];
  const b = Array.isArray(newList) ? newList : [];
  if (arraysEqual(a, b)) return { status: "match" };

  const { missing, extra, reordered } = multisetDiff(a, b);
  return {
    status: "flagged-diff",
    legacyCount: a.length,
    newCount: b.length,
    missing: missing.slice(0, maxItems),
    extra: extra.slice(0, maxItems),
    missingTotal: missing.length,
    extraTotal: extra.length,
    reordered,
  };
}

function diffCounts(legacyCounts, newCounts) {
  const a = legacyCounts ?? {};
  const b = newCounts ?? {};
  const mismatches = {};
  let hasDrop = false;

  for (const key of Object.keys(COUNT_SELECTORS)) {
    const la = a[key] ?? 0;
    const nb = b[key] ?? 0;
    if (la !== nb) {
      mismatches[key] = { legacy: la, new: nb };
      if (nb < la) hasDrop = true;
    }
  }

  if (Object.keys(mismatches).length === 0) {
    return { status: "match" };
  }
  return { status: "flagged-diff", mismatches, hasDrop };
}

function diffText(legacyText, newText, snippetBefore = 40, snippetAfter = 100) {
  const a = legacyText ?? "";
  const b = newText ?? "";
  if (a === b) return { status: "match" };
  // Legacy minified markup glues block elements together ("rotationLet's"); the new build keeps a newline
  // between them. A difference in inter-element whitespace only is not a content difference.
  if (a.replace(/\s+/g, "") === b.replace(/\s+/g, "")) {
    return { status: "expected-diff", reasons: ["whitespace-only"] };
  }

  let firstDiffIndex = 0;
  const minLen = Math.min(a.length, b.length);
  while (firstDiffIndex < minLen && a.charCodeAt(firstDiffIndex) === b.charCodeAt(firstDiffIndex)) {
    firstDiffIndex++;
  }

  const start = Math.max(0, firstDiffIndex - snippetBefore);
  const legacySnippet = a.slice(start, firstDiffIndex + snippetAfter);
  const newSnippet = b.slice(start, firstDiffIndex + snippetAfter);
  const { distance, approx } = levenshteinDistance(a, b);
  const lengthDelta = b.length - a.length;

  return {
    status: "flagged-diff",
    legacyLength: a.length,
    newLength: b.length,
    lengthDelta,
    firstDiffIndex,
    legacySnippet,
    newSnippet,
    editDistance: distance,
    editDistanceApprox: approx,
  };
}

/**
 * Compares extracted legacy and new post DOM objects and classifies each field as
 * "match", "expected-diff", or "flagged-diff", along with an overall severity.
 *
 * Errors: a canonical or link that is not exactly what the new site should emit, a URL on a preview/dev
 * origin (leaked origin), a missing heading, an EXTRA heading (an extra h1 is the PORT-9 duplicate-title class), more
 * visible h1 elements than legacy inside the content root (`visibleContentH1`; the page-wide `visibleH1`
 * count is only a warning, because cards and widgets legitimately differ), a missing image, a dropped element count, or a large text drop.
 */
export function diffPostDom(legacyDom, newDom, options = {}) {
  const {
    rewriteMap = null,
    postPath = "",
    legacyOrigin = DEFAULT_LEGACY_ORIGIN,
    newOrigin = DEFAULT_NEW_ORIGIN,
    maxDiffItems = 10,
    textDropErrorRatio = 0.1,
    textDropErrorMinChars = 20,
  } = options;

  const lookup = rewriteMap ? buildRewriteLookup(rewriteMap) : null;
  const normOptions = { rewriteMap: lookup, postPath, legacyOrigin, newOrigin };

  const legacyVisibleH1 = legacyDom.visibleH1 ?? 0;
  const newVisibleH1 = newDom.visibleH1 ?? 0;
  const legacyContentH1 = legacyDom.visibleContentH1 ?? 0;
  const newContentH1 = newDom.visibleContentH1 ?? 0;
  const fields = {
    title: diffScalar(legacyDom.title, newDom.title),
    h1: diffScalar(legacyDom.h1, newDom.h1),
    visibleH1:
      legacyVisibleH1 === newVisibleH1
        ? { status: "match" }
        : {
            status: "flagged-diff",
            legacy: legacyVisibleH1,
            new: newVisibleH1,
            newTexts: newDom.visibleH1Texts ?? [],
          },
    visibleContentH1:
      legacyContentH1 === newContentH1
        ? { status: "match" }
        : {
            status: "flagged-diff",
            legacy: legacyContentH1,
            new: newContentH1,
            newTexts: newDom.visibleContentH1Texts ?? [],
          },
    description: diffScalar(legacyDom.description, newDom.description),
    canonical: diffUrlScalar(legacyDom.canonical, newDom.canonical, { ...normOptions, kind: "link" }),
    headings: diffHeadings(legacyDom.headings, newDom.headings, maxDiffItems),
    links: diffUrlList(legacyDom.links, newDom.links, { ...normOptions, kind: "link" }, maxDiffItems),
    images: diffUrlList(legacyDom.images, newDom.images, { ...normOptions, kind: "image" }, maxDiffItems),
    leakedOrigins: diffLeakedOrigins(legacyDom, newDom, normOptions),
    counts: diffCounts(legacyDom.counts, newDom.counts),
    contentRoot: diffScalar(legacyDom.contentRoot ?? "", newDom.contentRoot ?? ""),
    text: diffText(legacyDom.text, newDom.text),
  };

  const flaggedFields = [];
  const expectedFields = [];
  const expectedReasons = new Set();
  for (const [key, result] of Object.entries(fields)) {
    if (result.status === "flagged-diff") flaggedFields.push(key);
    else if (result.status === "expected-diff") {
      expectedFields.push(key);
      for (const r of result.reasons ?? []) expectedReasons.add(r);
    }
  }

  let severity = "ok";
  const errorReasons = [];
  if (flaggedFields.length > 0) {
    const h = fields.headings;
    if (h.status === "flagged-diff" && h.missingTotal > 0) errorReasons.push("heading-missing");
    if (h.status === "flagged-diff" && h.extraTotal > 0) {
      errorReasons.push(h.extra.some((x) => x.startsWith("H1#")) ? "extra-h1" : "extra-heading");
    }
    if (fields.visibleContentH1.status === "flagged-diff" && newContentH1 > legacyContentH1) {
      errorReasons.push("extra-visible-h1");
    }
    if (fields.canonical.status === "flagged-diff") errorReasons.push("canonical-mismatch");
    if (fields.links.status === "flagged-diff") errorReasons.push("link-mismatch");
    if (fields.leakedOrigins.status === "flagged-diff") errorReasons.push("leaked-origin");
    if (fields.images.status === "flagged-diff" && fields.images.missingTotal > 0) {
      errorReasons.push("image-missing-or-wrong");
    }
    if (fields.counts.status === "flagged-diff" && fields.counts.hasDrop) {
      errorReasons.push("count-drop");
    }
    if (fields.text.status === "flagged-diff") {
      const { legacyLength, newLength } = fields.text;
      const drop = legacyLength - newLength;
      if (
        (legacyLength > 0 && newLength === 0) ||
        (drop >= textDropErrorMinChars && legacyLength > 0 && drop / legacyLength >= textDropErrorRatio)
      ) {
        errorReasons.push("text-drop");
      }
    }
    severity = errorReasons.length > 0 ? "error" : "warn";
  } else if (expectedFields.length > 0) {
    severity = "expected";
  }

  return {
    severity,
    errorReasons,
    flaggedFields,
    expectedFields,
    expectedReasons: [...expectedReasons],
    fields,
  };
}

/**
 * Filters a URL list file (such as apps/web/tests/legacy-urls.txt) down to
 * blog post paths matching /<cat>/<yyyy>/<mm>/<dd>/<slug>/.
 */
export function filterPostUrls(text, options = {}) {
  const { filter = "", limit = Infinity } = options;
  const needle = filter ? String(filter).toLowerCase() : "";
  const seen = new Set();
  const urls = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!POST_URL_RE.test(line)) continue;
    if (needle && !line.toLowerCase().includes(needle)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    urls.push(line);
    if (urls.length >= limit) break;
  }

  return urls;
}

/**
 * Resolves a post URL path (e.g. /life/2015/08/18/b/) to its index.html inside a dist dir.
 * Checks both literal path and URI-decoded path.
 */
export function resolvePostHtmlPath(distDir, urlPath) {
  const segments = String(urlPath)
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  const literal = join(distDir, ...segments, "index.html");
  if (existsSync(literal)) return literal;

  try {
    const decoded = join(
      distDir,
      ...segments.map((s) => decodeURIComponent(s)),
      "index.html",
    );
    if (existsSync(decoded)) return decoded;
  } catch {
    // Ignore malformed URI components
  }
  return literal;
}

const FLAG_KEYS = [
  "title",
  "h1",
  "visibleH1",
  "visibleContentH1",
  "description",
  "canonical",
  "headings",
  "links",
  "images",
  "leakedOrigins",
  "counts",
  "contentRoot",
  "text",
];

/** Compare one post URL. Returns a small JSON-serialisable result (also what a worker process sends back). */
export function diffOneUrl(urlPath, config) {
  const {
    legacyDir,
    newDir,
    rewriteMap = null,
    legacyOrigin = DEFAULT_LEGACY_ORIGIN,
    newOrigin = DEFAULT_NEW_ORIGIN,
    maxDiffItems = 10,
    textDropErrorRatio = 0.1,
    textDropErrorMinChars = 20,
  } = config;
  const legacyFile = resolvePostHtmlPath(legacyDir, urlPath);
  const newFile = resolvePostHtmlPath(newDir, urlPath);
  const hasLegacy = existsSync(legacyFile);
  const hasNew = existsSync(newFile);
  if (!hasLegacy || !hasNew) {
    return { url: urlPath, missing: { url: urlPath, missingLegacy: !hasLegacy, missingNew: !hasNew } };
  }
  const legacyDom = extractPostDom(readFileSync(legacyFile, "utf8"), { distDir: legacyDir });
  const newDom = extractPostDom(readFileSync(newFile, "utf8"), { distDir: newDir });
  const diff = diffPostDom(legacyDom, newDom, {
    rewriteMap,
    postPath: urlPath,
    legacyOrigin,
    newOrigin,
    maxDiffItems,
    textDropErrorRatio,
    textDropErrorMinChars,
  });
  const compactDiffs = {};
  for (const field of diff.flaggedFields) compactDiffs[field] = diff.fields[field];
  return {
    url: urlPath,
    severity: diff.severity,
    errorReasons: diff.errorReasons,
    flaggedFields: diff.flaggedFields,
    expectedFields: diff.expectedFields,
    expectedReasons: diff.expectedReasons,
    diffs: compactDiffs,
    roots: { legacy: legacyDom.contentRoot, new: newDom.contentRoot },
  };
}

/** Post-shaped `index.html` directories in `dir` that are not in `knownUrls` (genuinely new posts). */
export function findNewPosts(dir, knownUrls) {
  const known = new Set(knownUrls);
  const found = [];
  const walk = (d, depth, segs) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && depth < 5) walk(join(d, e.name), depth + 1, [...segs, e.name]);
      else if (e.isFile() && e.name === "index.html" && depth === 5) {
        const p = `/${segs.join("/")}/`;
        if (POST_URL_RE.test(p) && !known.has(p)) found.push(p);
      }
    }
  };
  walk(dir, 0, []);
  return found.sort();
}

/** Aggregate per-URL results into the report (shared by the in-process and the isolated runner). */
export function buildReport(urls, results, { meta = {}, newPosts = [], durationMs = 0 } = {}) {
  const flaggedFieldCounts = Object.fromEntries(FLAG_KEYS.map((k) => [k, 0]));
  const counts = { ok: 0, expected: 0, warn: 0, error: 0 };
  const expectedReasonCounts = {};
  const errorReasonCounts = {};
  const roots = { legacy: {}, new: {} };
  let missingLegacy = 0;
  let missingNew = 0;
  const missing = [];
  const flagged = [];

  const byUrl = new Map(results.map((r) => [r.url, r]));
  for (const urlPath of urls) {
    const r = byUrl.get(urlPath);
    if (!r) throw new Error(`No result for ${urlPath}`);
    if (r.missing) {
      if (r.missing.missingLegacy) missingLegacy++;
      if (r.missing.missingNew) missingNew++;
      missing.push(r.missing);
      continue;
    }
    roots.legacy[r.roots.legacy] = (roots.legacy[r.roots.legacy] ?? 0) + 1;
    roots.new[r.roots.new] = (roots.new[r.roots.new] ?? 0) + 1;
    counts[r.severity]++;
    for (const reason of r.expectedReasons) {
      expectedReasonCounts[reason] = (expectedReasonCounts[reason] ?? 0) + 1;
    }
    if (r.severity === "warn" || r.severity === "error") {
      for (const field of r.flaggedFields) flaggedFieldCounts[field] = (flaggedFieldCounts[field] ?? 0) + 1;
      for (const reason of r.errorReasons) errorReasonCounts[reason] = (errorReasonCounts[reason] ?? 0) + 1;
      flagged.push({
        url: r.url,
        severity: r.severity,
        errorReasons: r.errorReasons,
        flaggedFields: r.flaggedFields,
        expectedFields: r.expectedFields,
        diffs: r.diffs,
      });
    }
  }

  flagged.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return a.url.localeCompare(b.url);
  });
  missing.sort((a, b) => a.url.localeCompare(b.url));

  const fallbacks = (side) =>
    Object.entries(side)
      .filter(([k]) => k !== "prose")
      .reduce((n, [, v]) => n + v, 0);
  return {
    generatedAt: new Date().toISOString(),
    options: meta,
    summary: {
      total: urls.length,
      ...counts,
      missingFiles: missing.length,
      missingLegacy,
      missingNew,
      newPosts: newPosts.length,
      durationMs,
      flaggedFieldCounts,
      errorReasonCounts,
      // Why "expected" diffs are expected: number of posts per reason (rewrite-map, origin, tag-hash, cloudinary-auto).
      expectedReasonCounts,
      // Content-root detection per side; anything other than `prose` is a fallback (legacy heuristic missed).
      contentRoots: roots,
      contentRootFallbacks: { legacy: fallbacks(roots.legacy), new: fallbacks(roots.new) },
    },
    missing,
    newPosts,
    flagged,
  };
}

/**
 * Runs the bulk DOM parity diff in THIS process (synchronous; fine for tests and small samples).
 * jsdom retains memory across documents, so the full 995-post run uses `runBulkDiffIsolated`.
 */
export function runBulkDiff(config) {
  const startedAt = Date.now();
  const { urls, rewriteMap = null, meta = {}, newPosts = [] } = config;
  const lookup = rewriteMap ? buildRewriteLookup(rewriteMap) : null;
  const results = urls.map((u) => diffOneUrl(u, { ...config, rewriteMap: lookup }));
  return buildReport(urls, results, { meta, newPosts, durationMs: Date.now() - startedAt });
}

/**
 * Same report as `runBulkDiff`, but the URLs are processed in batches by short-lived child processes
 * (`diff-worker.mjs`), so memory is returned to the OS after every batch and the run needs no
 * `--max-old-space-size`.
 */
export async function runBulkDiffIsolated(
  config,
  { batchSize = 40, concurrency = 3, batchTimeoutMs = 180_000, workerPath = join(HERE, "diff-worker.mjs") } = {},
) {
  const startedAt = Date.now();
  const { fork } = await import("node:child_process");
  const { urls, rewriteMap = null, meta = {}, newPosts = [] } = config;
  const workerConfig = { ...config, rewriteMap: rewriteMap?.__isRewriteLookup ? null : rewriteMap };
  delete workerConfig.urls;
  delete workerConfig.meta;
  delete workerConfig.newPosts;
  const batches = [];
  for (let i = 0; i < urls.length; i += batchSize) batches.push(urls.slice(i, i + batchSize));

  const results = [];
  let next = 0;
  const runBatch = (batch) =>
    new Promise((resolveBatch, reject) => {
      const child = fork(workerPath, [], { serialization: "advanced" });
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill("SIGKILL");
        reject(new Error(`diff worker timed out after ${batchTimeoutMs} ms (batch of ${batch.length}, first: ${batch[0]})`));
      }, batchTimeoutMs);
      child.on("message", (msg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error));
        else resolveBatch(msg.results);
        child.disconnect();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("exit", (code) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(new Error(`diff worker exited with code ${code}`));
        }
      });
      child.send({ config: workerConfig, urls: batch });
    });
  const lane = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      results.push(...(await runBatch(batch)));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches.length)) }, lane));
  return buildReport(urls, results, { meta, newPosts, durationMs: Date.now() - startedAt });
}
