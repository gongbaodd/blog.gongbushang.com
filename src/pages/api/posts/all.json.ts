import { getAllClientPostsForSearch, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const posts = await getAllClientPostsForSearch()    
    return new Response(JSON.stringify({ posts }))
}