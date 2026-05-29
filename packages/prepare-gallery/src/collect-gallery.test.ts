import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";

vi.mock("image-metadata", () => ({
  getColorSet: vi.fn(),
}));

import { collectGallery } from "./collect-gallery.ts";
import { getColorSet } from "image-metadata";
import type { GalleryData, GalleryEntry } from "./types.ts";

const getColorSetMock = getColorSet as Mock;

let tmpRoot = "";
let galleryDir = "";
let outputFile = "";
let traceDir = "";

async function writeGalleryEntry(
  relativePath: string,
  data: { image: string; doc: string },
) {
  const filePath = path.join(galleryDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function readGalleryManifest(): Promise<GalleryData> {
  const raw = await fs.readFile(outputFile, "utf-8");
  return JSON.parse(raw) as GalleryData;
}

describe("collectGallery", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prepare-gallery-"));
    galleryDir = path.join(tmpRoot, "_gallery");
    outputFile = path.join(tmpRoot, "gallery.json");
    traceDir = path.join(tmpRoot, "gallery");

    getColorSetMock.mockResolvedValue({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  test("processes new gallery entries and writes trace SVGs", async () => {
    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    expect(getColorSetMock).toHaveBeenCalledOnce();
    expect(getColorSetMock).toHaveBeenCalledWith(
      "https://example.com/photo.jpg",
      expect.objectContaining({
        baseDir: tmpRoot,
        relPath: "05/25/shenzhen",
        saveTraceToDir: traceDir,
      }),
    );

    const manifest = await readGalleryManifest();
    expect(manifest.images).toHaveLength(1);
    expect(manifest.images[0]).toMatchObject({
      id: "05/25/shenzhen",
      file: "05/25/shenzhen",
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
      colorSet: { bgColor: "#111111", titleColor: "#eeeeee" },
    });
    expect(manifest.images[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.lastUpdated).toBeTruthy();
  });

  test("skips unchanged entries by hash", async () => {
    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    getColorSetMock.mockClear();

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    expect(getColorSetMock).not.toHaveBeenCalled();
  });

  test("re-traces when image URL changes", async () => {
    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    getColorSetMock.mockClear();

    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/new-photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    expect(getColorSetMock).toHaveBeenCalledOnce();
    const manifest = await readGalleryManifest();
    expect(manifest.images[0]?.image).toBe("https://example.com/new-photo.jpg");
  });

  test("reuses colorSet when only doc changes", async () => {
    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    getColorSetMock.mockClear();

    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/updated-doc",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    expect(getColorSetMock).not.toHaveBeenCalled();
    const manifest = await readGalleryManifest();
    expect(manifest.images[0]?.doc).toBe("/2019/05/25/updated-doc");
    expect(manifest.images[0]?.colorSet).toEqual({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });
  });

  test("removes orphaned entries and trace SVGs", async () => {
    await writeGalleryEntry("05/25/shenzhen.json", {
      image: "https://example.com/photo.jpg",
      doc: "/2019/05/25/take-another-black-golden-roof-again",
    });
    await writeGalleryEntry("06/01/beijing.json", {
      image: "https://example.com/beijing.jpg",
      doc: "/2019/06/01/beijing",
    });

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    const orphanSvg = path.join(traceDir, "06-01-beijing.svg");
    await fs.writeFile(orphanSvg, "<svg>trace</svg>", "utf-8");

    await fs.unlink(path.join(galleryDir, "06/01/beijing.json"));

    await collectGallery({
      galleryDir,
      outputFile,
      traceDir,
      baseDir: tmpRoot,
    });

    const manifest = await readGalleryManifest();
    expect(manifest.images).toHaveLength(1);
    expect(manifest.images[0]?.id).toBe("05/25/shenzhen");
    await expect(fs.access(orphanSvg)).rejects.toThrow();
  });
});
