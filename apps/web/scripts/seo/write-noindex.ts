// GON-203 pre-build step: list the posts whose SEO panel says noindex (read-only), for the sitemap filter.
// Always (re)writes the file, so a stale list from an earlier build can never leak into this one.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connect } from "../derive/db.ts";
import { NOINDEX_FILE } from "./noindex-list.mjs";

/** Postgres 42P01: the `_emdash_seo` table does not exist yet, so nothing is noindex. */
const isMissingTable = (e: unknown) => (e as { code?: string } | null)?.code === "42P01";

const client = await connect();
let legacyIds: string[] = [];
try {
	await client.query("begin read only");
	try {
		const r = await client.query(`
			select p.legacy_id
			from ec_posts p
			join _emdash_seo s on s.collection = 'posts' and s.content_id = p.id and s.seo_no_index = 1
			where p.status = 'published' and p.deleted_at is null and p.legacy_id is not null
			order by p.legacy_id`);
		legacyIds = r.rows.map((x: { legacy_id: string }) => x.legacy_id.trim()).filter(Boolean);
	} catch (err) {
		if (!isMissingTable(err)) throw err;
	} finally {
		await client.query("rollback").catch(() => {});
	}
} finally {
	await client.end();
}
mkdirSync(dirname(NOINDEX_FILE), { recursive: true });
writeFileSync(NOINDEX_FILE, JSON.stringify({ legacyIds }, null, 2) + "\n");
console.log(`[seo] ${legacyIds.length} noindex post(s) excluded from the sitemap`);
