import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDepthEstimation } from "./run-depth-estimation.ts";

export async function prepareWithDepth(inputBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "depth-trace-"));

  try {
    const inputPath = path.join(tmpDir, "input.png");
    const outputPath = path.join(tmpDir, "depth.png");
    await fs.writeFile(inputPath, inputBuffer);
    await runDepthEstimation(inputPath, outputPath);
    return fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
