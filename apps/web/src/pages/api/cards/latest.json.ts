import type { APIRoute } from "astro";
import { INITIAL_SSR_POSTS, getCounts, latestCards } from "../../../lib/listing";

export const prerender = true;

export const GET: APIRoute = async () => {
	const posts = await latestCards(INITIAL_SSR_POSTS);
	const totalCounts = (await getCounts()).all;
	return new Response(JSON.stringify({ posts, totalCounts }));
};
