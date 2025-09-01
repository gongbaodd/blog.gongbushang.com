import { POST_COUNT_PER_PAGE } from "@/packages/consts";
import { sortPostsByDate } from "@/packages/utils/filter";
import { getAllPosts, mapServerPostToClient, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute, GetStaticPathsResult } from "astro";

export const prerender = true;

export const getStaticPaths = async function () {
    const posts = sortPostsByDate((await getAllPosts()).filter(p => p.data.city))
    const results: GetStaticPathsResult = []

    for (let i = 0; i < posts.length; i += POST_COUNT_PER_PAGE) {
        results.push({
            params: {
                page: Math.floor(i/POST_COUNT_PER_PAGE)
            },
            props: {
                posts: posts.slice(i, i + POST_COUNT_PER_PAGE)
            }
        })
    }

    return results
}


export const GET: APIRoute<{ posts: T_PROPS[] }> = async ({ props }) => {
    const posts = await mapServerPostToClient(props.posts)
    const streamedPosts = posts.map(p => JSON.stringify(p)).join("\n")
    return new Response(streamedPosts, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8"
        },
        status: 200,
    })
}