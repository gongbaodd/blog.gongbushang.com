import { describe, expect, it, vi } from "vitest";
import {
  CLOUDINARY_THUMBNAIL_TRANSFORM,
  toCloudinaryThumbnailUrl,
  UrlValidationError,
  validateImageUrl,
} from "./cloudinary.ts";
import { constantTimeEqual, handleRequest } from "./index.ts";
import {
  deltaE2000,
  extractColorSet,
  findNearestTitleColor,
  rgbToLab,
  TITLE_COLOR_MAP,
} from "./palette.ts";
import { decodePng, encodePng, PngDecodeError, type PngFilterMode } from "./png.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGradientRgba(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = (x * 17 + y * 5) & 0xff;
      data[idx + 1] = (y * 19 + x * 3) & 0xff;
      data[idx + 2] = ((x ^ y) * 13 + 41) & 0xff;
      data[idx + 3] = (x + y) % 7 === 0 ? 180 : 255;
    }
  }
  return data;
}

function makeTwoToneRgba(
  width: number,
  height: number,
  mutedRgb: readonly [number, number, number],
  vibrantRgb: readonly [number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // 65% muted background, 35% vibrant foreground accent
      const useMuted = y < Math.floor(height * 0.65);
      const [r, g, b] = useMuted ? mutedRgb : vibrantRgb;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// 1. PNG Decoder Tests
// ---------------------------------------------------------------------------

describe("PNG decoder (pure TS + DecompressionStream)", () => {
  const filterModes: PngFilterMode[] = [0, 1, 2, 3, 4, "mixed"];

  for (const filter of filterModes) {
    it(`decodes 8-bit RGBA PNG with filter=${String(filter)} losslessly`, async () => {
      const width = 16;
      const height = 12;
      const expected = makeGradientRgba(width, height);
      const png = await encodePng({ width, height, data: expected, colorType: 6, filter });
      const decoded = await decodePng(png);

      expect(decoded.width).toBe(width);
      expect(decoded.height).toBe(height);
      expect(Array.from(decoded.data)).toEqual(Array.from(expected));
    });
  }

  it("decodes 8-bit RGB PNG (colorType 2) with Paeth filter", async () => {
    const width = 8;
    const height = 6;
    const rgb = new Uint8Array(width * height * 3);
    const expectedRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const r = (i * 29) & 0xff;
      const g = (i * 53 + 17) & 0xff;
      const b = (i * 97 + 11) & 0xff;
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
      expectedRgba[i * 4] = r;
      expectedRgba[i * 4 + 1] = g;
      expectedRgba[i * 4 + 2] = b;
      expectedRgba[i * 4 + 3] = 255;
    }

    const png = await encodePng({ width, height, data: rgb, colorType: 2, filter: 4 });
    const decoded = await decodePng(png);
    expect(Array.from(decoded.data)).toEqual(Array.from(expectedRgba));
  });

  it("decodes 8-bit Grayscale PNG (colorType 0) with mixed filters", async () => {
    const width = 10;
    const height = 8;
    const gray = new Uint8Array(width * height);
    const expectedRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = (i * 7 + 13) & 0xff;
      gray[i] = v;
      expectedRgba[i * 4] = v;
      expectedRgba[i * 4 + 1] = v;
      expectedRgba[i * 4 + 2] = v;
      expectedRgba[i * 4 + 3] = 255;
    }

    const png = await encodePng({ width, height, data: gray, colorType: 0, filter: "mixed" });
    const decoded = await decodePng(png);
    expect(Array.from(decoded.data)).toEqual(Array.from(expectedRgba));
  });

  it("decodes 8-bit Grayscale+Alpha PNG (colorType 4) with Average filter", async () => {
    const width = 6;
    const height = 6;
    const ga = new Uint8Array(width * height * 2);
    const expectedRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = (i * 11) & 0xff;
      const a = (i * 23 + 100) & 0xff;
      ga[i * 2] = v;
      ga[i * 2 + 1] = a;
      expectedRgba[i * 4] = v;
      expectedRgba[i * 4 + 1] = v;
      expectedRgba[i * 4 + 2] = v;
      expectedRgba[i * 4 + 3] = a;
    }

    const png = await encodePng({ width, height, data: ga, colorType: 4, filter: 3 });
    const decoded = await decodePng(png);
    expect(Array.from(decoded.data)).toEqual(Array.from(expectedRgba));
  });

  it("decodes 8-bit Indexed/PLTE PNG (colorType 3) with tRNS transparency", async () => {
    const width = 4;
    const height = 4;
    const palette = new Uint8Array([
      255, 0, 0, // idx 0: red
      0, 200, 100, // idx 1: emerald
      40, 80, 220, // idx 2: blue
      240, 220, 60, // idx 3: yellow
    ]);
    const trns = new Uint8Array([0, 128]); // idx 0 transparent, idx 1 half, idx 2..3 opaque (255)
    const indices = new Uint8Array(width * height);
    const expectedRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const idx = i % 4;
      indices[i] = idx;
      expectedRgba[i * 4] = palette[idx * 3]!;
      expectedRgba[i * 4 + 1] = palette[idx * 3 + 1]!;
      expectedRgba[i * 4 + 2] = palette[idx * 3 + 2]!;
      expectedRgba[i * 4 + 3] = idx < trns.length ? trns[idx]! : 255;
    }

    const png = await encodePng({
      width,
      height,
      data: indices,
      colorType: 3,
      palette,
      trns,
      filter: "mixed",
    });
    const decoded = await decodePng(png);
    expect(Array.from(decoded.data)).toEqual(Array.from(expectedRgba));
  });

  it("rejects non-PNG data and truncated streams cleanly", async () => {
    await expect(decodePng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).rejects.toThrow(
      PngDecodeError,
    );
    const valid = await encodePng({
      width: 2,
      height: 2,
      data: new Uint8Array(16).fill(200),
      colorType: 6,
    });
    await expect(decodePng(valid.subarray(0, 24))).rejects.toThrow(PngDecodeError);
  });
});

