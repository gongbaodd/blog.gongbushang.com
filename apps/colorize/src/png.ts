/**
 * Pure-TypeScript PNG decoder (and minimal encoder helper for tests) using the
 * Web standard Compression Streams API (`DecompressionStream("deflate")`).
 *
 * Zero external dependencies — runs natively in Cloudflare Workers and Node 20+.
 * Supports color types 0 (Grayscale), 2 (RGB), 3 (Indexed/PLTE + tRNS),
 * 4 (Grayscale+Alpha), and 6 (RGBA), filter types 0–4 (None, Sub, Up, Average, Paeth),
 * bit depths 1/2/4/8/16, and both non-interlaced and Adam7 interlaced images.
 */

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA pixel buffer (`width * height * 4` bytes). */
  data: Uint8ClampedArray;
}

export class PngDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PngDecodeError";
  }
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 4_000_000;
const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024;

// Adam7 interlace pass parameters: [xStart, yStart, xStep, yStep]
const ADAM7_PASSES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

function channelsForColorType(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1; // Grayscale
    case 2:
      return 3; // RGB
    case 3:
      return 1; // Indexed (PLTE)
    case 4:
      return 2; // Grayscale + Alpha
    case 6:
      return 4; // RGBA
    default:
      throw new PngDecodeError(`Unsupported PNG color type: ${colorType}`);
  }
}

function validateBitDepth(colorType: number, bitDepth: number): void {
  const allowed: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  const valid = allowed[colorType];
  if (!valid || !valid.includes(bitDepth)) {
    throw new PngDecodeError(`Invalid PNG bit depth ${bitDepth} for color type ${colorType}`);
  }
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanlines(
  raw: Uint8Array,
  rawOffset: number,
  width: number,
  height: number,
  channels: number,
  bitDepth: number,
): { pixels: Uint8Array; nextOffset: number } {
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const bpp = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const needed = height * (1 + rowBytes);
  if (rawOffset + needed > raw.byteLength) {
    throw new PngDecodeError(
      `Truncated PNG image data: need ${rawOffset + needed} bytes, got ${raw.byteLength}`,
    );
  }

  const out = new Uint8Array(height * rowBytes);
  let src = rawOffset;

  for (let y = 0; y < height; y++) {
    const filterType = raw[src++]!;
    const rowStart = y * rowBytes;
    const prevStart = (y - 1) * rowBytes;

    switch (filterType) {
      case 0: // None
        out.set(raw.subarray(src, src + rowBytes), rowStart);
        break;
      case 1: // Sub
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
          out[rowStart + x] = (raw[src + x]! + a) & 0xff;
        }
        break;
      case 2: // Up
        for (let x = 0; x < rowBytes; x++) {
          const b = y > 0 ? out[prevStart + x]! : 0;
          out[rowStart + x] = (raw[src + x]! + b) & 0xff;
        }
        break;
      case 3: // Average
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
          const b = y > 0 ? out[prevStart + x]! : 0;
          out[rowStart + x] = (raw[src + x]! + ((a + b) >>> 1)) & 0xff;
        }
        break;
      case 4: // Paeth
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
          const b = y > 0 ? out[prevStart + x]! : 0;
          const c = y > 0 && x >= bpp ? out[prevStart + x - bpp]! : 0;
          out[rowStart + x] = (raw[src + x]! + paethPredictor(a, b, c)) & 0xff;
        }
        break;
      default:
        throw new PngDecodeError(`Unknown PNG scanline filter type: ${filterType}`);
    }

    src += rowBytes;
  }

  return { pixels: out, nextOffset: src };
}

function readSubByteSample(row: Uint8Array, rowStart: number, x: number, bitDepth: number): number {
  const pixelsPerByte = 8 / bitDepth;
  const byteIndex = rowStart + Math.floor(x / pixelsPerByte);
  const shift = 8 - bitDepth - (x % pixelsPerByte) * bitDepth;
  const mask = (1 << bitDepth) - 1;
  return (row[byteIndex]! >>> shift) & mask;
}

