import type { IPost } from "@/packages/card/PostCard";
import { atom } from "nanostores";

export const $relates = atom<IPost[]>([]);
export const $isLoading = atom(true);

/** Load the nearest same-category posts for `id` (short posts only get short ones). */
export async function request(id: string) {
  $isLoading.set(true);
  const url = `/api/relates/${id}.json`;
  const response = await fetch(url);
  const { posts } = (await response.json()) as { posts: IPost[] };
  $relates.set(posts);
  $isLoading.set(false);
}
