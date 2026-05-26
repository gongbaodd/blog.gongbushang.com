import { md2txt } from "utils/md2txt";
import type { Link, MetadataEntry } from "./types.ts";

export interface FrontmatterData {
  category: string;
  tag?: string[];
  series?: { slug: string; name?: string };
  city?: string | string[];
  cover?: { url: string; alt?: string };
}

export function titleFromBody(body: string, slug: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  if (match?.[1]) {
    return match[1].trim();
  }

  const lastIndex = slug.lastIndexOf("/");
  const segment = lastIndex >= 0 ? slug.slice(lastIndex + 1) : slug;
  return segment.replace(/-/g, " ");
}

export function dateFromSlug(slug: string): Date {
  const info = slug.split("/");
  return new Date(
    parseInt(info[0], 10),
    parseInt(info[1], 10) - 1,
    parseInt(info[2], 10),
  );
}

export function categoryFromFrontmatter(category: string): Link {
  return {
    label: category,
    href: `/${category}`,
  };
}

export function tagsFromFrontmatter(tags?: string[]): Link[] {
  if (!tags) return [];

  return tags.map((_t) => {
    const t = _t.toLocaleLowerCase();
    return {
      label: t,
      href: `/tag/${t}`,
    };
  });
}

export function seriesFromFrontmatter(
  series: FrontmatterData["series"],
  seriesNameMap: Map<string, string>,
): Link | undefined {
  if (!series) return undefined;

  const label = series.name ?? seriesNameMap.get(series.slug) ?? series.slug;
  return {
    label,
    href: `/series/${series.slug}`,
  };
}

export function normalizeCity(city?: string | string[]): string[] | undefined {
  if (!city) return undefined;
  return Array.isArray(city) ? city : [city];
}

export function buildSeriesNameMap(
  entries: { series?: FrontmatterData["series"] }[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const { series } of entries) {
    if (series?.name && series.slug) {
      map.set(series.slug, series.name);
    }
  }

  return map;
}

export async function extractDataFields(
  slug: string,
  frontmatter: FrontmatterData,
  body: string,
  seriesNameMap: Map<string, string>,
): Promise<
  Pick<
    MetadataEntry,
    "id" | "href" | "title" | "date" | "content" | "category" | "tags" | "series" | "city"
  >
> {
  const city = normalizeCity(frontmatter.city);

  return {
    id: slug,
    href: `/${frontmatter.category}/${slug}`,
    title: titleFromBody(body, slug),
    date: dateFromSlug(slug).toISOString(),
    content: await md2txt(body),
    category: categoryFromFrontmatter(frontmatter.category),
    tags: tagsFromFrontmatter(frontmatter.tag),
    series: seriesFromFrontmatter(frontmatter.series, seriesNameMap),
    city,
  };
}
