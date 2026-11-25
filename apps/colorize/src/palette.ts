/**
 * Pure-TypeScript palette extraction (MMCQ median-cut + Vibrant/Muted swatch
 * scoring) and CIEDE2000 Lab color matching against `TITLE_COLOR_MAP`.
 *
 * Matches the output contract of `packages/image-metadata/src/get-color-set.ts`
 * and `packages/image-metadata/src/color-utils.ts` with zero external dependencies.
 */

export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

export type RgbTuple = readonly [number, number, number];
export type LabTuple = readonly [number, number, number];
export type HslTuple = readonly [number, number, number];

const MANTINE_PREFIX = "--mantine-color-";

/**
 * Mirrors `packages/consts/colors.ts` (`TITLE_COLOR_MAP`).
 */
export const TITLE_COLOR_MAP: Readonly<Record<string, string>> = Object.entries({
  "pink-2": "#fcc2d7",
  "indigo-2": "#bac8ff",
  "yellow-2": "#ffec99",
  "green-4": "#69db7c",
  "orange-2": "#ffd8a8",
  "teal-2": "#96f2d7",
  "violet-2": "#d0bfff",
  "cyan-2": "#99e9f2",
  "grape-3": "#e599f7",
  "blue-2": "#a5d8ff",
  "lime-2": "#d8f5a2",
  "dark-8": "#1f1f1f",
  "red-3": "#ffa8a8",
  "gray-2": "#e9ecef",
}).reduce<Record<string, string>>((acc, [name, value]) => {
  acc[MANTINE_PREFIX + name] = value;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// Color conversion & CIEDE2000 (matching chroma-js D65 sRGB -> Lab -> deltaE)
// ---------------------------------------------------------------------------

const D65_XN = 0.95047;
const D65_YN = 1.0;
const D65_ZN = 1.08883;
const LAB_KE = 216.0 / 24389.0;
const LAB_KK = 24389.0 / 27.0;
const POW_25_7 = 25 ** 7;

export function hexToRgb(hex: string): RgbTuple {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0]! + clean[0]!, 16);
    const g = Number.parseInt(clean[1]! + clean[1]!, 16);
    const b = Number.parseInt(clean[2]! + clean[2]!, 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      throw new Error(`Invalid hex color: ${hex}`);
    }
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      throw new Error(`Invalid hex color: ${hex}`);
    }
    return [r, g, b];
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): LabTuple {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  // sRGB -> CIE XYZ (D65)
  const x = rl * 0.4124564390896922 + gl * 0.357576077643909 + bl * 0.18043748326639894;
  const y = rl * 0.21267285140562253 + gl * 0.715152155287818 + bl * 0.07217499330655958;
  const z = rl * 0.0193338955823293 + gl * 0.11919202588130297 + bl * 0.9503040785363679;

  const xr = x / D65_XN;
  const yr = y / D65_YN;
  const zr = z / D65_ZN;

  const fx = xr > LAB_KE ? Math.cbrt(xr) : (LAB_KK * xr + 16.0) / 116.0;
  const fy = yr > LAB_KE ? Math.cbrt(yr) : (LAB_KK * yr + 16.0) / 116.0;
  const fz = zr > LAB_KE ? Math.cbrt(zr) : (LAB_KK * zr + 16.0) / 116.0;

  return [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)];
}