// ---------------------------------------------------------------------------
// 2. Palette Extraction & CIEDE2000 Mantine Color Mapping
// ---------------------------------------------------------------------------

describe("palette extraction & Mantine TITLE_COLOR_MAP matching", () => {
  it("maps every exact TITLE_COLOR_MAP hex back to its own CSS variable", () => {
    expect(Object.keys(TITLE_COLOR_MAP)).toHaveLength(14);
    for (const [cssVar, hex] of Object.entries(TITLE_COLOR_MAP)) {
      expect(findNearestTitleColor(hex)).toBe(cssVar);
      expect(deltaE2000(rgbToLab(128, 64, 192), rgbToLab(128, 64, 192))).toBe(0);
    }
  });

  it("matches representative vibrant colors identically to chroma.deltaE (CIEDE2000)", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["#ff3b30", "--mantine-color-red-3"],
      ["#2ecc71", "--mantine-color-green-4"],
      ["#3498db", "--mantine-color-blue-2"],
      ["#f1c40f", "--mantine-color-yellow-2"],
      ["#f39c12", "--mantine-color-orange-2"],
      ["#9b59b6", "--mantine-color-grape-3"],
      ["#1abc9c", "--mantine-color-teal-2"],
      ["#00bcd4", "--mantine-color-cyan-2"],
      ["#ec4899", "--mantine-color-grape-3"],
      ["#faa2c1", "--mantine-color-pink-2"],
      ["#111827", "--mantine-color-dark-8"],
      ["#84cc16", "--mantine-color-green-4"],
      ["#c0eb75", "--mantine-color-lime-2"],
      ["#6366f1", "--mantine-color-grape-3"],
      ["#e5e7eb", "--mantine-color-gray-2"],
    ];

    for (const [hex, expectedVar] of cases) {
      expect(findNearestTitleColor(hex), `nearest title color for ${hex}`).toBe(expectedVar);
    }
  });

  it("separates muted bgColor from vibrant titleColor on a two-tone image", () => {
    const rgba = makeTwoToneRgba(32, 32, [96, 112, 128], [46, 204, 113]); // muted slate + vibrant green
    const result = extractColorSet(new Uint8ClampedArray(rgba));

    expect(result.bgColor).toBe("#607080");
    expect(result.titleColor).toBe("--mantine-color-green-4");
  });

  it("falls back gracefully on solid monochrome, solid saturated, and fully transparent images", () => {
    // Solid saturated blue
    const solidBlue = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < solidBlue.length; i += 4) {
      solidBlue[i] = 52;
      solidBlue[i + 1] = 152;
      solidBlue[i + 2] = 219;
      solidBlue[i + 3] = 255;
    }
    const blueRes = extractColorSet(solidBlue);
    expect(blueRes.bgColor).toBe("#3498db");
    expect(blueRes.titleColor).toBe("--mantine-color-blue-2");

    // Solid dark charcoal
    const solidDark = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < solidDark.length; i += 4) {
      solidDark[i] = 28;
      solidDark[i + 1] = 28;
      solidDark[i + 2] = 30;
      solidDark[i + 3] = 255;
    }
    const darkRes = extractColorSet(solidDark);
    expect(darkRes.bgColor).toBe("#1c1c1e");
    expect(darkRes.titleColor).toBe("--mantine-color-dark-8");

    // Fully transparent
    const transparent = new Uint8ClampedArray(8 * 8 * 4);
    expect(extractColorSet(transparent)).toEqual({ bgColor: "", titleColor: "" });
  });
});

