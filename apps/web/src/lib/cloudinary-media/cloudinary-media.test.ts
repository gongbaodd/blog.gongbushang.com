import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudinaryMedia } from "./index";
import { assertInFolder, createCloudinaryProvider } from "./provider";
import { createMediaProvider, createRuntimeEnvLookup, loadWorkersEnv } from "./runtime";
import {
  MIME,
  buildDestroyRequest,
  buildUploadRequest,
  deliveryUrl,
  encodeMediaId,
  escapeContextValue,
  inferResourceType,
  parseMediaId,
  signParams,
  stringToSign,
  videoPosterUrl,
} from "./sign";

const creds = { cloudName: "demo", apiKey: "key123", apiSecret: "sekret" };
const envMap: Record<string, string> = {
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key123",
  CLOUDINARY_API_SECRET: "sekret",
};
const env = (n: string) => envMap[n];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signing and resource type helpers", () => {
  it("sorts params, drops file/api_key/cloud_name/resource_type and empties", () => {
    expect(
      stringToSign({
        timestamp: 1,
        folder: "f",
        file: "x",
        api_key: "k",
        cloud_name: "c",
        resource_type: "video",
        context: undefined,
        n: null,
        e: "",
      }),
    ).toBe("folder=f&timestamp=1");
  });

  it("matches an independent SHA-1 (node crypto) of the documented example string", async () => {
    const params = {
      eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      public_id: "sample",
      timestamp: 1315060510,
    };
    const sig = await signParams(params, "abcd");
    const expected = createHash("sha1")
      .update(`${stringToSign(params)}abcd`)
      .digest("hex");
    expect(sig).toBe("7e775a49f317e77d8f0af0fb11891b6e6edf21c0");
    expect(sig).toBe(expected);
  });

  it("escapes context values (=, |, and backslash)", () => {
    expect(escapeContextValue("a=b|c\\d")).toBe("a\\=b\\|c\\\\d");
  });

  it("maps common image, video, audio, and document extensions in MIME", () => {
    expect(MIME.mp4).toBe("video/mp4");
    expect(MIME.webm).toBe("video/webm");
    expect(MIME.mov).toBe("video/quicktime");
    expect(MIME.mp3).toBe("audio/mpeg");
    expect(MIME.m4a).toBe("audio/mp4");
    expect(MIME.wav).toBe("audio/wav");
    expect(MIME.pdf).toBe("application/pdf");
    expect(MIME.zip).toBe("application/zip");
    expect(MIME.json).toBe("application/json");
    expect(MIME.txt).toBe("text/plain");
  });

  it("infers Cloudinary resource_type from MIME type and falls back to filename extension", () => {
    expect(inferResourceType("image/png", "a.png")).toBe("image");
    expect(inferResourceType("image/svg+xml; charset=utf-8", "icon.svg")).toBe("image");
    expect(inferResourceType("video/mp4", "clip.mp4")).toBe("video");
    expect(inferResourceType("audio/mpeg", "podcast.mp3")).toBe("video");
    expect(inferResourceType("application/pdf", "paper.pdf")).toBe("raw");
    expect(inferResourceType("application/zip", "bundle.zip")).toBe("raw");
    expect(inferResourceType("text/plain", "notes.txt")).toBe("raw");

    // Fallback to extension when browser sends empty or octet-stream MIME
    expect(inferResourceType("", "photo.avif")).toBe("image");
    expect(inferResourceType("application/octet-stream", "movie.mov")).toBe("video");
    expect(inferResourceType("", "episode.m4a")).toBe("video");
    expect(inferResourceType("application/octet-stream", "data.json")).toBe("raw");
    expect(inferResourceType("", "unknown.customext")).toBe("raw");
    expect(inferResourceType("", "README")).toBe("raw");
    expect(inferResourceType(undefined, "growgen/legacy-cover", "image")).toBe("image");
  });

  it("encodes and parses media IDs across image, video, and raw", () => {
    expect(encodeMediaId("image", "growgen/a")).toBe("growgen/a");
    expect(encodeMediaId("video", "growgen/clip")).toBe("video:growgen/clip");
    expect(encodeMediaId("raw", "growgen/doc.pdf")).toBe("raw:growgen/doc.pdf");

    expect(parseMediaId("growgen/a")).toEqual({
      resourceType: "image",
      publicId: "growgen/a",
      explicit: false,
    });
    expect(parseMediaId("image:growgen/a")).toEqual({
      resourceType: "image",
      publicId: "growgen/a",
      explicit: true,
    });
    expect(parseMediaId("video:growgen/clip")).toEqual({
      resourceType: "video",
      publicId: "growgen/clip",
      explicit: true,
    });
    expect(parseMediaId("raw:growgen/doc.pdf")).toEqual({
      resourceType: "raw",
      publicId: "growgen/doc.pdf",
      explicit: true,
    });
    expect(parseMediaId("growgen/doc.pdf")).toEqual({
      resourceType: "raw",
      publicId: "growgen/doc.pdf",
      explicit: false,
    });
  });
});

