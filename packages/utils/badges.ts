import { getCollection, type CollectionEntry } from "astro:content";
import { memoize } from "es-toolkit"

type T_POST = CollectionEntry<"blog">;
type T_Link = { label: string; href: string, count: number };

const categoryMap = new Map<string, Set<T_POST>>();

function initCategoryMap(posts: T_POST[]) {
    const memInit = memoize(() => {
        posts.forEach((post) => {
            const { category } = post.data;

            if (!categoryMap.has(category)) {
                categoryMap.set(category, new Set());
            }
            categoryMap.get(category)?.add(post);
        })
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
export async function getCategories() {
    const posts = await getCollection("blog");
    initCategoryMap(posts);
    return Array.from<any, T_Link>(categoryMap, ([label, posts]) => (
        { label, href: `/${label}`, count: [...posts].length }
    )).toSorted((a, b) => b.count - a.count);
}

const tagMap = new Map<string, Set<T_POST>>();
function initTagMap(posts: T_POST[]) {
    const memInit = memoize(() => {
        posts.forEach((post) => {
            const { tag } = post.data;

            tag?.forEach((t: string) => {
                if (!tagMap.has(t)) {
                    tagMap.set(t, new Set());
                }
                tagMap.get(t)?.add(post);
            });
        })
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
export async function getTags() {
    const posts = await getCollection("blog");
    initTagMap(posts);
    return Array.from<any, T_Link>(tagMap, ([label, posts]) => (
        { label, href: `/tag/${label.toLowerCase()}`, count: [...posts].length }
    )).toSorted((a, b) => b.count - a.count);
}

const seriesMap = new Map<string, Set<T_POST>>();
function initSeriesMap(posts: T_POST[]) {
    const memInit = memoize(() => {
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
    }, { getCacheKey: () => posts.length.toString() })
    memInit();
}
export async function getSeries() {
    const posts = await getCollection("blog");
    initSeriesMap(posts);
    return Array.from<any, T_Link>(seriesMap, ([label, posts]) => (
        { label, href: `/series/${label}`, count: [...posts].length }
    )).toSorted((a, b) => b.count - a.count);
}

export async function getBadges() {
    const posts = await getCollection("blog");

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