// ---------------------------------------------------------------------------
// 3. Cloudinary URL Rewriter & SSRF Protection
// ---------------------------------------------------------------------------

describe("Cloudinary URL rewriting", () => {
  it("rewrites standard versioned Cloudinary upload URLs to 32x32 PNG thumbnails", () => {
    const input = "https://res.cloudinary.com/demo/image/upload/v1700000000/blog/cover.jpg";
    expect(toCloudinaryThumbnailUrl(input)).toBe(
      `https://res.cloudinary.com/demo/image/upload/${CLOUDINARY_THUMBNAIL_TRANSFORM}/v1700000000/blog/cover.jpg`,
    );
  });

  it("rewrites versionless Cloudinary URLs", () => {
    const input = "https://res.cloudinary.com/my-cloud/image/upload/posts/hero.webp";
    expect(toCloudinaryThumbnailUrl(input)).toBe(
      `https://res.cloudinary.com/my-cloud/image/upload/${CLOUDINARY_THUMBNAIL_TRANSFORM}/posts/hero.webp`,
    );
  });

  it("replaces existing Cloudinary transformation segments cleanly", () => {
    const input =
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1600/c_fill,h_900/v12345/folder/photo.avif";
    expect(toCloudinaryThumbnailUrl(input)).toBe(
      `https://res.cloudinary.com/demo/image/upload/${CLOUDINARY_THUMBNAIL_TRANSFORM}/v12345/folder/photo.avif`,
    );
  });

  it("preserves signed Cloudinary URLs and non-Cloudinary URLs unchanged", () => {
    const signed = "https://res.cloudinary.com/demo/image/upload/s--AbCd1234--/v1/cover.png";
    expect(toCloudinaryThumbnailUrl(signed)).toBe(signed);

    const other = "https://images.example.com/photos/cover.png?v=1";
    expect(toCloudinaryThumbnailUrl(other)).toBe(other);
  });
});

