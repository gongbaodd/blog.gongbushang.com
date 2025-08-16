import { type CollectionEntry } from "astro:content";
import { memoize } from "es-toolkit"
import { getAllPosts } from "./post";

type T_POST = CollectionEntry<"blog">;
type T_Link = { label: string; href: string, count: number };

let categoryMap = new Map<string, Set<T_POST>>();
function initCategoryMap(posts: T_POST[]) {
    const memInit = memoize(() => {
        categoryMap = generateCategoryMap(posts)
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
function generateCategoryMap(posts: T_POST[]) {
    const categoryMap = new Map<string, Set<T_POST>>();

    posts.forEach((post) => {
        const { category } = post.data;

        if (!categoryMap.has(category)) {
            categoryMap.set(category, new Set());
        }
        categoryMap.get(category)?.add(post);
    })

    return categoryMap
}
export async function getCategories(_map?: typeof categoryMap) {
    if (!_map) {
        const posts = await getAllPosts()
        initCategoryMap(posts);
    }

    const map = _map ?? categoryMap;

    return Array.from<any, T_Link>(map, ([label, posts]) => (
        { label, href: `/${label}`, count: [...posts].length }
    )).toSorted((a, b) => b.count - a.count);
}

export async function getCategoriesFrom(posts: T_POST[]) {
    const map = generateCategoryMap(posts);
    return await getCategories(map);
}

let tagMap = new Map<string, Set<T_POST>>();
function initTagMap(posts: T_POST[]) {
    const memInit = memoize(() => {
        tagMap = generateTagMap(posts);
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
function generateTagMap(posts: T_POST[]) {
    const tagMap = new Map<string, Set<T_POST>>();
    posts.forEach((post) => {
        const { tag } = post.data;

        tag?.forEach((_t: string) => {
            const t = _t.toLocaleLowerCase();

            if (!tagMap.has(t)) {
                tagMap.set(t, new Set());
            }
            tagMap.get(t)?.add(post);
        });
    })
    return tagMap
}
export async function getTags(_map?: typeof tagMap) {
    if (!_map) {
        const posts = await getAllPosts()
        initTagMap(posts);
    }

    const map = _map ?? tagMap;

    return Array.from<any, T_Link>(map, ([label, posts]) => (
        { label, href: `/tag/${label.toLowerCase()}`, count: [...posts].length }
    )).toSorted((a, b) => b.count - a.count);
}
export async function getTagsFrom(posts: T_POST[]) {
    const map = generateTagMap(posts);
    return await getTags(map);
}

let seriesMap = new Map<string, Set<T_POST>>();
function initSeriesMap(posts: T_POST[]) {
    const memInit = memoize(() => {
        seriesMap = generateSeriesMap(posts)
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
function generateSeriesMap(posts: T_POST[]) {
    const seriesMap = new Map<string, Set<T_POST>>();

    posts.forEach((post) => {
        const { series } = post.data;

        if (series) {
            const { slug } = series;
            if (!seriesMap.has(slug)) {
                seriesMap.set(slug, new Set());
            }

            seriesMap.get(slug)?.add(post);
        }
    })

    return seriesMap
}
export async function getSeries(_map?: typeof seriesMap) {
    if (!_map) {

        const posts = await getAllPosts()
        initSeriesMap(posts);
    }

    const map = _map ?? seriesMap

    return Array.from<any, T_Link>(map, ([_label, posts]: [string, T_POST[]]) => {
        let label = _label;
        let slug = "";
        for (const post of posts) {
            slug = post.data.series?.slug ?? slug;

            if (post.data.series?.name) {
                label = post.data.series.name;
                break;
            }
        }

        return (
            { label, href: `/series/${slug}`, count: [...posts].length }
        )
    }).toSorted((a, b) => b.count - a.count);
}
export async function getSeriesFrom(posts: T_POST[]) {
    const map = generateSeriesMap(posts);
    return await getSeries(map)
}

export async function getBadges() {
    const posts = await getAllPosts()

    const memoriedGetBadges = memoize(_getBadges, { getCacheKey: () => posts.length.toString() });
    const badges = memoriedGetBadges();

    return badges;

    async function _getBadges() {
        const badges: T_Link[] = [
            ...(await getCategories()),
            ...(await getTags()),
            ...(await getSeries()),
        ];

        return badges.toSorted((a, b) => b.count - a.count);
    }
}