export function deltaE2000(lab1: LabTuple, lab2: LabTuple): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad2deg = (rad: number) => (180 * rad) / Math.PI;
  const deg2rad = (deg: number) => (Math.PI * deg) / 180;

  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const avgC7 = avgC ** 7;
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + POW_25_7)));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;

  const atan1 = rad2deg(Math.atan2(b1, a1p));
  const atan2Val = rad2deg(Math.atan2(b2, a2p));
  const h1p = atan1 >= 0 ? atan1 : atan1 + 360;
  const h2p = atan2Val >= 0 ? atan2Val : atan2Val + 360;

  const avgHp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const T =
    1 -
    0.17 * Math.cos(deg2rad(avgHp - 30)) +
    0.24 * Math.cos(deg2rad(2 * avgHp)) +
    0.32 * Math.cos(deg2rad(3 * avgHp + 6)) -
    0.2 * Math.cos(deg2rad(4 * avgHp - 63));

  let deltaHpDeg = h2p - h1p;
  if (Math.abs(deltaHpDeg) > 180) {
    deltaHpDeg = h2p <= h1p ? deltaHpDeg + 360 : deltaHpDeg - 360;
  }
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(deltaHpDeg) / 2);

  const deltaL = L2 - L1;
  const deltaCp = C2p - C1p;
  const avgLMinus50Sq = (avgL - 50) ** 2;
  const sl = 1 + (0.015 * avgLMinus50Sq) / Math.sqrt(20 + avgLMinus50Sq);
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * T;

  const deltaTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const avgCp7 = avgCp ** 7;
  const Rc = 2 * Math.sqrt(avgCp7 / (avgCp7 + POW_25_7));
  const Rt = -Rc * Math.sin(2 * deg2rad(deltaTheta));

  const dL = deltaL / sl;
  const dC = deltaCp / sc;
  const dH = deltaHp / sh;
  const result = Math.sqrt(dL * dL + dC * dC + dH * dH + Rt * dC * dH);
  return Math.max(0, Math.min(100, result));
}

const PRECOMPUTED_TITLE_COLORS: ReadonlyArray<{ name: string; lab: LabTuple }> = Object.entries(
  TITLE_COLOR_MAP,
).map(([name, hex]) => {
  const [r, g, b] = hexToRgb(hex);
  return { name, lab: rgbToLab(r, g, b) };
});

export function findNearestTitleColor(hexColor: string): string {
  const [r, g, b] = hexToRgb(hexColor);
  const targetLab = rgbToLab(r, g, b);
  let bestDistance = Infinity;
  let nearest = "";
  for (const candidate of PRECOMPUTED_TITLE_COLORS) {
    const d = deltaE2000(targetLab, candidate.lab);
    if (d < bestDistance) {
      bestDistance = d;
      nearest = candidate.name;
    }
  }
  return nearest;
}

export function rgbToHsl(r: number, g: number, b: number): HslTuple {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [h / 6, s, l];
}

// ---------------------------------------------------------------------------
// Quantization (5-bit RGB bucketing + MMCQ median-cut) & Swatch scoring
// ---------------------------------------------------------------------------

interface ColorBucket {
  r5: number;
  g5: number;
  b5: number;
  sumR: number;
  sumG: number;
  sumB: number;
  count: number;
}

