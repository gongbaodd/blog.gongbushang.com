// GON-203: per-entry SEO-panel overrides (`_emdash_seo`) for prerendered pages.
// `getEmDashCollection()` does not fold `_emdash_seo` in (only single-entry `getEmDashEntry()` does, and `<EmDashHead>`'s
// request-cache overlay only runs on SSR), so the prerendered post route reads the whole collection's rows in ONE query
// and resolves them with EmDash's own `getSeoMeta()`.
// Build-time only (prerendered pages); never import from a Worker request path.
import type { ContentSeo } from "emdash";
import { getSeoMeta } from "emdash/seo";
import { getDb } from "emdash/runtime";
import { SITE_TITLE } from "../consts";

export type { ContentSeo };

/** The raw `_emdash_seo` columns the build reads. */
export interface SeoRow {
  content_id: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_image: string | null;
  seo_canonical: string | null;
  /** SQLite/D1 return 0/1, Postgres drivers may return a boolean. */
  seo_no_index: number | boolean | string | null;
}

/** Map a raw row to EmDash's `ContentSeo` (same shape `extractSeo` builds for a folded entry). */
export function rowToSeo(row: SeoRow): ContentSeo {
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  return {
    title: str(row.seo_title),
    description: str(row.seo_description),
    image: str(row.seo_image),
    canonical: str(row.seo_canonical),
    noIndex: row.seo_no_index === true || Number(row.seo_no_index) === 1,
  };
}

/** True when the panel overrides anything (an all-empty row is the same as no row). */
export function hasSeoOverride(seo: ContentSeo | undefined): seo is ContentSeo {
  return Boolean(seo && (seo.title || seo.description || seo.image || seo.canonical || seo.noIndex));
}

/** Missing `_emdash_seo` table (SQLite "no such table", Postgres 42P01 / "relation ... does not exist"): no SEO rows. */
export function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e?.code === "42P01") return true;
  const m = typeof e?.message === "string" ? e.message.toLowerCase() : "";
  if (m.includes("no such table")) return true;
  return (m.includes("does not exist") || m.includes("doesn't exist")) && (m.includes("relation") || m.includes("table"));
}

const cache = new Map<string, Promise<Map<string, ContentSeo>>>();

async function queryAll(collection: string): Promise<Map<string, ContentSeo>> {
  const out = new Map<string, ContentSeo>();
  try {
    const db = await getDb();
    const rows = (await db
      .selectFrom("_emdash_seo")
      .select(["content_id", "seo_title", "seo_description", "seo_image", "seo_canonical", "seo_no_index"])
      .where("collection", "=", collection)
      .execute()) as unknown as SeoRow[];
    for (const r of rows) {
      const seo = rowToSeo(r);
      if (hasSeoOverride(seo)) out.set(r.content_id, seo);
    }
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return out;
}

/**
 * One batched query: every `_emdash_seo` row of a collection, keyed by `entry.data.id` (the database ULID, NOT the slug).
 * A missing table counts as no rows. Memoised per collection for the build process, except in dev (editors change the
 * panel while `astro dev` runs) and after a failure (a rejected promise is evicted so the next call retries).
 */
export function loadSeoByContentId(collection: string): Promise<Map<string, ContentSeo>> {
  if (import.meta.env?.DEV) return queryAll(collection);
  let p = cache.get(collection);
  if (!p) {
    p = queryAll(collection);
    cache.set(collection, p);
    p.catch(() => {
      if (cache.get(collection) === p) cache.delete(collection);
    });
  }
  return p;
}

/** Test hook: forget memoised results. */
export function clearSeoCache(): void {
  cache.clear();
}

const DAY_MS = 86_400_000;

/**
 * `article:modified_time` / JSON-LD `dateModified`. Imported posts all carry the import date as `updated_at`, so it only
 * counts when it is more than a day after `published_at` (a real edit in the admin); otherwise the legacy date is used.
 */
export function articleModifiedTime(post: { date: string; publishedAt?: string; updatedAt?: string }): string {
  if (post.updatedAt && post.publishedAt) {
    const gap = Date.parse(post.updatedAt) - Date.parse(post.publishedAt);
    if (Number.isFinite(gap) && gap > DAY_MS) return post.updatedAt;
  }
  return post.date;
}

export interface ResolveSeoInput {
  /** Fallback page title (the editor title / first heading), WITHOUT the site prefix. */
  title: string;
  /** Fallback description (the excerpt). */
  description: string;
  /** Fallback image (cover). */
  image?: string | null;
  /** The entry's SEO panel, if any. */
  seo?: ContentSeo;
  /** Absolute site origin, used for relative `canonical`/`image` panel values. */
  siteUrl?: string;
  /** Public path of the page, e.g. `/fe/2025/02/21/slug/` (canonical fallback). */
  path: string;
}

export interface ResolvedSeo {
  /** `<title>`. */
  title: string;
  /** `og:title` / `twitter:title` / JSON-LD headline. Same value as `title` (legacy parity). */
  pageTitle: string;
  description: string;
  image: string | null;
  canonical: string | null;
  /** EmDash's robots value for a panel noindex (`noindex, nofollow`), else null. */
  robots: string | null;
  /** True only when the editor ticked "noindex" in the panel. Never lifts the site-wide pre-cutover noindex. */
  noindex: boolean;
}

/**
 * Resolve the head values of one post through `getSeoMeta()`. Legacy title format is `<site> | <title>` (the legacy
 * `<title>` and og:title), so the default keeps that prefix; a panel title replaces the whole string.
 */
export function resolvePostSeo(input: ResolveSeoInput): ResolvedSeo {
  const meta = getSeoMeta(
    { data: { title: input.title }, seo: input.seo },
    {
      defaultTitle: `${SITE_TITLE} | ${input.title}`,
      defaultDescription: input.description,
      defaultOgImage: input.image ?? undefined,
      siteUrl: input.siteUrl,
      path: input.path,
    },
  );
  const title = meta.title;
  return {
    title,
    pageTitle: meta.ogTitle || title,
    description: meta.description ?? input.description,
    image: meta.ogImage,
    canonical: meta.canonical,
    robots: meta.robots,
    noindex: Boolean(input.seo?.noIndex),
  };
}
