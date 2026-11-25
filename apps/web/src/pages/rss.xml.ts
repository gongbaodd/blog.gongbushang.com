// /rss.xml, same shape as the legacy feed: channel title/description, one item per post, newest first.
// Items come from the legacy metadata snapshot (scripts/legacy-data.mjs -> src/generated/rss-items.json: title,
// path, date, first 200 characters + "..."). TODO DATA-1: build from EmDash once body text is the source.
// Without a snapshot (no legacy content submodule) it falls back to the EmDash posts.
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { SITE_DESCRIPTION, SITE_TITLE } from "../consts";
import { getPostEntries } from "../lib/listing";
import { postPath } from "../lib/legacy-url";

export const prerender = true;

interface FeedItem {
	title: string;
	href: string;
	date: string;
	description: string;
}

const snapshot = import.meta.glob<FeedItem[]>("../generated/rss-items.json", { eager: true, import: "default" });

async function items(): Promise<FeedItem[]> {
	const snap = Object.values(snapshot)[0];
	if (snap?.length) return snap;
	const entries = await getPostEntries();
	return entries
		.toSorted((a, b) => b.date.getTime() - a.date.getTime())
		.map((e) => ({
			title: e.title,
			href: postPath(e.id, e.data.category),
			date: e.date.toISOString(),
			description: (e.body ?? "").substring(0, 200) + "...",
		}));
}

export const GET: APIRoute = async (context) =>
	rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site!,
		items: (await items()).map((post) => ({
			title: post.title,
			pubDate: new Date(post.date),
			description: post.description,
			link: post.href,
		})),
	});
