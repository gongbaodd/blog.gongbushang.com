// MIG-0 audit: checks legacy source frontmatter, glob ids, taxonomy URLs and dist coverage.
// Writes docs/plan/emdash/reports/MIG-0.md (and a JSON dump when --json <path> is given).
// Usage: node apps/web/scripts/import/mig0/audit.mjs [--json <path>]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIST, DOCS, LEGACY_ROOT, globId, loadSlugger, loadYaml, splitFrontmatter, walk, SKIP,
} from "./lib.mjs";
import { buildPaths, classify as classifyUrl } from "./snapshot.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const REPORT = resolve(here, "../../../../../docs/plan/emdash/reports/MIG-0.md");
const LIST_CAP = 40;
const today = new Date().toISOString().slice(0, 10);

// Mirrors citySlug in packages/utils/city.ts.
export function citySlug(city) {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*,\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const KNOWN_KEYS = new Set(["type", "category", "adsense", "tag", "series", "cover", "city"]);

async function main() {
  const slug = await loadSlugger();
  const yaml = loadYaml();
  const { served } = buildPaths();
  // Decoded URL -> dist URL, so "c#" and "c%23" match.
  const byDecoded = new Map();
  for (const u of served.keys()) byDecoded.set(safeDecode(u), u);
  const findUrl = (url) => byDecoded.get(safeDecode(url)) ?? null;

  const all = walk(DOCS);
  const mdFiles = all.filter((p) => /\.mdx?$/.test(p));
  const assetFiles = all.length - mdFiles.length;

  const posts = [];
  const anomalies = { frontmatterError: [], badFolderDate: [], noFrontmatter: [], uppercaseIdDiffers: [] };
  const typeValues = {};
  const unknownKeys = {};
  const unknownKeyFiles = [];
  const categoryMissing = [];

  for (const rel of mdFiles) {
    const text = readFileSync(join(DOCS, rel), "utf8");
    let fm = null;
    try {
      fm = splitFrontmatter(text, yaml);
    } catch (e) {
      anomalies.frontmatterError.push({ file: rel, error: String(e.message).slice(0, 120) });
      continue;
    }
    if (!fm) {
      anomalies.noFrontmatter.push(rel);
      continue;
    }
    const id = globId(rel, slug);
    const dirs = rel.split("/").slice(0, -1);
    const folderDate = dirs.slice(0, 3).join("/");
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(folderDate) || dirs.length !== 3) anomalies.badFolderDate.push(rel);
    const fileStem = basename(rel).replace(/\.mdx?$/, "");
    if (slug(fileStem) !== fileStem.toLowerCase()) {
      anomalies.uppercaseIdDiffers.push({ file: rel, glob: id.split("/").pop(), lower: fileStem.toLowerCase() });
    }
    const d = fm.data;
    const type = d.type === undefined ? "(missing)" : String(d.type);
    typeValues[type] = (typeValues[type] ?? 0) + 1;
    for (const k of Object.keys(d)) {
      if (KNOWN_KEYS.has(k)) continue;
      unknownKeys[k] = (unknownKeys[k] ?? 0) + 1;
      unknownKeyFiles.push({ file: rel, key: k, value: String(d[k]).slice(0, 80) });
    }
    if (!d.category) categoryMissing.push(rel);
    posts.push({
      rel,
      id,
      folderDate,
      slugTail: id.split("/").pop(),
      type,
      category: d.category == null ? null : String(d.category),
      tags: Array.isArray(d.tag) ? d.tag.map(String) : [],
      seriesSlug: d.series?.slug ?? null,
      cities: Array.isArray(d.city) ? d.city.map(String) : [],
    });
  }

  // Duplicate glob ids and same slug under different dates.
  const idCount = new Map();
  for (const p of posts) idCount.set(p.id, (idCount.get(p.id) ?? []).concat(p.rel));
  const duplicateIds = [...idCount].filter(([, files]) => files.length > 1).map(([id, files]) => ({ id, files }));
  const bySlugTail = new Map();
  for (const p of posts) {
    const e = bySlugTail.get(p.slugTail) ?? { dates: new Set(), files: [] };
    e.dates.add(p.folderDate);
    e.files.push(p.rel);
    bySlugTail.set(p.slugTail, e);
  }
  const slugCollisions = [...bySlugTail]
    .filter(([, e]) => e.dates.size > 1)
    .map(([s, e]) => ({ slug: s, dates: [...e.dates].sort(), files: e.files }));

  // Post URL coverage.
  const postRows = posts.map((p) => {
    const expected = `/${p.category}/${p.id}/`;
    const url = findUrl(expected);
    let htmlHasDate = null;
    if (url) {
      const file = join(DIST, url.slice(1), "index.html");
      if (existsSync(file)) {
        const html = readFileSync(file, "utf8");
        htmlHasDate = html.includes(p.folderDate.replaceAll("/", "-"));
      }
    }
    return { ...p, expected, url, htmlHasDate };
  });
  const missingPosts = postRows.filter((r) => !r.url);
  const drafts = postRows.filter((r) => r.type === "draft").map((r) => ({
    file: r.rel, url: r.url, servedInDist: Boolean(r.url),
  }));
  const dateMismatch = postRows.filter((r) => r.url && r.htmlHasDate === false);
  const urlDateMismatch = postRows.filter((r) => r.url && !r.url.includes(`/${r.folderDate}/`));

  // Taxonomies: each distinct value -> expected URL -> dist URL.
  const taxonomy = (label, pairs) => {
    const rows = new Map();
    for (const [raw, expected] of pairs) {
      const key = `${raw}`;
      if (!rows.has(key)) rows.set(key, { raw, expected, dist: findUrl(expected), uses: 0 });
      rows.get(key).uses++;
    }
    const list = [...rows.values()];
    return {
      label,
      distinct: list.length,
      missing: list.filter((r) => !r.dist),
      mixedCase: list.filter((r) => r.raw !== r.raw.toLowerCase()).map((r) => r.raw),
      values: list,
    };
  };
  const categoryTax = taxonomy("category", posts.filter((p) => p.category).map((p) => [p.category, `/${p.category}/`]));
  const tagTax = taxonomy("tag", posts.flatMap((p) => p.tags.map((t) => [t, `/tag/${t.toLowerCase()}/`])));
  const seriesTax = taxonomy("series", posts.filter((p) => p.seriesSlug).map((p) => [p.seriesSlug, `/series/${p.seriesSlug}/`]));
  const cityTax = taxonomy("city", posts.flatMap((p) => p.cities.map((c) => [c, `/world/${citySlug(c)}/`])));

  // Dist pages not produced from a source post (categories, tags, etc. are excluded).
  const postUrlSet = new Set(postRows.filter((r) => r.url).map((r) => r.url));
  const distPostLike = [...served.keys()].filter((u) => /^\/[^/]+\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(u));
  const distOnlyPosts = distPostLike.filter((u) => !postUrlSet.has(u));

  const nonIndexHtml = walk(DIST).filter((p) => !SKIP(p) && p.endsWith(".html") && !p.endsWith("index.html"));

  const result = {
    generated: today,
    legacyRoot: LEGACY_ROOT,
    sourceFiles: { md: mdFiles.length, assets: assetFiles },
    posts: { total: posts.length, withDistUrl: postRows.filter((r) => r.url).length, missing: missingPosts.length },
    typeValues,
    unknownKeys,
    unknownKeyFiles,
    categoryMissing,
    anomalies,
    duplicateIds,
    slugCollisions,
    drafts,
    dateMismatch: dateMismatch.map((r) => r.rel),
    urlDateMismatch: urlDateMismatch.map((r) => r.rel),
    taxonomies: { category: categoryTax, tag: tagTax, series: seriesTax, city: cityTax },
    distOnlyPosts: distOnlyPosts.length,
    distOnlyPostSample: distOnlyPosts.slice(0, LIST_CAP),
    missingPostSample: missingPosts.slice(0, LIST_CAP).map((r) => ({ file: r.rel, expected: r.expected })),
    nonIndexHtml,
  };

  if (process.argv.includes("--json")) {
    const out = process.argv[process.argv.indexOf("--json") + 1];
    writeFileSync(out, JSON.stringify(result, null, 1));
  }
  writeFileSync(REPORT, renderReport(result));
  console.log(JSON.stringify({
    sourceMd: result.sourceFiles.md, posts: result.posts, typeValues, drafts: drafts.length,
    slugCollisions: slugCollisions.length, duplicateIds: duplicateIds.length,
    uppercaseIdDiffers: anomalies.uppercaseIdDiffers.length, frontmatterError: anomalies.frontmatterError.length,
    noFrontmatter: anomalies.noFrontmatter.length, badFolderDate: anomalies.badFolderDate.length,
    dateMismatch: dateMismatch.length, distOnlyPosts: distOnlyPosts.length,
    taxonomy: Object.fromEntries(Object.entries(result.taxonomies).map(([k, v]) => [k, { distinct: v.distinct, missing: v.missing.length }])),
    unknownKeys, nonIndexHtml,
  }, null, 1));
}

