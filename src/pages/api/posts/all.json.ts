import { getAllClientPosts } from "@/packages/utils/post";
import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

type T_PROPS = CollectionEntry<"blog">

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const posts = await getAllClientPosts()    
    return new Response(JSON.stringify({ posts }))
}