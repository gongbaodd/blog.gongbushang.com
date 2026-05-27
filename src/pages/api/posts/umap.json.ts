import type { TLink } from "@/packages/utils/extract";
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

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = (readPostMetadata() ?? [])
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
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return new Response(JSON.stringify({ posts }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
};
