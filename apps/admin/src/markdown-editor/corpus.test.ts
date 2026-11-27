/**
 * Byte round trip over every stored post body (GON-249). Skipped unless `MD_CORPUS_DATABASE_URL` points at a LOCAL database
 * (loopback host only: this test never reads production):
 *
 *   MD_CORPUS_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter admin exec vitest run corpus
 *
 * For each `ec_posts.body_md` it opens the value in the widget's editor state, checks nothing is reported as changed, reads it back,
 * and asserts the bytes are identical (compared as UTF-8 buffers, not just JS strings).
 */
import { Buffer } from "node:buffer";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createBodyState, needsExternalSync, readBody } from "./doc.ts";

const url = process.env.MD_CORPUS_DATABASE_URL;
const host = url ? new URL(url).hostname : "";
const isLoopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);

describe.skipIf(!url)("stored body_md corpus", { timeout: 120_000 }, () => {
	it("is read from a loopback database only", () => {
		expect(isLoopback).toBe(true);
	});

	it.skipIf(!isLoopback)("opens and saves every post byte-identically", async () => {
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		try {
			const { rows } = await client.query<{ slug: string; body_md: string | null }>("select slug, body_md from ec_posts order by slug");
			const bodies = rows.filter((r) => typeof r.body_md === "string") as { slug: string; body_md: string }[];
			const mismatches: string[] = [];
			let crlf = 0;
			let noFinalNewline = 0;
			let trailingWhitespace = 0;
			let mdx = 0;
			for (const { slug, body_md } of bodies) {
				const state = createBodyState(body_md);
				const back = readBody(state);
				if (!Buffer.from(back, "utf8").equals(Buffer.from(body_md, "utf8")) || needsExternalSync(state, body_md)) mismatches.push(slug);
				if (body_md.includes("\r")) crlf++;
				if (!body_md.endsWith("\n")) noFinalNewline++;
				if (/[ \t]+\r?\n/.test(body_md)) trailingWhitespace++;
				if (body_md.includes("DescriptionImage")) mdx++;
			}
			console.log(
				`[corpus] rows=${rows.length} withBody=${bodies.length} crlf=${crlf} noFinalNewline=${noFinalNewline} trailingWhitespace=${trailingWhitespace} descriptionImage=${mdx} mismatches=${mismatches.length}`,
			);
			expect(bodies.length).toBeGreaterThan(900);
			expect(mismatches).toEqual([]);
		} finally {
			await client.end();
		}
	});
});
