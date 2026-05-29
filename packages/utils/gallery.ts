import fs from "node:fs";
import path from "node:path";
import { GALLERY_JSON, GALLERY_TRACE_DIR } from "../consts/config.js";

export interface GalleryEntry {
  id: string;
  file: string;
  hash: string;
  image: string;
  doc: string;
  colorSet?: {
    bgColor: string;
    titleColor: string;
  };
}

export interface GalleryData {
  lastUpdated: string;
  images: GalleryEntry[];
}

const EMPTY_GALLERY_DATA: GalleryData = {
  lastUpdated: "",
  images: [],
};

function traceSvgBasename(id: string): string {
  return `${id.replaceAll("/", "-")}.svg`;
}

export function readGalleryData(): GalleryData {
  try {
    const galleryPath = path.join(process.cwd(), GALLERY_JSON);
    if (!fs.existsSync(galleryPath)) return EMPTY_GALLERY_DATA;

    return JSON.parse(fs.readFileSync(galleryPath, "utf-8")) as GalleryData;
  } catch (error) {
    console.warn("Could not read gallery data:", error);
    return EMPTY_GALLERY_DATA;
  }
}

export function readGalleryEntry(id: string): GalleryEntry | undefined {
  return readGalleryData().images.find((entry) => entry.id === id);
}

export function readGalleryTraceSvg(id: string): string | undefined {
  try {
    const svgPath = path.join(
      process.cwd(),
      GALLERY_TRACE_DIR,
      traceSvgBasename(id),
    );
    if (!fs.existsSync(svgPath)) return undefined;
    return fs.readFileSync(svgPath, "utf-8");
  } catch {
    return undefined;
  }
}
