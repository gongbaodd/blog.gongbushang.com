import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";
import data from "../../../content/podcast.json";
import { POST_COUNT_PER_PAGE } from "@/packages/consts";

export const prerender = true;

function episodeSlug(id: string): string {
  const part = id.split("/").pop();
  return part || id.replace(/[^a-zA-Z0-9-]/g, "-");
}

const rawEpisodes = data.episodes as Array<Record<string, unknown>>;
const podcastDir = path.join(process.cwd(), "src", "content", "podcast");

const episodes = rawEpisodes.map((ep) => {
  if (!ep.image) return ep;
  const slug = episodeSlug(ep.id as string);
  const svgPath = path.join(podcastDir, `${slug}.svg`);
  try {
    const trace = fs.readFileSync(svgPath, "utf-8");
    return { ...ep, trace };
  } catch {
    return ep;
  }
});
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
