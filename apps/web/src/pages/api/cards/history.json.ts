// Time Machine cards: depends on the build day (same month of earlier years) plus the nearest gallery photo.
import type { APIRoute } from "astro";
import { INITIAL_SSR_POSTS, historyCards } from "../../../lib/listing";

export const prerender = true;

export const GET: APIRoute = async () => new Response(JSON.stringify({ posts: await historyCards(INITIAL_SSR_POSTS) }));
