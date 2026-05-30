import type { TClientPost } from "@/packages/utils/post";
import { map } from "nanostores";

export const $cardCache = map<Record<string, TClientPost>>({});

const pendingFetches = new Map<string, Promise<TClientPost | undefined>>();

export async function requestCardPost(
  postId: string,
): Promise<TClientPost | undefined> {
  const cached = $cardCache.get()[postId];
  if (cached) return cached;

  const pending = pendingFetches.get(postId);
  if (pending) return pending;

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/cards/${postId}.json`);
      if (!res.ok) return undefined;

      const { post } = (await res.json()) as { post: TClientPost };
      $cardCache.setKey(postId, post);
      return post;
    } finally {
      pendingFetches.delete(postId);
    }
  })();

  pendingFetches.set(postId, fetchPromise);
  return fetchPromise;
}
