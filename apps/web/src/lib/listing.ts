// Listing data for the prerendered list pages and JSON/NDJSON APIs (PORT-3).
// EmDash posts + taxonomies -> legacy-shaped list entries / client posts. Build time only.
// Covers, card colors, UMAP, relates, podcast and gallery come from the derive step (src/lib/legacy-data.ts, written from
// EmDash by scripts/derive, PORT-8 / MIG-3); nothing reads the legacy content submodule.
import { getAllPosts, postExcerpt, type BlogPost } from "./content";
import { legacy, postRecord, type PodcastEpisode } from "./legacy-data";
import { optimizeCloudinaryUrl } from "./cloudinary";
import { buildHeroGalleryImage, isPlaceholderTrace } from "./gallery";
import { smartypants } from "./smartypants";
import { tagSlug } from "./legacy-url";
import { INITIAL_SSR_POSTS, POST_COUNT_PER_PAGE } from "../consts-list";
import {
  categoryLinks,
  citySlug,
  createPostMap,
  dateText,
  findCityBySlug,
  localMidnight,
  localParts,
  paginate,
  reorderLike,
  seriesLinks,
  sortByDate,
  tagLinks,
  toClientPost,
  type ListEntry,
  type TClientPost,
} from "./listing-core";

export type { ListEntry, TClientPost } from "./listing-core";

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | undefined;
  return () => (p ??= fn());
}

// ---- entries ----

async function toPostEntry(p: BlogPost): Promise<ListEntry> {
  const rec = postRecord(p.id);
  const tag = reorderLike(p.data.tag ?? [], rec?.tags, (s) => s.toLowerCase());
  const city = reorderLike(
    (p.data.city ?? []).map((c) => c.label),
    rec?.city,
    citySlug,
  );
  const cover =
    p.data.cover ?? (rec?.cover ? { url: rec.cover.url, alt: rec.cover.alt ?? "" } : undefined);
  return {
    id: p.id,
    body: p.body,
    title: await smartypants(
      p.cmsTitle || p.id.slice(p.id.lastIndexOf("/") + 1).replace(/-/g, " "),
    ),
    date: localMidnight(p.date),
    // Key order = legacy collection schema order (type, category, adsense, tag, series, cover, city).
    data: {
      type: p.data.type,
      category: p.data.category,
      adsense: p.data.adsense,
      ...(tag.length ? { tag } : {}),
      // Legacy frontmatter always carried `name` (sometimes equal to the slug); mapPost drops it when label == slug.
      ...(p.data.series
        ? {
            series: {
              slug: p.data.series.slug,
              name: p.data.series.name ?? p.data.series.slug,
              ...(p.data.series.number !== undefined ? { number: p.data.series.number } : {}),
            },
          }
        : {}),
      ...(cover ? { cover } : {}),
      ...(city.length ? { city } : {}),
    },
    colorSet: cover ? rec?.colorSet : undefined,
  };
}

function toPodcastEntry(ep: PodcastEpisode): ListEntry {
  // Mirrors legacy mapPodcastEpisodesToPosts (packages/utils/podcast.ts).
  return {
    id: ep.id,
    title: ep.title,
    date: new Date(ep.pubDate),
    data: {
      type: "post",
      title: ep.title,
      category: "podcast",
      adsense: false,
      description: ep.description || ep.summary || "",
      summary: ep.summary,
      date: new Date(ep.pubDate),
      duration: ep.duration,
      audioUrl: ep.audioUrl,
      image: ep.image,
      link: ep.link,
      colorSet: ep.colorSet,
      body: ep.description || ep.summary || "",
    },
  };
}

/** Blog posts. Input order = id ascending, standing in for the legacy glob order (matters for sort ties). */
export const getPostEntries = once(async () => {
  const posts = await getAllPosts();
  return Promise.all(
    posts.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(toPostEntry),
  );
});

export const getPodcastEntries = (): ListEntry[] => legacy.podcast.map(toPodcastEntry);
const podcasts = once(async () => getPodcastEntries());

