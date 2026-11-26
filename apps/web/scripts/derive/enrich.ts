// Cover colours (cache key = cover URL) and city geocodes (cache key = city string), both through the legacy extractors.
import type pg from "pg";
import { geocodeCities } from "../../../../packages/content-prepare/src/geocode.ts";
import { getPaletteColorSet as getColorSet } from "../../../../packages/image-metadata/src/get-palette.ts"; // colours only: no potrace/Sobel/depth (PORT-8b part 3)
import { loadColors, loadGeocodes, pruneColors, upsertColor, upsertGeocode, type ColorSet, type Location } from "./cache.ts";
import type { DerivedPost } from "./posts.ts";

export interface ColorResult {
	colors: Map<string, ColorSet>;
	reused: number;
	extracted: number;
	failed: string[];
}

/** `extraUrls`: other images that need a colour set (podcast covers the CMS has no color_set for); same cache, same key. */
export async function resolveColors(c: pg.Client, posts: DerivedPost[], extract = true, extraUrls: string[] = []): Promise<ColorResult> {
	const cache = await loadColors(c);
	const urls = [...new Set([...posts.flatMap((p) => (p.cover ? [p.cover.url] : [])), ...extraUrls])];
	const todo = urls.filter((u) => !cache.has(u) && /^https?:\/\//.test(u)); // relative legacy covers (./x.jpg) cannot be fetched
	const failed: string[] = [];
	let extracted = 0;
	if (extract) {
		const queue = [...todo];
		const worker = async () => {
			for (let u = queue.shift(); u; u = queue.shift()) {
				try {
					const cs = await getColorSet(u);
					if (!cs.bgColor && !cs.titleColor) throw new Error("no palette");
					await upsertColor(c, u, cs);
					cache.set(u, cs);
					extracted++;
					console.log(`[derive] colors ${u}`);
				} catch (err) {
					failed.push(u);
					console.warn(`[derive] WARNING: cover colors failed for ${u}: ${(err as Error).message}`);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
	}
	await pruneColors(c, urls);
	return { colors: cache, reused: urls.filter((u) => cache.has(u)).length - extracted, extracted, failed };
}

export interface GeoResult {
	byCity: Map<string, Location>;
	reused: number;
	fetched: number;
	missing: string[];
}

export async function resolveGeocodes(c: pg.Client, posts: DerivedPost[], googleApiKey = process.env.GOOGLE_API_KEY): Promise<GeoResult> {
	const byCity = await loadGeocodes(c);
	const cities = [...new Set(posts.flatMap((p) => p.cities))];
	const todo = cities.filter((x) => !byCity.has(x));
	let fetched = 0;
	const missing: string[] = [];
	for (const city of todo) {
		if (!googleApiKey) {
			missing.push(city);
			continue;
		}
		const r = await geocodeCities([city], googleApiKey);
		const loc = r?.locations[0];
		if (loc) {
			await upsertGeocode(c, city, loc);
			byCity.set(city, loc);
			fetched++;
		} else missing.push(city);
	}
	if (missing.length) console.warn(`[derive] WARNING: no location for ${missing.length} city string(s) (${googleApiKey ? "geocoding failed" : "GOOGLE_API_KEY not set"}): ${missing.slice(0, 5).join("; ")}`);
	return { byCity, reused: cities.length - todo.length, fetched, missing };
}
