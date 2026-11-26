// /api/relates/<post id>.json: up to 8 related posts (nearest by legacy embeddings, TODO DATA-1; newest same-category otherwise).
import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import {
  getPostEntries,
  relatesFor,
  sortByDate,
  toClients,
  type ListEntry,
} from "../../../lib/listing";

export const prerender = true;

export async function getStaticPaths() {
  const posts = await getPostEntries();
  const byId = new Map(posts.map((p) => [p.id.replaceAll("-", ""), p]));
  const sorted = sortByDate(posts);
  return Promise.all(
    posts.map(async (post) => ({
      params: { id: post.id },
      props: { relates: await relatesFor(post, sorted, byId) },
    })),
  );
}

export const GET: APIRoute<{ relates: ListEntry[] }> = async ({ props }) =>
  json({ posts: await toClients(props.relates) });