const fence = (rows) => rows.map((r) => (typeof r === "string" ? `- \`${r}\`` : `- \`${JSON.stringify(r)}\``)).join("\n") || "- none";

function renderReport(r) {
  const cap = (arr) => arr.slice(0, LIST_CAP);
  const more = (arr) => (arr.length > LIST_CAP ? `\n- ... ${arr.length - LIST_CAP} more (see the audit script)` : "");
  const tax = (t) => [
    `### ${t.label}`,
    `Distinct values: ${t.distinct}. Missing in dist: ${t.missing.length}.`,
    t.missing.length ? `Missing:\n${fence(cap(t.missing.map((m) => `${m.raw} -> ${m.expected}`)))}${more(t.missing)}` : "",
    `Mixed-case raw values: ${t.values.filter((v) => v.raw !== v.raw.toLowerCase()).length}.`,
    `Samples (raw value -> dist URL):\n${cap(t.values).slice(0, 15).map((v) => `- \`${v.raw}\` -> \`${v.dist ?? "MISSING"}\` (${v.uses} posts)`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return `# MIG-0 report: legacy snapshot and audit

Generated ${today} by \`apps/web/scripts/import/mig0/snapshot.mjs\` and \`audit.mjs\`. Source: \`${LEGACY_ROOT}\` (legacy \`dist/\` built today, \`src/content/_docs\`).

## 1. Totals per route group

Snapshot file: \`apps/web/tests/legacy-urls.txt\` and \`legacy-route-groups.json\`. Route groups are assigned from the URL shape (see \`classify()\` in snapshot.mjs).

| Group | Paths |
|---|---|
${Object.entries(snapshotGroups()).map(([g, n]) => `| ${g} | ${n} |`).join("\n")}

Total paths: ${Object.values(snapshotGroups()).reduce((a, b) => a + b, 0)}. The 18 CV PDFs under \`/resume/pdfs/\` are not in \`dist/\` (generate-pdfs.mjs has not run) and are added from the script's role/language list. \`dist/resume/pdfs/\` holds only \`.gitkeep\`.

## 2. Posts

- Source markdown files: ${r.sourceFiles.md}; non-markdown assets under \`_docs\`: ${r.sourceFiles.assets}.
- Posts (markdown): ${r.posts.total}. With a dist URL at \`/<category>/<id>/\`: ${r.posts.withDistUrl}. Missing: ${r.posts.missing}.
- Dist post pages with no source post: ${r.distOnlyPosts}.
- Legacy \`type\` values: ${Object.entries(r.typeValues).map(([k, v]) => `\`${JSON.stringify(k)}\` x${v}`).join(", ")}. Values other than \`post\` and \`draft\`: ${Object.keys(r.typeValues).filter((k) => k !== "post" && k !== "draft").length ? Object.keys(r.typeValues).filter((k) => k !== "post" && k !== "draft").map((k) => `\`${JSON.stringify(k)}\``).join(", ") : "none"}. Values with stray whitespace are YAML-trimmed to \`post\`.
- Frontmatter keys outside the collection schema: ${Object.keys(r.unknownKeys).length ? JSON.stringify(r.unknownKeys) : "none"}.${r.unknownKeyFiles.length ? "\n" + fence(r.unknownKeyFiles) : ""}
- Posts without \`category\`: ${r.categoryMissing.length}.
- Frontmatter parse errors: ${r.anomalies.frontmatterError.length}. Files without frontmatter: ${r.anomalies.noFrontmatter.length}. Folder not \`YYYY/MM/DD\`: ${r.anomalies.badFolderDate.length}.

## 3. Draft audit (\`type: draft\`)

${r.drafts.length} posts have \`type: draft\`. Each one has a dist page, so the draft is public today. \`packages/utils/post.ts\` has no draft filter.

${r.drafts.map((d) => `- \`${d.file}\` -> \`${d.url ?? "no dist URL"}\` (dist: ${d.servedInDist ? "yes" : "no"})`).join("\n") || "- none"}

