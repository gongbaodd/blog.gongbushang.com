import { POST_CARD_UNDERLINE_COLORS, TITLE_COLOR_MAP } from "@/packages/consts";
import { initYearPostMap } from "@/packages/utils/filter";
import { getAllPosts, mapServerPostToClient, type T_PROPS } from "@/packages/utils/post";
import type { ICoverResult, TColors, TCovers } from "@/src/stores/yearCovers";
import { darken } from "@mantine/core";
import type { APIRoute } from "astro";
import { isString } from "es-toolkit";

export const prerender = true;


export const GET: APIRoute<T_PROPS> = async () => {

    const posts = await getAllPosts();
    const yearPostMap = initYearPostMap(posts);

    const yearCoverPostMap: TCovers = {};
    const colors: TColors = {}
    for (const [year, postsSet] of yearPostMap) {
        const withCover = Array.from(postsSet).filter((p) => Boolean(p.data.cover));
        const t3 = (await mapServerPostToClient(withCover.slice(0, 3))).map(p => {
            if (p.data.cover) {
                if (isString(p.data.cover.url)) {
                    return p.data.cover.url as string
                }

                return p.data.cover.url.src
            }

            return ""
        });

        const { top3 } = {
            get top3() {
                if (t3?.length === 1) {
                    return [undefined, undefined, t3[0]]
                }

                if (t3?.length === 2) {
                    return [t3[0], undefined, t3[1]]
                }

                return t3;
            },
        };

        yearCoverPostMap[year] = top3;

        const color = darken(TITLE_COLOR_MAP[POST_CARD_UNDERLINE_COLORS[parseInt(year, 10) % POST_CARD_UNDERLINE_COLORS.length]], .3)
        colors[year] = color;
    }
    return new Response(JSON.stringify({ covers: yearCoverPostMap, colors } as ICoverResult))
}