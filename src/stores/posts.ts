import { atom, computed, map } from "nanostores"
import { FILTER_ENTRY } from "@/packages/consts";
import type { IPost } from "@/packages/card/PostCard";

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