interface VBox {
  buckets: ColorBucket[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
  count: number;
}

export interface Swatch {
  r: number;
  g: number;
  b: number;
  hex: string;
  hsl: HslTuple;
  population: number;
}

function makeVBox(buckets: ColorBucket[]): VBox {
  let rMin = 31;
  let rMax = 0;
  let gMin = 31;
  let gMax = 0;
  let bMin = 31;
  let bMax = 0;
  let count = 0;

  for (const bk of buckets) {
    if (bk.r5 < rMin) rMin = bk.r5;
    if (bk.r5 > rMax) rMax = bk.r5;
    if (bk.g5 < gMin) gMin = bk.g5;
    if (bk.g5 > gMax) gMax = bk.g5;
    if (bk.b5 < bMin) bMin = bk.b5;
    if (bk.b5 > bMax) bMax = bk.b5;
    count += bk.count;
  }

  return { buckets, rMin, rMax, gMin, gMax, bMin, bMax, count };
}

function vboxVolume(box: VBox): number {
  return (box.rMax - box.rMin + 1) * (box.gMax - box.gMin + 1) * (box.bMax - box.bMin + 1);
}

function splitVBox(box: VBox): [VBox, VBox] | null {
  if (box.buckets.length <= 1) return null;

  const rSpan = box.rMax - box.rMin;
  const gSpan = box.gMax - box.gMin;
  const bSpan = box.bMax - box.bMin;

  if (rSpan >= gSpan && rSpan >= bSpan) {
    box.buckets.sort((a, b) => a.r5 - b.r5);
  } else if (gSpan >= rSpan && gSpan >= bSpan) {
    box.buckets.sort((a, b) => a.g5 - b.g5);
  } else {
    box.buckets.sort((a, b) => a.b5 - b.b5);
  }

  const half = box.count / 2;
  let acc = 0;
  let splitIdx = 1;
  for (let i = 0; i < box.buckets.length - 1; i++) {
    acc += box.buckets[i]!.count;
    if (acc >= half) {
      splitIdx = i + 1;
      break;
    }
  }

  const left = box.buckets.slice(0, splitIdx);
  const right = box.buckets.slice(splitIdx);
  if (left.length === 0 || right.length === 0) return null;
  return [makeVBox(left), makeVBox(right)];
}

function quantizeRgba(rgba: Uint8ClampedArray, maxColors = 64): Swatch[] {
  const collectBuckets = (ignoreNearWhite: boolean): ColorBucket[] => {
    const map = new Map<number, ColorBucket>();
    for (let i = 0; i + 3 < rgba.byteLength; i += 4) {
      const a = rgba[i + 3]!;
      if (a < 125) continue;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      if (ignoreNearWhite && r > 250 && g > 250 && b > 250) continue;

      const r5 = r >>> 3;
      const g5 = g >>> 3;
      const b5 = b >>> 3;
      const key = (r5 << 10) | (g5 << 5) | b5;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { r5, g5, b5, sumR: 0, sumG: 0, sumB: 0, count: 0 };
        map.set(key, bucket);
      }
      bucket.sumR += r;
      bucket.sumG += g;
      bucket.sumB += b;
      bucket.count++;
    }
    return Array.from(map.values());
  };

  let buckets = collectBuckets(true);
  if (buckets.length === 0) {
    buckets = collectBuckets(false);
  }
  if (buckets.length === 0) {
    return [];
  }

  const boxes: VBox[] = [makeVBox(buckets)];
  const popPhaseLimit = Math.ceil(maxColors * 0.75);

  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestScore = -1;
    const useVolumeWeight = boxes.length >= popPhaseLimit;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.buckets.length <= 1) continue;
      const score = useVolumeWeight ? box.count * vboxVolume(box) : box.count;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const target = boxes[bestIdx]!;
    const split = splitVBox(target);
    if (!split) break;
    boxes.splice(bestIdx, 1, split[0], split[1]);
  }

  return boxes.map((box) => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (const bk of box.buckets) {
      sumR += bk.sumR;
      sumG += bk.sumG;
      sumB += bk.sumB;
    }
    const r = Math.round(sumR / box.count);
    const g = Math.round(sumG / box.count);
    const b = Math.round(sumB / box.count);
    return {
      r,
      g,
      b,
      hex: rgbToHex(r, g, b),
      hsl: rgbToHsl(r, g, b),
      population: box.count,
    };
  });
}

interface SwatchTarget {
  minL: number;
  targetL: number;
  maxL: number;
  minS: number;
  targetS: number;
  maxS: number;
}

const TARGET_VIBRANT: SwatchTarget = {
  minL: 0.3,
  targetL: 0.5,
  maxL: 0.7,
  minS: 0.35,
  targetS: 1.0,
  maxS: 1.0,
};
const TARGET_LIGHT_VIBRANT: SwatchTarget = {
  minL: 0.55,
  targetL: 0.74,
  maxL: 1.0,
  minS: 0.35,
  targetS: 1.0,
  maxS: 1.0,
};
const TARGET_DARK_VIBRANT: SwatchTarget = {
  minL: 0.0,
  targetL: 0.26,
  maxL: 0.45,
  minS: 0.35,
  targetS: 1.0,
  maxS: 1.0,
};
const TARGET_MUTED: SwatchTarget = {
  minL: 0.3,
  targetL: 0.5,
  maxL: 0.7,
  minS: 0.0,
  targetS: 0.3,
  maxS: 0.4,
};
const TARGET_LIGHT_MUTED: SwatchTarget = {
  minL: 0.55,
  targetL: 0.74,
  maxL: 1.0,
  minS: 0.0,
  targetS: 0.3,
  maxS: 0.4,
};
const TARGET_DARK_MUTED: SwatchTarget = {
  minL: 0.0,
  targetL: 0.26,
  maxL: 0.45,
  minS: 0.0,
  targetS: 0.3,
  maxS: 0.4,
};

