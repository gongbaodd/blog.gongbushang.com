// /api/world/map.json: one marker per city. Coordinates come from the legacy generated metadata
// (TODO PORT-6 / DATA-1: geocoded locations into EmDash city terms).
import type { APIRoute } from "astro";
import { worldMapData } from "../../../lib/listing";

export const prerender = true;

export const GET: APIRoute = async () => new Response(JSON.stringify({ data: await worldMapData() }));
