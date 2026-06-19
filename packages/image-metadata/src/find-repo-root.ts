import fs from "node:fs";
import path from "node:path";

export function findRepoRoot(startDir = process.cwd()): string {
  let dir = startDir;

  while (true) {
    const pyprojectPath = path.join(dir, "pyproject.toml");
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, "utf-8");
      if (content.includes("[tool.uv.workspace]")) {
        return dir;
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}
