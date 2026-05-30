import {
  getAllPosts,
  mapServerPostToClient,
  readPostMetadata,
} from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;

export async function getStaticPaths() {
  const umapIds = new Set(
    (readPostMetadata() ?? [])
      .filter((e) => e.id && e.umap2D)
      .map((e) => e.id),
  );
  const serverPosts = (await getAllPosts()).filter((p) => umapIds.has(p.id));
  return serverPosts.map((post) => ({ params: { id: post.id } }));
}

export const GET: APIRoute = async ({ params }) => {
  const postId = params.id;
  if (!postId) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const serverPost = (await getAllPosts()).find((p) => p.id === postId);
  if (!serverPost) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const [clientPost] = await mapServerPostToClient([serverPost]);
  return new Response(JSON.stringify({ post: clientPost }), {
    headers: { "Content-Type": "application/json" },
  });
};
