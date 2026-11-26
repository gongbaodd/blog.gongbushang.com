import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import { getCounts, getHeatmapData } from "../../../lib/listing";
import { localParts } from "../../../lib/listing-core";

export const prerender = true;

export const GET: APIRoute = async () =>
  json({
    heatData: await getHeatmapData(),
    countsMap: await getCounts(),
    currentYear: String(localParts(new Date()).year),
  });
