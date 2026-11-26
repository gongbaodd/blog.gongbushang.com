import type { APIRoute } from "astro";
import { ndjsonPage } from "../../../../lib/api";
import { paginate, seriesPages, type ListEntry } from "../../../../lib/listing";

export const prerender = true;

export const getStaticPaths = async () => paginate(await seriesPages());

export const GET: APIRoute<{ posts: ListEntry[] }> = ({ props }) => ndjsonPage(props.posts);
