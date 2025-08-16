import type { TLink } from "@/packages/utils/extract";
import { atom } from "nanostores";

export const $category = atom<TLink[]>([])
export const $tag = atom<TLink[]>([])
export const $series = atom<TLink[]>([])

const TAG_URL = "/api/tag/all.json"
const CATEGORY_URL = "/api/category/all.json"
const SERIES_URL = "/api/series/all.json"

function request(url: string, $link: typeof $category) {
    return async () => {
        const data = await fetch(url)
        const { links } = await data.json() as { links: TLink[] }
        $link.set(links)
    }
}

export const requestAllTags = request(TAG_URL, $tag)
export const requestAllCategories = request(CATEGORY_URL, $category)
export const requestAllSeries = request(SERIES_URL, $series)