function writeRgbaPass(
  unfiltered: Uint8Array,
  passWidth: number,
  passHeight: number,
  colorType: number,
  bitDepth: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
  rgba: Uint8ClampedArray,
  fullWidth: number,
  xStart: number,
  yStart: number,
  xStep: number,
  yStep: number,
): void {
  const channels = channelsForColorType(colorType);
  const rowBytes = Math.ceil((passWidth * channels * bitDepth) / 8);

  // Optional single-color tRNS key for grayscale (0) or RGB (2)
  let trnsGray = -1;
  let trnsR = -1;
  let trnsG = -1;
  let trnsB = -1;
  if (trns) {
    if (colorType === 0 && trns.byteLength >= 2) {
      const rawGray = (trns[0]! << 8) | trns[1]!;
      trnsGray = bitDepth === 16 ? rawGray >>> 8 : rawGray;
    } else if (colorType === 2 && trns.byteLength >= 6) {
      const r16 = (trns[0]! << 8) | trns[1]!;
      const g16 = (trns[2]! << 8) | trns[3]!;
      const b16 = (trns[4]! << 8) | trns[5]!;
      trnsR = bitDepth === 16 ? r16 >>> 8 : r16;
      trnsG = bitDepth === 16 ? g16 >>> 8 : g16;
      trnsB = bitDepth === 16 ? b16 >>> 8 : b16;
    }
  }

  const maxSubByteVal = bitDepth < 8 ? (1 << bitDepth) - 1 : 255;

  for (let py = 0; py < passHeight; py++) {
    const rowStart = py * rowBytes;
    const dstY = yStart + py * yStep;

    for (let px = 0; px < passWidth; px++) {
      const dstX = xStart + px * xStep;
      const dstIdx = (dstY * fullWidth + dstX) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (colorType === 0) {
        let gray: number;
        if (bitDepth < 8) {
          const sample = readSubByteSample(unfiltered, rowStart, px, bitDepth);
          gray = Math.round((sample * 255) / maxSubByteVal);
          if (sample === trnsGray) a = 0;
        } else if (bitDepth === 8) {
          gray = unfiltered[rowStart + px]!;
          if (gray === trnsGray) a = 0;
        } else {
          gray = unfiltered[rowStart + px * 2]!;
          if (gray === trnsGray) a = 0;
        }
        r = gray;
        g = gray;
        b = gray;
      } else if (colorType === 2) {
        if (bitDepth === 8) {
          const off = rowStart + px * 3;
          r = unfiltered[off]!;
          g = unfiltered[off + 1]!;
          b = unfiltered[off + 2]!;
        } else {
          const off = rowStart + px * 6;
          r = unfiltered[off]!;
          g = unfiltered[off + 2]!;
          b = unfiltered[off + 4]!;
        }
        if (r === trnsR && g === trnsG && b === trnsB) a = 0;
      } else if (colorType === 3) {
        if (!palette) {
          throw new PngDecodeError("Indexed PNG missing PLTE chunk");
        }
        const idx =
          bitDepth < 8
            ? readSubByteSample(unfiltered, rowStart, px, bitDepth)
            : unfiltered[rowStart + px]!;
        const pOff = idx * 3;
        if (pOff + 2 >= palette.byteLength) {
          throw new PngDecodeError(`Palette index ${idx} out of bounds`);
        }
        r = palette[pOff]!;
        g = palette[pOff + 1]!;
        b = palette[pOff + 2]!;
        a = trns && idx < trns.byteLength ? trns[idx]! : 255;
      } else if (colorType === 4) {
        if (bitDepth === 8) {
          const off = rowStart + px * 2;
          r = g = b = unfiltered[off]!;
          a = unfiltered[off + 1]!;
        } else {
          const off = rowStart + px * 4;
          r = g = b = unfiltered[off]!;
          a = unfiltered[off + 2]!;
        }
      } else if (colorType === 6) {
        if (bitDepth === 8) {
          const off = rowStart + px * 4;
          r = unfiltered[off]!;
          g = unfiltered[off + 1]!;
          b = unfiltered[off + 2]!;
          a = unfiltered[off + 3]!;
        } else {
          const off = rowStart + px * 8;
          r = unfiltered[off]!;
          g = unfiltered[off + 2]!;
          b = unfiltered[off + 4]!;
          a = unfiltered[off + 6]!;
        }
      }

      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b;
      rgba[dstIdx + 3] = a;
    }
  }
}

