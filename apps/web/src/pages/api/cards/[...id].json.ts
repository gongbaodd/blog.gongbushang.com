// /api/cards/<post id>.json: one client post per entry that has UMAP coordinates (particle hero) -
// blog posts and podcast episodes. Which entries have coordinates comes from the legacy data (TODO DATA-1).
import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import { legacy, postRecord } from "../../../lib/legacy-data";
import { getAllEntries, toClient, type ListEntry } from "../../../lib/listing";

export const prerender = true;

const hasUmap = (e: ListEntry) =>
  e.data.category === "podcast"
    ? !!legacy.podcast.find((p) => p.id === e.id)?.umap2D
    : !!postRecord(e.id)?.umap2D;

export async function getStaticPaths() {
  return (await getAllEntries())
    .filter(hasUmap)
    .map((e) => ({ params: { id: e.id }, props: { entry: e } }));
}

export const GET: APIRoute<{ entry: ListEntry }> = async ({ props }) =>
  json({ post: await toClient(props.entry) });
