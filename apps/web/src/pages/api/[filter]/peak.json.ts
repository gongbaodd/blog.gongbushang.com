// /api/<category>/peak.json: first POST_COUNT_PER_PAGE / 2 client posts. Legacy patch: `all` stays empty (slow build).
import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import {
  POST_COUNT_PER_PAGE,
  categoryPages,
  toClients,
  type ListEntry,
} from "../../../lib/listing";

export const prerender = true;

export const getStaticPaths = async () =>
  (await categoryPages(true)).map((p) =>
    p.params.filter === "all" ? { ...p, props: { posts: [] as ListEntry[] } } : p,
  );

export const GET: APIRoute<{ posts: ListEntry[] }> = async ({ props }) =>
  json({ posts: await toClients(props.posts.slice(0, POST_COUNT_PER_PAGE / 2)) });
