import { beforeEach, describe, expect, it, vi } from "vitest";
import { galleryPlaceholderStyle } from "../particle-hero/placeholder-style";

const legacyMock = vi.hoisted(() => ({
  legacy: {
    gallery: [] as unknown[],
    podcast: [] as unknown[],
    traceFiles: [] as string[],
    placeholderTraceFiles: [] as string[] | undefined,
  },
}));
vi.mock("./legacy-data", () => ({ legacy: legacyMock.legacy, postRecord: () => undefined }));
vi.mock("./content", () => ({ getAllPosts: async () => [], postExcerpt: () => "" }));

const IMG = "https://res.cloudinary.com/x/image/upload/v1/g/a.jpg";
const entry = (id: string) => ({ id, file: id, hash: "", image: IMG, doc: "", colorSet: { bgColor: "#102030", titleColor: "t" } });

beforeEach(() => {
  legacyMock.legacy.traceFiles = ["08-26-real.svg", "09-01-new.svg"];
  legacyMock.legacy.placeholderTraceFiles = ["09-01-new.svg"];
});

describe("gallery hero image (real trace vs placeholder)", () => {
  it("isPlaceholderTrace follows placeholderTraceFiles, and tolerates its absence", async () => {
    const { isPlaceholderTrace } = await import("./gallery");
    expect(isPlaceholderTrace("09/01/new")).toBe(true);
    expect(isPlaceholderTrace("08/26/real")).toBe(false);
    legacyMock.legacy.placeholderTraceFiles = undefined;
    expect(isPlaceholderTrace("09/01/new")).toBe(false);
  });

  it("toHeroGalleryImage keeps the trace URL for a real trace and swaps in the blurred rendition for a placeholder", async () => {
    const { toHeroGalleryImage } = await import("./gallery");
    expect(toHeroGalleryImage(entry("08/26/real"))).toMatchObject({ traceUrl: "/api/gallery/trace/08-26-real.svg", lqipUrl: undefined });
    const p = toHeroGalleryImage(entry("09/01/new"));
    expect(p.traceUrl).toBeUndefined();
    expect(p.lqipUrl).toContain("w_48,e_blur:1000");
    expect(p.colorSet?.bgColor).toBe("#102030");
  });

  it("homeGalleryImage applies the same rule to the nearest entry", async () => {
    const { homeGalleryImage } = await import("./listing");
    legacyMock.legacy.podcast = [{ id: "ep", pubDate: "Sun, 01 Sep 2024 07:30:00 GMT" }];
    legacyMock.legacy.gallery = [{ ...entry("09/01/new"), doc: "/podcast/ep" }];
    const p = homeGalleryImage(new Date("2025-09-01T12:00:00Z"));
    expect(p?.traceUrl).toBeUndefined();
    expect(p?.lqipUrl).toContain("e_blur");
    legacyMock.legacy.gallery = [{ ...entry("08/26/real"), doc: "/podcast/ep" }];
    expect(homeGalleryImage(new Date("2025-09-01T12:00:00Z"))).toMatchObject({ traceUrl: "/api/gallery/trace/08-26-real.svg", lqipUrl: undefined });
  });
});

describe("ParticleHero placeholder background", () => {
  it("uses the trace, else the blurred rendition, over bgColor", () => {
    expect(galleryPlaceholderStyle({ traceUrl: "/t.svg", lqipUrl: "/l.jpg", colorSet: { bgColor: "#111", titleColor: "x" } })).toMatchObject({ backgroundImage: "url(/t.svg)", backgroundColor: "#111" });
    expect(galleryPlaceholderStyle({ lqipUrl: "/l.jpg" })).toMatchObject({ backgroundImage: "url(/l.jpg)", backgroundColor: undefined });
    expect(galleryPlaceholderStyle({ colorSet: { bgColor: "#111", titleColor: "x" } })).toMatchObject({ backgroundColor: "#111", backgroundImage: undefined });
  });
  it("renders no placeholder with no colorSet and no lqipUrl or trace", () => {
    expect(galleryPlaceholderStyle({})).toBeUndefined();
    expect(galleryPlaceholderStyle(undefined)).toBeUndefined();
  });
});
