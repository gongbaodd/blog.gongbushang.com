// Post ids for posts created in the admin (GON-269). Pure, dependency-free: shared by apps/web (content.ts), the derive and seo
// scripts (tsx) and the admin slug-validation plugin.
//
// An imported post keeps its `legacy_id` (`YYYY/MM/DD/<slug>`). A post without one gets the synthetic id
// `YYYY/MM/DD/<entry slug>`, where the date is the calendar date of `published_at` in POST_URL_TZ, so everything keyed on the id
// (legacy-url.ts, routes, derive caches, listings, /api) works unchanged. Since GON-270 the public URL is exactly `/<id>/`.
//
// Timezone caveat (GON-270): EmDash builds its own admin "View" link from the collection urlPattern `/{year}/{month}/{day}/{slug}`
// with the UTC date of `published_at` (interpolateUrlPattern, i18n/resolve.ts) and the entry slug. This module dates a new post in
// Europe/Tallinn (UTC+2/+3), so a post published between 22:00 (21:00 in summer) UTC and midnight UTC has a site URL one day ahead
// of the View link. The site URL is the one that counts (legacy URLs must not change), so it keeps the Tallinn rule. Imported posts
// are unaffected: their id is `legacy_id`, and apps/web/scripts/schema/apply-post-urls.mjs backfills their `published_at` to noon
// UTC of the legacy day, where both zones agree.

/** The legacy site was built in Estonia; the same zone dates imported posts (listing-core re-exports it). */
export const LEGACY_TZ = "Europe/Tallinn";
/** The single timezone that turns `published_at` into the URL date of a new post. */
export const POST_URL_TZ = LEGACY_TZ;

/**
 * One URL path segment: lowercase letters, digits and hyphens, starting with a letter or digit. Deliberately looser than
 * `^[a-z0-9]+(?:-[a-z0-9]+)*$`: 5 of the 995 imported slugs contain `--` or end in `-` (e.g. `2017-09-20-run-with-the-wind-`) and must
 * stay publishable. Every one of the 995 slugs in tests/legacy-urls.txt (`YYYY-MM-DD-<slug>`) satisfies it.
 */
export const POST_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export const isValidPostSlug = (slug: unknown): slug is string => typeof slug === "string" && POST_SLUG_RE.test(slug);

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: POST_URL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** `YYYY/MM/DD` of an instant in POST_URL_TZ; undefined for a missing or unparsable value. */
export function postUrlDate(publishedAt: Date | string | null | undefined): string | undefined {
  if (!publishedAt) return undefined;
  const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return undefined;
  const p: Record<string, string> = {};
  for (const { type, value } of ymdFmt.formatToParts(d)) if (type !== "literal") p[type] = value;
  return `${p.year}/${p.month}/${p.day}`;
}

/**
 * Id of a post without `legacy_id`: `YYYY/MM/DD/<slug>`. undefined when it was never published (no `published_at`);
 * throws when the slug is not a single valid path segment (the admin blocks publishing it, this is the build-time backstop).
 */
export function newPostId(slug: string, publishedAt: Date | string | null | undefined): string | undefined {
  const date = postUrlDate(publishedAt);
  if (!date) return undefined;
  if (!isValidPostSlug(slug)) {
    throw new Error(`post "${slug}" has an invalid slug: it must be one path segment of lowercase letters, digits and hyphens (${POST_SLUG_RE})`);
  }
  return `${date}/${slug}`;
}

/** The id of any post row: its `legacy_id` when imported, else the synthetic one (undefined when unpublished). */
export function resolvePostId(row: { legacyId?: string | null; slug: string; publishedAt?: Date | string | null }): string | undefined {
  const legacy = typeof row.legacyId === "string" ? row.legacyId.trim() : "";
  return legacy || newPostId(row.slug, row.publishedAt);
}

/** Fails (clear message) when two posts share the same `key` (their id, which is also their public path minus the category). */
export function assertUniquePostUrls(posts: { key: string; entry: string }[], what = "URL"): void {
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const { key, entry } of posts) {
    const first = seen.get(key);
    if (first === undefined) seen.set(key, entry);
    else dupes.push(`${key} (posts "${first}" and "${entry}")`);
  }
  if (dupes.length) {
    throw new Error(
      `duplicate post ${what}: ${dupes.join("; ")}. Two posts published on the same day (Europe/Tallinn) with the same slug clash: change one slug in the admin.`,
    );
  }
}
