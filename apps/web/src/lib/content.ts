// Typed EmDash content helpers (CMS-4): map EmDash entries -> legacy-compatible shapes.
// Build-time only (prerendered pages); never import from a Worker request path.
import {
  getEmDashCollection,
  getEmDashEntry,
  type ContentEntry,
  type EmDashCollections,
  type PortableTextBlock,
} from "emdash";
import { remark } from "remark";
import strip from "strip-markdown";
import { loadSeoByContentId, type ContentSeo } from "./seo";
import { optimizeCloudinaryUrl, optimizeCoverUrl } from "./cloudinary";
import {
  categoryHref,
  cityHref,
  postParams,
  postPath,
  seriesHref,
  tagHref,
  type PostParams,
} from "./legacy-url";
import type {
  ColorSet,
  EmDashCollectionName,
  GalleryEntryInput,
  PageEntryInput,
  PodcastEntryInput,
  PostEntryDataInput,
  PostEntryInput,
  PostFrontmatterExtra,
  PostTaxonomies,
} from "../types/emdash";

export type {
  ColorSet,
  EmDashCollectionName,
  EmDashFeaturedImage,
  EmDashGalleryData,
  EmDashGalleryEntry,
  EmDashPageData,
  EmDashPageEntry,
  EmDashPodcastData,
  EmDashPodcastEntry,
  EmDashPostData,
  EmDashPostEntry,
  GalleryEntryDataInput,
  GalleryEntryInput,
  PageEntryDataInput,
  PageEntryInput,
  PodcastEntryDataInput,
  PodcastEntryInput,
  PostEntryDataInput,
  PostEntryInput,
  PostFrontmatterExtra,
  PostTaxonomies,
  TaxonomyName,
  TaxonomyTermRef,
} from "../types/emdash";

export interface TLink {
  label: string;
  href: string;
}

export interface PostSeries {
  slug: string;
  name?: string;
  number?: number;
}

export interface PostCover {
  url: string;
  alt: string;
}

export interface PostCity {
  slug: string;
  label: string;
}

/** Mirrors the legacy collection entry `data` (src/content.config.ts) where practical. */
export interface BlogPostData {
  type: "post" | "draft";
  category: string;
  adsense: boolean;
  tag?: string[];
  series?: PostSeries;
  cover?: PostCover;
  /** City term slugs and labels. */
  city?: PostCity[];
}

/** Alias matching legacy `packages/utils/post.ts` metadata naming. */
export type PostMetadata = BlogPostData;

export interface BlogPost {
  /** Legacy id `YYYY/MM/DD/<slug>` (legacy: Astro glob id). */
  id: string;
  /** EmDash entry id (slug). */
  entryId: string;
  /** Database ULID (`entry.data.id`): the key of `_emdash_seo` and of `content` references. */
  dbId: string;
  /** ISO timestamps of the CMS record (article:published_time / modified_time). */
  publishedAt?: string;
  updatedAt?: string;
  /** Primary byline display name. */
  author?: string;
  /** Editor SEO-panel overrides (`_emdash_seo`), attached by `getAllPosts()`. */
  seo?: ContentSeo;
  href: string;
  /** `YYYY-MM-DD`, timezone-free (`legacy_date`, falling back to the id). */
  date: string;
  /** Raw markdown (legacy: `post.body`). */
  body: string;
  /** EmDash title field (the legacy site derives the title from the first heading instead). */
  cmsTitle: string;
  data: BlogPostData;
  params: PostParams;
}

/** Alias matching EmDash typed entry naming. */
export type PostEntry = BlogPost;

/** Typed EmDash `podcasts` entry matching `legacy-data.ts` / `packages/utils/podcast.ts`. */
export interface PodcastEntry {
  id: string;
  entryId: string;
  href: string;
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  summary?: string;
  duration?: string;
  audioUrl?: string;
  image?: string;
  colorSet?: ColorSet;
}

