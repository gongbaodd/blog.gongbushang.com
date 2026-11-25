// Gallery data access (hero gallery image + trace SVG URLs). Images live in the EmDash `gallery` collection (MIG-3);
// scripts/derive/index.ts reads them (plus the cached trace SVGs, derived.gallery_traces) into
// src/generated/legacy-data.json and writes the traces as static files under public/api/gallery/trace/.
import { legacy, type GalleryEntry } from "./legacy-data";
import { optimizeCloudinaryUrl } from "./cloudinary";

export type { GalleryEntry };

export const getGalleryEntries = (): GalleryEntry[] =>
  legacy.gallery.map((e) => ({ ...e, image: optimizeCloudinaryUrl(e.image) }));

export const getGalleryEntry = (id: string): GalleryEntry | undefined =>
  getGalleryEntries().find((e) => e.id === id);

/** `08/26/jinghong` -> `/api/gallery/trace/08-26-jinghong.svg` (the PORT-3 static copy). */
export const getGalleryTraceUrl = (id: string): string =>
  `/api/gallery/trace/${id.replaceAll("/", "-")}.svg`;
