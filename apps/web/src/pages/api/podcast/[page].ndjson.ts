// /api/podcast/<n>.ndjson: raw episodes (legacy shape, incl. UMAP). Episodes come from EmDash `podcasts` through the derive step (MIG-3).
import type { APIRoute } from "astro";
import { ndjson } from "../../../lib/api";
import { legacy, type PodcastEpisode } from "../../../lib/legacy-data";
import { POST_COUNT_PER_PAGE } from "../../../lib/listing";

export const prerender = true;

export function getStaticPaths() {
  const total = Math.ceil(legacy.podcast.length / POST_COUNT_PER_PAGE);
  return Array.from({ length: total }, (_, i) => ({
    params: { page: String(i) },
    props: {
      episodes: legacy.podcast.slice(i * POST_COUNT_PER_PAGE, (i + 1) * POST_COUNT_PER_PAGE),
    },
  }));
}

export const GET: APIRoute<{ episodes: PodcastEpisode[] }> = ({ props }) => ndjson(props.episodes);
