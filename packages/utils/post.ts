import { getCollection, type CollectionEntry } from "astro:content";
import { date as dateFrom, title as titleFrom, excerpt as excerptFrom, type TLink } from "@/packages/utils/extract";
import { set } from 'es-toolkit/compat';
import { BLOG_SOURCE, POST_CARD_CLASSNAMES, POST_CARD_LAYOUT } from "../consts";
import { POST_COVER_DIR, POST_METADATA_DIR } from "../consts/config.js";
import fs from "node:fs"
import path from "node:path";
import dayjs from "dayjs";

export interface PostMetadataEntry {
    file: string;
    hash: string;
    id: string;
    href: string;
    title: string;
    date: string;
    content: string;
    category: TLink;
    tags: TLink[];
    series?: TLink;
    city?: string[];
    locations?: { latitude: number; longitude: number }[];
    cover?: { url: string; alt?: string };
    colorSet?: { bgColor: string; titleColor: string };
}

function metadataFileBasename(postId: string): string {
    return `${postId.replaceAll("/", "-")}.json`;
}

export function readPostMetadataEntry(postId: string): PostMetadataEntry | undefined {
    try {
        const metadataPath = path.join(
            process.cwd(),
            POST_METADATA_DIR,
            metadataFileBasename(postId),
        );
        if (!fs.existsSync(metadataPath)) return undefined;
        return JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as PostMetadataEntry;
    } catch {
        return undefined;
    }
}

export function readPostMetadata(): PostMetadataEntry[] | undefined {
    try {
        const metadataDir = path.join(process.cwd(), POST_METADATA_DIR);
        if (!fs.existsSync(metadataDir)) return undefined;
        const files = fs.readdirSync(metadataDir).filter((f) => f.endsWith(".json"));
        return files.map((file) => {
            const raw = fs.readFileSync(path.join(metadataDir, file), "utf-8");
            return JSON.parse(raw) as PostMetadataEntry;
        });
    } catch (error) {
        console.warn("Could not read post metadata:", error);
        return undefined;
    }
}

export function readPostCoverSvg(postId: string): string | undefined {
    try {
        const coverPath = path.join(
            process.cwd(),
            POST_COVER_DIR,
            `${postId.replaceAll("/", "-")}.svg`,
        );
        if (!fs.existsSync(coverPath)) return undefined;
        return fs.readFileSync(coverPath, "utf-8");
    } catch {
        return undefined;
    }
}

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
    city?: string[];
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


export async function getAllClientPostsForSearch(): Promise<IPost[]> {
    const entries = readPostMetadata() ?? [];
    return entries
        .map((entry) => ({
            id: entry.id,
            href: entry.href,
            title: entry.title,
            date: new Date(entry.date),
            content: entry.content,
            category: entry.category,
            tags: entry.tags,
            series: entry.series,
            city: entry.city,
        }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());
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
        const matchingEntry = readPostMetadataEntry(post.id);

        if (matchingEntry?.colorSet) {
            const trace = readPostCoverSvg(post.id);
            if (trace) {
                const r = set({ ...post }, "data.bgColor", matchingEntry.colorSet.bgColor);
                const t = set(r, "data.trace", trace);
                return set<T_EXT_POST>(t, "data.titleColor", matchingEntry.colorSet.titleColor);
            }
        }
    } catch (error) {
        console.warn('Could not read post metadata, falling back to color generation:', error);
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
