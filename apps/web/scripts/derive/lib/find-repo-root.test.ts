import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { findRepoRoot } from "./find-repo-root.ts";

const realRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const tmpDirs: string[] = [];

function makeTmp(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "find-root-")));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("findRepoRoot", () => {
  test("finds the directory with pnpm-workspace.yaml from a nested dir", () => {
    const root = makeTmp();
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    const nested = path.join(root, "apps", "web");
    fs.mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
    expect(findRepoRoot(root)).toBe(root);
  });

  test("resolves the real repo root from apps/web", () => {
    expect(findRepoRoot(path.join(realRoot, "apps", "web"))).toBe(realRoot);
  });

  test("throws a clear error when no workspace root exists", () => {
    const dir = makeTmp();
    expect(() => findRepoRoot(dir)).toThrow(/no pnpm-workspace\.yaml/);
  });
});
