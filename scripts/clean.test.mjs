// node --test scripts/clean.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clean, listTargets } from "./clean.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "clean-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const p of [
    ".astro",
    "apps/web/dist",
    "apps/web/dist-e2e",
    "apps/web/.wrangler",
    "apps/admin/dist",
    "apps/web/node_modules",
    "apps/web/.emdash",
    "packages/lib/dist",
    "target",
    "supabase/.temp",
  ]) {
    mkdirSync(join(root, p), { recursive: true });
    writeFileSync(join(root, p, "f"), "x");
  }
  writeFileSync(join(root, "apps/web/.env"), "SECRET=1");
  return root;
}

test("lists only build output at root and in apps/*", () => {
  const root = fixture();
  const rel = listTargets(root).map((p) => p.slice(root.length + 1));
  assert.deepEqual(rel, [
    ".astro",
    "apps/admin/dist",
    "apps/web/dist",
    "apps/web/dist-e2e",
    "apps/web/.wrangler",
  ]);
});

test("dry run removes nothing", () => {
  const root = fixture();
  clean(root, { dryRun: true, log: () => {} });
  assert.ok(existsSync(join(root, "apps/web/dist")));
});

test("clean removes output and keeps everything else", () => {
  const root = fixture();
  clean(root, { log: () => {} });
  for (const p of [
    ".astro",
    "apps/web/dist",
    "apps/web/dist-e2e",
    "apps/web/.wrangler",
    "apps/admin/dist",
  ]) {
    assert.ok(!existsSync(join(root, p)), p);
  }
  for (const p of [
    "apps/web/.env",
    "apps/web/node_modules",
    "apps/web/.emdash",
    "packages/lib/dist",
    "target",
    "supabase/.temp",
  ]) {
    assert.ok(existsSync(join(root, p)), p);
  }
});

test("refuses a git-tracked target", () => {
  const root = fixture();
  execFileSync("git", ["add", "-f", "apps/admin/dist/f"], { cwd: root });
  assert.throws(() => clean(root, { log: () => {} }), /git-tracked.*apps\/admin\/dist/);
  assert.ok(existsSync(join(root, "apps/web/dist")));
});
