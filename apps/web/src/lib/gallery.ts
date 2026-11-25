// Gallery data access (hero gallery image + trace SVG URLs). Reads the legacy snapshot written by
// scripts/derive/index.ts; trace SVGs are static copies under public/api/gallery/trace/.
// TODO MIG-3: gallery moves into EmDash; only this module changes.
import { legacy, type GalleryEntry } from "./legacy-data";
import { optimizeCloudinaryUrl } from "./cloudinary";

export type { GalleryEntry };

export const getGalleryEntries = (): GalleryEntry[] => legacy.gallery.map((e) => ({ ...e, image: optimizeCloudinaryUrl(e.image) }));

export const getGalleryEntry = (id: string): GalleryEntry | undefined => getGalleryEntries().find((e) => e.id === id);

/** `08/26/jinghong` -> `/api/gallery/trace/08-26-jinghong.svg` (the PORT-3 static copy). */
export const getGalleryTraceUrl = (id: string): string => `/api/gallery/trace/${id.replaceAll("/", "-")}.svg`;
