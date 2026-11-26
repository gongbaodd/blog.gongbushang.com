#!/usr/bin/env node
/**
 * MIG-7: master content catch-up helper (posts + gallery + MIG-2 rewrite-map aware).
 *
 * Extends the MIG-6 workflow without modifying `mig6/*`:
 *   - Supports `--base <sha>` and `--target <sha>` so an environment on an older content baseline
 *     (e.g. `4893092`) can catch up after git HEAD bumps `src/content`.
 *   - Uses `globLegacyId` (`github-slugger` rules) so mixed-case/punctuated filenames match
 *     `mig1/import.mjs --match-exact` reliably.
 *   - The image guard accepts URLs already hosted by MIG-2 (`mig2/rewrite-map.json` + `mig2/upload-result.json`).
 *   - Detects `_gallery/*.json` changes and invokes `mig3/import.mjs --only gallery` on `--write`.
 *
 * Review fixes (MIG-7):
 *   - `--write` needs an explicit `--rewrite map|none`; there is no default. `map` writes Cloudinary URLs
 *     for MIG-2 hosted body images, `none` keeps the legacy body URLs. Pick the mode that matches the
 *     target database (MIG-7.md "Choosing --rewrite").
 *   - The target admin host is printed; `--write` to a non-loopback admin refuses without `--yes-production`.
 *   - `--bump` refuses unless HEAD:src/content and the submodule checkout both sit at `--base` (clean).
 *
 * Usage:
 *   node apps/web/scripts/import/mig7/catchup.mjs [--ref origin/master] [--base <sha>] [--target <sha>] [--rewrite map|none] [--dry-run]
 *   node apps/web/scripts/import/mig7/catchup.mjs --write --rewrite map|none --url http://127.0.0.1:4322 [--base <sha>] [--target <sha>]
 *        [--yes-production] [--force] [--update-gallery] [--bump]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bumpPreconditions,
  checkGalleryImages,
  checkPostImages,
  describeTarget,
  galleryLegacyId,
  gallerySlug,
  globLegacyId,
  importableGallery,
  importablePosts,
  parseContentDiff,
  slugifySegment,
  validateOptions,
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
  --rewrite <map|none>    REQUIRED with --write. map: MIG-2 hosted body images are written as Cloudinary URLs;
                          none: the body keeps its legacy URLs. Match the target DB (MIG-7.md "Choosing --rewrite").
  --yes-production        Allow --write to a non-loopback admin URL (anything but localhost/127.0.0.1/[::1])
  --force                 Forward --force to mig1/import.mjs (overwrite admin-edited posts)
  --update-gallery        Forward --update to mig3/import.mjs (update modified gallery items)
  --bump                  After a successful --write, check out src/content at target and stage the gitlink.
                          Refuses unless HEAD:src/content and the submodule checkout are both at --base (clean).
  -h, --help              Show this help and exit 0

Auth (forwarded to the importers): EMDASH_TOKEN (bearer API token) and/or EMDASH_HEADERS
("Name: Value" lines, e.g. Cloudflare Access service-token headers). Without either, a localhost
admin is reached through the dev bypass (astro dev only).

Exit codes:
  0  Success (or dry-run passed, or --help)
  1  Git resolution or import failure
  2  Invalid CLI arguments or refused (production guard, --bump preconditions)
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
const WRITE = flag("--write") && !flag("--dry-run");
const DRY = !WRITE;
const BUMP = flag("--bump");
const FORCE = flag("--force");
const UPDATE_GALLERY = flag("--update-gallery");
const YES_PRODUCTION = flag("--yes-production");
const REWRITE = opt("--rewrite");

const optionErrors = validateOptions({ write: WRITE, rewrite: REWRITE, url: URL_, yesProduction: YES_PRODUCTION, bump: BUMP });
if (optionErrors.length) {
  for (const e of optionErrors) console.error(e);
  process.exit(2);
}

const uploadResultPath = join(MIG2, "upload-result.json");
const rewriteMapPath = join(MIG2, "rewrite-map.json");
const haveMig2 = existsSync(uploadResultPath) && existsSync(rewriteMapPath);
if (REWRITE === "map" && !haveMig2) {
  console.error("--rewrite map needs apps/web/scripts/import/mig2/rewrite-map.json and upload-result.json");
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

const t = URL_ ? describeTarget(URL_) : null;
console.log(`ref     ${TARGET_OPT ? "(explicit --target)" : REF}`);
console.log(`base    ${base}`);
console.log(`target  ${target}`);
console.log(`rewrite ${REWRITE ?? "(not set; required with --write)"}`);
console.log(`admin   ${t ? `${t.host || URL_} (${t.ok ? (t.loopback ? "loopback" : "REMOTE: production guard") : t.error})` : "(none)"}`);
console.log(`mode    ${WRITE ? "WRITE" : "dry run"}`);

function bumpState() {
  return bumpPreconditions({
    headGitlink: git(REPO, "rev-parse", "HEAD:src/content"),
    subHead: git(SUB, "rev-parse", "HEAD"),
    subDirty: git(SUB, "status", "--porcelain") !== "",
    base,
    target,
  });
}

// Check --bump preconditions before importing anything, so a refused bump never follows a write.
if (BUMP) {
  const pre = bumpState();
  if (pre.errors.length) {
    console.error("--bump refused (nothing written):");
    for (const e of pre.errors) console.error(`  ${e}`);
    process.exit(2);
  }
}

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
  const pre = bumpState();
  if (pre.errors.length) {
    console.error("--bump refused (import done, gitlink NOT moved):");
    for (const e of pre.errors) console.error(`  ${e}`);
    process.exitCode = 2;
    return;
  }
  if (pre.noop) {
    console.log(`src/content already at ${target.slice(0, 8)}; nothing to bump`);
    return;
  }
  git(SUB, "checkout", "--quiet", target);
  git(REPO, "add", "src/content");
  console.log(`submodule at ${target.slice(0, 8)}, pointer staged (not committed)`);
}

if (!postPaths.length && !galleryPaths.length) {
  console.log("nothing to import");
  if (BUMP && WRITE && base !== target) bump();
  process.exit(process.exitCode ?? 0);
}

// Resolve exact github-slugger if available; fall back to pure-JS equivalent.
let slugFn = slugifySegment;
try {
  const mod = await import("github-slugger");
  if (typeof mod?.slug === "function") slugFn = mod.slug;
} catch {
  // pure-JS slugifySegment matches github-slugger@2.0.0
}

// 1. Post image guard. It always consults the MIG-2 map (when present): a MIG-2 hosted URL is safe
//    either way; --rewrite only decides whether the body is written with the Cloudinary or the legacy URL.
const rewriteMap = haveMig2 ? JSON.parse(readFileSync(rewriteMapPath, "utf8")) : null;
const uploadResult = haveMig2 ? JSON.parse(readFileSync(uploadResultPath, "utf8")) : null;

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
  `image guard: ok (posts: ${postCheck.cloudinaryDirect} direct Cloudinary, ${postCheck.rewrittenByMap.length} MIG-2 hosted; gallery: ${galleryItems.length} direct Cloudinary)`,
);
if (postCheck.rewrittenByMap.length) {
  const n = postCheck.rewrittenByMap.length;
  if (REWRITE === "map") console.log(`rewrite map: ${n} MIG-2 hosted body URL(s) will be written as Cloudinary URLs`);
  else if (REWRITE === "none") console.log(`rewrite none: ${n} MIG-2 hosted body URL(s) stay as legacy URLs in body_md`);
  else console.log(`${n} MIG-2 hosted body URL(s): Cloudinary with --rewrite map, legacy with --rewrite none`);
}

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
  console.log("\ndry run: nothing written. Add --write --rewrite <map|none> --url <admin> to import.");
  process.exit(0);
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
  } else if (BUMP) {
    bump();
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
