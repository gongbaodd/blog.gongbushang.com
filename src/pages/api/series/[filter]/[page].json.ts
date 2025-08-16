import { getFilterBySeriesPage, page } from "@/packages/utils/filter";
import { mapServerPostToClient } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;
export const getStaticPaths = page(getFilterBySeriesPage);

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = async ({ props }) => {
    return new Response(JSON.stringify({
        posts: await mapServerPostToClient(props.posts),
    }), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 200,
    })
}