// /api/world/<n>.ndjson: posts that have a city, newest first (the /world/ list).
import type { APIRoute } from "astro";
import { ndjsonPage } from "../../../lib/api";
import { POST_COUNT_PER_PAGE, worldPosts, type ListEntry } from "../../../lib/listing";

export const prerender = true;

export const getStaticPaths = async () => {
  const posts = await worldPosts();
  const results = [];
  for (let i = 0; i < posts.length; i += POST_COUNT_PER_PAGE) {
    results.push({
      params: { page: String(Math.floor(i / POST_COUNT_PER_PAGE)) },
      props: { posts: posts.slice(i, i + POST_COUNT_PER_PAGE) },
    });
  }
  return results;
};

export const GET: APIRoute<{ posts: ListEntry[] }> = ({ props }) => ndjsonPage(props.posts);
