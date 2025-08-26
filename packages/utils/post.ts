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
import potrace from "potrace"

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
    layout: string;
    bgClass: string;
    bgColor: string;
    titleColor: string;
    trace: string;
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
          const result = {
              id: clientPost.id,
              href: `/${post.data.category}/${post.id}`,
              title: await titleFrom(post),
              date: dateFrom(post),
              data: clientPost.data,
              excerpt: await excerptFrom(post),
          }          
          return result
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
            const count = wordcount(title) + (post.data.tag?.length ?? 0) + 1;      

            if (count < 3) return POST_CARD_LAYOUT.xs;
            if (count < 4) return POST_CARD_LAYOUT.sm;
            if (count < 5) return POST_CARD_LAYOUT.md;
            if (count < 10) return POST_CARD_LAYOUT.lg;
            return POST_CARD_LAYOUT.xl;
        },
    };
    return set<T_EXT_POST>(post, "data.layout", layoutCls)
}

async function colorizePost(post: T_PROPS | T_EXT_POST, index: number): Promise<T_EXT_POST> {
    if (!post.data.cover) {
        const bgClass = POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length]
        const result = set<T_EXT_POST>({ ...post }, "data.bgClass", bgClass)
        return result
    }

    const { url } = post.data.cover;
    const coverUrl = isString(url) ? url : url.src;

    try {
        const metadataPath = path.join(process.cwd(), 'src', 'content', 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);
            
            const matchingEntry = metadata.find((entry: any) =>{
                return entry.file === post.id
            });
            
            if (matchingEntry) {
                return {
                    get result() {
                        const r = set({ ...post }, "data.bgColor", matchingEntry.colorSet.bgColor)
                        const t = set(r, "data.trace", matchingEntry.colorSet.trace)
                        return set<T_EXT_POST>(t, "data.titleColor", matchingEntry.colorSet.titleColor)
                    }
                }.result
            }
        }
    } catch (error) {
        // If metadata.json doesn't exist or there's an error reading it, continue with normal color generation
        console.warn('Could not read metadata.json, falling back to color generation:', error);
    }

    // Fall back to generating colors if no metadata found
    const { bgColor, titleColor, trace } = await getColorSet(coverUrl)

    return {
        get result() {
            const r = set({ ...post }, "data.bgColor", bgColor)
            const t = set(r, "data.trace", trace)
            return set<T_EXT_POST>(t, "data.titleColor", titleColor)
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
    const trace = await new Promise<string>((res, rej) => {
        potrace.trace(buffer, {
            turdSize: 100,
            optCurve: true,
            optTolerance: 0.4,
        }, (err, svg) => {
            if (err) return rej(err)
            res(svg)
        })
    })
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
        },

        trace
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

function wordcount(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        try {
            const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
            const segments = segmenter.segment(text);  

            return [...segments].filter(w => w.isWordLike).length;
        } catch (error) {
            console.warn('Intl.Segmenter failed, falling back to simple word counting:', error);
        }
    }
    
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}
