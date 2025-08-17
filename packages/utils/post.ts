import { getCollection, type CollectionEntry } from "astro:content";
import { date as dateFrom, title as titleFrom, category as categoryFrom, tags as tagsFrom, series as seriesFrom, excerpt as excerptFrom, type TLink } from "@/packages/utils/extract";
import { isString, memoize } from "es-toolkit";
import { set } from 'es-toolkit/compat';
import { POST_CARD_CLASSNAMES, POST_CARD_LAYOUT, TITLE_COLOR_MAP } from "../consts";
import { Vibrant } from "node-vibrant/node";
import sharp from "sharp"
import chroma from "chroma-js"
import fs from "node:fs"
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import wordcount from "word-count";


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
type T_EXT = {
    layoutCLass: string;
    bgClass: string;
    bgColor: string;
    titleColor: string;
}
type T_EXT_POST = T_PROPS & { data: T_PROPS["data"] & T_EXT }

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

export type TClientPost = Unpromise<ReturnType<typeof mapServerPostToClient>>[0]

export async function mapServerPostToClient(posts: T_PROPS[]) {
  return await Promise.all(
      posts.map(async (post, i) => {
          const cPost = await colorizePost(post, i)
          const clientPost = await layoutPost(cPost)
          return ({
              id: clientPost.id,
              href: `/${post.data.category}/${post.id}`,
              title: await titleFrom(post),
              date: dateFrom(post),
              data: clientPost.data,
              excerpt: await excerptFrom(post),
          })
      })
  );
}


let posts: IPost[]

export async function getAllClientPostsForSearch() {
    const _posts = await getAllPosts()
    const memMap = memoize(() => {
        const ps = _posts.map(async (post) => mapServerPostToJSON(post))
        return ps
    }, { getCacheKey: () => _posts.length.toString() })
    posts = await Promise.all(memMap())
    return posts
}
export async function getAllPosts() {
    const posts = await getCollection("blog")
    return posts
}

async function layoutPost(post:T_PROPS | T_EXT_POST) {
    const title = await titleFrom(post)
    
    const { layoutCls } = {
        get layoutCls() {
            const count = wordcount(title) + (post.data.tag?.length ?? 0);
            if (count < 3) return POST_CARD_LAYOUT.xs;
            if (count < 4) return POST_CARD_LAYOUT.sm;
            if (count < 5) return POST_CARD_LAYOUT.md;
            if (count < 10) return POST_CARD_LAYOUT.lg;
            return POST_CARD_LAYOUT.xl;
        },
    };

    return set<T_EXT_POST>(post, "data.layoutClass", layoutCls)
}

async function colorizePost(post: T_PROPS | T_EXT_POST, index: number): Promise<T_EXT_POST> {
    if (!post.data.cover) {
        const bgClass = POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length]
        const result = set<T_EXT_POST>({ ...post }, "data.bgClass", bgClass)
        return result
    }

    const { url } = post.data.cover;

    const { bgColor, titleColor } =  await getColorSet(isString(url) ? url : url.src)

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
    
    let buffer: Buffer | undefined = undefined;

    if (isRemote(imagePathOrUrl)) {
        const res = await fetch(imagePathOrUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${imagePathOrUrl}`);
        buffer = Buffer.from(await res.arrayBuffer());
        buffer = await sharp(buffer).png().toBuffer();
    } else {
        let url = imagePathOrUrl
        const devPattern = /^\/@fs\/|(\?.*)$/g
        if (devPattern.test(imagePathOrUrl)) {
            url = imagePathOrUrl.replace(/^\/@fs\/|(\?.*)$/g, "")
        } else {
            const root = fileURLToPath(new URL(".", import.meta.url));
            url = join(root, "..", imagePathOrUrl);
        }
        buffer = fs.readFileSync(path.resolve(url));
    }


    const vibrantBuilder = Vibrant.from(buffer)
    const palette = await vibrantBuilder.getPalette()
    return {
        get bgColor() {
            const hex = palette.Muted?.hex
            if (hex) {
                return hex
            }
            return ""
        },

        get titleColor() {
            const hex = palette.Vibrant?.hex
            if (hex) {
                return findNearestTitleColor(hex)
            }
            return ""
        }
    }
}

function findNearestTitleColor(color: string) {
    let distance = Infinity
    let nearestColor = ""
    for(const [name, value] of Object.entries(TITLE_COLOR_MAP)) {
        const dis = chroma.deltaE(color, value)
        distance = distance < dis ? distance: dis
        if (distance === dis) nearestColor = name
    }
    return nearestColor
}