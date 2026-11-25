// Data helpers: EmDash entries -> the shape the legacy post page used (CMS-4 spirit).
// Build-time only (prerendered pages); never import from a Worker request path.
import { getEmDashCollection } from "emdash";
import { remark } from "remark";
import strip from "strip-markdown";
import { optimizeCoverUrl } from "./cloudinary";
import { postParams, postPath, tagHref, categoryHref, seriesHref, cityHref, type PostParams } from "./legacy-url";

export interface TLink {
	label: string;
	href: string;
}

/** Mirrors the legacy collection entry `data` (src/content.config.ts) where practical. */
export interface BlogPostData {
	type: "post" | "draft";
	category: string;
	adsense: boolean;
	tag?: string[];
	series?: { slug: string; name?: string; number?: number };
	cover?: { url: string; alt: string };
	/** City term slugs and labels. */
	city?: { slug: string; label: string }[];
}

export interface BlogPost {
	/** Legacy id `YYYY/MM/DD/<slug>` (legacy: Astro glob id). */
	id: string;
	/** EmDash entry id (slug), for `content` references. */
	entryId: string;
	href: string;
	/** `YYYY-MM-DD`, timezone-free (`legacy_date`, falling back to the id). */
	date: string;
	/** Raw markdown (legacy: `post.body`). */
	body: string;
	/** EmDash title field (the legacy site derives the title from the first heading instead). */
	cmsTitle: string;
	data: BlogPostData;
	params: PostParams;
}

type Terms = Record<string, { slug: string; label: string }[] | undefined> | undefined;

const toLegacyDate = (legacyDate: string | undefined, id: string) =>
	legacyDate && /^\d{4}-\d{2}-\d{2}$/.test(legacyDate) ? legacyDate : id.split("/").slice(0, 3).join("-");

/** Map one EmDash `posts` entry; returns undefined for entries that are not migrated legacy posts. */
export function mapPost(entry: { id: string; data: any }): BlogPost | undefined {
	const d = entry.data;
	const legacyId: string | undefined = d.legacy_id;
	if (!legacyId) return undefined;
	const terms: Terms = d.terms;
	const category = terms?.category?.[0]?.slug;
	if (!category) throw new Error(`post ${legacyId} has no category term`);
	const params = postParams(legacyId, category);
	if (!params) throw new Error(`post ${legacyId} has a malformed legacy_id`);

	const extra = (d.legacy_frontmatter_extra ?? {}) as { type?: string };
	const seriesTerm = terms?.series?.[0];
	const img = d.featured_image as { src?: string; alt?: string } | undefined;
	// Display labels keep the frontmatter casing (MIG-1c); URLs use the lowercase slug, as legacy did.
	const tag = (terms?.tag ?? []).map((t) => t.label || t.slug);
	const city = (terms?.city ?? []).map((t) => ({ slug: t.slug, label: t.label }));

	return {
		id: legacyId,
		entryId: entry.id,
		href: postPath(legacyId, category),
		date: toLegacyDate(d.legacy_date, legacyId),
		body: typeof d.body_md === "string" ? d.body_md : "",
		cmsTitle: typeof d.title === "string" ? d.title : "",
		params,
		data: {
			type: extra.type === "draft" ? "draft" : "post",
			category,
			adsense: Boolean(d.adsense),
			...(tag.length ? { tag } : {}),
			...(seriesTerm
				? {
						series: {
							slug: seriesTerm.slug,
							...(seriesTerm.label && seriesTerm.label !== seriesTerm.slug ? { name: seriesTerm.label } : {}),
							...(typeof d.series_number === "number" ? { number: d.series_number } : {}),
						},
					}
				: {}),
			...(img?.src ? { cover: { url: optimizeCoverUrl(img.src), alt: img.alt ?? "" } } : {}),
			...(city.length ? { city } : {}),
		},
	};
}

/** All published, migrated posts (paginated fetch). */
export async function getAllPosts(): Promise<BlogPost[]> {
	const out: BlogPost[] = [];
	let cursor: string | undefined;
	do {
		const { entries, nextCursor, error } = await getEmDashCollection("posts", { limit: 100, cursor });
		if (error) throw error;
		for (const e of entries) {
			const p = mapPost(e);
			if (p) out.push(p);
		}
		cursor = nextCursor;
	} while (cursor);
	return out;
}

/** Legacy title rule (extract.ts): first heading of the body, else the slug with dashes as spaces. */
export function postTitle(post: Pick<BlogPost, "id" | "cmsTitle">, headings: { text: string }[]): string {
	if (headings[0]) return headings[0].text;
	if (post.cmsTitle) return post.cmsTitle;
	return post.id.slice(post.id.lastIndexOf("/") + 1).replace(/-/g, " ");
}

/** Cheap title (first markdown heading outside code fences) for series neighbours, without rendering them. */
export function quickTitle(post: Pick<BlogPost, "id" | "cmsTitle" | "body">): string {
	let fence = false;
	for (const line of post.body.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		else if (!fence) {
			const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
			if (m) return m[1];
		}
	}
	return postTitle(post, []);
}

/** Legacy excerpt rule (extract.ts): strip markdown, first 120 chars + "...". */
export async function postExcerpt(body: string, words = 120): Promise<string> {
	if (!body) return "";
	const doc = await remark().use(strip).process(body.replace(/#.*/, ""));
	return String(doc).slice(0, words) + "...";
}

/** Badge links in legacy order: category, tags, series (+ cities, new in EmDash). */
export function postLinks(post: BlogPost): TLink[] {
	const { category, tag = [], series, city = [] } = post.data;
	const links: TLink[] = [{ label: category, href: categoryHref(category) }];
	for (const t of tag) links.push({ label: t, href: tagHref(t.toLowerCase()) });
	if (series) links.push({ label: series.name ?? series.slug, href: seriesHref(series.slug) });
	for (const c of city) links.push({ label: c.label, href: cityHref(c.slug) });
	return links;
}

export interface SeriesNav {
	slug: string;
	name: string;
	href: string;
	number?: number;
	total: number;
	prev?: { title: string; href: string };
	next?: { title: string; href: string };
}

/** Prev/next within a series, ordered by series_number then date. Titles come from `titleOf`. */
export function seriesNav(
	post: BlogPost,
	all: BlogPost[],
	titleOf: (p: BlogPost) => string,
): SeriesNav | undefined {
	const s = post.data.series;
	if (!s) return undefined;
	const members = all
		.filter((p) => p.data.series?.slug === s.slug)
		.sort(
			(a, b) =>
				(a.data.series?.number ?? Infinity) - (b.data.series?.number ?? Infinity) ||
				a.date.localeCompare(b.date) ||
				a.id.localeCompare(b.id),
		);
	const i = members.findIndex((p) => p.id === post.id);
	const link = (p?: BlogPost) => (p ? { title: titleOf(p), href: p.href } : undefined);
	return {
		slug: s.slug,
		name: s.name ?? s.slug,
		href: seriesHref(s.slug),
		number: s.number,
		total: members.length,
		prev: link(members[i - 1]),
		next: link(members[i + 1]),
	};
}
