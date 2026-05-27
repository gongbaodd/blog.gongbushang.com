import { POST_CARD_UNDERLINE_COLORS } from "@/packages/consts/colors.ts";
import { atom, computed } from "nanostores";
import type { TLink } from "@/packages/utils/extract";

export interface IUmapPost {
  id: string;
  href: string;
  title: string;
  date: string;
  category: TLink;
  umap2D: [number, number];
}

export interface IUmapChartPoint {
  x: number;
  y: number;
  title: string;
  href: string;
  date: string;
  category: string;
  [key: string]: number | string;
}

export interface IUmapChartSeries {
  name: string;
  color: string;
  data: IUmapChartPoint[];
}

export const $umapPosts = atom<IUmapPost[]>([]);
export const $umapLoading = atom(false);
export const $umapError = atom<string | null>(null);

export function cssVarToMantineColor(cssVar: string): string {
  return cssVar.replace("--mantine-color-", "").replace(/-(\d+)$/, ".$1");
}

export function categoryToChartColor(
  sortedCategoryHrefs: string[],
  categoryHref: string,
): string {
  const index = sortedCategoryHrefs.indexOf(categoryHref);
  const paletteIndex =
    index >= 0 ? index % POST_CARD_UNDERLINE_COLORS.length : 0;
  return cssVarToMantineColor(POST_CARD_UNDERLINE_COLORS[paletteIndex]!);
}

export function buildUmapChartData(posts: IUmapPost[]): IUmapChartSeries[] {
  if (posts.length === 0) return [];

  const categoriesByHref = new Map<string, TLink>();
  for (const post of posts) {
    categoriesByHref.set(post.category.href, post.category);
  }

  const sortedCategoryHrefs = [...categoriesByHref.keys()].sort();
  const postsByCategory = new Map<string, IUmapPost[]>();

  for (const post of posts) {
    const href = post.category.href;
    const group = postsByCategory.get(href);
    if (group) {
      group.push(post);
    } else {
      postsByCategory.set(href, [post]);
    }
  }

  return sortedCategoryHrefs.map((href) => {
    const category = categoriesByHref.get(href)!;
    return {
      name: category.label,
      color: categoryToChartColor(sortedCategoryHrefs, href),
      data: (postsByCategory.get(href) ?? []).map((p) => ({
        x: p.umap2D[0],
        y: p.umap2D[1],
        title: p.title,
        href: p.href,
        date: p.date,
        category: category.label,
      })),
    };
  });
}

export const $umapChartData = computed($umapPosts, buildUmapChartData);

let umapPromise: Promise<void> | null = null;

async function _requestUmapData() {
  $umapLoading.set(true);
  $umapError.set(null);

  try {
    const response = await fetch("/api/posts/umap.json");
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    const { posts } = (await response.json()) as { posts: IUmapPost[] };
    $umapPosts.set(posts);
  } catch (err) {
    $umapError.set(err instanceof Error ? err.message : "Failed to fetch UMAP data");
  } finally {
    $umapLoading.set(false);
  }
}

export async function requestUmapData() {
  if (umapPromise == null) {
    umapPromise = _requestUmapData();
    await umapPromise;
    umapPromise = null;
  }
}
