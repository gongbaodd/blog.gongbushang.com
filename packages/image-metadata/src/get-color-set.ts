import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Vibrant } from "node-vibrant/node";
import potrace from "potrace";
import { SobelService } from "@musical-sniffle/sobel-edge-detection";
import { findNearestTitleColor, isRemote, stripQuery } from "./color-utils.ts";
import { prepareWithDepth } from "./prepare-trace-input.ts";

export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

export interface GetColorSetOptions {
  baseDir?: string;
  relPath?: string;
  saveTraceToDir?: string;
  useDepthPrep?: boolean;
}

const POTRACE_OPTIONS = {
  turdSize: 100,
  optCurve: true,
  optTolerance: 0.4,
} as const;

export async function traceBufferToSvg(buffer: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    potrace.trace(buffer, POTRACE_OPTIONS, (err, svg) =>
      err ? reject(err) : resolve(svg),
    );
  });
}

export async function sharpSobel(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .greyscale()
    .resize({ width: 500 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sobelService = new SobelService();
  const { width, channels, height } = info;
  const { imageData: detected } = sobelService.applySobel(
    new Uint8ClampedArray(data.buffer),
    width,
    height,
    channels,
  );

  for (let i = 0; i < detected.length; i += 4) {
    detected[i] = 255 - detected[i];
    detected[i + 1] = 255 - detected[i + 1];
    detected[i + 2] = 255 - detected[i + 2];
  }

  return sharp(detected, { raw: { channels: 4, height, width } })
    .normalize()
    .png()
    .toBuffer();
}

export async function getColorSet(
  imagePathOrUrl: string,
  options: GetColorSetOptions = {},
): Promise<ColorSet> {
  const {
    baseDir = process.cwd(),
    relPath,
    saveTraceToDir,
    useDepthPrep = false,
  } = options;

  let bufferForColor: Buffer;
  let buffer: Buffer;

  if (isRemote(imagePathOrUrl)) {
    const res = await fetch(imagePathOrUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${imagePathOrUrl}: ${res.status}`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
    bufferForColor = await sharp(buffer).png().toBuffer();
  } else {
    let p = imagePathOrUrl;
    if (p.startsWith("/@fs/")) p = p.slice("/@fs/".length);
    p = stripQuery(p);
    const abs = path.isAbsolute(p) ? p : path.resolve(baseDir, p);
    buffer = await fs.readFile(abs);
    bufferForColor = await sharp(buffer).png().toBuffer();
  }

  const traceInput = useDepthPrep
    ? await prepareWithDepth(bufferForColor)
    : bufferForColor;
  buffer = await sharpSobel(traceInput);

  const palette = await Vibrant.from(bufferForColor).getPalette();

  const trace = await traceBufferToSvg(buffer);

  if (relPath && saveTraceToDir) {
    await fs.mkdir(saveTraceToDir, { recursive: true });
    const svgFileName = relPath.replace(/\//g, "-") + ".svg";
    const svgPath = path.join(saveTraceToDir, svgFileName);
    await fs.writeFile(svgPath, trace, "utf-8");
  }

  return {
    bgColor: palette.Muted?.hex ?? "",
    titleColor: palette.Vibrant?.hex
      ? findNearestTitleColor(palette.Vibrant.hex)
      : "",
  };
}