describe("SSRF protection & URL validation", () => {
  const blockedUrls = [
    "file:///etc/passwd",
    "ftp://res.cloudinary.com/image.png",
    "javascript:alert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "https://user:pass@res.cloudinary.com/demo/image/upload/v1/a.png",
    "http://localhost/image.png",
    "http://sub.localhost:8787/image.png",
    "http://printer.local/image.png",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://127.0.0.1/image.png",
    "http://127.1/image.png",
    "http://2130706433/image.png",
    "http://0x7f000001/image.png",
    "http://0177.0.0.1/image.png",
    "http://10.0.0.5/image.png",
    "http://172.16.0.1/image.png",
    "http://172.31.255.254/image.png",
    "http://192.168.1.10/image.png",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/image.png",
    "http://0.0.0.0/image.png",
    "http://224.0.0.1/image.png",
    "http://[::1]/image.png",
    "http://[::]/image.png",
    "http://[fe80::1]/image.png",
    "http://[fc00::1]/image.png",
    "http://[fd12:3456::1]/image.png",
    "http://[::ffff:127.0.0.1]/image.png",
    "http://[::ffff:169.254.169.254]/image.png",
  ];

  for (const badUrl of blockedUrls) {
    it(`blocks unsafe URL: ${badUrl}`, () => {
      expect(() => validateImageUrl(badUrl)).toThrow(UrlValidationError);
    });
  }

  it("allows public HTTPS URLs when ALLOWED_HOSTS is unset, and enforces ALLOWED_HOSTS when set", () => {
    expect(validateImageUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg").hostname).toBe(
      "res.cloudinary.com",
    );
    expect(validateImageUrl("https://cdn.example.com/a.png").hostname).toBe("cdn.example.com");

    expect(() =>
      validateImageUrl("https://cdn.example.com/a.png", { allowedHosts: "res.cloudinary.com" }),
    ).toThrow(UrlValidationError);

    expect(
      validateImageUrl("https://sub.cloudinary.com/a.png", {
        allowedHosts: "res.cloudinary.com,*.cloudinary.com",
      }).hostname,
    ).toBe("sub.cloudinary.com");
  });
});

// ---------------------------------------------------------------------------
// 4. Auth & HTTP Worker Handler Tests
// ---------------------------------------------------------------------------

