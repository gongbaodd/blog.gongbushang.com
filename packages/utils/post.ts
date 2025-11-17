import { getCollection, type CollectionEntry } from "astro:content";
import { date as dateFrom, title as titleFrom, category as categoryFrom, tags as tagsFrom, series as seriesFrom, excerpt as excerptFrom, type TLink } from "@/packages/utils/extract";
import { memoize } from "es-toolkit";
import { set } from 'es-toolkit/compat';
import { BLOG_SOURCE, POST_CARD_CLASSNAMES, POST_CARD_LAYOUT } from "../consts";
import fs from "node:fs"
import path from "node:path";
import dayjs from "dayjs";

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

export type T_PROPS = CollectionEntry<"blog">
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

type Unpromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never;
export type TClientPost = Unpromise<ReturnType<typeof mapServerPostToClient>>[0]

export async function mapServerPostToClient(posts: T_PROPS[]) {
  return await Promise.all(
      posts.map(async (post, i) => {
          const cPost = await colorizePost(post)
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
    const posts = await getCollection(BLOG_SOURCE) 
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
    return set<T_EXT_POST>(post, "data.layout", layoutCls)
}

async function colorizePost(post: T_PROPS | T_EXT_POST): Promise<T_EXT_POST> {
    if (!post.data.cover) {
        const title = await titleFrom(post)
        const count = title.length
        const date =  dateFrom(post)
        const index = dayjs(date).date() + dayjs(date).month() + dayjs(date).year() + count;

        const bgClass = POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length]
        const result = set<T_EXT_POST>({ ...post }, "data.bgClass", bgClass)
        return result
    }

    try {
        const metadataPath = path.join(process.cwd(), 'src', 'content', 'metadata.json');
        const coverFolderPath = path.join(process.cwd(), 'src', 'content', 'cover');
        if (fs.existsSync(metadataPath)) {
            const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
            const metadata = JSON.parse(metadataContent);

            const matchingEntry = metadata.find((entry: any) =>{
                return entry.file === post.id
            });
            
            if (matchingEntry) {
                const coverPath = path.join(coverFolderPath, `${post.id.replaceAll("/", "-")}.svg`);
                if (fs.existsSync(coverPath)) {
                    return {
                        get result() {
                            const r = set({ ...post }, "data.bgColor", matchingEntry.colorSet.bgColor)
                            const t = set(r, "data.trace", fs.readFileSync(coverPath, 'utf-8'))
                            return set<T_EXT_POST>(t, "data.titleColor", matchingEntry.colorSet.titleColor)
                        }
                    }.result
                }

            }
        }
    } catch (error) {
        // If metadata.json doesn't exist or there's an error reading it, continue with normal color generation
        console.warn('Could not read metadata.json, falling back to color generation:', error);
    }


    return {...post}
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
