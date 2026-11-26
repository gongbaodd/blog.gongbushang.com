// Strongly-typed EmDash collection, taxonomy, and JSON field definitions (CMS-4).
// Anchored to the generated `apps/web/emdash-env.d.ts` module augmentation (`EmDashCollections`)
// and the CMS-1 schema (`apps/web/scripts/schema/apply.mjs`).
import type { ContentEntry, EmDashCollections, PortableTextBlock, TaxonomyTerm } from "emdash";

/** All EmDash collection slugs registered in `apps/web/emdash-env.d.ts`. */
export type EmDashCollectionName = keyof EmDashCollections;

/** Canonical CMS-1 taxonomy names attached to `posts`. */
export type TaxonomyName = "category" | "tag" | "series" | "city";

/** Minimal term shape satisfied by both runtime `TaxonomyTerm` and unit-test fixtures. */
export type TaxonomyTermRef = Pick<TaxonomyTerm, "slug" | "label">;

/** Known taxonomy map on a post entry, also compatible with EmDash's `Record<string, TaxonomyTerm[]>`. */
export type PostTaxonomies = Partial<
  Record<TaxonomyName | (string & {}), readonly TaxonomyTermRef[]>
>;

/** Typed shape of the `color_set` JSON field on `podcasts` and `gallery`. */
export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

/** Typed shape of the `legacy_frontmatter_extra` JSON field on `posts`. */
export interface PostFrontmatterExtra {
  type?: "post" | "draft" | (string & {});
  [key: string]: unknown;
}

/** Raw collection data interfaces derived from `emdash-env.d.ts` (`EmDashCollections`). */
export type EmDashPostData = EmDashCollections["posts"];
export type EmDashPodcastData = EmDashCollections["podcasts"];
export type EmDashGalleryData = EmDashCollections["gallery"];
export type EmDashPageData = EmDashCollections["pages"];

/** Featured image object shape from EmDash's `image` field on `posts`. */
export type EmDashFeaturedImage = NonNullable<EmDashPostData["featured_image"]>;

/** Full `ContentEntry<T>` types returned by `getEmDashCollection` / `getEmDashEntry`. */
export type EmDashPostEntry = ContentEntry<EmDashPostData>;
export type EmDashPodcastEntry = ContentEntry<EmDashPodcastData>;
export type EmDashGalleryEntry = ContentEntry<EmDashGalleryData>;
export type EmDashPageEntry = ContentEntry<EmDashPageData>;

/** Structural input accepted by `mapPost`: satisfied by `EmDashPostEntry` and lightweight fixtures. */
export type PostEntryDataInput = Partial<Omit<EmDashPostData, "terms" | "featured_image">> & {
  featured_image?: Pick<EmDashFeaturedImage, "src" | "alt"> | EmDashFeaturedImage | null;
  terms?: PostTaxonomies | null;
  /** Database ULID (`entry.id` is the slug); `_emdash_seo` is keyed by this. */
  id?: string;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  /** Primary byline (eagerly loaded by EmDash). */
  byline?: { displayName?: string | null } | null;
};

export interface PostEntryInput {
  id: string;
  data: PostEntryDataInput;
}

/** Structural input accepted by `mapPodcast`: satisfied by `EmDashPodcastEntry` and lightweight fixtures. */
export type PodcastEntryDataInput = Partial<EmDashPodcastData>;

export interface PodcastEntryInput {
  id: string;
  data: PodcastEntryDataInput;
}

/** Structural input accepted by `mapGallery`: satisfied by `EmDashGalleryEntry` and lightweight fixtures. */
export type GalleryEntryDataInput = Partial<EmDashGalleryData>;

export interface GalleryEntryInput {
  id: string;
  data: GalleryEntryDataInput;
}

/** Structural input accepted by `mapPage`: satisfied by `EmDashPageEntry` and lightweight fixtures. */
export type PageEntryDataInput = Partial<EmDashPageData>;

export interface PageEntryInput {
  id: string;
  data: PageEntryDataInput;
}

export type { ContentEntry, PortableTextBlock, TaxonomyTerm };
