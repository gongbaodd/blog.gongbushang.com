// Pure URL mapping for posts (no emdash imports, so it is unit-testable).
// Post URL (GON-270): /<YYYY>/<MM>/<DD>/<slug>/ where the post id (`legacy_id` or the synthetic id) = `YYYY/MM/DD/<slug>`.
// Until GON-270 the URL was /<category>/<YYYY>/<MM>/<DD>/<slug>/; those paths are 301s in public/_redirects. The category is post
// data now (listings, badges) and takes no part in the URL.

export interface PostParams {
  year: string;
  month: string;
  day: string;
  slug: string;
  [key: string]: string;
}

const LEGACY_ID_RE = /^(\d{4})\/(\d{2})\/(\d{2})\/(.+)$/;

/** Split a post id into Astro route params; undefined if malformed. */
export function postParams(legacyId: string): PostParams | undefined {
  const m = LEGACY_ID_RE.exec(legacyId);
  if (!m || m[4].includes("/")) return undefined;
  return { year: m[1], month: m[2], day: m[3], slug: m[4] };
}

/** Public path (with trailing slash, as built): `2025/02/21/puzzle-game` -> `/2025/02/21/puzzle-game/`. */
export function postPath(legacyId: string): string {
  return `/${legacyId}/`;
}

/** Inverse of postPath: `/2025/02/21/puzzle-game/` -> `2025/02/21/puzzle-game`; undefined for any other path (a slug has no dot, so `/2025/08/18/record.gif` is not a post). */
export function parsePostPath(path: string): { legacyId: string } | undefined {
  const m = /^\/(\d{4}\/\d{2}\/\d{2}\/[^/.]+)\/?$/.exec(path);
  return m ? { legacyId: m[1] } : undefined;
}

/** The retired `/<category>/<YYYY>/<MM>/<DD>/<slug>/` path of a post (a 301 now). */
export function retiredPostPath(legacyId: string, category: string): string {
  return `/${category}/${legacyId}/`;
}

/** Inverse of retiredPostPath: `/fe/2025/02/21/puzzle-game/` -> { category, legacyId }. */
export function parseRetiredPostPath(
  path: string,
): { category: string; legacyId: string } | undefined {
  const m = /^\/([^/]+)\/(\d{4}\/\d{2}\/\d{2}\/[^/]+)\/?$/.exec(path);
  return m ? { category: m[1], legacyId: m[2] } : undefined;
}

/**
 * Key of a post in the page-view service (pv.growgen.xyz, `ViewCount`): the pathname without a trailing slash. The service counts
 * under the path an imported post had before GON-270, so pass its category (imported posts only) to keep
 * `/<category>/<YYYY>/<MM>/<DD>/<slug>` and carry the count over without migrating data. A post without a legacy path uses its
 * current path.
 */
export function viewCountPath(legacyId: string, retiredCategory?: string): string {
  return retiredCategory ? `/${retiredCategory}/${legacyId}` : `/${legacyId}`;
}

/**
 * URL slug of a tag name (GON-240): lowercase, `#` spelled out as `-sharp` (`C#` -> `c-sharp`, `F#` -> `f-sharp`). `#` cannot be
 * a path segment (the Worker asset handler decodes `%23` back to `#` and misses the file), so the slug never carries it.
 * Idempotent: a slug maps to itself. Old `/tag/c%23/` URLs are 301s in public/_redirects.
 */
export const tagSlug = (name: string) => name.toLowerCase().replace(/#/g, "-sharp");

/** `/tag/<slug>` for a tag name or slug. */
export const tagHref = (name: string) => `/tag/${encodeURIComponent(tagSlug(name))}`;
export const categoryHref = (slug: string) => `/${slug}`;
export const seriesHref = (slug: string) => `/series/${slug}`;
export const cityHref = (slug: string) => `/world/${slug}`;