async function inflateZlib(compressed: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const writePromise = writer.write(compressed as BufferSource).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = ds.readable.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PngDecodeError(`Decompressed PNG stream exceeds limit of ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
    await writePromise;
  } catch (err) {
    // Ensure writePromise rejection doesn't become an unhandled rejection
    writePromise.catch(() => {});
    if (err instanceof PngDecodeError) throw err;
    throw new PngDecodeError(
      `Failed to decompress PNG IDAT stream: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength) return false;
  for (let i = 0; i < PNG_SIGNATURE.byteLength; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

export async function decodePng(input: Uint8Array | ArrayBuffer): Promise<DecodedPng> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!hasPngSignature(bytes)) {
    throw new PngDecodeError("Invalid PNG signature");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlaceMethod = 0;
  let seenIhdr = false;
  let seenIend = false;

  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idatChunks: Uint8Array[] = [];
  let totalIdatBytes = 0;

  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.byteLength) {
      throw new PngDecodeError(`Truncated PNG chunk "${type}"`);
    }

    if (type === "IHDR") {
      if (seenIhdr) throw new PngDecodeError("Duplicate IHDR chunk");
      if (length !== 13) throw new PngDecodeError(`Invalid IHDR length: ${length}`);
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = bytes[dataStart + 8]!;
      colorType = bytes[dataStart + 9]!;
      const compressionMethod = bytes[dataStart + 10]!;
      const filterMethod = bytes[dataStart + 11]!;
      interlaceMethod = bytes[dataStart + 12]!;

      if (width === 0 || height === 0) {
        throw new PngDecodeError(`Invalid PNG dimensions: ${width}x${height}`);
      }
      if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
        throw new PngDecodeError(`PNG dimensions ${width}x${height} exceed safety limits`);
      }
      if (compressionMethod !== 0) {
        throw new PngDecodeError(`Unsupported PNG compression method: ${compressionMethod}`);
      }
      if (filterMethod !== 0) {
        throw new PngDecodeError(`Unsupported PNG filter method: ${filterMethod}`);
      }
      if (interlaceMethod !== 0 && interlaceMethod !== 1) {
        throw new PngDecodeError(`Unsupported PNG interlace method: ${interlaceMethod}`);
      }
      channelsForColorType(colorType);
      validateBitDepth(colorType, bitDepth);
      seenIhdr = true;
    } else if (type === "PLTE") {
      if (length === 0 || length % 3 !== 0 || length > 256 * 3) {
        throw new PngDecodeError(`Invalid PLTE chunk length: ${length}`);
      }
      palette = bytes.subarray(dataStart, dataEnd);
    } else if (type === "tRNS") {
      trns = bytes.subarray(dataStart, dataEnd);
    } else if (type === "IDAT") {
      if (!seenIhdr) throw new PngDecodeError("IDAT encountered before IHDR");
      idatChunks.push(bytes.subarray(dataStart, dataEnd));
      totalIdatBytes += length;
    } else if (type === "IEND") {
      seenIend = true;
      break;
    }

    offset = dataEnd + 4; // skip 4-byte CRC
  }

  if (!seenIhdr) throw new PngDecodeError("Missing IHDR chunk");
  if (!seenIend) throw new PngDecodeError("Missing IEND chunk");
  if (idatChunks.length === 0) throw new PngDecodeError("Missing IDAT chunk");
  if (colorType === 3 && !palette) {
    throw new PngDecodeError("Indexed PNG missing PLTE chunk");
  }

  const compressed =
    idatChunks.length === 1
      ? idatChunks[0]!
      : (() => {
          const merged = new Uint8Array(totalIdatBytes);
          let pos = 0;
          for (const chunk of idatChunks) {
            merged.set(chunk, pos);
            pos += chunk.byteLength;
          }
          return merged;
        })();

  const channels = channelsForColorType(colorType);
  const maxExpectedBytes = Math.min(
    MAX_DECOMPRESSED_BYTES,
    (Math.ceil((width * channels * bitDepth) / 8) + 1) * height * 2 + 1024,
  );
  const inflated = await inflateZlib(compressed, maxExpectedBytes);
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (interlaceMethod === 0) {
    const { pixels } = unfilterScanlines(inflated, 0, width, height, channels, bitDepth);
    writeRgbaPass(pixels, width, height, colorType, bitDepth, palette, trns, rgba, width, 0, 0, 1, 1);
  } else {
    let passOffset = 0;
    for (const [xStart, yStart, xStep, yStep] of ADAM7_PASSES) {
      const passWidth = Math.ceil((width - xStart) / xStep);
      const passHeight = Math.ceil((height - yStart) / yStep);
      if (passWidth <= 0 || passHeight <= 0) continue;
      const { pixels, nextOffset } = unfilterScanlines(
        inflated,
        passOffset,
        passWidth,
        passHeight,
        channels,
        bitDepth,
      );
      writeRgbaPass(
        pixels,
        passWidth,
        passHeight,
        colorType,
        bitDepth,
        palette,
        trns,
        rgba,
        width,
        xStart,
        yStart,
        xStep,
        yStep,
      );
      passOffset = nextOffset;
    }
  }

  return { width, height, data: rgba };
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder helper (for deterministic unit tests without external deps)
// ---------------------------------------------------------------------------