const WEIGHT_SATURATION = 3;
const WEIGHT_LUMA = 6.5;
const WEIGHT_POPULATION = 0.5;

function scoreSwatch(swatch: Swatch, target: SwatchTarget, maxPopulation: number): number {
  const [, s, l] = swatch.hsl;
  const satScore = (1 - Math.abs(s - target.targetS)) * WEIGHT_SATURATION;
  const lumaScore = (1 - Math.abs(l - target.targetL)) * WEIGHT_LUMA;
  const popScore = (swatch.population / maxPopulation) * WEIGHT_POPULATION;
  return satScore + lumaScore + popScore;
}

function findBestSwatch(
  swatches: Swatch[],
  target: SwatchTarget,
  maxPopulation: number,
  used: Set<Swatch>,
  strict: boolean,
): Swatch | undefined {
  let best: Swatch | undefined;
  let bestScore = -Infinity;

  for (const sw of swatches) {
    if (used.has(sw)) continue;
    const [, s, l] = sw.hsl;
    if (strict) {
      if (s < target.minS || s > target.maxS || l < target.minL || l > target.maxL) {
        continue;
      }
    }
    const score = scoreSwatch(sw, target, maxPopulation);
    if (score > bestScore) {
      bestScore = score;
      best = sw;
    }
  }
  return best;
}

export interface ExtractedPalette {
  vibrant?: Swatch;
  lightVibrant?: Swatch;
  darkVibrant?: Swatch;
  muted?: Swatch;
  lightMuted?: Swatch;
  darkMuted?: Swatch;
  dominant?: Swatch;
}

export function extractPalette(rgba: Uint8ClampedArray): ExtractedPalette {
  const swatches = quantizeRgba(rgba, 64);
  if (swatches.length === 0) return {};

  let maxPopulation = 1;
  let dominant = swatches[0]!;
  for (const sw of swatches) {
    if (sw.population > maxPopulation) maxPopulation = sw.population;
    if (sw.population > dominant.population) dominant = sw;
  }

  const used = new Set<Swatch>();
  const pick = (target: SwatchTarget): Swatch | undefined => {
    const sw = findBestSwatch(swatches, target, maxPopulation, used, true);
    if (sw) used.add(sw);
    return sw;
  };

  // Pick in node-vibrant's priority order
  const vibrant = pick(TARGET_VIBRANT);
  const lightVibrant = pick(TARGET_LIGHT_VIBRANT);
  const darkVibrant = pick(TARGET_DARK_VIBRANT);
  const muted = pick(TARGET_MUTED);
  const lightMuted = pick(TARGET_LIGHT_MUTED);
  const darkMuted = pick(TARGET_DARK_MUTED);

  return { vibrant, lightVibrant, darkVibrant, muted, lightMuted, darkMuted, dominant };
}

/**
 * Extract `{ bgColor, titleColor }` from decoded RGBA pixel data.
 *
 * - `bgColor` prefers `Muted`, falling back to `DarkMuted` / `LightMuted` / dominant swatch.
 * - `titleColor` prefers `Vibrant`, falling back to `LightVibrant` / `DarkVibrant` / dominant swatch,
 *   then mapped to the nearest Mantine CSS variable in `TITLE_COLOR_MAP` via CIEDE2000.
 */
export function extractColorSet(rgba: Uint8ClampedArray): ColorSet {
  const palette = extractPalette(rgba);
  if (!palette.dominant) {
    return { bgColor: "", titleColor: "" };
  }

  const bgSwatch =
    palette.muted ?? palette.darkMuted ?? palette.lightMuted ?? palette.dominant;
  const titleSwatch =
    palette.vibrant ?? palette.lightVibrant ?? palette.darkVibrant ?? palette.dominant;

  return {
    bgColor: bgSwatch.hex,
    titleColor: findNearestTitleColor(titleSwatch.hex),
  };
}
