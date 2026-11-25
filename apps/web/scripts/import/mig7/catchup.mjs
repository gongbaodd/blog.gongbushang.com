#!/usr/bin/env node
/**
 * MIG-7: master content catch-up helper (posts + gallery + MIG-2 rewrite-map aware).
 *
 * Extends the MIG-6 workflow without modifying `mig6/*`:
 *   - Supports `--base <sha>` and `--target <sha>` so environments still on an older
 *     content baseline (e.g. `b7d0c04` or `4893092`) can catch up after git HEAD bumps `src/content`.
 *   - Uses `globLegacyId` (`github-slugger` rules) so mixed-case/punctuated filenames match
 *     `mig1/import.mjs --match-exact` reliably.
 *   - Checks `mig2/rewrite-map.json` + `mig2/upload-result.json` before flagging historical
 *     external URLs, and defaults to `--rewrite=map` so modified legacy posts keep their
 *     Cloudinary URLs in EmDash.
 *   - Detects `_gallery/*.json` changes and invokes `mig3/import.mjs --only gallery` on `--write`.
 *
 * Usage:
 *   node apps/web/scripts/import/mig7/catchup.mjs [--ref origin/master] [--base <sha>] [--target <sha>] [--dry-run]
 *   node apps/web/scripts/import/mig7/catchup.mjs --write --url http://127.0.0.1:4322 [--base <sha>] [--target <sha>] [--rewrite=map|none] [--force] [--update-gallery] [--bump]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkGalleryImages,
  checkPostImages,
  galleryLegacyId,
  gallerySlug,
  globLegacyId,
  importableGallery,
  importablePosts,
  parseContentDiff,
  slugifySegment,
} from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const SUB = join(REPO, "src/content");
const MIG2 = resolve(HERE, "../mig2");

const HELP = `Usage: node apps/web/scripts/import/mig7/catchup.mjs [options]

Options:
  --ref <git-ref>         Target git ref for src/content pointer (default: origin/master)
  --base <sha>            Override base src/content commit SHA (default: HEAD:src/content)
  --target <sha>          Override target src/content commit SHA (default: <ref>:src/content)
  --dry-run               Print plan and run image guards only (default unless --write)
  --write                 Import changed posts and gallery items into EmDash
  --url <admin-url>       EmDash admin URL (or set EMDASH_URL)
  --rewrite <map|none>    Image rewrite mode for mig1/import.mjs (default: map if mig2/upload-result.json exists)
  --force                 Forward --force to mig1/import.mjs (overwrite admin-edited posts)
  --update-gallery        Forward --update to mig3/import.mjs (update modified gallery items)
  --bump                  After successful --write, check out src/content at target and stage gitlink
  -h, --help              Show this help and exit 0

Exit codes:
  0  Success (or dry-run passed, or --help)
  1  Git resolution or import failure
  2  Invalid CLI arguments
  3  One or more images are neither on res.cloudinary.com nor uploaded via MIG-2
`;

const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const eq = args.find((a) => a.startsWith(`${n}=`));
  if (eq) return eq.slice(n.length + 1);
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};

if (flag("--help") || flag("-h")) {
  console.log(HELP);
  process.exit(0);
}

const REF = opt("--ref", "origin/master");
const BASE_OPT = opt("--base");
const TARGET_OPT = opt("--target");
const URL_ = opt("--url", process.env.EMDASH_URL);
const WRITE = flag("--write");
const DRY = flag("--dry-run") || !WRITE;
const BUMP = flag("--bump");
const FORCE = flag("--force");
const UPDATE_GALLERY = flag("--update-gallery");
const REAL_WRITE = WRITE && !flag("--dry-run");

const uploadResultPath = join(MIG2, "upload-result.json");
const rewriteMapPath = join(MIG2, "rewrite-map.json");
const defaultRewrite = existsSync(uploadResultPath) && existsSync(rewriteMapPath) ? "map" : "none";
const REWRITE = opt("--rewrite", defaultRewrite);

if (!["map", "none"].includes(REWRITE)) {
  console.error(`--rewrite must be map or none (got ${REWRITE})`);
  process.exit(2);
}
if (BUMP && !WRITE) {
  console.error("--bump needs --write (it only runs after a successful import)");
  process.exit(2);
}

const git = (cwd, ...a) =>
  execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

let base;
let target;
try {
  base = BASE_OPT ? git(SUB, "rev-parse", BASE_OPT) : git(REPO, "rev-parse", "HEAD:src/content");
  target = TARGET_OPT ? git(SUB, "rev-parse", TARGET_OPT) : git(REPO, "rev-parse", `${REF}:src/content`);
} catch {
  console.error(`cannot resolve base/target src/content commit (ref=${REF}; try git fetch)`);
  process.exit(1);
}

console.log(`ref    ${TARGET_OPT ? "(explicit --target)" : REF}`);
console.log(`base   ${base}`);
console.log(`target ${target}`);
console.log(`rewrite ${REWRITE}`);

let diffOut = "";
if (base !== target) {
  diffOut = git(SUB, "-c", "core.quotepath=false", "diff", "--name-status", "-M", base, target, "--", "_docs", "_gallery");
}
const { posts, gallery } = parseContentDiff(diffOut);

const show = (prefix, label, list) => {
  console.log(`${prefix} ${label}: ${list.length}`);
  for (const r of list) console.log(`  ${r.path}${r.from ? `  (from ${r.from})` : ""}`);
};

show("posts", "added", posts.added);
show("posts", "modified", posts.modified);
show("posts", "renamed", posts.renamed);
for (const r of posts.renamed) {
  console.warn(`WARN renamed post: old legacy_id ${globLegacyId(r.from)} stays in EmDash as an orphan (report only)`);
}
show("posts", "deleted (report only, never removed)", posts.deleted);

show("gallery", "added", gallery.added);
show("gallery", "modified", gallery.modified);
show("gallery", "renamed", gallery.renamed);
show("gallery", "deleted (report only, never removed)", gallery.deleted);

const postPaths = importablePosts(posts);
const galleryPaths = importableGallery(gallery);

function bump() {
  git(SUB, "checkout", "--quiet", target);
  git(REPO, "add", "src/content");
  console.log(`submodule at ${target.slice(0, 8)}, pointer staged (not committed)`);
}

if (!postPaths.length && !galleryPaths.length) {
  console.log("nothing to import");
  if (BUMP && REAL_WRITE && base !== target) bump();
  process.exit(0);
}

// Resolve exact github-slugger if available; fall back to pure-JS equivalent.
let slugFn = slugifySegment;
try {
  const mod = await import("github-slugger");
  if (typeof mod?.slug === "function") slugFn = mod.slug;
} catch {
  // pure-JS slugifySegment matches github-slugger@2.0.0
}

// 1. Post image guard (MIG-2 rewrite-map aware when REWRITE === "map").
const rewriteMap = REWRITE === "map" && existsSync(rewriteMapPath) ? JSON.parse(readFileSync(rewriteMapPath, "utf8")) : null;
const uploadResult = REWRITE === "map" && existsSync(uploadResultPath) ? JSON.parse(readFileSync(uploadResultPath, "utf8")) : null;

const postFiles = postPaths.map((p) => ({ path: p, text: git(SUB, "show", `${target}:_docs/${p}`) }));
const postCheck = checkPostImages(postFiles, { rewriteMap, uploadResult });

// 2. Gallery image guard.
const galleryItems = galleryPaths.map((p) => ({
  path: p,
  data: JSON.parse(git(SUB, "show", `${target}:_gallery/${p}`)),
}));
const badGallery = checkGalleryImages(galleryItems);

if (postCheck.unhosted.length || badGallery.length) {
  if (postCheck.unhosted.length) {
    console.error("\npost images not on res.cloudinary.com (rehost first, nothing written):");
    for (const b of postCheck.unhosted) console.error(`  ${b.path}  ${b.url}  (${b.reason})`);
  }
  if (badGallery.length) {
    console.error("\ngallery images not on res.cloudinary.com (rehost first, nothing written):");
    for (const b of badGallery) console.error(`  ${b.path}  ${b.url}`);
  }
  process.exit(3);
}

console.log(
  `image guard: ok (posts: ${postCheck.cloudinaryDirect} direct Cloudinary, ${postCheck.rewrittenByMap.length} MIG-2 rewritten; gallery: ${galleryItems.length} direct Cloudinary)`,
);

const postPlan = postPaths.map((p) => ({ path: p, legacyId: globLegacyId(p, slugFn) }));
const galleryPlan = galleryPaths.map((p) => {
  const legacyId = galleryLegacyId(p);
  return { path: p, legacyId, slug: gallerySlug(legacyId) };
});

if (postPlan.length) {
  console.log(`\nplan (posts): import ${postPlan.length} post(s):`);
  for (const p of postPlan) console.log(`  ${p.legacyId}  <-- _docs/${p.path}`);
}
if (galleryPlan.length) {
  console.log(`\nplan (gallery): import ${galleryPlan.length} gallery item(s):`);
  for (const g of galleryPlan) console.log(`  ${g.legacyId} (slug: ${g.slug})  <-- _gallery/${g.path}`);
}

if (DRY) {
  console.log("\ndry run: nothing written. Add --write --url <admin> to import.");
  process.exit(0);
}
if (!URL_) {
  console.error("--write needs --url <emdash admin url> (or EMDASH_URL)");
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), "mig7-"));
try {
  const archivePaths = [];
  if (postPlan.length) archivePaths.push("_docs");
  if (galleryPlan.length) archivePaths.push("_gallery", "generated/gallery.json");
  const tar = spawnSync("git", ["-C", SUB, "archive", target, ...archivePaths], {
    maxBuffer: 1 << 29,
  });
  if (tar.status !== 0) {
    console.error(tar.stderr?.toString() || "git archive failed");
    process.exit(1);
  }
  const untar = spawnSync("tar", ["-x", "-C", tmp], { input: tar.stdout, stdio: ["pipe", "inherit", "inherit"] });
  if (untar.status !== 0) {
    console.error("tar extract failed");
    process.exit(1);
  }

  let failed = 0;

  if (postPlan.length) {
    const importer = resolve(HERE, "../mig1/import.mjs");
    for (const p of postPlan) {
      console.log(`\n== post ${p.legacyId}`);
      const cmdArgs = [
        importer,
        "--url",
        URL_,
        "--source",
        join(tmp, "_docs"),
        "--match",
        p.legacyId,
        "--match-exact",
        `--rewrite=${REWRITE}`,
        ...(FORCE ? ["--force"] : []),
      ];
      const r = spawnSync(process.execPath, cmdArgs, { stdio: "inherit" });
      if (r.status !== 0) failed++;
    }
  }

  if (galleryPlan.length) {
    const galleryImporter = resolve(HERE, "../mig3/import.mjs");
    console.log(`\n== gallery (${galleryPlan.length} changed item(s))`);
    const cmdArgs = [
      galleryImporter,
      "--url",
      URL_,
      "--only",
      "gallery",
      "--source",
      tmp,
      ...(UPDATE_GALLERY ? ["--update"] : []),
    ];
    const r = spawnSync(process.execPath, cmdArgs, { stdio: "inherit" });
    if (r.status !== 0) failed++;
  }

  if (failed) {
    console.error(`${failed} import step(s) failed`);
    process.exitCode = 1;
  } else if (BUMP && REAL_WRITE) {
    bump();
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
