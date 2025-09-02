import { atom, computed, map } from "nanostores"
import { FILTER_ENTRY, POST_COUNT_PER_PAGE } from "@/packages/consts";
import type { IPost } from "@/packages/card/PostCard";
import { delay } from "es-toolkit";

export const $posts = map<Record<string, IPost[]>>({})
const $nextPage = computed([$posts], psMap => {
    return Object.keys(psMap).reduce((sum, key) => {
        return {
            ...sum,
            [key]: Math.floor(psMap[key].length/POST_COUNT_PER_PAGE)
        }
    }, {} as Record<string, number>)
})
export const $loading = atom(false)
export const $key = atom("")

export interface IPostStreamParams {
    filter: string
    entryType?: FILTER_ENTRY;
}

export function getKey(param: IPostStreamParams) {
    const { entryType, filter } = param

    const { prefix } = {
        get prefix() {
            if (entryType === FILTER_ENTRY.ALL) {
                return "all"
            }

            if (entryType) {
                return [entryType, filter].filter(p => p !== "").join("/")
            }

            return filter
        }
    }

    return prefix
}

export async function streamPosts(key: string) {
    $loading.set(true)
    const page = $nextPage.get()[key] ?? 0
    const url = ["/api", key, `${page}.ndjson`].join("/")
    
    for await (const post of _streamPosts(url)) {
        await delay(100)
        const oldPosts = $posts.get()[key] ?? []
        const existed = oldPosts.find(p => p.id === post.id)
        if (!existed) {            
            $posts.setKey(key, [...oldPosts, post])
        }
    }
    
    $loading.set(false)
}

async function* _streamPosts(url: string) {
    const response  = await fetch(url)
    if (response.status >= 400) {
        return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lines = buffer.split('\n');
        buffer = lines.pop()!; // keep the last incomplete line

        for (const line of lines) {
            if (line.trim() === '') continue;
            try {
                const obj = JSON.parse(line);
                yield obj
            } catch (err) {
                console.error('Invalid JSON line:', line);
            }
        }
    }

    // Parse the last line if any
    if (buffer.trim()) {
        try {
            const obj = JSON.parse(buffer);
            yield obj
        } catch (err) {
            console.error('Invalid JSON line:', buffer);
        }
    }

}