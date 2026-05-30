import type { TLink } from "@/packages/utils/extract";
import { processPodcastEpisodes } from "@/packages/utils/podcast";
import { readPostMetadata } from "@/packages/utils/post";
import type { APIRoute } from "astro";

export interface UmapPost {
  id: string;
  href: string;
  title: string;
  date: string;
  category: TLink;
  umap2D: [number, number];
}

const PODCAST_CATEGORY: TLink = { label: "podcast", href: "/podcast" };

export const prerender = true;

export const GET: APIRoute = async () => {
  const postEntries = (readPostMetadata() ?? [])
    .filter((entry): entry is typeof entry & { umap2D: [number, number] } =>
      entry.id != null && entry.umap2D != null,
    )
    .map(({ id, href, title, date, category, umap2D }) => ({
      id,
      href,
      title,
      date,
      category,
      umap2D,
    }));

  const podcastEntries = processPodcastEpisodes()
    .filter((episode): episode is typeof episode & { umap2D: [number, number] } =>
      episode.umap2D != null,
    )
    .map(({ id, link, title, pubDate, umap2D }) => ({
      id,
      href: link,
      title,
      date: pubDate,
      category: PODCAST_CATEGORY,
      umap2D,
    }));

  const posts = [...postEntries, ...podcastEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return new Response(JSON.stringify({ posts }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};