describe("Worker HTTP handler & auth", () => {
  it("compares bearer tokens in constant time", () => {
    expect(constantTimeEqual("secret-token-123", "secret-token-123")).toBe(true);
    expect(constantTimeEqual("secret-token-123", "secret-token-124")).toBe(false);
    expect(constantTimeEqual("short", "longer-token")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("serves GET /health without auth and rejects wrong methods / unknown paths", async () => {
    const res = await handleRequest(new Request("https://worker.test/health"), {
      COLORIZE_TOKEN: "top-secret",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const badMethod = await handleRequest(
      new Request("https://worker.test/health", { method: "POST" }),
    );
    expect(badMethod.status).toBe(405);

    const notFound = await handleRequest(new Request("https://worker.test/nope"));
    expect(notFound.status).toBe(404);
  });

  it("enforces COLORIZE_TOKEN when configured", async () => {
    const pngBytes = await encodePng({
      width: 4,
      height: 4,
      data: makeTwoToneRgba(4, 4, [100, 110, 120], [236, 72, 153]),
      colorType: 6,
    });
    const mockFetch = vi.fn(async () => new Response(pngBytes as BodyInit, { status: 200 }));
    const env = { COLORIZE_TOKEN: "my-secret-token" };
    const imageUrl = "https://res.cloudinary.com/demo/image/upload/v1/cover.jpg";

    // Missing header -> 401
    const unauth = await handleRequest(
      new Request("https://worker.test/colorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: imageUrl }),
      }),
      env,
      mockFetch as unknown as typeof fetch,
    );
    expect(unauth.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();

    // Wrong token -> 401
    const wrong = await handleRequest(
      new Request("https://worker.test/colorize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ url: imageUrl }),
      }),
      env,
      mockFetch as unknown as typeof fetch,
    );
    expect(wrong.status).toBe(401);

    // Correct token -> 200
    const ok = await handleRequest(
      new Request("https://worker.test/colorize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer my-secret-token",
        },
        body: JSON.stringify({ url: imageUrl }),
      }),
      env,
      mockFetch as unknown as typeof fetch,
    );
    expect(ok.status).toBe(200);
    const json = (await ok.json()) as {
      bgColor: string;
      titleColor: string;
      thumbnailUrl: string;
    };
    expect(json.thumbnailUrl).toBe(
      `https://res.cloudinary.com/demo/image/upload/${CLOUDINARY_THUMBNAIL_TRANSFORM}/v1/cover.jpg`,
    );
    expect(json.bgColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(json.titleColor).toBe("--mantine-color-grape-3");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(json.thumbnailUrl);
  });

  it("supports GET /colorize?url=...", async () => {
    const pngBytes = await encodePng({
      width: 8,
      height: 8,
      data: makeTwoToneRgba(8, 8, [96, 112, 128], [241, 196, 15]),
      colorType: 6,
      filter: "mixed",
    });
    const mockFetch = vi.fn(async () => new Response(pngBytes as BodyInit, { status: 200 }));
    const target = "https://res.cloudinary.com/demo/image/upload/v42/yellow.jpg";

    const res = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      { ALLOWED_HOSTS: "res.cloudinary.com" },
      mockFetch as unknown as typeof fetch,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      bgColor: string;
      titleColor: string;
      thumbnailUrl: string;
    };
    expect(json.bgColor).toBe("#607080");
    expect(json.titleColor).toBe("--mantine-color-yellow-2");
    expect(json.thumbnailUrl).toContain(CLOUDINARY_THUMBNAIL_TRANSFORM);
  });

  it("blocks SSRF redirects, oversized responses, non-PNG payloads, and upstream timeouts", async () => {
    const target = "https://res.cloudinary.com/demo/image/upload/v1/test.png";

    // 1. SSRF redirect to cloud metadata IP -> 400
    const redirectFetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    const ssrfRes = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      {},
      redirectFetch as unknown as typeof fetch,
    );
    expect(ssrfRes.status).toBe(400);

    // 2. Oversized Content-Length -> 413
    const hugeHeaderFetch = vi.fn(
      async () =>
        new Response(new Uint8Array(16), {
          status: 200,
          headers: { "content-length": String(1024 * 1024) },
        }),
    );
    const tooLargeHeader = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      { MAX_IMAGE_BYTES: "1024" },
      hugeHeaderFetch as unknown as typeof fetch,
    );
    expect(tooLargeHeader.status).toBe(413);

    // 3. Oversized streamed body without Content-Length -> 413
    const hugeStreamFetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(600));
          controller.enqueue(new Uint8Array(600));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });
    const tooLargeStream = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      { MAX_IMAGE_BYTES: "1024" },
      hugeStreamFetch as unknown as typeof fetch,
    );
    expect(tooLargeStream.status).toBe(413);

    // 4. Non-PNG response -> 415
    const jpegFetch = vi.fn(
      async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]), { status: 200 }),
    );
    const nonPng = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      {},
      jpegFetch as unknown as typeof fetch,
    );
    expect(nonPng.status).toBe(415);

    // 5. Upstream 500 -> 502
    const errFetch = vi.fn(async () => new Response("boom", { status: 500 }));
    const upstreamErr = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      {},
      errFetch as unknown as typeof fetch,
    );
    expect(upstreamErr.status).toBe(502);

    // 6. Upstream timeout -> 504
    const slowFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const timedOut = await handleRequest(
      new Request(`https://worker.test/colorize?url=${encodeURIComponent(target)}`),
      { FETCH_TIMEOUT_MS: "25" },
      slowFetch as unknown as typeof fetch,
    );
    expect(timedOut.status).toBe(504);
  });
});

// ---------------------------------------------------------------------------
// 5. Performance Budget (< 10 ms CPU for 32x32 PNG decode + palette)
// ---------------------------------------------------------------------------

describe("Workers Free CPU budget", () => {
  it("decodes a 32x32 filtered PNG and extracts palette well under 10 ms", async () => {
    const rgba = makeGradientRgba(32, 32);
    const pngBytes = await encodePng({
      width: 32,
      height: 32,
      data: rgba,
      colorType: 6,
      filter: "mixed",
    });

    // Warm up JIT once
    const warm = await decodePng(pngBytes);
    extractColorSet(warm.data);

    const iterations = 10;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const decoded = await decodePng(pngBytes);
      const colors = extractColorSet(decoded.data);
      expect(colors.bgColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(colors.titleColor).toMatch(/^--mantine-color-/);
    }
    const avgMs = (performance.now() - start) / iterations;
    expect(avgMs).toBeLessThan(10);
  });
});
