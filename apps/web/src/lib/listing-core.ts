// Pure listing logic (no emdash / fs imports, unit-testable): the legacy `mapServerPostToClient`
// (packages/utils/post.ts), `filter.ts` helpers and badge builders, over a source-agnostic entry.
// Output shapes (field names, key order, item order, page size) match the legacy JSON/NDJSON APIs.
import { POST_CARD_CLASSNAMES, POST_CARD_LAYOUT, POST_COUNT_PER_PAGE } from "../consts-list";
import { optimizeCoverUrl } from "./cloudinary";
import { tagSlug } from "./legacy-url";

export type TLink = { label: string; href: string };
export type TCountLink = TLink & { count: number };

import { LEGACY_TZ } from "./post-id";

/** The legacy site was built in Estonia: `date` instants in its output are local midnight there. */
export { LEGACY_TZ };

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: LEGACY_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Calendar/clock fields of an instant in LEGACY_TZ. `month` is 1-12. */
export function localParts(d: Date) {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFmt.formatToParts(d))
    if (type !== "literal") p[type] = Number(value);
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
  };
}

function offsetMs(instant: number): number {
  const p = localParts(new Date(instant));
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(instant / 1000) * 1000
  );
}

/** `new Date(y, m-1, d)` as the legacy build computed it (local midnight in LEGACY_TZ). */
export function localMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  const first = wall - offsetMs(wall);
  return new Date(wall - offsetMs(first));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dayjs(date).format("YYYY-MM-DD") in LEGACY_TZ. */
export function dateText(d: Date): string {
  const p = localParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

/** Source-agnostic list entry (a blog post or a synthetic podcast post). */
export interface ListEntry {
  /** Legacy id (`YYYY/MM/DD/slug`, or the podcast episode id). */
  id: string;
  /** Markdown body; undefined for podcast entries (legacy: synthetic posts have no top-level body). */
  body?: string;
  title: string;
  date: Date;
  /** Legacy frontmatter-shaped data, keys in legacy schema order. */
  data: {
    category: string;
    tag?: string[];
    series?: { slug: string; name?: string; number?: number };
    cover?: { url: string; alt?: string };
    city?: string[];
    [key: string]: unknown;
  };
  /** Color set read from legacy metadata; only applied to entries with a cover. */
  colorSet?: ColorSet;
}

export interface ClientPostData {
  category: string;
  tag?: string[];
  series?: { slug: string; name?: string; number?: number };
  cover?: { url: string | { src: string }; alt?: string };
  city?: string[];
  bgClass?: string;
  bgColor?: string;
  titleColor?: string;
  layout: string;
  [key: string]: any;
}

export interface TClientPost {
  id: string;
  href: string;
  title: string;
  date: Date | string;
  dateText: string;
  data: ClientPostData;
  excerpt: string;
}

export function wordcount(text: string): number {
  if (!text || typeof text !== "string") return 0;
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      return [...new Intl.Segmenter("en", { granularity: "word" }).segment(text)].filter(
        (w) => w.isWordLike,
      ).length;
    } catch {
      /* fall through */
    }
  }
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function layoutFor(title: string, tagCount: number): POST_CARD_LAYOUT {
  const count = wordcount(title) + tagCount;
  if (count < 3) return POST_CARD_LAYOUT.xs;
  if (count < 4) return POST_CARD_LAYOUT.sm;
  if (count < 5) return POST_CARD_LAYOUT.md;
  if (count < 10) return POST_CARD_LAYOUT.lg;
  return POST_CARD_LAYOUT.xl;
}

/** Legacy `mapServerPostToClient` for one entry (colorize -> layout -> cover optimisation). */
export function toClientPost(entry: ListEntry, excerpt: string): TClientPost {
  const data: Record<string, any> = { ...entry.data };
  if (!data.cover) {
    const p = localParts(entry.date);
    const index = p.day + (p.month - 1) + p.year + entry.title.length;
    data.bgClass = POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length];
  } else if (entry.colorSet) {
    data.bgColor = entry.colorSet.bgColor;
    data.titleColor = entry.colorSet.titleColor;
  }
  data.layout = layoutFor(entry.title, entry.data.tag?.length ?? 0);
  if (data.cover?.url) data.cover = { ...data.cover, url: optimizeCoverUrl(data.cover.url) };

  return {
    id: entry.id,
    href: `/${entry.data.category}/${entry.id}`,
    title: entry.title,
    date: entry.date,
    dateText: dateText(entry.date),
    data: data as ClientPostData,
    excerpt,
  };
}