/** Typed EmDash `gallery` entry matching `legacy-data.ts` / `packages/utils/gallery.ts`. */
export interface GalleryEntry {
  id: string;
  entryId: string;
  title: string;
  file: string;
  hash: string;
  image: string;
  doc: string;
  addedAt?: string;
  colorSet?: ColorSet;
}

/** Typed EmDash `pages` entry. */
export interface PageEntry {
  id: string;
  entryId: string;
  slug: string | null;
  title: string;
  content: PortableTextBlock[];
}

// -----------------------------------------------------------------------------
// Typed field parsers & extractors
// -----------------------------------------------------------------------------

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidYmd(value: string): boolean {
  const m = YMD_RE.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (isPlainRecord(raw)) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isPlainRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Safely parse EmDash's `legacy_frontmatter_extra` JSON field. */
export function parseFrontmatterExtra(raw: unknown): PostFrontmatterExtra {
  const obj = parseJsonObject(raw);
  if (!obj) return {};
  return obj as PostFrontmatterExtra;
}

/** Safely parse EmDash's `color_set` JSON field (`{ bgColor, titleColor }`). */
export function parseColorSet(raw: unknown): ColorSet | undefined {
  const obj = parseJsonObject(raw);
  if (!obj) return undefined;
  const { bgColor, titleColor } = obj;
  if (
    typeof bgColor === "string" &&
    bgColor.length > 0 &&
    typeof titleColor === "string" &&
    titleColor.length > 0
  ) {
    return { bgColor, titleColor };
  }
  return undefined;
}

/** Resolve `YYYY-MM-DD` from `legacy_date` (when valid), else from `YYYY/MM/DD/<slug>`. */
export function parsePostDate(legacyDate: string | null | undefined, id: string): string {
  if (typeof legacyDate === "string" && isValidYmd(legacyDate)) {
    return legacyDate;
  }
  return id.split("/").slice(0, 3).join("-");
}

/**
 * Legacy `date(post)` helper (`packages/utils/extract.ts`): returns a local calendar `Date`
 * parsed from `post.date` (`YYYY-MM-DD`) or `post.id` (`YYYY/MM/DD/<slug>`).
 */
export function postDate(post: Pick<BlogPost, "date" | "id">): Date {
  const ymd = parsePostDate(post.date, post.id);
  const m = YMD_RE.exec(ymd);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const parts = post.id.split("/");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Extract the final slug segment from a legacy post id (`YYYY/MM/DD/<slug>` -> `<slug>`). */
export function postSlug(post: Pick<BlogPost, "id">): string {
  const idx = post.id.lastIndexOf("/");
  return idx >= 0 ? post.id.slice(idx + 1) : post.id;
}

/** Extract and optimize cover image metadata from EmDash's `featured_image` field. */
export function extractCover(img: PostEntryDataInput["featured_image"]): PostCover | undefined {
  if (!img || typeof img.src !== "string") return undefined;
  const src = img.src.trim();
  if (!src) return undefined;
  return {
    url: optimizeCoverUrl(src),
    alt: typeof img.alt === "string" ? img.alt : "",
  };
}

/** Extract display tag labels (preserving frontmatter casing per MIG-1c; URLs use lowercase). */
export function extractTags(terms: PostTaxonomies | null | undefined): string[] {
  const raw = terms?.tag;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (!t) continue;
    const label =
      (typeof t.label === "string" && t.label) || (typeof t.slug === "string" && t.slug);
    if (label) out.push(label);
  }
  return out;
}

/** Extract series metadata from the `series` taxonomy term and numeric `series_number`. */
export function extractSeries(
  terms: PostTaxonomies | null | undefined,
  seriesNumber: unknown,
): PostSeries | undefined {
  const term = terms?.series?.[0];
  if (!term || typeof term.slug !== "string" || !term.slug) return undefined;
  const hasDistinctName =
    typeof term.label === "string" && term.label.length > 0 && term.label !== term.slug;
  const hasNumber = typeof seriesNumber === "number" && Number.isFinite(seriesNumber);
  return {
    slug: term.slug,
    ...(hasDistinctName ? { name: term.label } : {}),
    ...(hasNumber ? { number: seriesNumber } : {}),
  };
}

/** Extract city `{ slug, label }` tuples from the `city` taxonomy. */
export function extractCities(terms: PostTaxonomies | null | undefined): PostCity[] {
  const raw = terms?.city;
  if (!Array.isArray(raw)) return [];
  const out: PostCity[] = [];
  for (const t of raw) {
    if (!t || typeof t.slug !== "string" || !t.slug) continue;
    const label = typeof t.label === "string" && t.label ? t.label : t.slug;
    out.push({ slug: t.slug, label });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Collection mappers
// -----------------------------------------------------------------------------

function isoOrUndefined(v: Date | string | null | undefined): string | undefined {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Map one EmDash `posts` entry; returns undefined for entries that are not migrated legacy posts. */
export function mapPost(entry: PostEntryInput): BlogPost | undefined {
  const d = entry.data;
  const legacyId = typeof d.legacy_id === "string" ? d.legacy_id.trim() : "";
  if (!legacyId) return undefined;

  const terms = d.terms ?? undefined;
  const category = terms?.category?.[0]?.slug;
  if (!category) throw new Error(`post ${legacyId} has no category term`);

  const params = postParams(legacyId, category);
  if (!params) throw new Error(`post ${legacyId} has a malformed legacy_id`);

  const extra = parseFrontmatterExtra(d.legacy_frontmatter_extra);
  const tag = extractTags(terms);
  const series = extractSeries(terms, d.series_number);
  const cover = extractCover(d.featured_image);
  const city = extractCities(terms);

  return {
    id: legacyId,
    entryId: entry.id,
    dbId: typeof d.id === "string" ? d.id : "",
    ...(isoOrUndefined(d.publishedAt) ? { publishedAt: isoOrUndefined(d.publishedAt) } : {}),
    ...(isoOrUndefined(d.updatedAt) ? { updatedAt: isoOrUndefined(d.updatedAt) } : {}),
    ...(d.byline?.displayName ? { author: d.byline.displayName } : {}),
    href: postPath(legacyId, category),
    date: parsePostDate(d.legacy_date, legacyId),
    body: typeof d.body_md === "string" ? d.body_md : "",
    cmsTitle: typeof d.title === "string" ? d.title : "",
    params,
    data: {
      type: extra.type === "draft" ? "draft" : "post",
      category,
      adsense: Boolean(d.adsense),
      ...(tag.length ? { tag } : {}),
      ...(series ? { series } : {}),
      ...(cover ? { cover } : {}),
      ...(city.length ? { city } : {}),
    },
  };
}

/** Map one EmDash `podcasts` entry; returns undefined if it has no usable episode id. */
export function mapPodcast(entry: PodcastEntryInput): PodcastEntry | undefined {
  const d = entry.data;
  const id =
    (typeof d.legacy_id === "string" && d.legacy_id.trim()) ||
    (typeof d.slug === "string" && d.slug.trim()) ||
    entry.id.trim();
  if (!id) return undefined;

  const colorSet = parseColorSet(d.color_set);
  const image = typeof d.image_url === "string" && d.image_url ? d.image_url : undefined;

  return {
    id,
    entryId: entry.id,
    href: `/podcast/${encodeURIComponent(id)}/`,
    title: typeof d.title === "string" ? d.title : "",
    link: typeof d.link === "string" ? d.link : "",
    pubDate: typeof d.pub_date === "string" ? d.pub_date : "",
    ...(typeof d.description === "string" ? { description: d.description } : {}),
    ...(typeof d.summary === "string" ? { summary: d.summary } : {}),
    ...(typeof d.duration === "string" ? { duration: d.duration } : {}),
    ...(typeof d.audio_url === "string" ? { audioUrl: d.audio_url } : {}),
    ...(image ? { image } : {}),
    ...(colorSet ? { colorSet } : {}),
  };
}

/** Map one EmDash `gallery` entry; returns undefined if it has no legacy_id or image_url. */
export function mapGallery(entry: GalleryEntryInput): GalleryEntry | undefined {
  const d = entry.data;
  const id = typeof d.legacy_id === "string" ? d.legacy_id.trim() : "";
  const imageUrl = typeof d.image_url === "string" ? d.image_url.trim() : "";
  if (!id || !imageUrl) return undefined;

  const colorSet = parseColorSet(d.color_set);

  return {
    id,
    entryId: entry.id,
    title: typeof d.title === "string" ? d.title : "",
    file: typeof d.file === "string" ? d.file : "",
    hash: typeof d.hash === "string" ? d.hash : "",
    image: optimizeCloudinaryUrl(imageUrl),
    doc: typeof d.doc === "string" ? d.doc : "",
    ...(typeof d.added_at === "string" && d.added_at ? { addedAt: d.added_at } : {}),
    ...(colorSet ? { colorSet } : {}),
  };
}

/** Map one EmDash `pages` entry. */
export function mapPage(entry: PageEntryInput): PageEntry {
  const d = entry.data;
  return {
    id: entry.id,
    entryId: entry.id,
    slug: typeof d.slug === "string" ? d.slug : null,
    title: typeof d.title === "string" ? d.title : "",
    content: Array.isArray(d.content) ? d.content : [],
  };
}

// -----------------------------------------------------------------------------
// Paginated EmDash collection readers
// -----------------------------------------------------------------------------

async function fetchAllCollection<K extends EmDashCollectionName>(
  collection: K,
): Promise<ContentEntry<EmDashCollections[K]>[]> {
  const out: ContentEntry<EmDashCollections[K]>[] = [];
  let cursor: string | undefined;
  do {
    const { entries, nextCursor, error } = await getEmDashCollection<K, EmDashCollections[K]>(
      collection,
      {
        limit: 100,
        cursor,
      },
    );
    if (error) throw error;
    out.push(...entries);
    cursor = nextCursor;
  } while (cursor);
  return out;
}

/** All published, migrated posts (paginated fetch). */
export async function getAllPosts(): Promise<BlogPost[]> {
  const entries = await fetchAllCollection("posts");
  // `getEmDashCollection()` does not fold `_emdash_seo` in: one batched query for the SEO panel (GON-203).
  const seoById = await loadSeoByContentId("posts");
  const out: BlogPost[] = [];
  for (const e of entries) {
    const p = mapPost(e);
    if (!p) continue;
    const seo = seoById.get(p.dbId);
    if (seo) p.seo = seo;
    out.push(p);
  }
  return out;
}

/** Fetch a single post by its EmDash entry id/slug; returns undefined if absent or non-legacy. */
export async function getPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const { entry, error } = await getEmDashEntry("posts", slug);
  if (error) throw error;
  if (!entry) return undefined;
  return mapPost(entry);
}

/** All published podcast episodes from EmDash (paginated fetch). */
export async function getAllPodcasts(): Promise<PodcastEntry[]> {
  const entries = await fetchAllCollection("podcasts");
  const out: PodcastEntry[] = [];
  for (const e of entries) {
    const p = mapPodcast(e);
    if (p) out.push(p);
  }
  return out;
}

/** All published gallery entries from EmDash (paginated fetch). */
export async function getAllGallery(): Promise<GalleryEntry[]> {
  const entries = await fetchAllCollection("gallery");
  const out: GalleryEntry[] = [];
  for (const e of entries) {
    const g = mapGallery(e);
    if (g) out.push(g);
  }
  return out;
}

/** All published pages from EmDash (paginated fetch). */
export async function getAllPages(): Promise<PageEntry[]> {
  const entries = await fetchAllCollection("pages");
  return entries.map(mapPage);
}

// -----------------------------------------------------------------------------
// Title, excerpt, taxonomy links & series navigation (legacy extract.ts parity)
// -----------------------------------------------------------------------------

/** Legacy title rule (extract.ts): first heading of the body, else cmsTitle, else slug with dashes as spaces. */
export function postTitle(
  post: Pick<BlogPost, "id" | "cmsTitle">,
  headings: readonly { text: string }[],
): string {
  const firstHeading = headings[0]?.text;
  if (firstHeading) return firstHeading;
  if (post.cmsTitle) return post.cmsTitle;
  return postSlug(post).replace(/-/g, " ");
}

/** Cheap title (first markdown heading outside code fences) for series neighbours, without rendering them. */
export function quickTitle(post: Pick<BlogPost, "id" | "cmsTitle" | "body">): string {
  let fence = false;
  for (const line of post.body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) return m[1];
    }
  }
  return postTitle(post, []);
}

/** Legacy excerpt rule (extract.ts): strip markdown, first 120 chars + "...". */
export async function postExcerpt(body: string, words = 120): Promise<string> {
  // Legacy returns "" only for an empty body (frontmatter-only post; EmDash may store it as
  // whitespace). A non-empty body that strips to nothing (image-only, heading-only) stays "...".
  if (!body?.trim()) return "";
  const doc = await remark().use(strip).process(body.replace(/#.*/, ""));
  return String(doc).slice(0, words) + "...";
}

/** Legacy `category(post)` link helper (`packages/utils/extract.ts`). */
export function postCategory(post: Pick<BlogPost, "data">): TLink {
  const { category } = post.data;
  return { label: category, href: categoryHref(category) };
}

/** Legacy `tags(post)` link helper (`packages/utils/extract.ts`), preserving display label casing. */
export function postTags(post: Pick<BlogPost, "data">): TLink[] {
  const { tag = [] } = post.data;
  return tag.map((t) => ({ label: t, href: tagHref(t.toLowerCase()) }));
}

/** Legacy `series(post)` link helper (`packages/utils/extract.ts`). */
export function postSeries(post: Pick<BlogPost, "data">): TLink | undefined {
  const { series } = post.data;
  if (!series) return undefined;
  return { label: series.name ?? series.slug, href: seriesHref(series.slug) };
}

/** City taxonomy link helper. */
export function postCities(post: Pick<BlogPost, "data">): TLink[] {
  const { city = [] } = post.data;
  return city.map((c) => ({ label: c.label, href: cityHref(c.slug) }));
}

/** Badge links in legacy order: category, tags, series (+ cities, new in EmDash). */
export function postLinks(post: BlogPost): TLink[] {
  const series = postSeries(post);
  return [postCategory(post), ...postTags(post), ...(series ? [series] : []), ...postCities(post)];
}

export interface SeriesNav {
  slug: string;
  name: string;
  href: string;
  number?: number;
  total: number;
  prev?: { title: string; href: string };
  next?: { title: string; href: string };
}

/** Prev/next within a series, ordered by series_number then date. Titles come from `titleOf`. */
export function seriesNav(
  post: BlogPost,
  all: readonly BlogPost[],
  titleOf: (p: BlogPost) => string,
): SeriesNav | undefined {
  const s = post.data.series;
  if (!s) return undefined;
  const members = all
    .filter((p) => p.data.series?.slug === s.slug)
    .sort(
      (a, b) =>
        (a.data.series?.number ?? Infinity) - (b.data.series?.number ?? Infinity) ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    );
  const i = members.findIndex((p) => p.id === post.id);
  const link = (p?: BlogPost) => (p ? { title: titleOf(p), href: p.href } : undefined);
  return {
    slug: s.slug,
    name: s.name ?? s.slug,
    href: seriesHref(s.slug),
    number: s.number,
    total: members.length,
    prev: i > 0 ? link(members[i - 1]) : undefined,
    next: i >= 0 ? link(members[i + 1]) : undefined,
  };
}