describe("request and URL building", () => {
  it("builds signed multipart upload requests for image, video, audio, and raw", async () => {
    const imgReq = await buildUploadRequest(creds, {
      file: new Blob(["x"], { type: "image/png" }),
      filename: "a.png",
      folder: "growgen-spike",
      alt: "hi=there|friend",
      timestamp: 100,
    });
    expect(imgReq.url).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(imgReq.resourceType).toBe("image");
    const form = imgReq.init.body as FormData;
    expect(form.get("folder")).toBe("growgen-spike");
    expect(form.get("api_key")).toBe("key123");
    expect(form.get("context")).toBe("alt=hi\\=there\\|friend");
    const expected = await signParams(
      {
        context: "alt=hi\\=there\\|friend",
        folder: "growgen-spike",
        timestamp: 100,
        unique_filename: true,
        use_filename: true,
      },
      "sekret",
    );
    expect(form.get("signature")).toBe(expected);
    expect(form.has("api_secret")).toBe(false);

    const vidReq = await buildUploadRequest(creds, {
      file: new Blob(["v"], { type: "video/mp4" }),
      filename: "clip.mp4",
      folder: "growgen",
      timestamp: 101,
    });
    expect(vidReq.url).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    expect(vidReq.resourceType).toBe("video");

    const audReq = await buildUploadRequest(creds, {
      file: new Blob(["a"], { type: "audio/mpeg" }),
      filename: "ep.mp3",
      folder: "growgen",
      timestamp: 102,
    });
    expect(audReq.url).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    expect(audReq.resourceType).toBe("video");

    const rawReq = await buildUploadRequest(creds, {
      file: new Blob(["%PDF"], { type: "application/pdf" }),
      filename: "guide.pdf",
      folder: "growgen",
      timestamp: 103,
    });
    expect(rawReq.url).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
    expect(rawReq.resourceType).toBe("raw");
  });

  it("builds signed destroy requests for image, video, and raw", async () => {
    for (const rt of ["image", "video", "raw"] as const) {
      const { url, init } = await buildDestroyRequest(creds, "growgen/item", 5, rt);
      expect(url).toBe(`https://api.cloudinary.com/v1_1/demo/${rt}/destroy`);
      const body = init.body as URLSearchParams;
      expect(body.get("public_id")).toBe("growgen/item");
      expect(body.get("invalidate")).toBe("true");
      expect(body.get("api_key")).toBe("key123");
      expect(body.get("signature")).toBe(
        await signParams({ public_id: "growgen/item", timestamp: 5, invalidate: true }, "sekret"),
      );
    }
  });

  it("builds delivery and video poster URLs per resource type", () => {
    // Image
    expect(deliveryUrl("demo", "g/a")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/g/a",
    );
    expect(
      deliveryUrl("demo", "g/a", { width: 400, height: 300, format: "webp", quality: 80 }),
    ).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_400,h_300,f_webp,q_80/g/a");

    // Video & poster
    expect(deliveryUrl("demo", "video:g/clip")).toBe(
      "https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/g/clip",
    );
    expect(deliveryUrl("demo", "g/clip", { resourceType: "video", width: 1280 })).toBe(
      "https://res.cloudinary.com/demo/video/upload/c_limit,w_1280,f_auto,q_auto/g/clip",
    );
    expect(videoPosterUrl("demo", "video:g/clip", { width: 400 })).toBe(
      "https://res.cloudinary.com/demo/video/upload/c_fill,w_400,so_auto,q_auto/g/clip.jpg",
    );
    expect(videoPosterUrl("demo", "g/clip.mp4")).toBe(
      "https://res.cloudinary.com/demo/video/upload/so_auto,q_auto/g/clip.jpg",
    );

    // Audio (under video/upload without visual transforms)
    expect(
      deliveryUrl("demo", "g/ep1", { resourceType: "video", audio: true, format: "mp3" }),
    ).toBe("https://res.cloudinary.com/demo/video/upload/g/ep1.mp3");

    // Raw (never applies image transforms)
    expect(
      deliveryUrl("demo", "raw:g/doc.pdf", {
        width: 800,
        height: 600,
        format: "webp",
        quality: 70,
      }),
    ).toBe("https://res.cloudinary.com/demo/raw/upload/g/doc.pdf");
  });
});

