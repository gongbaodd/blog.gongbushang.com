import fs from "node:fs";
import path from "node:path";

/** Walks up from `startDir` to the directory that holds `pnpm-workspace.yaml` (the monorepo root). */
export function findRepoRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find the repo root: no pnpm-workspace.yaml in ${startDir} or any parent directory.`,
      );
    }
    dir = parent;
  }
}