/** Posts then podcast episodes, like the legacy `[...posts, ...podcastPosts]`. */
export const getAllEntries = once(async () => [...(await getPostEntries()), ...(await podcasts())]);

export const getAllByDateDesc = once(async () => sortByDate(await getAllEntries()));

// ---- client posts ----

const clientCache = new WeakMap<ListEntry, Promise<TClientPost>>();

export function toClient(entry: ListEntry): Promise<TClientPost> {
  let p = clientCache.get(entry);
  if (!p) {
    p = postExcerpt(entry.body ?? "").then((excerpt) =>
      toClientPost(entry, excerpt),
    );
    clientCache.set(entry, p);
  }
  return p;
}

export const toClients = (entries: ListEntry[]) => Promise.all(entries.map(toClient));

// ---- filters (legacy packages/utils/filter.ts) ----

type PageResult = { params: { filter: string }; props: { posts: ListEntry[] } };

/** `/all/` + one entry per category (podcast included unless `withPodcast` is false). */
export async function categoryPages(withPodcast = true): Promise<PageResult[]> {
  const all = await getAllEntries();
  const map = createPostMap(all, (e) => [e.data.category]);
  const cats = Array.from(map, ([filter, set]) => ({
    params: { filter },
    props: { posts: sortByDate([...set]) },
  })).filter((c) => withPodcast || c.params.filter !== "podcast");
  return [{ params: { filter: "all" }, props: { posts: sortByDate(all) } }, ...cats];
}

export async function tagPages(): Promise<(PageResult & { props: { tagName: string } })[]> {
  // Keyed by URL slug (`c#` -> `c-sharp`, GON-240); `tagName` is the lowercase display name the page shows.
  const names = new Map<string, string>();
  const map = createPostMap(await getPostEntries(), (e) =>
    (e.data.tag ?? []).map((t) => {
      const slug = tagSlug(t);
      if (!names.has(slug)) names.set(slug, t.toLowerCase());
      return slug;
    }),
  );
  return Array.from(map, ([filter, set]) => ({
    params: { filter },
    props: { posts: sortByDate([...set]), tagName: names.get(filter) ?? filter },
  }));
}

export async function seriesPages(): Promise<PageResult[]> {
  const map = createPostMap(await getPostEntries(), (e) =>
    e.data.series?.slug ? [e.data.series.slug] : [],
  );
  return Array.from(map, ([filter, set]) => ({
    params: { filter },
    props: { posts: sortByDate([...set]) },
  }));
}

export const yearOf = (e: ListEntry) => String(localParts(e.date).year);

export async function yearPages(): Promise<PageResult[]> {
  const map = createPostMap(await getPostEntries(), (e) => [yearOf(e)]);
  return Array.from(map, ([filter, set]) => ({
    params: { filter },
    props: { posts: sortByDate([...set]) },
  }));
}

export async function cityPages() {
  const map = createPostMap(await getPostEntries(), (e) => (e.data.city ?? []).map(citySlug));
  return Array.from(map, ([city, set]) => {
    const posts = sortByDate([...set]);
    const cityName = findCityBySlug(posts[0]?.data.city ?? [], city) ?? city;
    return { params: { city }, props: { posts, cityName } };
  });
}

/** Posts with a city, newest first (the `/world/` list and `/api/world/N.ndjson`). */
export const worldPosts = async () =>
  sortByDate((await getPostEntries()).filter((e) => !!e.data.city));

export { paginate, sortByDate };

// ---- badges / counts / heatmap ----

export const getCategories = async () => categoryLinks(await getPostEntries());
export const getTags = async () => tagLinks(await getPostEntries());
export const getSeries = async () => seriesLinks(await getPostEntries());

export async function getCounts(): Promise<Record<string, number>> {
  const posts = await getPostEntries();
  const counts: Record<string, number> = {};
  for (const p of posts) counts[yearOf(p)] = (counts[yearOf(p)] ?? 0) + 1;
  counts.all = posts.length;
  return counts;
}

