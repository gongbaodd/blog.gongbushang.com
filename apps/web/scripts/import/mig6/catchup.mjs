#!/usr/bin/env node
/**
 * MIG-6: content catch-up. Legacy posts are still authored on master (content submodule); this finds
 * what changed between the submodule commit pinned by HEAD and the one pinned by --ref, and imports it
 * with the MIG-1 importer.
 *
 *   pnpm --filter web content:catchup -- [--ref origin/master] [--dry-run] [--bump]
 *   pnpm --filter web content:catchup -- --write --url http://127.0.0.1:4322 [--ref ...] [--bump] [--force]
 *
 * Without --write it only prints the plan (no admin needed). Deleted posts are reported, never deleted.
 * --bump checks the submodule out at the target commit and stages the pointer (no commit).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classify, importable, legacyIdOf, offCloudinary, parseNameStatus } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../../..");
const SUB = join(REPO, "src/content");
const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();

const REF = opt("--ref", "origin/master");
const URL_ = opt("--url", process.env.EMDASH_URL);
const WRITE = flag("--write");
const DRY = flag("--dry-run") || !WRITE;

const BUMP = flag("--bump");
if (BUMP && !WRITE) {
  console.error("--bump needs --write (it only runs after a successful import)");
  process.exit(2);
}
const REAL_WRITE = WRITE && !flag("--dry-run");
let base, target;
try {
  base = git(REPO, "rev-parse", "HEAD:src/content");
  target = git(REPO, "rev-parse", `${REF}:src/content`);
} catch {
  console.error(`cannot resolve ${REF}:src/content (bad --ref? try git fetch)`);
  process.exit(1);
}
console.log(`ref ${REF}\nbase   ${base}\ntarget ${target}`);

let rows = [];
if (base !== target) {
  rows = parseNameStatus(git(SUB, "diff", "--name-status", "-M", base, target, "--", "_docs"));
}
const c = classify(rows);
const show = (label, list) => {
  console.log(`${label}: ${list.length}`);
  for (const r of list) console.log(`  ${r.path}${r.from ? `  (from ${r.from})` : ""}`);
};
show("added", c.added);
show("modified", c.modified);
show("renamed", c.renamed);
for (const r of c.renamed) console.warn(`WARN renamed: old legacy id ${legacyIdOf(r.from)} stays in EmDash as an orphan (report only, delete in the admin if wanted)`);
show("deleted (report only, never removed from EmDash)", c.deleted);

const paths = importable(c);
if (!paths.length) {
  console.log("nothing to import");
  if (BUMP && REAL_WRITE && base !== target) bump();
  process.exit(0);
}

// Image guard, on the target commit's content.
const files = paths.map((p) => ({ path: p, text: git(SUB, "show", `${target}:_docs/${p}`) }));
const bad = offCloudinary(files);
if (bad.length) {
  console.error("\nimages not on res.cloudinary.com (rehost first, nothing written):");
  for (const b of bad) console.error(`  ${b.path}  ${b.url}`);
  process.exit(3);
}
console.log("image guard: all images on res.cloudinary.com");

function bump() {
  git(SUB, "checkout", "--quiet", target);
  git(REPO, "add", "src/content");
  console.log(`submodule at ${target.slice(0, 8)}, pointer staged (not committed)`);
}

console.log(`\nplan: import ${paths.length} post(s): ${paths.map(legacyIdOf).join(", ")}`);
if (DRY) {
  console.log("dry run: nothing written. Add --write --url <admin> to import.");
  process.exit(0);
}
if (!URL_) {
  console.error("--write needs --url <emdash admin url> (or EMDASH_URL)");
  process.exit(2);
}

// Source = the target commit's _docs, exported to a temp dir (no need to move the submodule).
const tmp = mkdtempSync(join(tmpdir(), "mig6-"));
try {
  execFileSync("sh", ["-c", `git -C "${SUB}" archive ${target} _docs | tar -x -C "${tmp}"`]);
  const importer = join(HERE, "../mig1/import.mjs");
  let failed = 0;
  for (const p of paths) {
    const id = legacyIdOf(p);
    console.log(`\n== ${id}`);
    const r = spawnSync(
      process.execPath,
      [importer, "--url", URL_, "--source", join(tmp, "_docs"), "--match", id, "--match-exact", ...(flag("--dry-run") ? ["--dry-run"] : []), ...(flag("--force") ? ["--force"] : [])],
      { stdio: "inherit" },
    );
    if (r.status !== 0) failed++;
  }
  if (failed) {
    console.error(`${failed} import(s) failed`);
    process.exitCode = 1;
  } else if (BUMP && REAL_WRITE) bump();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
