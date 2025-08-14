import { getCollection, type CollectionEntry } from "astro:content";
import { date as dateFrom, title as titleFrom, category as categoryFrom, tags as tagsFrom, series as seriesFrom, type TLink } from "@/packages/utils/extract";
import { memoize } from "es-toolkit";

export interface IPost {
    id: string;
    href: string;
    title: string;
    date: Date;
    content: string;
    category: TLink;
    tags: TLink[];
    series?: {
        label: string;
        href: string;
    };
}
 
type T_PROPS = CollectionEntry<"blog">

export async function mapServerPostToJSON(post: T_PROPS) {
    return {
        id: post.id,
        href: `/${post.data.category}/${post.id}`,
        title: await titleFrom(post),
        date: dateFrom(post),
        content: post.body ?? "",
        category: categoryFrom(post),
        tags: tagsFrom(post),
        series: await seriesFrom(post),
    } as IPost
}

let posts: IPost[]

export async function getAllClientPosts() {
    const _posts = await getCollection("blog")
    const memMap = memoize(() => _posts.map(async (post) => mapServerPostToJSON(post)), { getCacheKey: () => _posts.length.toString() })
    posts = await Promise.all(memMap())
    return posts
}
