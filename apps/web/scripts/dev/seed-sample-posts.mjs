#!/usr/bin/env node
/**
 * DEV ONLY. Seeds a few real legacy posts into a local EmDash dev server so PORT-2 can be built and
 * parity-checked before MIG-1's full import. The posts use the REAL legacy_id, so MIG-1's upsert
 * (keyed on legacy_id) overwrites them. Their `legacy_frontmatter_extra.seeded_by` marks them.
 *
 *   node scripts/dev/seed-sample-posts.mjs -u http://localhost:4341 [--legacy /path/to/_docs] 2025/09/08/mermaid ...
 *
 * Skips posts whose legacy_id already exists. Auth: localhost dev bypass (same as scripts/schema/apply.mjs).
 * The frontmatter parser is deliberately tiny (scalars, lists, one-level maps): enough for sample posts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (flag) => {
	const i = argv.indexOf(flag);
	return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const BASE = (opt("-u") ?? "http://localhost:4321").replace(/\/$/, "");
const DOCS = opt("--legacy") ?? "/Volumes/MacData/github/blog.gongbushang.com/src/content/_docs";
const ids = argv;
if (!ids.length) throw new Error("usage: seed-sample-posts.mjs -u URL <YYYY/MM/DD/file-stem>...");

// --- legacy rules (packages/utils) --------------------------------------------------------
const citySlug = (c) =>
	c.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s*,\s*/g, "-")
		.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
/** Astro glob-loader slugify (github-slugger style) of a file stem. */
const globSlug = (stem) =>
	stem.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
		.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");

function parseFrontmatter(src) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
	if (!m) return { data: {}, body: src };
	const data = {};
	let key = null, sub = null;
	const unq = (v) => v.trim().replace(/^["'](.*)["']$/, "$1");
	for (const line of m[1].split(/\r?\n/)) {
		if (!line.trim()) continue;
		const top = /^(\w+):\s*(.*)$/.exec(line);
		if (top) {
			key = top[1]; sub = null;
			data[key] = top[2] === "" ? undefined : /^(true|false)$/.test(top[2]) ? top[2] === "true" : unq(top[2]);
			continue;
		}
		const item = /^\s+-\s+(.*)$/.exec(line);
		if (item && key) { (data[key] ??= []).push(unq(item[1])); continue; }
		const kv = /^\s+(\w+):\s*(.*)$/.exec(line);
		if (kv && key) { (data[key] ??= {})[kv[1]] = /^\d+$/.test(kv[2]) ? Number(kv[2]) : unq(kv[2]); sub = kv[1]; }
	}
	return { data, body: src.slice(m[0].length) };
}

// --- API ----------------------------------------------------------------------------------
let cookie;
async function api(method, path, body) {
	if (!cookie) {
		const r = await fetch(`${BASE}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
		cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
		await r.text().catch(() => {});
	}
	const res = await fetch(`${BASE}/_emdash/api${path}`, {
		method,
		headers: { "content-type": "application/json", "x-emdash-request": "1", cookie },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json?.error?.message ?? ""}`);
	return json?.data ?? json;
}

const termCache = {};
async function termId(taxonomy, slug, label) {
	const list = (termCache[taxonomy] ??= (await api("GET", `/taxonomies/${taxonomy}/terms`)).terms ?? []);
	let t = list.find((x) => x.slug === slug);
	if (!t) {
		t = await api("POST", `/taxonomies/${taxonomy}/terms`, { slug, label });
		t = t.term ?? t;
		list.push(t);
		console.log(`  term   ${taxonomy}:${slug}`);
	}
	return t.id;
}

// `content list` has no legacy_id; the slug (legacy_id with "/" -> "-") is enough to detect a previous run.
const existingSlugs = new Set();
{
	let cursor;
	do {
		const args = ["exec", "emdash", "content", "list", "posts", "-u", BASE, "--json", "--limit", "100", ...(cursor ? ["--cursor", cursor] : [])];
		const page = JSON.parse(execFileSync("pnpm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
		for (const i of page.items ?? []) existingSlugs.add(i.slug);
		cursor = page.nextCursor;
	} while (cursor);
}

for (const id of ids) {
	const [y, mo, d, ...rest] = id.split("/");
	const stem = rest.join("/");
	const file = readdirSync(join(DOCS, y, mo, d)).find((f) => f.replace(/\.(md|mdx)$/, "") === stem);
	if (!file) throw new Error(`no legacy file for ${id}`);
	const { data, body } = parseFrontmatter(readFileSync(join(DOCS, y, mo, d, file), "utf8"));
	const legacyId = `${y}/${mo}/${d}/${globSlug(stem)}`;
	if (existingSlugs.has(legacyId.replaceAll("/", "-"))) { console.log(`skip    ${legacyId} (exists)`); continue; }

	const fields = {
		title: (/^#{1,6}\s+(.+)$/m.exec(body)?.[1] ?? stem).trim(),
		legacy_id: legacyId,
		legacy_date: `${y}-${mo}-${d}`,
		body_md: body.replace(/^\s*\n/, ""),
		adsense: Boolean(data.adsense),
		legacy_frontmatter_extra: { type: data.type ?? "post", seeded_by: "PORT-2 dev seed (MIG-1 overwrites)" },
	};
	if (data.series?.number != null) fields.series_number = data.series.number;
	if (data.cover?.url) fields.featured_image = { provider: "cloudinary", id: data.cover.url.split("/").pop(), src: data.cover.url, alt: data.cover.alt ?? "" };

	const tmp = join(tmpdir(), `seed-${legacyId.replaceAll("/", "-")}.json`);
	writeFileSync(tmp, JSON.stringify(fields));
	const out = execFileSync("pnpm", ["exec", "emdash", "content", "create", "posts", "-u", BASE, "--slug", legacyId.replaceAll("/", "-"), "--file", tmp, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	const itemId = JSON.parse(out.slice(out.indexOf("{"))).id ?? JSON.parse(out.slice(out.indexOf("{"))).item?.id;

	const assign = (tax, terms) => api("POST", `/content/posts/${itemId}/terms/${tax}`, { termIds: terms });
	await assign("category", [await termId("category", data.category, data.category)]);
	if (data.tag?.length) await assign("tag", await Promise.all(data.tag.map((t) => termId("tag", t.toLowerCase(), t))));
	if (data.series?.slug) await assign("series", [await termId("series", data.series.slug, data.series.name ?? data.series.slug)]);
	if (data.city?.length) await assign("city", await Promise.all(data.city.map((c) => termId("city", citySlug(c), c))));
	console.log(`created ${legacyId} (${itemId})`);
}
