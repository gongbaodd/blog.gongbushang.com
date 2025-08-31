import { FILTER_ENTRY } from "@/packages/consts";
import { getAllPostByDateDesc } from "@/packages/utils/filter";
import { getCounts } from "@/packages/utils/heatmap";
import { mapServerPostToClient, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const _posts = await getAllPostByDateDesc();
    const posts = await mapServerPostToClient(_posts.slice(0, 5));
    const counts = await getCounts();
    const totalCounts = counts[FILTER_ENTRY.ALL]
    return new Response(JSON.stringify({ posts, totalCounts }))
}