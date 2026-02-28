import type { APIRoute } from "astro";
import data from "../../../data/podcast.json";
import { POST_COUNT_PER_PAGE } from "@/packages/consts";

export const prerender = true;

const episodes = data.episodes as Array<Record<string, unknown>>;
const totalPages = Math.ceil(episodes.length / POST_COUNT_PER_PAGE);

export async function getStaticPaths() {
  return Array.from({ length: totalPages }, (_, i) => ({
    params: { page: String(i) },
  }));
}

export const GET: APIRoute<{ page: string }> = async ({ params }) => {
  const page = parseInt(params.page ?? "0", 10);
  const start = page * POST_COUNT_PER_PAGE;
  const pageEpisodes = episodes.slice(start, start + POST_COUNT_PER_PAGE);
  const streamed = pageEpisodes.map((ep) => JSON.stringify(ep)).join("\n");

  return new Response(streamed, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
    status: 200,
  });
};
