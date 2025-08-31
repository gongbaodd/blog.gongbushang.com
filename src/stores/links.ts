import { $posts } from "@/packages/masonry/store/posts";
import type { TLink } from "@/packages/utils/extract";
import { atom, computed } from "nanostores";

export const $category = atom<TLink[]>([])
export const $tag = atom<TLink[]>([])
export const $series = atom<TLink[]>([])

export const $clientCategory = computed([$posts, $category], (posts, category) => {
    const postCategories = posts.map(post => {
        const categoryPath = post.href.split('/')[1] // Get the category part
        return {
            label: categoryPath,
            href: `/${categoryPath}`
        }
    })

    const allCategories = [...category, ...postCategories]
    
    const uniqueCategories = allCategories.filter((cat, index, self) =>
        index === self.findIndex(c => c.href === cat.href)
    )

    return uniqueCategories
})

export const $clientTag = computed([$posts, $tag], (posts, tag) => {
    const postTags = posts.flatMap(post => {
        if (post.data?.tag && Array.isArray(post.data.tag)) {
            return post.data.tag.map((tagName: string) => ({
                label: tagName,
                href: `/tag/${tagName.toLowerCase()}`
            }))
        }
        return []
    })

    const allTags = [...tag, ...postTags]
    
    const uniqueTags = allTags.filter((t, index, self) =>
        index === self.findIndex(ct => ct.href === t.href)
    )

    return uniqueTags
})

export const $clientSeries = computed([$posts, $series], (posts, series) => {
    const postSeries = posts.flatMap(post => {
        if (post.data?.series?.name) {
            return [{
                label: post.data.series.name ?? post.data.series.slug,
                href: `/series/${post.data.series.slug}`
            }]
        }
        return []
    })

    const allSeries = [...series, ...postSeries]
    
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