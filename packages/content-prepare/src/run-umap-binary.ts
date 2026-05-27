import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { findRepoRoot } from "./cli.ts";
import { UMAP_2D_CONFIG } from "./umap-params.ts";

export interface UmapBinaryDeps {
  findRepoRoot: () => Promise<string>;
  access: (targetPath: string) => Promise<void>;
  spawn: (
    command: string,
    args: readonly string[],
    options: { cwd: string; stdio: ["pipe", "pipe", "pipe"] },
  ) => ChildProcessWithoutNullStreams;
}

const defaultDeps: UmapBinaryDeps = {
  findRepoRoot,
  access,
  spawn,
};

function resolveUmapBinary(repoRoot: string): string {
  return process.env.UMAP_BIN ?? path.join(repoRoot, "target/release/umap");
}

export async function runUmapBinary(
  embeddings: number[][],
  deps: UmapBinaryDeps = defaultDeps,
): Promise<[number, number][]> {
  const repoRoot = await deps.findRepoRoot();
  const umapBin = resolveUmapBinary(repoRoot);

  try {
    await deps.access(umapBin);
  } catch {
    throw new Error(
      `UMAP binary not found at ${umapBin}. Run \`pnpm umap:build\` first.`,
    );
  }

  return new Promise((resolve, reject) => {
    const child = deps.spawn(umapBin, [], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `Failed to run UMAP binary (exit ${code ?? "unknown"})`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as {
          coordinates?: [number, number][];
        };
        if (!Array.isArray(parsed.coordinates)) {
          reject(new Error(`Invalid UMAP JSON: ${stdout.trim()}`));
          return;
        }
        resolve(parsed.coordinates);
      } catch {
        reject(new Error(`Invalid UMAP JSON: ${stdout.trim()}`));
      }
    });

    child.stdin.write(
      JSON.stringify({ embeddings, config: UMAP_2D_CONFIG }),
    );
    child.stdin.end();
  });
}
