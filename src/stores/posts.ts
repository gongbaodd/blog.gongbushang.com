import { atom } from "nanostores"
import type { IPost } from "../components/BlogList"
import { FILTER_ENTRY } from "@/packages/consts";

export const $posts = atom<IPost[]>([])

interface IRequestPost {
    filter: string;
    entryType?: FILTER_ENTRY;
    page: number;
}

export async function requestPost({
    filter, entryType, page
}: IRequestPost) {
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
}