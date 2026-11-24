// /api/<category>/<n>.ndjson and /api/all/<n>.ndjson: 16 client posts per page (legacy parity).
// The podcast category is served by api/podcast/[page].ndjson.ts (raw episodes).
import type { APIRoute } from "astro";
import { ndjsonPage } from "../../../lib/api";
import { categoryPages, paginate, type ListEntry } from "../../../lib/listing";

export const prerender = true;

export const getStaticPaths = async () => paginate(await categoryPages(false));

export const GET: APIRoute<{ posts: ListEntry[] }> = ({ props }) => ndjsonPage(props.posts);
