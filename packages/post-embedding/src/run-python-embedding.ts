import { spawn } from "node:child_process";
import path from "node:path";
import { resolveModel } from "./client.ts";
import { findRepoRoot } from "./find-repo-root.ts";
import type { EmbeddingOptions } from "./types.ts";

export async function runPythonEmbedding(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  const repoRoot = findRepoRoot();
  const model = resolveModel(options);
  const uvBin = process.env.UV_BIN ?? "uv";

  return new Promise((resolve, reject) => {
    const child = spawn(
      uvBin,
      ["run", "--package", "embedding", "embed-text", "-", "--model", model],
      {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

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
            stderr.trim() ||
              `Failed to run embedding via ${path.join("uv", "run")} (exit ${code})`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()) as number[]);
      } catch {
        reject(new Error(`Invalid embedding JSON: ${stdout.trim()}`));
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}
