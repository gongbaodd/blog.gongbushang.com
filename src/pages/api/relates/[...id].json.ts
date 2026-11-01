import { POST_COUNT_PER_PAGE } from "@/packages/consts";
import { sortPostsByDate } from "@/packages/utils/filter";
import { findNearest } from "@/packages/utils/nearest";
import {
  getAllPosts,
  mapServerPostToClient,
  readPostMetadata,
  type TClientPost,
} from "@/packages/utils/post";
import { toMetadataSlug } from "@/packages/content-prepare/src/path-utils.ts";
import type { APIRoute } from "astro";
import path from "node:path";

export const prerender = true;

const RELATES_LIMIT = POST_COUNT_PER_PAGE / 2;
const DOCS_DIR = path.join(process.cwd(), "src/content/_docs");

type T_POST = Awaited<ReturnType<typeof getAllPosts>>[number];

/**
 * Metadata ids come from content-prepare's `toMetadataSlug(file path)`, which can
 * differ from Astro's collection id for file names with spaces or symbols.
 */
function metadataKey(post: T_POST): string {
  if (!post.filePath) return post.id;
  return toMetadataSlug(path.relative(DOCS_DIR, path.resolve(process.cwd(), post.filePath)));
}

export const getStaticPaths = async () => {
  const posts = await getAllPosts();
  const metadata = readPostMetadata() ?? [];
  const metadataById = new Map(metadata.map((entry) => [entry.id, entry]));

  // Map every post to its client shape once, then reuse across all pages.
  const clientPosts = await mapServerPostToClient(posts);
  const keys = posts.map(metadataKey);
  const clientByKey = new Map(keys.map((key, i) => [key, clientPosts[i]]));

  const clientById = new Map(posts.map((post, i) => [post.id, clientPosts[i]]));
  const sortedPosts = sortPostsByDate(posts);

  // Fallback for posts without metadata (e.g. .mdx): newest posts in the same category.
  function latestInCategory(post: T_POST): TClientPost[] {
    return sortedPosts
      .filter((p) => p.id !== post.id && p.data.category === post.data.category)
      .slice(0, RELATES_LIMIT)
      .map((p) => clientById.get(p.id))
      .filter((p): p is TClientPost => !!p);
  }

  function nearestFor(target: (typeof metadata)[number]): TClientPost[] {
    return findNearest(target, metadata, RELATES_LIMIT)
      .map((entry) => clientByKey.get(entry.id))
      .filter((p): p is TClientPost => !!p);
  }

  return posts.map((post, i) => {
    const target = metadataById.get(keys[i]);
    let relates = target ? nearestFor(target) : latestInCategory(post);
    // A short post whose category has no other short posts falls back to its nearest posts.
    if (target?.isShort && relates.length === 0) {
      relates = nearestFor({ ...target, isShort: false });
    }

    return {
      params: { id: post.id },
      props: { posts: relates },
    };
  });
};

type T_PROPS = { posts: TClientPost[] };

export const GET: APIRoute<T_PROPS> = async ({ props }) => {
  return new Response(JSON.stringify({ posts: props.posts }), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
};