/** Legacy sortPostsByDate: same inconsistent comparator (ties return 1), same engine sort, so ties order the same. */
export function sortByDate<T extends { date: Date }>(entries: T[]): T[] {
  return entries.toSorted((a, b) => (new Date(a.date) > new Date(b.date) ? -1 : 1));
}

export function createPostMap<T>(items: T[], keysOf: (item: T) => string[]): Map<string, Set<T>> {
  const map = new Map<string, Set<T>>();
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(item);
    }
  }
  return map;
}

/** Legacy `page()`: split each result into pages of POST_COUNT_PER_PAGE. */
export function paginate<P extends Record<string, string>, T>(
  results: { params: P; props: { posts: T[] } & Record<string, unknown> }[],
  size = POST_COUNT_PER_PAGE,
) {
  const out: { params: P & { page: string }; props: { posts: T[] } & Record<string, unknown> }[] =
    [];
  for (const r of results) {
    for (let j = 0; j < r.props.posts.length; j += size) {
      out.push({
        ...r,
        params: { ...r.params, page: String(Math.floor(j / size)) },
        props: { ...r.props, posts: r.props.posts.slice(j, j + size) },
      });
    }
  }
  return out;
}

/** Order `ours` like `reference` when both hold the same set (EmDash terms have no per-entry order). */
export function reorderLike(
  ours: string[],
  reference: string[] | undefined,
  norm: (s: string) => string = (s) => s,
): string[] {
  if (!reference || reference.length !== ours.length) return ours;
  const byNorm = new Map(ours.map((o) => [norm(o), o]));
  const out = reference.map((r) => byNorm.get(norm(r)));
  return out.every((o): o is string => o !== undefined) && new Set(out).size === ours.length
    ? out
    : ours;
}

// ---- badges (legacy packages/utils/badges.ts) ----

export function categoryLinks(entries: ListEntry[]): TCountLink[] {
  const map = createPostMap(entries, (e) => [e.data.category]);
  return Array.from(map, ([label, set]) => ({
    label,
    href: `/${label}`,
    count: set.size,
  })).toSorted((a, b) => b.count - a.count);
}

/** Tag href as emitted into JSON (`c#` -> `/tag/c-sharp`, GON-240; legacy emitted a broken `/tag/c#`). */
export const apiTagHref = (name: string) => `/tag/${tagSlug(name).replace(/[%#?]/g, encodeURIComponent)}`;

export function tagLinks(entries: ListEntry[]): TCountLink[] {
  const map = createPostMap(entries, (e) => (e.data.tag ?? []).map((t) => t.toLocaleLowerCase()));
  return Array.from(map, ([label, set]) => ({
    label,
    href: apiTagHref(label.toLowerCase()),
    count: set.size,
  })).toSorted((a, b) => b.count - a.count);
}

export function seriesLinks(entries: ListEntry[]): TCountLink[] {
  const map = createPostMap(entries, (e) => (e.data.series ? [e.data.series.slug] : []));
  return Array.from(map, ([slugKey, set]) => {
    let label = slugKey;
    let slug = "";
    for (const e of set) {
      slug = e.data.series?.slug ?? slug;
      if (e.data.series?.name) {
        label = e.data.series.name;
        break;
      }
    }
    return { label, href: `/series/${slug}`, count: set.size };
  }).toSorted((a, b) => b.count - a.count);
}

/** Legacy city slug rule (packages/utils/city.ts). */
export function citySlug(city: string): string {
  return city
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*,\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function findCityBySlug(cities: string[], slug: string): string | undefined {
  return cities.find((c) => citySlug(c) === slug);
}
