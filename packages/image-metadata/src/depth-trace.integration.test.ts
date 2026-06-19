/**
 * Depth trace integration tests (requires ONNX model).
 *
 *   pnpm depth:sync && DEPTH_TRACE_TEST=1 pnpm vitest run packages/image-metadata/src/depth-trace.integration.test.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
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

describe.runIf(process.env.DEPTH_TRACE_TEST === "1")(
  "depth trace pipeline (integration)",
  () => {
    test.each(FIXTURES)(
      "produces valid baseline and depth SVGs for %s",
      async (fixture) => {
        const stem = path.basename(fixture, path.extname(fixture));
        const input = await fs.readFile(path.join(fixturesDir, fixture));
        const png = await normalizeToPng(input);

        const baselineSvg = await traceBufferToSvg(await sharpSobel(png));
        const depthSvg = await traceBufferToSvg(
          await sharpSobel(await prepareWithDepth(png)),
        );

        assertValidSvg(baselineSvg, `${stem} baseline`);
        assertValidSvg(depthSvg, `${stem} depth`);

        await expect(baselineSvg).toMatchFileSnapshot(
          `./__snapshots__/${stem}-baseline.svg`,
        );
        await expect(depthSvg).toMatchFileSnapshot(
          `./__snapshots__/${stem}-depth.svg`,
        );
      },
      120_000,
    );
  },
);