export type PngFilterMode = 0 | 1 | 2 | 3 | 4 | "mixed";

export interface EncodePngOptions {
  width: number;
  height: number;
  /** Raw pixel bytes matching `colorType` (8-bit per channel). */
  data: Uint8Array;
  /** PNG color type: 0 (Gray), 2 (RGB), 3 (Indexed), 4 (Gray+Alpha), 6 (RGBA). Default 6. */
  colorType?: 0 | 2 | 3 | 4 | 6;
  /** Required when colorType === 3: flat RGB triplets (`3 * N` bytes). */
  palette?: Uint8Array;
  /** Optional tRNS chunk payload (for colorType 3, 1 alpha byte per palette index). */
  trns?: Uint8Array;
  /** Scanline filter type to apply (0..4) or "mixed" to cycle all 5 filters. Default 0. */
  filter?: PngFilterMode;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(typeBytes: Uint8Array, data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < typeBytes.byteLength; i++) {
    c = CRC_TABLE[(c ^ typeBytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  for (let i = 0; i < data.byteLength; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(typeBytes, data), false);
  return out;
}

async function deflateZlib(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  const writePromise = writer.write(raw as BufferSource).then(() => writer.close());

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await writePromise;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function encodePng(options: EncodePngOptions): Promise<Uint8Array> {
  const { width, height, data, colorType = 6, palette, trns, filter = 0 } = options;
  const channels = channelsForColorType(colorType);
  const rowBytes = width * channels;
  const bpp = channels;

  if (data.byteLength !== rowBytes * height) {
    throw new Error(
      `Expected ${rowBytes * height} bytes for ${width}x${height} colorType ${colorType}, got ${data.byteLength}`,
    );
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // non-interlaced

  const filtered = new Uint8Array(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const filterType = filter === "mixed" ? (y % 5) : filter;
    const dstRow = y * (1 + rowBytes);
    const srcRow = y * rowBytes;
    const prevRow = (y - 1) * rowBytes;

    filtered[dstRow] = filterType;
    for (let x = 0; x < rowBytes; x++) {
      const cur = data[srcRow + x]!;
      const a = x >= bpp ? data[srcRow + x - bpp]! : 0;
      const b = y > 0 ? data[prevRow + x]! : 0;
      const c = y > 0 && x >= bpp ? data[prevRow + x - bpp]! : 0;

      let encoded: number;
      switch (filterType) {
        case 0:
          encoded = cur;
          break;
        case 1:
          encoded = (cur - a) & 0xff;
          break;
        case 2:
          encoded = (cur - b) & 0xff;
          break;
        case 3:
          encoded = (cur - ((a + b) >>> 1)) & 0xff;
          break;
        case 4:
          encoded = (cur - paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          encoded = cur;
      }
      filtered[dstRow + 1 + x] = encoded;
    }
  }

  const compressed = await deflateZlib(filtered);

  const chunks: Uint8Array[] = [PNG_SIGNATURE, makeChunk("IHDR", ihdr)];
  if (colorType === 3) {
    if (!palette) throw new Error("encodePng: palette is required for colorType 3");
    chunks.push(makeChunk("PLTE", palette));
  }
  if (trns) {
    chunks.push(makeChunk("tRNS", trns));
  }
  chunks.push(makeChunk("IDAT", compressed));
  chunks.push(makeChunk("IEND", new Uint8Array(0)));

  const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}
