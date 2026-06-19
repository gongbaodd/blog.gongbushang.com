import { spawn } from "node:child_process";
import path from "node:path";
import { findRepoRoot } from "./find-repo-root.ts";

export async function runDepthEstimation(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const repoRoot = findRepoRoot();
  const uvBin = process.env.UV_BIN ?? "uv";

  return new Promise((resolve, reject) => {
    const child = spawn(
      uvBin,
      [
        "run",
        "--package",
        "depth-estimation",
        "depth-photo",
        inputPath,
        "-o",
        outputPath,
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `Failed to run depth estimation via ${path.join("uv", "run")} (exit ${code})`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}
