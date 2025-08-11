import { date as dateFrom, title as titleFrom, category as categoryFrom, tags as tagsFrom, series as seriesFrom } from "@/packages/utils/extract";
import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

type T_PROPS = CollectionEntry<"blog">

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const _posts = await getCollection("blog")
    const posts = await Promise.all(
        _posts.map(async (post) => ({
            id: post.id,
            href: `/${post.data.category}/${post.id}`,
            title: await titleFrom(post),
            date: dateFrom(post),
            content: post.body ?? "",
            category: categoryFrom(post),
            tags: tagsFrom(post),
            series: seriesFrom(post),
        }))
    )
    
    return new Response(JSON.stringify({ posts }))
}