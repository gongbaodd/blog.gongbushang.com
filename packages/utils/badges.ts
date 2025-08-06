import { getCollection, type CollectionEntry } from "astro:content";
import { memoize } from "es-toolkit"

export async function getBadges() {
    const posts = await getCollection("blog");
    type T_POST = CollectionEntry<"blog">;

    const memoriedGetBadges = memoize(_getBadges, { getCacheKey: () => posts.length.toString() });
    const badges = memoriedGetBadges();

    return badges;

    function _getBadges() {
        const categoryMap = new Map<string, Set<T_POST>>();
        const tagMap = new Map<string, Set<T_POST>>();
        const seriesMap = new Map<string, Set<T_POST>>();

        posts.forEach((post) => {
            const { category, tag, series } = post.data;

            if (!categoryMap.has(category)) {
                categoryMap.set(category, new Set());
            }
            categoryMap.get(category)?.add(post);

            tag?.forEach((t: string) => {
                if (!tagMap.has(t)) {
                    tagMap.set(t, new Set());
                }
                tagMap.get(t)?.add(post);
            });

            if (series) {
                const { slug } = series;
                if (!seriesMap.has(slug)) {
                    seriesMap.set(slug, new Set());
                }

                seriesMap.get(slug)?.add(post);
            }
        });

        const badges: [string, string, number][] = [];
        for (const [category] of categoryMap) {
            badges.push([category, `/${category}`, categoryMap.get(category)?.size || 0]);
        }

        for (const [tag] of tagMap) {
            badges.push([tag, `/tag/${tag.toLowerCase()}`, tagMap.get(tag)?.size || 0]);
        }

        for (const [series, posts] of seriesMap) {
            let name = series;

            for (const post of posts) {
                if (post.data.series?.name) {
                    name = post.data.series.name;
                    break;
                }
            }

            badges.push([name, `/series/${series}`, posts.size || 0]);
        }

        return badges.toSorted((a, b) => b[2] - a[2]);
    }
}
