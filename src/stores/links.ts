import { $key, $posts } from "@/packages/masonry/store/posts";
import type { TLink } from "@/packages/utils/extract";
import { atom, computed } from "nanostores";

export const $category = atom<TLink[]>([])
export const $tag = atom<TLink[]>([])
export const $series = atom<TLink[]>([])

export const $clientCategory = computed([$posts, $category, $key], (posts, category, key) => {
    const postList = posts[key] ?? []
    const postCategories = postList.map(post => {
        const categoryPath = post.href.split('/')[1] // Get the category part
        return {
            label: categoryPath,
            href: `/${categoryPath}`
        }
    })

    const allCategories = [...postCategories, ...category]
    
    const uniqueCategories = allCategories.filter((cat, index, self) =>
        index === self.findIndex(c => c.href === cat.href)
    )

    return uniqueCategories
})

export const $clientTag = computed([$posts, $tag, $key], (posts, tag, key) => {
    const postList = posts[key] ?? []
    const postTags = postList.flatMap(post => {
        if (post.data?.tag && Array.isArray(post.data.tag)) {
            return post.data.tag.map((tagName: string) => ({
                label: tagName,
                href: `/tag/${tagName.toLowerCase()}`
            }))
        }
        return []
    })

    const allTags = [...postTags, ...tag]
    
    const uniqueTags = allTags.filter((t, index, self) =>
        index === self.findIndex(ct => ct.href === t.href)
    )

    return uniqueTags
})

export const $clientSeries = computed([$posts, $series, $key], (posts, series, key) => {
    const postList = posts[key] ?? []
    const postSeries = postList.flatMap(post => {
        if (post.data?.series?.name) {
            return [{
                label: post.data.series.name ?? post.data.series.slug,
                href: `/series/${post.data.series.slug}`
            }]
        }
        return []
    })

    const allSeries = [...postSeries, ...series]
    
    const uniqueSeries = allSeries.filter((s, index, self) =>
        index === self.findIndex(cs => cs.href === s.href)
    )

    return uniqueSeries
})

const TAG_URL = "/api/tag/all.json"
const CATEGORY_URL = "/api/category/all.json"
const SERIES_URL = "/api/series/all.json"

function request(url: string, $link: typeof $category) {
    return async () => {
        const data = await fetch(url)
        const { links } = await data.json() as { links: TLink[] }
        const existingLinks = $link.get()
        const existingHrefs = new Set(existingLinks.map(link => link.href))
        const newLinks = links.filter(link => !existingHrefs.has(link.href))
        $link.set([...existingLinks, ...newLinks])
    }
}

export const requestAllTags = request(TAG_URL, $tag)
export const requestAllCategories = request(CATEGORY_URL, $category)
export const requestAllSeries = request(SERIES_URL, $series)