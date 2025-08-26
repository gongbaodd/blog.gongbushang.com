import { POST_COUNT_PER_PAGE } from "@/packages/consts";
import { getFilterByCategoryPage } from "@/packages/utils/filter";
import { mapServerPostToClient } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;
export const getStaticPaths = getFilterByCategoryPage;

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = async ({ props }) => {
    return new Response(JSON.stringify({
        posts: (await mapServerPostToClient(props.posts)).slice(0, POST_COUNT_PER_PAGE / 2),
    }), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 200,
    })
}