## 4. Slug collisions and glob ids

- Duplicate glob ids (same \`/YYYY/MM/DD/slug\`): ${r.duplicateIds.length}.${r.duplicateIds.length ? "\n" + fence(cap(r.duplicateIds)) : ""}
- Same slug tail under different dates: ${r.slugCollisions.length} groups. These do not collide in URLs because the date is in the path. Examples:
${cap(r.slugCollisions).slice(0, 10).map((c) => `  - \`${c.slug}\`: ${c.dates.join(", ")}`).join("\n") || "  - none"}${more(r.slugCollisions)}
- Glob id differs from the lowercase file name: ${r.anomalies.uppercaseIdDiffers.length}. Examples (file -> glob slug vs lowercased name):
${cap(r.anomalies.uppercaseIdDiffers).slice(0, 10).map((u) => `  - \`${u.file}\` -> \`${u.glob}\` vs \`${u.lower}\``).join("\n") || "  - none"}${more(r.anomalies.uppercaseIdDiffers)}

## 5. Taxonomy slugs

Rules read from the legacy code: categories use the raw value (\`packages/utils/filter.ts\`), tags are lowercased, series use \`series.slug\`, cities use \`citySlug()\` (\`packages/utils/city.ts\`). Dist directories are named with percent-encoding (for example \`tag/c%23/\`).

${tax(r.taxonomies.category)}

${tax(r.taxonomies.tag)}

${tax(r.taxonomies.series)}

${tax(r.taxonomies.city)}

## 6. Timezone check

Post dates come from the glob id and are built with local \`new Date(y, m-1, d)\`, so no URL can shift.
- Dist URL date differs from folder date: ${r.urlDateMismatch.length}.
- Rendered page lacks its folder date (\`YYYY-MM-DD\`): ${r.dateMismatch.length}.${r.dateMismatch.length ? "\n" + fence(cap(r.dateMismatch)) : ""}

## 7. Trailing slash and non-index files

- Directory pages are written as \`index.html\` and served at \`/path/\`. The legacy build has no \`trailingSlash\` override (astro.config.mjs sets only \`site\`), so the default \`directory\` format applies.
- Non-index HTML files in dist: ${r.nonIndexHtml.length ? r.nonIndexHtml.map((f) => `\`/${f}\``).join(", ") : "none"}.
- Files other than \`index.html\` are listed as-is (for example \`/rss.xml\`, \`/api/.../1.ndjson\`, \`/sitemap-0.xml\`).

## 8. Open questions for Lead

Nothing here is fixed by the migrator. Items for a decision:
- Drafts are public in the legacy site (section 3). Keep them public in EmDash, or hide them with \`draft\` status?
- Post count: 995 markdown files in \`_docs\`, against 994 in the brief. The extra file is not identified here; Lead to confirm the expected count.
- Legacy glob ids drop characters such as apostrophes, \`+\` and \`.\`, and turn \`·\` into \`--\` (section 4). EmDash \`legacy_slug\` keeps these ids as produced, so the URLs match. Confirm this is the intended rule.
- Frontmatter key \`plan\` (section 2) is outside the schema. Lead to decide whether it is data to keep.
`;
}

// Group counts come from the snapshot classifier, so the report and legacy-route-groups.json agree.
function snapshotGroups() {
  const { served, categories } = buildPaths();
  const counts = {};
  for (const u of served.keys()) {
    const g = classifyUrl(u, categories);
    counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}


await main();
