import { map } from "nanostores";
import miniSearch from "minisearch";
import type { IPost } from "@/packages/utils/post";

export const $postsToIndex = map<{
    posts: IPost[];
    isLoading: boolean;
    index: miniSearch<IPost> | null
}>({
    posts: [],
    isLoading: false,
    index: null,
});

export async function loadPostsToIndex() {
    $postsToIndex.setKey("isLoading", true);

    const data = await fetch("/api/posts/all.json");
    const results = await data.json() as { posts: IPost[] };

    const index = new miniSearch<IPost>({
        fields: ["title", "content"],
        storeFields: ["id", "href", "title", "date", "content", "category", "tags", "series"],
    });

    await index.addAllAsync(results.posts);

    $postsToIndex.set({ posts: results.posts, isLoading: false, index });
}