export async function getHeatmapData(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const p of await getPostEntries()) {
    const key = dateText(p.date);
    out[key] = (out[key] ?? 0) + (p.body?.length ?? 0);
  }
  return out;
}

// ---- cards, relates, map ----

export async function latestCards(limit: number) {
  return toClients((await getAllByDateDesc()).slice(0, limit));
}

const DAY = 86_400_000;

function galleryDocDate(doc: string, pubDates: Map<string, string>): Date | undefined {
  if (doc.startsWith("/podcast/")) {
    let id = doc.slice("/podcast/".length).replace(/\/$/, "");
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    const pub = pubDates.get(id);
    const d = pub ? new Date(pub) : undefined;
    return d && !Number.isNaN(d.getTime()) ? localMidnight(dateText(d)) : undefined;
  }
  const m = doc.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return undefined;
  const [, , mo, d] = m.map(Number) as [number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return localMidnight(`${m[1]}-${m[2]}-${m[3]}`);
}

function dayOfYear(month: number, day: number): number {
  const dim = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = day;
  for (let i = 1; i < month; i++) doy += dim[i]!;
  return doy;
}

/** Time Machine cards (home): same-month posts of earlier years nearest the build day, plus the nearest gallery photo. */
export async function historyCards(limit: number, now = new Date()): Promise<TClientPost[]> {
  const all = await getAllByDateDesc();
  const n = localParts(now);
  const buildYear = n.year;
  const buildMonth = n.month;
  const buildDay = n.day;

  const sameMonth: ListEntry[] = [];
  const byYearMonth = createPostMap(all, (e) => {
    const p = localParts(e.date);
    return [`${p.year}-${String(p.month).padStart(2, "0")}`];
  });
  for (const [ym, set] of byYearMonth) {
    const [y, m] = ym.split("-").map(Number);
    if (y === buildYear) continue;
    if (m === buildMonth) sameMonth.push(...set);
  }

  const withDiff = sameMonth.map((e) => {
    const postDay = localParts(e.date).day;
    return { e, dayDiff: Math.abs(postDay - buildDay), postDay };
  });
  withDiff.sort((a, b) =>
    a.dayDiff !== b.dayDiff ? a.dayDiff - b.dayDiff : a.postDay - b.postDay,
  );

  let posts = await toClients(withDiff.slice(0, limit).map((x) => x.e));
  const asc = (a: TClientPost, b: TClientPost) => Number(a.date) - Number(b.date);
  const isPodcast = (p: TClientPost) => p.data.category === "podcast";
  const withCover = posts.filter((p) => p.data.cover).sort(asc);
  const noCover = posts
    .filter((p) => !p.data.cover)
    .sort((a, b) => {
      const o = Number(isPodcast(b)) - Number(isPodcast(a));
      return o !== 0 ? o : asc(a, b);
    });
  posts = [...withCover, ...noCover];

  const gallery = await galleryPost(now);
  if (gallery) posts = [gallery, ...posts.filter((p) => p.id !== gallery.id)];
  return posts;
}

/** Gallery entry whose doc date is closest to `now` by day of year (legacy `findNearestGalleryEntry`). */
function nearestGalleryEntry(now: Date, pubDates: Map<string, string>) {
  const ref = localParts(now);
  let best: (typeof legacy.gallery)[number] | undefined;
  let bestDist = Infinity;
  for (const entry of legacy.gallery) {
    const d = galleryDocDate(entry.doc, pubDates);
    if (!d) continue;
    const p = localParts(d);
    const diff = Math.abs(dayOfYear(ref.month, ref.day) - dayOfYear(p.month, p.day));
    const dist = Math.min(diff, 365 - diff);
    if (dist < bestDist || (dist === bestDist && (entry.addedAt ?? "") > (best?.addedAt ?? ""))) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

/** Home hero image: the gallery entry nearest today, with its trace SVG url when one was generated. */
export function homeGalleryImage(now = new Date()) {
  const best = nearestGalleryEntry(now, new Map(legacy.podcast.map((e) => [e.id, e.pubDate])));
  if (!best) return undefined;
  return buildHeroGalleryImage(best, {
    url: optimizeCloudinaryUrl(best.image),
    hasTrace: legacy.traceFiles.includes(`${best.id.replaceAll("/", "-")}.svg`),
    placeholder: isPlaceholderTrace(best.id), // a placeholder trace is a flat rect: bgColor + blurred rendition instead
  });
}

async function galleryPost(now: Date): Promise<TClientPost | undefined> {
  const pubDates = new Map(legacy.podcast.map((e) => [e.id, e.pubDate]));
  const best = nearestGalleryEntry(now, pubDates);
  if (!best) return undefined;
  const docDate = galleryDocDate(best.doc, pubDates);
  if (docDate && Math.trunc((now.getTime() - docDate.getTime()) / DAY) <= 7) return undefined;

  const entries = await getAllEntries();
  const isPodcastDoc = best.doc.startsWith("/podcast/");
  const wanted = isPodcastDoc
    ? decodeURIComponent(best.doc.slice("/podcast/".length).replace(/\/$/, ""))
    : best.doc.slice(1);
  const entry = entries.find(
    (e) => e.id === wanted && (e.data.category === "podcast") === isPodcastDoc,
  );
  if (!entry) return undefined;
  const client = await toClient(entry);
  const withGallery: TClientPost = {
    ...client,
    data: {
      ...client.data,
      cover: {
        url: optimizeCloudinaryUrl(best.image),
        alt: client.data.cover?.alt ?? client.title,
      },
      ...(best.colorSet?.bgColor ? { bgColor: best.colorSet.bgColor } : {}),
      ...(best.colorSet?.titleColor ? { titleColor: best.colorSet.titleColor } : {}),
    },
  };
  if (!isPodcastDoc) return withGallery;
  const cover = withGallery.data.cover!.url;
  return {
    ...withGallery,
    data: {
      ...withGallery.data,
      image: typeof cover === "string" ? cover : cover.src,
      ...(best.colorSet ? { colorSet: best.colorSet } : {}),
    },
  };
}

/** Legacy `/api/relates/<id>.json` list: nearest posts from the legacy embeddings; newest same-category posts otherwise. */
export async function relatesFor(
  entry: ListEntry,
  sortedPosts: ListEntry[],
  byId: Map<string, ListEntry>,
): Promise<ListEntry[]> {
  const ids = postRecord(entry.id)?.relates;
  if (ids)
    return ids.map((id) => byId.get(id.replaceAll("-", ""))).filter((e): e is ListEntry => !!e);
  return sortedPosts
    .filter((p) => p.id !== entry.id && p.data.category === entry.data.category)
    .slice(0, POST_COUNT_PER_PAGE / 2);
}

export interface IMapData {
  name: string;
  slug: string;
  location: { latitude: number; longitude: number };
  id: string;
}

export async function worldMapData(): Promise<IMapData[]> {
  const posts = await worldPosts();
  const map = createPostMap(posts, (e) => (e.data.city ?? []).map(citySlug));
  const data: IMapData[] = [];
  for (const [city, set] of map) {
    const [post] = [...set];
    const meta = postRecord(post.id);
    if (meta?.city && meta.locations) {
      const index = meta.city.map(citySlug).indexOf(city);
      if (index > -1) {
        data.push({
          name: findCityBySlug(meta.city, city) ?? city,
          slug: city,
          location: meta.locations[index]!,
          id: post.id,
        });
      }
    }
  }
  return data;
}

/** Home tag cloud (legacy `getBadges`): categories, tags and series ordered by post count. */
export async function getBadges() {
  const [categories, tags, series] = await Promise.all([getCategories(), getTags(), getSeries()]);
  return [...categories, ...tags, ...series].toSorted((a, b) => b.count - a.count);
}

export { INITIAL_SSR_POSTS, POST_COUNT_PER_PAGE };
