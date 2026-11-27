import { atom, map } from "nanostores";
import miniSearch, { type SearchResult } from "minisearch";
import type { TLink } from "../lib/content";
import { indexOptions } from "./search-options";
import { $pvMap, requestAllViewCount } from "./pv";

/** One entry of `/api/posts/all.json` (static copy of the legacy search index). */
export interface IPost {
  id: string;
  href: string;
  title: string;
  date: string;
  content: string;
  category: TLink;
  tags: TLink[];
  series?: TLink;
  city?: string[];
}

export const $index = map<{
  isLoading: boolean;
  index: miniSearch<IPost> | null;
}>({
  isLoading: false,
  index: null,
});

export const $posts = atom<(SearchResult | IPost)[]>([]);

/** Built once per page load; later calls reuse the same promise (also after a failure is retried). */
let loadPromise: Promise<void> | null = null;
let popularPosts: IPost[] = [];

async function buildIndex() {
  const data = await fetch("/api/posts/all.json");
  const results = (await data.json()) as { posts: IPost[] };

  const index = new miniSearch<IPost>(indexOptions);
  await index.addAllAsync(results.posts);
  popularPosts = await filterHighestPvPost(results.posts);
  $index.set({ isLoading: false, index });
}

export async function loadPostsToIndex() {
  if (!loadPromise) {
    $index.setKey("isLoading", true);
    loadPromise = buildIndex().catch((error) => {
      loadPromise = null;
      $index.setKey("isLoading", false);
      throw error;
    });
  }
  await loadPromise;
  $posts.set(popularPosts);
}

export function search(query: string) {
  const { index } = $index.get();
  if (!index) return;

  if (!query.trim()) {
    $posts.set(popularPosts);
    return;
  }
  $posts.set(index.search(query));
}

async function filterHighestPvPost(posts: IPost[]) {
  if (posts.length === 0) return [];

  await requestAllViewCount();
  const filteredPaths = Object.entries($pvMap.get());
  const filteredPosts = posts.filter((post) => {
    return filteredPaths.some(([path]) => path === post.href);
  });
  return filteredPosts;
}
