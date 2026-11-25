// Pure URL mapping for posts (no emdash imports, so it is unit-testable).
// Legacy URL: /<category>/<YYYY>/<MM>/<DD>/<slug>/ where `legacy_id` = `YYYY/MM/DD/<slug>`.

export interface PostParams {
  category: string;
  year: string;
  month: string;
  day: string;
  slug: string;
  [key: string]: string;
}

const LEGACY_ID_RE = /^(\d{4})\/(\d{2})\/(\d{2})\/(.+)$/;

/** Split a `legacy_id` + category term slug into Astro route params; undefined if malformed. */
export function postParams(legacyId: string, category: string): PostParams | undefined {
  const m = LEGACY_ID_RE.exec(legacyId);
  if (!m || !category || m[4].includes("/")) return undefined;
  return { category, year: m[1], month: m[2], day: m[3], slug: m[4] };
}

/** Public path (with trailing slash, as listed in tests/legacy-urls.txt). */
export function postPath(legacyId: string, category: string): string {
  return `/${category}/${legacyId}/`;
}

/** Inverse of postPath: `/fe/2025/02/21/puzzle-game/` -> { category, legacyId }. */
export function parsePostPath(path: string): { category: string; legacyId: string } | undefined {
  const m = /^\/([^/]+)\/(\d{4}\/\d{2}\/\d{2}\/[^/]+)\/?$/.exec(path);
  return m ? { category: m[1], legacyId: m[2] } : undefined;
}

export const tagHref = (slug: string) => `/tag/${encodeURIComponent(slug)}`;
export const categoryHref = (slug: string) => `/${slug}`;
export const seriesHref = (slug: string) => `/series/${slug}`;
export const cityHref = (slug: string) => `/world/${slug}`;
