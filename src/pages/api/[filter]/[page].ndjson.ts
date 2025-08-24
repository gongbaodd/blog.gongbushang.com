import { getFilterByCategoryPage, page } from "@/packages/utils/filter";
import { mapServerPostToClient } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;
export const getStaticPaths = page(getFilterByCategoryPage);

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = async ({ props }) => {
    const posts = await mapServerPostToClient(props.posts)
    const streamedPosts = posts.map(p => JSON.stringify(p)).join("\n")
    return new Response(streamedPosts, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8"
        },
        status: 200,
    })
}