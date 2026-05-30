import { readUmapPosts, type UmapPost } from "@/packages/utils/umap";
import type { APIRoute } from "astro";

export type { UmapPost };

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = readUmapPosts();

  return new Response(JSON.stringify({ posts }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};
