import { atom, computed } from "nanostores";

export interface IUmapPost {
  id: string;
  href: string;
  title: string;
  date: string;
  umap2D: [number, number];
}

export interface IUmapChartPoint {
  x: number;
  y: number;
  title: string;
  href: string;
  date: string;
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

export function buildUmapChartData(posts: IUmapPost[]): IUmapChartSeries[] {
  return [
    {
      name: "Posts",
      color: "blue.5",
      data: posts.map((p) => ({
        x: p.umap2D[0],
        y: p.umap2D[1],
        title: p.title,
        href: p.href,
        date: p.date,
      })),
    },
  ];
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