describe("provider", () => {
  it("lists across image, video, and raw sorted by created_at and paginates only remaining streams", async () => {
    const f = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/resources/image/upload?")) {
        if (u.includes("next_cursor=img-2")) {
          return new Response(
            JSON.stringify({
              resources: [
                {
                  public_id: "growgen/older-img",
                  format: "jpg",
                  resource_type: "image",
                  created_at: "2026-11-20T00:00:00Z",
                },
              ],
            }),
          );
        }
        return new Response(
          JSON.stringify({
            resources: [
              {
                public_id: "growgen/img-1",
                format: "png",
                resource_type: "image",
                bytes: 300,
                width: 20,
                height: 10,
                created_at: "2026-11-24T10:00:00Z",
              },
            ],
            next_cursor: "img-2",
          }),
        );
      }
      if (u.includes("/resources/video/upload?")) {
        return new Response(
          JSON.stringify({
            resources: [
              {
                public_id: "growgen/vid-1",
                format: "mp4",
                resource_type: "video",
                bytes: 9000,
                width: 1920,
                height: 1080,
                created_at: "2026-11-25T10:00:00Z",
              },
              {
                public_id: "growgen/ep-1",
                format: "mp3",
                resource_type: "video",
                is_audio: true,
                bytes: 4000,
                created_at: "2026-11-23T10:00:00Z",
              },
            ],
          }),
        );
      }
      if (u.includes("/resources/raw/upload?")) {
        return new Response(
          JSON.stringify({
            resources: [
              {
                public_id: "growgen/paper.pdf",
                resource_type: "raw",
                bytes: 1200,
                created_at: "2026-11-24T12:00:00Z",
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected URL: ${u}`);
    });

    const p = createCloudinaryProvider({ folder: "/growgen/" }, env, f as unknown as typeof fetch);
    const page1 = await p.list({ limit: 5 });

    expect(f).toHaveBeenCalledTimes(3);
    for (const [url, init] of f.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toContain("prefix=growgen%2F");
      expect(url).toContain("max_results=5");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Basic ${btoa("key123:sekret")}`,
      );
    }

    // Sorted newest first: vid-1 -> paper.pdf -> img-1 -> ep-1
    expect(page1.items.map((i) => i.id)).toEqual([
      "video:growgen/vid-1",
      "raw:growgen/paper.pdf",
      "growgen/img-1",
      "video:growgen/ep-1",
    ]);
    expect(page1.items[0]).toMatchObject({
      id: "video:growgen/vid-1",
      mimeType: "video/mp4",
      previewUrl:
        "https://res.cloudinary.com/demo/video/upload/c_fill,w_400,so_auto,q_auto/growgen/vid-1.jpg",
    });
    expect(page1.items[1]).toMatchObject({
      id: "raw:growgen/paper.pdf",
      filename: "paper.pdf",
      mimeType: "application/pdf",
      previewUrl: "https://res.cloudinary.com/demo/raw/upload/growgen/paper.pdf",
    });
    expect(page1.items[3]).toMatchObject({
      id: "video:growgen/ep-1",
      filename: "ep-1.mp3",
      mimeType: "audio/mpeg",
      previewUrl: "https://res.cloudinary.com/demo/video/upload/growgen/ep-1.mp3",
    });
    expect(page1.nextCursor).toBeDefined();

    // Page 2: only `image` had next_cursor="img-2", so video & raw are not re-fetched
    f.mockClear();
    const page2 = await p.list({ limit: 5, cursor: page1.nextCursor });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toContain("/resources/image/upload?");
    expect(String(f.mock.calls[0]?.[0])).toContain("next_cursor=img-2");
    expect(page2.items.map((i) => i.id)).toEqual(["growgen/older-img"]);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("filters list() by options.mimeType (prefix, exact, audio vs video, and comma-separated)", async () => {
    const f = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("/resources/video/upload?")) {
        return new Response(
          JSON.stringify({
            resources: [
              { public_id: "growgen/v", format: "webm", resource_type: "video" },
              { public_id: "growgen/a", format: "m4a", resource_type: "video", is_audio: true },
            ],
            next_cursor: "vc1",
          }),
        );
      }
      if (u.includes("/resources/raw/upload?")) {
        return new Response(
          JSON.stringify({
            resources: [
              { public_id: "growgen/doc.pdf", resource_type: "raw" },
              { public_id: "growgen/archive.zip", resource_type: "raw" },
            ],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          resources: [{ public_id: "growgen/pic", format: "webp", resource_type: "image" }],
          next_cursor: "ic1",
        }),
      );
    });

    const p = createCloudinaryProvider({}, env, f as unknown as typeof fetch);

    // Audio-only filter queries only `/resources/video/upload` and excludes video/webm
    const audioOnly = await p.list({ mimeType: "audio/" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(audioOnly.items.map((i) => i.mimeType)).toEqual(["audio/mp4"]);
    expect(audioOnly.nextCursor).toBe("vc1");

    // Video-only filter excludes audio/mp4
    f.mockClear();
    const videoOnly = await p.list({ mimeType: "video/" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(videoOnly.items.map((i) => i.mimeType)).toEqual(["video/webm"]);

    // Exact PDF filter queries only `/resources/raw/upload`
    f.mockClear();
    const pdfOnly = await p.list({ mimeType: "application/pdf" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(pdfOnly.items.map((i) => i.filename)).toEqual(["doc.pdf"]);

    // Comma-separated multi-filter (as EmDash Admin sends)
    f.mockClear();
    const imageAndVideo = await p.list({ mimeType: "image/,video/" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(imageAndVideo.items.map((i) => i.mimeType)).toEqual(["image/webp", "video/webm"]);

    // Legacy plain cursor compatibility
    f.mockClear();
    const legacyPage = await p.list({ limit: 5, cursor: "c" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toContain("next_cursor=c");
    expect(legacyPage.nextCursor).toBe("ic1");
  });

  it("uploads and deletes image, video, audio, and raw assets cleanly", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (u: string, init?: RequestInit) => {
      calls.push({ url: u, init });
      if (u.endsWith("/destroy")) {
        return new Response(JSON.stringify({ result: "ok" }));
      }
      if (u.endsWith("/image/upload")) {
        return new Response(
          JSON.stringify({
            public_id: "growgen/pic",
            format: "png",
            resource_type: "image",
            width: 800,
            height: 600,
            context: { custom: { alt: "cover" } },
          }),
        );
      }
      if (u.endsWith("/video/upload")) {
        const form = init?.body as FormData;
        const uploaded = form.get("file") as File;
        const isAudio = uploaded.name.endsWith(".wav");
        return new Response(
          JSON.stringify({
            public_id: isAudio ? "growgen/sound" : "growgen/clip",
            format: isAudio ? "wav" : "mov",
            resource_type: "video",
            ...(isAudio ? { is_audio: true } : { width: 1280, height: 720 }),
          }),
        );
      }
      if (u.endsWith("/raw/upload")) {
        return new Response(
          JSON.stringify({
            public_id: "growgen/data.json",
            display_name: "data.json",
            format: "json",
            resource_type: "raw",
            bytes: 42,
          }),
        );
      }
      throw new Error(`Unexpected URL: ${u}`);
    });

    const p = createCloudinaryProvider({}, env, f as unknown as typeof fetch, () => 1700000000);

    // 1. Image
    const img = await p.upload!({
      file: new File(["png"], "pic.png", { type: "image/png" }),
      filename: "pic.png",
      alt: "cover",
    });
    expect(img).toMatchObject({
      id: "growgen/pic",
      filename: "pic.png",
      mimeType: "image/png",
      alt: "cover",
      meta: { resourceType: "image", publicId: "growgen/pic" },
    });
    await p.delete!(img.id);
    expect(calls.at(-1)?.url).toBe("https://api.cloudinary.com/v1_1/demo/image/destroy");

    // 2. Video (with octet-stream fallback to .mov extension)
    const vid = await p.upload!({
      file: new File(["mov"], "clip.mov", { type: "application/octet-stream" }),
      filename: "clip.mov",
    });
    expect(vid).toMatchObject({
      id: "video:growgen/clip",
      filename: "clip.mov",
      mimeType: "video/quicktime",
      previewUrl:
        "https://res.cloudinary.com/demo/video/upload/c_fill,w_400,so_auto,q_auto/growgen/clip.jpg",
      meta: { resourceType: "video", publicId: "growgen/clip" },
    });
    await p.delete!(vid.id);
    expect(calls.at(-1)?.url).toBe("https://api.cloudinary.com/v1_1/demo/video/destroy");
    expect((calls.at(-1)?.init?.body as URLSearchParams).get("public_id")).toBe("growgen/clip");

    // 3. Audio (uploaded to /video/upload, stored with audio/wav MIME)
    const aud = await p.upload!({
      file: new File(["wav"], "sound.wav", { type: "audio/wav" }),
      filename: "sound.wav",
    });
    expect(aud).toMatchObject({
      id: "video:growgen/sound",
      filename: "sound.wav",
      mimeType: "audio/wav",
      previewUrl: "https://res.cloudinary.com/demo/video/upload/growgen/sound.wav",
      meta: { resourceType: "video", publicId: "growgen/sound", isAudio: true },
    });
    await p.delete!(aud.id);
    expect(calls.at(-1)?.url).toBe("https://api.cloudinary.com/v1_1/demo/video/destroy");

    // 4. Raw (uploaded to /raw/upload, no duplicate extension on filename)
    const raw = await p.upload!({
      file: new File(["{}"], "data.json", { type: "application/json" }),
      filename: "data.json",
    });
    expect(raw).toMatchObject({
      id: "raw:growgen/data.json",
      filename: "data.json",
      mimeType: "application/json",
      previewUrl: "https://res.cloudinary.com/demo/raw/upload/growgen/data.json",
      meta: { resourceType: "raw", publicId: "growgen/data.json" },
    });
    await p.delete!(raw.id);
    expect(calls.at(-1)?.url).toBe("https://api.cloudinary.com/v1_1/demo/raw/destroy");
    expect((calls.at(-1)?.init?.body as URLSearchParams).get("public_id")).toBe(
      "growgen/data.json",
    );
  });

  it("gets and deletes both prefixed IDs and unprefixed fallback IDs", async () => {
    const getFetch = vi.fn(async (u: string) => {
      if (u.includes("/resources/video/upload/growgen/unprefixed-clip?")) {
        return new Response(
          JSON.stringify({
            public_id: "growgen/unprefixed-clip",
            format: "mp4",
            resource_type: "video",
          }),
        );
      }
      if (u.includes("/resources/raw/upload/growgen/notes%231.txt?")) {
        return new Response(
          JSON.stringify({ public_id: "growgen/notes#1.txt", resource_type: "raw", bytes: 12 }),
        );
      }
      return new Response("", { status: 404 });
    });
    const p = createCloudinaryProvider({}, env, getFetch as unknown as typeof fetch);

    // Explicit raw prefix hits /resources/raw/upload directly in 1 call and encodes `#` safely
    const rawItem = await p.get!("raw:growgen/notes#1.txt");
    expect(getFetch).toHaveBeenCalledTimes(1);
    expect(rawItem).toMatchObject({ id: "raw:growgen/notes#1.txt", mimeType: "text/plain" });

    // Unprefixed extensionless video probes image (404) -> video (200)
    getFetch.mockClear();
    const vidItem = await p.get!("growgen/unprefixed-clip");
    expect(getFetch).toHaveBeenCalledTimes(2);
    expect(vidItem).toMatchObject({ id: "video:growgen/unprefixed-clip", mimeType: "video/mp4" });

    // Completely missing asset returns null after probing
    getFetch.mockClear();
    expect(await p.get!("growgen/missing")).toBeNull();
    expect(getFetch).toHaveBeenCalledTimes(3);

    // Unprefixed delete probes next resource_type when Cloudinary returns { result: "not found" }
    const delFetch = vi.fn(async (u: string) => {
      if (u.endsWith("/image/destroy"))
        return new Response(JSON.stringify({ result: "not found" }));
      if (u.endsWith("/video/destroy")) return new Response(JSON.stringify({ result: "ok" }));
      return new Response(JSON.stringify({ result: "not found" }));
    });
    const pDel = createCloudinaryProvider({}, env, delFetch as unknown as typeof fetch, () => 10);
    await pDel.delete!("growgen/unprefixed-clip");
    expect(delFetch).toHaveBeenCalledTimes(2);
    expect(String(delFetch.mock.calls[1]?.[0])).toBe(
      "https://api.cloudinary.com/v1_1/demo/video/destroy",
    );
  });

  it("generates embeds and thumbnail URLs for image, video, audio, and raw values", async () => {
    const p = createCloudinaryProvider({}, env);

    // Image embed + getSrc + thumbnail
    const imgEmbed = await p.getEmbed(
      {
        id: "growgen/a",
        width: 1000,
        height: 500,
        alt: "hero",
        blurhash: "L00000",
        dominantColor: "#112233",
      },
      { width: 800 },
    );
    expect(imgEmbed).toMatchObject({
      type: "image",
      src: "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,f_auto,q_auto/growgen/a",
      width: 1000,
      height: 500,
      alt: "hero",
      blurhash: "L00000",
      dominantColor: "#112233",
      cdnBaseUrl: "https://res.cloudinary.com/demo/image/upload",
    });
    if (imgEmbed.type === "image") {
      expect(imgEmbed.getSrc?.({ width: 320, format: "avif" })).toBe(
        "https://res.cloudinary.com/demo/image/upload/c_fill,w_320,f_avif,q_auto/growgen/a",
      );
    }
    expect(p.getThumbnailUrl!("growgen/a", "image/png", { width: 240 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_240,f_auto,q_auto/growgen/a",
    );

    // Video embed from minimal PortableText Video.astro MediaValue (only prefixed id + dims)
    const vidEmbed = await p.getEmbed(
      { id: "video:growgen/clip", width: 1920, height: 1080 },
      { width: 1280 },
    );
    expect(vidEmbed).toEqual({
      type: "video",
      src: "https://res.cloudinary.com/demo/video/upload/c_limit,w_1280,f_auto,q_auto/growgen/clip",
      poster:
        "https://res.cloudinary.com/demo/video/upload/c_fill,w_1280,h_1080,so_auto,q_auto/growgen/clip.jpg",
      width: 1280,
      height: 1080,
      controls: true,
      playsinline: true,
      preload: "metadata",
    });
    expect(p.getThumbnailUrl!("video:growgen/clip")).toBe(
      "https://res.cloudinary.com/demo/video/upload/c_fill,w_400,so_auto,q_auto/growgen/clip.jpg",
    );

    // Audio embed + thumbnail
    const audEmbed = await p.getEmbed({
      id: "video:growgen/ep1",
      mimeType: "audio/mpeg",
      filename: "ep1.mp3",
      meta: { resourceType: "video", isAudio: true, format: "mp3" },
    });
    expect(audEmbed).toEqual({
      type: "audio",
      src: "https://res.cloudinary.com/demo/video/upload/growgen/ep1.mp3",
      controls: true,
      preload: "metadata",
    });
    expect(p.getThumbnailUrl!("video:growgen/ep1.mp3", "audio/mpeg")).toBe(
      "https://res.cloudinary.com/demo/video/upload/growgen/ep1.mp3",
    );

    // Raw embed + thumbnail (no image transforms)
    const rawEmbed = await p.getEmbed(
      { id: "raw:growgen/spec.pdf", filename: "spec.pdf" },
      { width: 600 },
    );
    expect(rawEmbed).toMatchObject({
      type: "image",
      src: "https://res.cloudinary.com/demo/raw/upload/growgen/spec.pdf",
      alt: "spec.pdf",
      cdnBaseUrl: "https://res.cloudinary.com/demo/raw/upload",
    });
    if (rawEmbed.type === "image") {
      expect(rawEmbed.getSrc?.({ width: 400 })).toBe(
        "https://res.cloudinary.com/demo/raw/upload/growgen/spec.pdf",
      );
    }
    expect(p.getThumbnailUrl!("raw:growgen/spec.pdf", "application/pdf", { width: 400 })).toBe(
      "https://res.cloudinary.com/demo/raw/upload/growgen/spec.pdf",
    );
  });

  it("enforces upload size limits, missing credential messages, and HTTP error handling", async () => {
    // Missing default credentials
    const noEnvProvider = createCloudinaryProvider({}, () => undefined);
    await expect(noEnvProvider.list({})).rejects.toThrow(/missing CLOUDINARY_CLOUD_NAME/);
    expect(() => noEnvProvider.getThumbnailUrl!("growgen/a")).toThrow(
      /missing CLOUDINARY_CLOUD_NAME/,
    );

    const partialEnvProvider = createCloudinaryProvider({}, (n) =>
      n === "CLOUDINARY_CLOUD_NAME" ? "demo" : n === "CLOUDINARY_API_KEY" ? "k" : undefined,
    );
    await expect(partialEnvProvider.list({})).rejects.toThrow(/missing CLOUDINARY_API_SECRET/);

    // Missing custom env var name
    const customEnvProvider = createCloudinaryProvider({ apiKeyEnvVar: "MY_CLD_KEY" }, (n) =>
      n === "CLOUDINARY_CLOUD_NAME" ? "demo" : undefined,
    );
    await expect(customEnvProvider.list({})).rejects.toThrow(/missing MY_CLD_KEY/);

    // Upload size limit check (runs before network call)
    const neverFetch = vi.fn();
    const capped = createCloudinaryProvider(
      { maxBytes: 4 },
      env,
      neverFetch as unknown as typeof fetch,
    );
    await expect(
      capped.upload!({ file: new File(["12345"], "big.bin"), filename: "big.bin" }),
    ).rejects.toThrow(/exceeds 4 bytes/);
    expect(neverFetch).not.toHaveBeenCalled();

    // HTTP error statuses on list, get, upload, delete
    const failingFetch = vi.fn(async () => new Response("bad signature", { status: 401 }));
    const errProvider = createCloudinaryProvider({}, env, failingFetch as unknown as typeof fetch);
    await expect(errProvider.list({ mimeType: "image/" })).rejects.toThrow(
      "Cloudinary list failed: 401",
    );
    await expect(errProvider.get!("growgen/a")).rejects.toThrow("Cloudinary get failed: 401");
    await expect(
      errProvider.upload!({
        file: new File(["x"], "a.png", { type: "image/png" }),
        filename: "a.png",
      }),
    ).rejects.toThrow("Cloudinary upload failed: 401 bad signature");
    await expect(errProvider.delete!("growgen/a")).rejects.toThrow("Cloudinary delete failed: 401");
  });

  it("enforces folder confinement and rejects path traversal in get() and delete()", async () => {
    // Valid IDs under configured folder pass
    expect(() => assertInFolder("growgen/pic", "growgen")).not.toThrow();
    expect(() => assertInFolder("growgen/nested/pic", "/growgen/")).not.toThrow();
    expect(() => assertInFolder("growgen/notes#1.txt", "growgen")).not.toThrow();
    expect(() => assertInFolder("any/pic", "")).not.toThrow();

    // Traversal, backslashes, empty segments, and out-of-folder IDs are rejected
    const badIds = [
      "growgen/../other/secret",
      "growgen/sub/../../other/secret",
      "growgen/./pic",
      "growgen//pic",
      "/growgen/pic",
      "growgen/pic/",
      "growgen\\..\\other\\secret",
      "growgen/a\\b",
      "other/pic",
      "growgen-other/pic",
      "growgen",
      "video:growgen/../other/secret",
      "raw:other/secret.pdf",
    ];

    const neverFetch = vi.fn();
    const p = createCloudinaryProvider(
      { folder: "growgen" },
      env,
      neverFetch as unknown as typeof fetch,
    );

    for (const badId of badIds) {
      await expect(p.get!(badId)).rejects.toThrow(/Cloudinary:/);
      await expect(p.delete!(badId)).rejects.toThrow(/Cloudinary:/);
    }
    expect(neverFetch).not.toHaveBeenCalled();

    // Even with an empty folder, traversal and malformed segments are rejected
    expect(() => assertInFolder("../secret", "")).toThrow(/invalid publicId/);
    expect(() => assertInFolder("a/./b", "")).toThrow(/invalid publicId/);
    expect(() => assertInFolder("a//b", "")).toThrow(/invalid publicId/);
    expect(() => assertInFolder("a\\b", "")).toThrow(/invalid publicId/);
    expect(() => assertInFolder("", "")).toThrow(/invalid publicId/);
  });
});

describe("env-portable runtime and config descriptor", () => {
  it("loads runtime.ts cleanly in Node without cloudflare:workers and falls back to process.env", async () => {
    expect(await loadWorkersEnv()).toBeUndefined();

    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "node-cloud");
    const provider = createMediaProvider({});
    expect(provider.getThumbnailUrl!("growgen/pic")).toBe(
      "https://res.cloudinary.com/node-cloud/image/upload/c_fill,w_400,f_auto,q_auto/growgen/pic",
    );
  });

  it("prefers cloudflare:workers env when populated and falls back to process.env when empty or throwing", async () => {
    const workersEnv = await loadWorkersEnv(async () => ({
      env: { CLOUDINARY_CLOUD_NAME: "cf-cloud", EMPTY_VAR: "" },
    }));
    expect(workersEnv).toEqual({ CLOUDINARY_CLOUD_NAME: "cf-cloud", EMPTY_VAR: "" });

    const lookup = createRuntimeEnvLookup(workersEnv, {
      CLOUDINARY_CLOUD_NAME: "node-cloud",
      EMPTY_VAR: "from-node",
      ONLY_NODE: "present",
    });
    expect(lookup("CLOUDINARY_CLOUD_NAME")).toBe("cf-cloud");
    expect(lookup("EMPTY_VAR")).toBe("from-node");
    expect(lookup("ONLY_NODE")).toBe("present");
    expect(lookup("MISSING")).toBeUndefined();

    // Proxy getter that throws outside request context falls back cleanly to process.env
    const throwingWorkersEnv = new Proxy(
      {},
      {
        get() {
          throw new Error("Disallowed outside request context");
        },
      },
    );
    const safeLookup = createRuntimeEnvLookup(throwingWorkersEnv, {
      CLOUDINARY_CLOUD_NAME: "fallback-cloud",
    });
    expect(safeLookup("CLOUDINARY_CLOUD_NAME")).toBe("fallback-cloud");
  });

  it("builds a valid EmDash MediaProviderDescriptor pointing to runtime.ts", () => {
    const descriptor = cloudinaryMedia({ folder: "growgen" });
    expect(descriptor.id).toBe("cloudinary");
    expect(descriptor.capabilities).toEqual({
      browse: true,
      search: false,
      upload: true,
      delete: true,
    });
    expect(descriptor.config).toEqual({ folder: "growgen" });
    expect(existsSync(descriptor.entrypoint)).toBe(true);
  });
});
