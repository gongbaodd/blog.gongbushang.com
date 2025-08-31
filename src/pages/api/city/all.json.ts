import type { IMapData } from "@/packages/map/GLMap";
import { sortPostsByDate, initCityPostMap } from "@/packages/utils/filter";
import { getAllPosts, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

export interface IMeta {
    file: string;
    city: string[];
    locations: {
        latitude: number;
        longitude: number;
    }[];
}

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {

    const posts = await getAllPosts();
    const allPosts = sortPostsByDate(posts.filter(p => !!p.data.city))

    const cityPostMap = initCityPostMap(allPosts);

    const { metaData } = {
        get metaData() {
            try {
                const metadataPath = path.join(
                    process.cwd(),
                    "src",
                    "content",
                    "metadata.json"
                );
                if (fs.existsSync(metadataPath)) {
                    const metadataContent = fs.readFileSync(metadataPath, "utf-8");
                    return JSON.parse(metadataContent) as IMeta[];
                }
            } catch (error) {
                // If metadata.json doesn't exist or there's an error reading it, continue with normal color generation
                console.warn(
                    "Could not read metadata.json, falling back to color generation:",
                    error
                );
            }
        },
    };

    const data: IMapData[] = [];
    for (const [city, postSet] of cityPostMap.entries()) {
        const [post, ..._] = [...postSet];
        const file = post.id;
        const meta = metaData?.find((d) => d.file === file);
        if (meta) {
            const index = meta.city.map((c) => c.toLowerCase()).indexOf(city);
            if (index > -1) {
                const location = meta.locations[index];
                data.push({
                    name: city,
                    location: location,
                    id: file,
                });
            }
        }
    }
    return new Response(JSON.stringify({ data }))
}