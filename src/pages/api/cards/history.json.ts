import { INITIAL_SSR_POSTS } from "@/packages/consts";
import { getHistoryCards } from "@/packages/utils/cards";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getHistoryCards(INITIAL_SSR_POSTS);
  return new Response(JSON.stringify({ posts }));
};
