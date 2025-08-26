import type { IPost } from "@/packages/card/PostCard";
import { atom } from "nanostores";

export const $relates = atom<IPost[]>([])
export const $isLoading = atom(true)

export async function request(category: string) {
    $isLoading.set(true)
    const url = `/api/${category}/peak.json`
    const response = await fetch(url)
    const { posts } = await response.json() as { posts: IPost[] }
    $relates.set(posts)
    $isLoading.set(false)
}