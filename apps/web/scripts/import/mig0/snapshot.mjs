// MIG-0: snapshot every public path the legacy site serves.
// Output: apps/web/tests/legacy-urls.txt and apps/web/tests/legacy-route-groups.json.
// Usage: node apps/web/scripts/import/mig0/snapshot.mjs   (LEGACY_ROOT overrides the source checkout)
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIST, LEGACY_ROOT, RESUME_SCRIPT, distUrl, resumeCombos, walk, SKIP } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const TESTS = resolve(here, "../../../tests");
const today = new Date().toISOString().slice(0, 10);

// Top-level names that are pages or assets, not categories.
const STATIC_EXACT = new Set([
  "about", "contact", "privacy", "lab", "gemini", "fonts", "assets", "llm", "api",
  "series", "tag", "tags", "year", "world", "podcast", "resume", "cv", "sitemap",
  "umap", "hero-gallery",
]);

export function classify(url, categories) {
  if (url === "/") return "static";
  if (url.startsWith("/api/")) return "api/*";
  if (/^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(url)) return "post";
  if (/^\/tags?(\/|$)/.test(url)) return "tag";
  if (/^\/series(\/|$)/.test(url)) return "series";
  if (/^\/year(\/|$)/.test(url)) return "year";
  if (/^\/world(\/|$)/.test(url)) return "world";
  if (/^\/podcast(\/|$)/.test(url)) return "podcast";
  if (/^\/(resume|cv)(\/|$)/.test(url)) return "resume";
  if (/^\/hero-gallery(\/|$)/.test(url)) return "gallery";
  if (/^\/(rss\.xml|sitemap(-[^/]*)?\.xml|sitemap\/)$/.test(url)) return "rss/sitemap";
  if (/^\/(umap|\d{4})(\/|$)/.test(url)) return "other";
  if (/^\/[^/]+\/$/.test(url) && categories.has(url.slice(1, -1))) return "category";
  if (/^\/[^/]+\/$/.test(url) && url.slice(1, -1) === "all") return "category";
  if (/^\/(about|contact|privacy|lab|gemini|fonts|assets|llm)(\/|$)/.test(url)) return "static";
  if (/^\/[^/]+$/.test(url)) return "static"; // root files: robots.txt, favicons, ads.txt, CNAME, 404.html ...
  return "other";
}

export function buildPaths() {
  const files = walk(DIST).filter((p) => !SKIP(p));
  const served = new Map(); // url -> source
  for (const p of files) served.set(distUrl(p), "dist");

  // generate-pdfs.mjs writes these after astro build; they are not in dist/ yet.
  const pdfs = [];
  for (const { role, language } of resumeCombos()) {
    const url = `/resume/pdfs/jian-gong-${role}-${language}.pdf`;
    pdfs.push(url);
    if (!served.has(url)) served.set(url, "generate-pdfs");
  }

  // Category set: single-segment directories whose index.html exists in dist.
  const categories = new Set();
  for (const url of served.keys()) {
    const m = url.match(/^\/([^/]+)\/$/);
    if (m && !STATIC_EXACT.has(m[1])) categories.add(m[1]);
  }
  return { served, pdfs, categories };
}

function main() {
  const { served, pdfs, categories } = buildPaths();
  const urls = [...served.keys()].sort();
  const derived = urls.filter((u) => served.get(u) === "generate-pdfs").length;
  const groups = {};
  for (const u of urls) {
    const g = classify(u, categories);
    (groups[g] ??= []).push(u);
  }
  const order = [
    "post", "category", "tag", "series", "year", "world", "podcast", "api/*",
    "resume", "static", "rss/sitemap", "gallery", "other",
  ];

  mkdirSync(TESTS, { recursive: true });
  const header = [
    "# Legacy public paths (MIG-0). Do not edit by hand; regenerate with apps/web/scripts/import/mig0/snapshot.mjs.",
    `# Source: ${join(LEGACY_ROOT, "dist")} (legacy astro build) + generate-pdfs.mjs output paths (${derived} not yet in dist).`,
    `# Date: ${today}. Excludes _astro/ and _noop*. Directory indexes are listed with a trailing slash.`,
    `# Count: ${urls.length}`,
  ];
  writeFileSync(join(TESTS, "legacy-urls.txt"), [...header, ...urls].join("\n") + "\n");

  const json = {
    generated: today,
    source: { dist: DIST, pdfScript: RESUME_SCRIPT, pdfPathsDerivedNotInDist: derived },
    total: urls.length,
    groups: Object.fromEntries(
      order.filter((g) => groups[g]).map((g) => [g, { count: groups[g].length, paths: groups[g] }]),
    ),
  };
  writeFileSync(join(TESTS, "legacy-route-groups.json"), JSON.stringify(json, null, 1) + "\n");

  const summary = Object.fromEntries(order.map((g) => [g, groups[g]?.length ?? 0]));
  console.log(JSON.stringify({ total: urls.length, derivedPdfs: derived, summary, dist: existsSync(DIST) }, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
