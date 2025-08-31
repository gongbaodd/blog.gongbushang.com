import type { TClientPost } from "@/packages/utils/post";
import { atom } from "nanostores";

export const $history = atom<TClientPost[]>([])

export async function requestHistoryPosts() {
    const url = `/api/cards/history.json`
    const response = await fetch(url)
    const result = await response.json() as { posts: TClientPost[] }
    $history.set(result.posts)
}
