import type { IMapData } from "@/packages/map/GLMap";
import { sortPostsByDate, initCityPostMap } from "@/packages/utils/filter";
import { citySlug, findCityBySlug } from "@/packages/utils/city";
import { getAllPosts, readPostMetadata, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {

    const posts = await getAllPosts();
    const allPosts = sortPostsByDate(posts.filter(p => !!p.data.city))

    const cityPostMap = initCityPostMap(allPosts);
    const metaData = readPostMetadata();

    const data: IMapData[] = [];
    for (const [city, postSet] of cityPostMap.entries()) {
        const [post, ..._] = [...postSet];
        const file = post.id;
        const meta = metaData?.find((d) => d.file === file);
        if (meta) {
            const index = meta.city.map((c) => citySlug(c)).indexOf(city);
            if (index > -1) {
                const location = meta.locations[index];
                const name = findCityBySlug(meta.city, city) ?? city;
                data.push({
                    name,
                    slug: city,
                    location: location,
                    id: file,
                });
            }
        }
    }
    return new Response(JSON.stringify({ data }))
}
