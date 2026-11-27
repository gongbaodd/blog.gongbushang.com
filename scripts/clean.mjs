#!/usr/bin/env node
// pnpm clean [--dry-run]
// Removes regenerable build output only: dist, dist-e2e, .astro, .wrangler
// at the repo root and in each apps/* folder. Never touches packages/*
// (packages/shiki-plantuml/dist is tracked in its submodule), .env files,
// node_modules, target/ or supabase/ state. Refuses any path git tracks.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT_DIRS = ["dist", "dist-e2e", ".astro", ".wrangler"];

export function listTargets(root) {
  const bases = [root];
  const apps = join(root, "apps");
  if (existsSync(apps)) {
    for (const name of readdirSync(apps).sort()) {
      const dir = join(apps, name);
      if (statSync(dir).isDirectory()) bases.push(dir);
    }
  }
  const targets = [];
  for (const base of bases) {
    for (const name of OUTPUT_DIRS) {
      const p = join(base, name);
      if (existsSync(p)) targets.push(p);
    }
  }
  return targets;
}

function isTracked(root, path) {
  const out = execFileSync("git", ["ls-files", "--", relative(root, path)], {
    cwd: root,
    encoding: "utf8",
  });
  return out.trim() !== "";
}

export function clean(root, { dryRun = false, log = console.log } = {}) {
  const targets = listTargets(root);
  const tracked = targets.filter((p) => isTracked(root, p));
  if (tracked.length) {
    throw new Error(
      `refusing to clean git-tracked paths: ${tracked.map((p) => relative(root, p)).join(", ")}`,
    );
  }
  if (!targets.length) log("clean: nothing to remove");
  for (const p of targets) {
    log(`${dryRun ? "would remove" : "removing"} ${relative(root, p)}`);
    if (!dryRun) rmSync(p, { recursive: true, force: true });
  }
  return targets;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  clean(root, { dryRun: process.argv.includes("--dry-run") });
}
