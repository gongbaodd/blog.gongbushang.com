import type { APIRoute } from "astro";
import data from "../../../data/podcast.json";

export const prerender = true;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(data));
};

