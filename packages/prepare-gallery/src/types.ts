import type { ColorSet } from "image-metadata";

export interface GallerySource {
  image: string;
  doc: string;
}

export interface GalleryEntry {
  id: string;
  file: string;
  hash: string;
  image: string;
  doc: string;
  colorSet?: ColorSet;
}

export interface GalleryData {
  lastUpdated: string;
  images: GalleryEntry[];
}

export interface CollectGalleryOptions {
  galleryDir: string;
  outputFile: string;
  traceDir: string;
  baseDir: string;
}
