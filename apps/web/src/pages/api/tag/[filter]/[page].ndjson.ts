import type { APIRoute } from "astro";
import { ndjsonPage } from "../../../../lib/api";
import { paginate, tagPages, type ListEntry } from "../../../../lib/listing";

export const prerender = true;

export const getStaticPaths = async () => paginate(await tagPages());

export const GET: APIRoute<{ posts: ListEntry[] }> = ({ props }) => ndjsonPage(props.posts);
