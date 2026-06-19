/**
 * Depth trace pipeline tests (fast, no ONNX model).
 *
 * Full integration test (ONNX depth model):
 *   pnpm depth:sync && DEPTH_TRACE_TEST=1 pnpm vitest run packages/image-metadata/src/depth-trace.integration.test.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";

const runDepthEstimationMock = vi.fn(
  async (_inputPath: string, outputPath: string) => {
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .png()
      .toFile(outputPath);
  },
);

vi.mock("./run-depth-estimation.ts", () => ({
  runDepthEstimation: (...args: unknown[]) => runDepthEstimationMock(...args),
}));

import { sharpSobel, traceBufferToSvg } from "./get-color-set.ts";
import { prepareWithDepth } from "./prepare-trace-input.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures");

const FIXTURES = [
  "week-24-graduation.jpg",
  "deep-knowledge-tracing.png",
  "battery.png",
] as const;

const MIN_SVG_BYTES = 1024;
const MAX_SVG_BYTES = 512 * 1024;

async function normalizeToPng(inputBuffer: Buffer): Promise<Buffer> {
  return sharp(inputBuffer).png().toBuffer();
}

function assertValidSvg(svg: string, label: string): void {
  expect(svg.length, `${label} should be non-empty`).toBeGreaterThan(0);
  expect(svg, `${label} should contain svg root`).toContain("<svg");
  expect(svg.length, `${label} byte length`).toBeGreaterThanOrEqual(MIN_SVG_BYTES);
  expect(svg.length, `${label} byte length`).toBeLessThanOrEqual(MAX_SVG_BYTES);
}

describe("prepareWithDepth (mocked)", () => {
  test("returns depth PNG buffer from runDepthEstimation output", async () => {
    runDepthEstimationMock.mockClear();
    const input = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const depthBuffer = await prepareWithDepth(input);

    expect(runDepthEstimationMock).toHaveBeenCalledOnce();
    expect(depthBuffer.length).toBeGreaterThan(0);
    const meta = await sharp(depthBuffer).metadata();
    expect(meta.format).toBe("png");
  });
});

describe("baseline trace pipeline", () => {
  test.each(FIXTURES)("produces valid SVG for %s", async (fixture) => {
    const input = await fs.readFile(path.join(fixturesDir, fixture));
    const png = await normalizeToPng(input);
    const sobelBuffer = await sharpSobel(png);
    const svg = await traceBufferToSvg(sobelBuffer);
    assertValidSvg(svg, fixture);
  });
});
