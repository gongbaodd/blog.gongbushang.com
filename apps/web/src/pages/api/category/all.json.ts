import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import { getCategories } from "../../../lib/listing";

export const prerender = true;

export const GET: APIRoute = async () => json({ links: await getCategories() });
