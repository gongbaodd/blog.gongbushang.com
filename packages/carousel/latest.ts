import type { TClientPost } from "@/packages/utils/post";
import { atom } from "nanostores";

export const $latest = atom<TClientPost[]>([])
export const $totalCounts = atom<number>(0)

export async function requestLatestPosts() {
    const url = `/api/cards/latest.json`
    const response = await fetch(url)
    const result = await response.json() as { posts: TClientPost[], totalCounts: number }
    $latest.set(result.posts)
    $totalCounts.set(result.totalCounts)
}
