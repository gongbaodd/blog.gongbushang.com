import { getCollection, type CollectionEntry } from "astro:content";
import { date as dateFrom, title as titleFrom, category as categoryFrom, tags as tagsFrom, series as seriesFrom, type TLink } from "@/packages/utils/extract";
import { isString, memoize } from "es-toolkit";
import { set } from 'es-toolkit/compat';
import { POST_CARD_CLASSNAMES } from "../consts";
import { Vibrant } from "node-vibrant/node";
import sharp from "sharp"
import fs from "fs"
import path from "path"

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

export async function mapServerPostToJSON(post: T_EXT_POST) {
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
    const _posts = await getAllPosts()
    const memMap = memoize(() => _posts.map(async (post) => mapServerPostToJSON(post)), { getCacheKey: () => _posts.length.toString() })
    posts = await Promise.all(memMap())
    return posts
}

export type T_EXT = {
    bgClass: string;
    bgColor: string;
    titleColor: string;
}
export type T_EXT_POST = T_PROPS & { data: T_PROPS["data"] & T_EXT }

export async function getAllPosts() {
    const posts = await getCollection("blog")
    const memExt = memoize(async () => await Promise.all(posts.map(colorizePost)), { getCacheKey: () => posts.length })

    return await memExt()
}

async function colorizePost(post: T_PROPS, index: number): Promise<T_EXT_POST> {
    if (!post.data.cover) {
        const bgClass = POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length]
        const result = set<T_EXT_POST>({ ...post }, "data.bgClass", bgClass)
        return result
    }

    const { url } = post.data.cover;

    const { bgColor, titleColor } = await getColorSet(isString(url) ? url : url.src.replace(/^\/@fs\/|(\?.*)$/g, ""))

    return {
        get result() {
            const r = set({ ...post }, "data.bgColor", bgColor)
            return set<T_EXT_POST>(r, "data.titleColor", titleColor)
        }
    }.result
}

async function getColorSet(imagePathOrUrl: string) {
    function isRemote(url: string) {
        return /^https?:\/\//.test(url);
    }
    
    let buffer: Buffer;

    if (isRemote(imagePathOrUrl)) {
        const res = await fetch(imagePathOrUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${imagePathOrUrl}`);
        buffer = Buffer.from(await res.arrayBuffer());
    } else {
        buffer = fs.readFileSync(path.resolve(imagePathOrUrl));
    }

    buffer = await sharp(buffer).png().toBuffer();

    const vibrantBuilder = Vibrant.from(buffer)
    const palette = await vibrantBuilder.getPalette()
    return {
        get bgColor() {
            const rgb = palette.Muted?.rgb
            if (rgb) {
                return `rgb(${rgb.join(",")})`
            }
            return ""
        },

        get titleColor() {
            const rgb = palette.Vibrant?.rgb
            if (rgb) {
                return `rgb(${rgb.join(",")})`
            }
            return ""
        }
    }
}