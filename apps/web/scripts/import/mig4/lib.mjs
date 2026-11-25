import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const DEFAULT_LEGACY_ORIGIN = "https://growgen.xyz";
export const DEFAULT_NEW_ORIGIN = "https://next.growgen.xyz";
export const POST_URL_RE = /^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/;

const COUNT_SELECTORS = Object.freeze({
  katex: ".katex",
  mermaid: "pre.mermaid",
  code: "pre.astro-code",
  plantuml: "pre[data-language=plantuml]",
  iframe: "iframe",
  table: "table",
});

const CLOUDINARY_URL_RE =
  /^(https?:\/\/res\.cloudinary\.com\/[^/?#]+\/(?:image|video)\/upload\/)([^?#]*)(\?[^#]*)?(#.*)?$/i;
const ASTRO_IMG_RE = /^\/_astro\/(.+?)\.[A-Za-z0-9_-]{6,}(?:_[A-Za-z0-9_-]+)?\.[A-Za-z0-9]+$/;
const TRANSFORM_TOKEN_RE = /^[a-z]{1,3}_[^,/]+$/i;
const AUTO_TRANSFORM_TOKENS = new Set(["f_auto", "q_auto"]);

let cachedJsdom = null;

function resolveMainRepoFromGitWorktree(startDir) {
  const dotGit = join(startDir, ".git");
  if (!existsSync(dotGit)) return null;
  try {
    const content = readFileSync(dotGit, "utf8");
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) return null;
    const gitDir = resolve(startDir, match[1].trim());
    // Typical worktree gitdir: <mainRepo>/.git/worktrees/<name>
    const worktreesIdx = gitDir.lastIndexOf("/.git/worktrees/");
    if (worktreesIdx !== -1) {
      return gitDir.slice(0, worktreesIdx);
    }
    return null;
  } catch {
    return null;
  }
}

export function loadJsdom() {
  if (cachedJsdom) return cachedJsdom;

  const candidates = [
    join(REPO_ROOT, "package.json"),
    join(process.cwd(), "package.json"),
  ];
  const mainRepo = resolveMainRepoFromGitWorktree(REPO_ROOT);
  if (mainRepo) candidates.push(join(mainRepo, "package.json"));
  if (process.env.LEGACY_ROOT) {
    candidates.push(join(process.env.LEGACY_ROOT, "package.json"));
  }
  candidates.push("/Volumes/MacData/github/blog.gongbushang.com/package.json");

  const tried = new Set();
  for (const pkgPath of candidates) {
    if (!pkgPath || tried.has(pkgPath)) continue;
    tried.add(pkgPath);
    if (!existsSync(pkgPath)) continue;
    try {
      const req = createRequire(pkgPath);
      const mod = req("jsdom");
      if (mod?.JSDOM) {
        cachedJsdom = mod;
        return cachedJsdom;
      }
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    `Unable to resolve 'jsdom' from any candidate package.json: ${[...tried].join(", ")}`,
  );
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExtractedUrl(value) {
  return String(value ?? "").trim();
}

/**
 * Extract structured DOM fields from a rendered post HTML document.
 * Mirrors apps/web/scripts/dev/parity-post.cjs content-root heuristics.
 */
export function extractPostDom(html) {
  const { JSDOM } = loadJsdom();
  const dom = new JSDOM(typeof html === "string" ? html : "");
  try {
    const doc = dom.window.document;
    const proseCandidates = [...doc.querySelectorAll("[class*='prose']")].filter(
      (el) => /content/i.test(el.className || "") && !el.querySelector("h1.__none"),
    );
    const contentEl =
      proseCandidates[proseCandidates.length - 1] ??
      doc.querySelector("article") ??
      doc.querySelector("main") ??
      doc.body;

    const title = normalizeWhitespace(doc.querySelector("title")?.textContent ?? "");
    const h1 = normalizeWhitespace(doc.querySelector("h1")?.textContent ?? "");
    const description = normalizeWhitespace(
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    );
    const canonical = normalizeExtractedUrl(
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    );

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
    };
  } finally {
    dom.window.close();
  }
}

function normalizePostKey(key) {
  if (!key) return "";
  const cleaned = String(key)
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.mdx?$/i, "")
    .toLowerCase();
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

function normalizeCloudinaryUrl(url) {
  const match = url.match(CLOUDINARY_URL_RE);
  if (!match) return url;

  let [, prefix, pathPart = "", query = "", hash = ""] = match;
  prefix = prefix.replace(/^http:\/\//i, "https://");

  const segments = pathPart.split("/");
  const normalizedSegments = [];
  let inTransformPrefix = true;

  for (const seg of segments) {
    if (inTransformPrefix && seg.includes("_")) {
      const tokens = seg.split(",");
      if (tokens.every((t) => TRANSFORM_TOKEN_RE.test(t))) {
        const kept = tokens.filter((t) => !AUTO_TRANSFORM_TOKENS.has(t.toLowerCase()));
        if (kept.length > 0) normalizedSegments.push(kept.join(","));
        continue;
      }
    }
    inTransformPrefix = false;
    normalizedSegments.push(seg);
  }

  let normalizedQuery = query;
  if (query) {
    const params = new URLSearchParams(query.slice(1));
    for (const key of Array.from(params.keys())) {
      if (AUTO_TRANSFORM_TOKENS.has(key.toLowerCase())) {
        params.delete(key);
      }
    }
    const qs = params.toString();
    normalizedQuery = qs ? `?${qs}` : "";
  }

  return `${prefix}${normalizedSegments.join("/")}${normalizedQuery}${hash}`;
}

function normalizeTagHash(url) {
  // Encode literal '#' inside /tag/<segment> paths (e.g. /tag/c# -> /tag/c%23)
  return url.replace(/(\/tag\/[^/?\s]*?)#([^/?\s]*)/gi, (full, before, after) => {
    // Only rewrite when the '#' is part of the tag slug (e.g. /tag/c# or /tag/c#/)
    // and not an empty tag followed by a fragment (e.g. /tag/#top).
    const slugPart = before.slice("/tag/".length);
    if (!slugPart) return full;
    return `${before}%23${after}`;
  });
}

/**
 * Normalizes a URL for parity comparison so known intentional migration diffs
 * (Cloudinary rehost + f_auto,q_auto, legacy vs new origin, /tag/c# encoding)
 * do not flood triage.
 */
export function normalizeUrlForParity(url, options = {}) {
  if (typeof url !== "string") return "";
  let out = url.trim();
  if (!out) return "";

  const {
    rewriteMap = null,
    postPath = "",
    legacyOrigin = DEFAULT_LEGACY_ORIGIN,
    newOrigin = DEFAULT_NEW_ORIGIN,
  } = options;

  // 1. Apply mig2/rewrite-map.json lookup (handles direct URLs, ./local, and /_astro/<stem>.<hash>.<ext>)
  if (rewriteMap) {
    const lookup = buildRewriteLookup(rewriteMap);
    out = lookupRewrite(out, lookup, postPath);
  }

  // 2. Origin normalization (newOrigin -> legacyOrigin)
  const normLegacyOrigin = normalizeOriginString(legacyOrigin);
  const normNewOrigin = normalizeOriginString(newOrigin);
  if (normLegacyOrigin && normNewOrigin && normLegacyOrigin !== normNewOrigin) {
    const lowerOut = out.toLowerCase();
    const lowerNew = normNewOrigin.toLowerCase();
    const altNewHttp = lowerNew.replace(/^https:\/\//, "http://");
    if (lowerOut === lowerNew || lowerOut.startsWith(`${lowerNew}/`) || lowerOut.startsWith(`${lowerNew}?`) || lowerOut.startsWith(`${lowerNew}#`)) {
      out = normLegacyOrigin + out.slice(normNewOrigin.length);
    } else if (
      altNewHttp !== lowerNew &&
      (lowerOut === altNewHttp || lowerOut.startsWith(`${altNewHttp}/`) || lowerOut.startsWith(`${altNewHttp}?`) || lowerOut.startsWith(`${altNewHttp}#`))
    ) {
      out = normLegacyOrigin + out.slice(altNewHttp.length);
    }
  }

  // 3. Cloudinary delivery transform/query normalization (f_auto, q_auto)
  out = normalizeCloudinaryUrl(out);

  // 4. Encoded fragment tag links (/tag/c# -> /tag/c%23)
  out = normalizeTagHash(out);

  return out;
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
  if (a === b) return { status: "match" };
  const normA = normalizeUrlForParity(a, normOptions);
  const normB = normalizeUrlForParity(b, normOptions);
  if (normA === normB) {
    return { status: "expected-diff", legacy: a, new: b, normalized: normA };
  }
  return { status: "flagged-diff", legacy: a, new: b };
}

function diffUrlList(legacyList, newList, normOptions, maxItems) {
  const a = Array.isArray(legacyList) ? legacyList : [];
  const b = Array.isArray(newList) ? newList : [];
  if (arraysEqual(a, b)) return { status: "match" };

  const normA = a.map((u) => normalizeUrlForParity(u, normOptions));
  const normB = b.map((u) => normalizeUrlForParity(u, normOptions));
  const { missing, extra, reordered } = multisetDiff(normA, normB);

  if (missing.length === 0 && extra.length === 0 && !reordered) {
    let rewrittenCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) rewrittenCount++;
    }
    return {
      status: "expected-diff",
      count: a.length,
      rewrittenCount,
    };
  }

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

  const fields = {
    title: diffScalar(legacyDom.title, newDom.title),
    h1: diffScalar(legacyDom.h1, newDom.h1),
    description: diffScalar(legacyDom.description, newDom.description),
    canonical: diffUrlScalar(legacyDom.canonical, newDom.canonical, normOptions),
    headings: diffHeadings(legacyDom.headings, newDom.headings, maxDiffItems),
    links: diffUrlList(legacyDom.links, newDom.links, normOptions, maxDiffItems),
    images: diffUrlList(legacyDom.images, newDom.images, normOptions, maxDiffItems),
    counts: diffCounts(legacyDom.counts, newDom.counts),
    text: diffText(legacyDom.text, newDom.text),
  };

  const flaggedFields = [];
  const expectedFields = [];
  for (const [key, result] of Object.entries(fields)) {
    if (result.status === "flagged-diff") flaggedFields.push(key);
    else if (result.status === "expected-diff") expectedFields.push(key);
  }

  let severity = "ok";
  if (flaggedFields.length > 0) {
    let isError = false;

    if (fields.headings.status === "flagged-diff" && fields.headings.missingTotal > 0) {
      isError = true;
    }
    if (fields.images.status === "flagged-diff" && fields.images.missingTotal > 0) {
      isError = true;
    }
    if (fields.counts.status === "flagged-diff" && fields.counts.hasDrop) {
      isError = true;
    }
    if (fields.text.status === "flagged-diff") {
      const { legacyLength, newLength } = fields.text;
      const drop = legacyLength - newLength;
      if (legacyLength > 0 && newLength === 0) {
        isError = true;
      } else if (
        drop >= textDropErrorMinChars &&
        legacyLength > 0 &&
        drop / legacyLength >= textDropErrorRatio
      ) {
        isError = true;
      }
    }

    severity = isError ? "error" : "warn";
  } else if (expectedFields.length > 0) {
    severity = "expected";
  }

  return {
    severity,
    flaggedFields,
    expectedFields,
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

/**
 * Runs bulk DOM parity diff over a list of post URLs and returns a compact
 * JSON-serializable report suitable for summary display and automated triage.
 */
export function runBulkDiff(config) {
  const startedAt = Date.now();
  const {
    legacyDir,
    newDir,
    urls,
    rewriteMap = null,
    legacyOrigin = DEFAULT_LEGACY_ORIGIN,
    newOrigin = DEFAULT_NEW_ORIGIN,
    maxDiffItems = 10,
    textDropErrorRatio = 0.1,
    textDropErrorMinChars = 20,
    meta = {},
  } = config;

  const lookup = rewriteMap ? buildRewriteLookup(rewriteMap) : null;
  const flaggedFieldCounts = {
    title: 0,
    h1: 0,
    description: 0,
    canonical: 0,
    headings: 0,
    links: 0,
    images: 0,
    counts: 0,
    text: 0,
  };

  let ok = 0;
  let expected = 0;
  let warn = 0;
  let error = 0;
  let missingLegacy = 0;
  let missingNew = 0;
  let missingFiles = 0;

  const missing = [];
  const flagged = [];

  for (const urlPath of urls) {
    const legacyFile = resolvePostHtmlPath(legacyDir, urlPath);
    const newFile = resolvePostHtmlPath(newDir, urlPath);
    const hasLegacy = existsSync(legacyFile);
    const hasNew = existsSync(newFile);

    if (!hasLegacy || !hasNew) {
      missingFiles++;
      if (!hasLegacy) missingLegacy++;
      if (!hasNew) missingNew++;
      missing.push({
        url: urlPath,
        missingLegacy: !hasLegacy,
        missingNew: !hasNew,
      });
      continue;
    }

    const legacyDom = extractPostDom(readFileSync(legacyFile, "utf8"));
    const newDom = extractPostDom(readFileSync(newFile, "utf8"));
    const diff = diffPostDom(legacyDom, newDom, {
      rewriteMap: lookup,
      postPath: urlPath,
      legacyOrigin,
      newOrigin,
      maxDiffItems,
      textDropErrorRatio,
      textDropErrorMinChars,
    });

    if (diff.severity === "ok") {
      ok++;
    } else if (diff.severity === "expected") {
      expected++;
    } else {
      if (diff.severity === "error") error++;
      else warn++;

      const compactDiffs = {};
      for (const field of diff.flaggedFields) {
        flaggedFieldCounts[field] = (flaggedFieldCounts[field] ?? 0) + 1;
        compactDiffs[field] = diff.fields[field];
      }

      flagged.push({
        url: urlPath,
        severity: diff.severity,
        flaggedFields: diff.flaggedFields,
        expectedFields: diff.expectedFields,
        diffs: compactDiffs,
      });
    }
  }

  // Deterministic ordering: errors first, then warns, alphabetically by URL
  flagged.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return a.url.localeCompare(b.url);
  });
  missing.sort((a, b) => a.url.localeCompare(b.url));

  return {
    generatedAt: new Date().toISOString(),
    options: meta,
    summary: {
      total: urls.length,
      ok,
      expected,
      warn,
      error,
      missingFiles,
      missingLegacy,
      missingNew,
      durationMs: Date.now() - startedAt,
      flaggedFieldCounts,
    },
    missing,
    flagged,
  };
}
