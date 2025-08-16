import { getAllClientPosts, type T_EXT_POST } from "@/packages/utils/post";
import type { APIRoute } from "astro";

type T_PROPS = T_EXT_POST

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const posts = await getAllClientPosts()    
    return new Response(JSON.stringify({ posts }))
}