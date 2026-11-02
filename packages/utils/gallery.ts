import fs from "node:fs";
import path from "node:path";
import { GALLERY_JSON, GALLERY_TRACE_DIR } from "../consts/config.js";
import { optimizeCloudinaryUrl } from "./cloudinary.ts";
import { readPodcastData } from "./podcast.ts";

export interface GalleryEntry {
  id: string;
  file: string;
  hash: string;
  image: string;
  doc: string;
  /** ISO timestamp of when this entry was first collected into the gallery. */
  addedAt?: string;
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

export function readGalleryData(): GalleryData {
  try {
    const galleryPath = path.join(process.cwd(), GALLERY_JSON);
    if (!fs.existsSync(galleryPath)) return EMPTY_GALLERY_DATA;

    const data = JSON.parse(fs.readFileSync(galleryPath, "utf-8")) as GalleryData;
    return {
      ...data,
      images: data.images.map((entry) => ({
        ...entry,
        image: optimizeCloudinaryUrl(entry.image),
      })),
    };
  } catch (error) {
    console.warn("Could not read gallery data:", error);
    return EMPTY_GALLERY_DATA;
  }
}

export function readGalleryEntry(id: string): GalleryEntry | undefined {
  return readGalleryData().images.find((entry) => entry.id === id);
}

function traceSvgBasename(id: string): string {
  return `${id.replaceAll("/", "-")}.svg`;
}

function galleryTracePath(id: string): string | undefined {
  try {
    const svgPath = path.join(process.cwd(), GALLERY_TRACE_DIR, traceSvgBasename(id));
    return fs.existsSync(svgPath) ? svgPath : undefined;
  } catch {
    return undefined;
  }
}

export function readGalleryTraceSvg(id: string): string | undefined {
  const svgPath = galleryTracePath(id);
  if (!svgPath) return undefined;
  try {
    return fs.readFileSync(svgPath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * URL of the traced SVG served by the prerendered
 * `src/pages/api/gallery/trace/[file].svg.ts` endpoint.
 * Prefer this over `readGalleryTraceSvg` so the SVG bytes are not
 * inlined into the HTML payload.
 */
export function readGalleryTraceUrl(id: string): string | undefined {
  return galleryTracePath(id) ? `/api/gallery/trace/${traceSvgBasename(id)}` : undefined;
}

/** Basenames (without .svg) of all generated gallery trace SVGs. */
export function listGalleryTraceFiles(): string[] {
  try {
    const dir = path.join(process.cwd(), GALLERY_TRACE_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith(".svg"))
      .map((file) => file.replace(/\.svg$/, ""));
  } catch {
    return [];
  }
}

const DOC_DATE_RE = /^\/(\d{4})\/(\d{2})\/(\d{2})\//;

const PODCAST_DOC_PREFIX = "/podcast/";

/** `/podcast/<episode id>` -> `<episode id>`; undefined for any other doc. */
export function galleryDocToPodcastId(doc: string): string | undefined {
  if (!doc.startsWith(PODCAST_DOC_PREFIX)) return undefined;
  const raw = doc.slice(PODCAST_DOC_PREFIX.length).replace(/\/$/, "");
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

let podcastPubDates: Map<string, string> | undefined;

function defaultPodcastPubDate(episodeId: string): string | undefined {
  podcastPubDates ??= new Map(readPodcastData().episodes.map((ep) => [ep.id, ep.pubDate]));
  return podcastPubDates.get(episodeId);
}

/**
 * Date a gallery doc refers to: the path date for blog posts (`/2019/05/25/slug`), or the episode's
 * publish date for podcast docs (`/podcast/<id>`).
 */
export function parseGalleryDocDate(
  doc: string,
  podcastPubDate: (episodeId: string) => string | undefined = defaultPodcastPubDate,
): Date | undefined {
  const episodeId = galleryDocToPodcastId(doc);
  if (episodeId) {
    const pubDate = podcastPubDate(episodeId);
    const d = pubDate ? new Date(pubDate) : undefined;
    if (!d || Number.isNaN(d.getTime())) return undefined;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const match = doc.match(DOC_DATE_RE);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  return new Date(year, month - 1, day);
}

function dayOfYear(month: number, day: number): number {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = day;
  for (let m = 1; m < month; m++) doy += daysInMonth[m]!;
  return doy;
}

export function anniversaryDistance(refDate: Date, entryDate: Date): number {
  const refDoy = dayOfYear(refDate.getMonth() + 1, refDate.getDate());
  const entryDoy = dayOfYear(entryDate.getMonth() + 1, entryDate.getDate());
  const diff = Math.abs(refDoy - entryDoy);
  return Math.min(diff, 365 - diff);
}

export function pickNearestGalleryEntry(
  images: GalleryEntry[],
  refDate: Date = new Date(),
): GalleryEntry | undefined {
  let best: GalleryEntry | undefined;
  let bestDistance = Infinity;

  for (const entry of images) {
    const date = parseGalleryDocDate(entry.doc);
    if (!date) continue;

    const distance = anniversaryDistance(refDate, date);
    if (
      distance < bestDistance ||
      (distance === bestDistance && (entry.addedAt ?? "") > (best?.addedAt ?? ""))
    ) {
      bestDistance = distance;
      best = entry;
    }
  }

  return best;
}

export function findNearestGalleryEntry(refDate: Date = new Date()): GalleryEntry | undefined {
  return pickNearestGalleryEntry(readGalleryData().images, refDate);
}

export function galleryDocToPostId(doc: string): string | undefined {
  if (!doc.startsWith("/")) return undefined;
  const postId = doc.slice(1);
  return postId.length > 0 ? postId : undefined;
}

export interface IGalleryClientPostData {
  cover?: { url: string | { src: string }; alt?: string };
  bgColor?: string;
  titleColor?: string;
  [key: string]: unknown;
}

export interface IGalleryClientPost {
  id: string;
  title: string;
  data: IGalleryClientPostData;
}

export function applyGalleryEntryToClientPost<T extends IGalleryClientPost>(
  clientPost: T,
  entry: GalleryEntry,
): T {
  return {
    ...clientPost,
    data: {
      ...clientPost.data,
      cover: {
        url: optimizeCloudinaryUrl(entry.image),
        alt: clientPost.data.cover?.alt ?? clientPost.title,
      },
      ...(entry.colorSet?.bgColor ? { bgColor: entry.colorSet.bgColor } : {}),
      ...(entry.colorSet?.titleColor ? { titleColor: entry.colorSet.titleColor } : {}),
    },
  };
}
