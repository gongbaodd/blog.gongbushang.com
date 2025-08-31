import { getAllClientPostsForSearch, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";
import type { CollectionEntry } from "astro:content";

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const posts = await getAllClientPostsForSearch()    
    return new Response(JSON.stringify({ posts }))
}