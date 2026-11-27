// Colour set only: the palette half of `getColorSet` without the Sobel + potrace trace.
// Same input handling and the same Vibrant call as `getColorSet`, so the colours are identical. Used by apps/web derive.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Vibrant } from "node-vibrant/node";
import { findNearestTitleColor, isRemote, stripQuery } from "./color-utils.ts";

export interface PaletteColorSet {
  bgColor: string;
  titleColor: string;
}

export async function getPaletteColorSet(
  imagePathOrUrl: string,
  options: { baseDir?: string } = {},
): Promise<PaletteColorSet> {
  const { baseDir = process.cwd() } = options;
  let buffer: Buffer;
  if (isRemote(imagePathOrUrl)) {
    const res = await fetch(imagePathOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${imagePathOrUrl}: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    let p = imagePathOrUrl;
    if (p.startsWith("/@fs/")) p = p.slice("/@fs/".length);
    p = stripQuery(p);
    buffer = await fs.readFile(path.isAbsolute(p) ? p : path.resolve(baseDir, p));
  }
  const bufferForColor = await sharp(buffer).png().toBuffer();
  const palette = await Vibrant.from(bufferForColor).getPalette();
  return {
    bgColor: palette.Muted?.hex ?? "",
    titleColor: palette.Vibrant?.hex ? findNearestTitleColor(palette.Vibrant.hex) : "",
  };
}
