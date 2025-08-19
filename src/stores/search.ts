import { atom, computed, map } from "nanostores";
import miniSearch, { type SearchResult } from "minisearch";
import type { IPost } from "@/packages/utils/post";
import { $pvMap, requestAllViewCount } from "./pv";

export const $index = map<{
    isLoading: boolean;
    index: miniSearch<IPost> | null
}>({
    isLoading: false,
    index: null,
});

export const $posts = atom<((SearchResult) | IPost)[]>([])

export async function loadPostsToIndex() {
    $index.setKey("isLoading", true);

    const data = await fetch("/api/posts/all.json");
    const results = await data.json() as { posts: IPost[] };

    const index = new miniSearch<IPost>({
        fields: ["title", "content"],
        storeFields: ["id", "href", "title", "date", "content", "category", "tags", "series"],
    });

    await index.addAllAsync(results.posts)
    const filteredPosts = await filterHighestPvPost(results.posts)
    $posts.set(filteredPosts)

    $index.set({ isLoading: false, index });
}

export function search(query: string) {
    const { index } = $index.get()
    if (!index) return

    const posts = index.search(query)
    $posts.set(posts)
}

async function filterHighestPvPost(posts: IPost[]) {
    if (posts.length === 0) return []

    await requestAllViewCount()
    const filteredSlugs = Object.entries($pvMap.get())
        .filter(([k]) => /^\d{4}-\d{2}-\d{2}-/.test(k))
        .sort(([, v1], [, v2]) => v2 - v1)
        .slice(0, 6)
        .map(([k, v]) => [k.replace(/^(\d{4})-(\d{2})-(\d{2})-(.*)/, "$1/$2/$3/$4"), v] as const)


    const filteredPosts = posts.filter(post => filteredSlugs.some(([slug]) => slug === post.id))
    return filteredPosts
}

