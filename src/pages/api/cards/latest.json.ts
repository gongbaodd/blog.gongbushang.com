import { FILTER_ENTRY, INITIAL_SSR_POSTS } from "@/packages/consts";
import { getLatestCards } from "@/packages/utils/cards";
import { getCounts } from "@/packages/utils/heatmap";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getLatestCards(INITIAL_SSR_POSTS);
  const counts = await getCounts();
  const totalCounts = counts[FILTER_ENTRY.ALL];
  return new Response(JSON.stringify({ posts, totalCounts }));
};
