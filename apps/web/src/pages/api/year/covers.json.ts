// /api/year/covers.json: up to three cover images per year for the archive folders, plus a folder color per year.
import { darken } from "@mantine/core";
import type { APIRoute } from "astro";
import { POST_CARD_UNDERLINE_COLORS, TITLE_COLOR_MAP } from "../../../consts-list";
import { getPostEntries, toClients, yearOf } from "../../../lib/listing";
import { createPostMap } from "../../../lib/listing-core";
import type { ICoverResult, TColors, TCovers } from "../../../stores/yearCovers";

export const prerender = true;

export const GET: APIRoute = async () => {
  const byYear = createPostMap(await getPostEntries(), (e) => [yearOf(e)]);
  const covers: TCovers = {};
  const colors: TColors = {};
  for (const [year, set] of byYear) {
    const withCover = [...set].filter((p) => Boolean(p.data.cover));
    const t3 = (await toClients(withCover.slice(0, 3))).map((p) => {
      const url = p.data.cover?.url;
      return typeof url === "string" ? url : (url?.src ?? "");
    });
    covers[year] =
      t3.length === 1
        ? [undefined, undefined, t3[0]]
        : t3.length === 2
          ? [t3[0], undefined, t3[1]]
          : t3;
    colors[year] = darken(
      TITLE_COLOR_MAP[
        POST_CARD_UNDERLINE_COLORS[parseInt(year, 10) % POST_CARD_UNDERLINE_COLORS.length]
      ],
      0.3,
    );
  }
  return new Response(JSON.stringify({ covers, colors } as ICoverResult));
};
