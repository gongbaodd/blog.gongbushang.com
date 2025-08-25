import { atom, computed, map } from "nanostores"
import { FILTER_ENTRY } from "@/packages/consts";
import type { IPost } from "@/packages/card/PostCard";
import { delay } from "es-toolkit";

export const $posts = atom<IPost[]>([])

interface PostPageParams {
    filter: string;
    entryType?: FILTER_ENTRY;
    page: number;
    totalCount: number;
}
export const $postsListParams = map<PostPageParams>({ filter: FILTER_ENTRY.ALL, page: 0, totalCount: 0 })

export const $hasMorePosts = computed([$posts, $postsListParams], (posts, { totalCount }) => posts.length < totalCount)

export async function requestPosts() {
    const { filter, entryType, page: _page } = $postsListParams.get()
    const page = _page + 1

    const { url } = {
        get url() {
            if (entryType === FILTER_ENTRY.ALL) {
                return `/api/all/${page}.json`
            }

            if (entryType) {
                return `/api/${entryType}/${filter}/${page}.json`
            }

            return `/api/${filter}/${page}.json`
        }
    }

    const data = await fetch(url)
    const { posts } = await data.json() as { posts: IPost[] }
    const _posts = $posts.get()
    $posts.set([..._posts, ...posts])
    $postsListParams.setKey("page", page)
}

export async function streamPosts() {
    const { page: _page } = $postsListParams.get()
    const page = _page + 1
    for await (const post of _streamPosts()) {
        const _posts = $posts.get()

        await delay(100)

        $posts.set([..._posts, post])
    }
    $postsListParams.setKey("page", page)
}

async function* _streamPosts() {
    const { filter, entryType, page: _page } = $postsListParams.get()
    const page = _page + 1

    const { url } = {
        get url() {
            if (entryType === FILTER_ENTRY.ALL) {
                return `/api/all/${page}.ndjson`
            }

            if (entryType) {
                return `/api/${entryType}/${filter}/${page}.ndjson`
            }

            return `/api/${filter}/${page}.ndjson`
        }
    }

    const response  = await fetch(url)
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