// SEC-11 / SEC-14 (GON-198): INF-5 sync fails closed on unclassified public tables.
import pg from "pg";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import { LOCAL_DB_URL, LIST_PUBLIC_TABLES_SQL, buildListPublicTablesArgs, buildTruncateSql, findUnknownPublicTables } from "./lib.mjs";

describe("INF-5 fail-closed table classification (SEC-11)", () => {
	it("finds unknown public tables, ignoring excluded, known content, ec_* and blanks", () => {
		expect(
			findUnknownPublicTables(["users", "ec_posts", "media", "_emdash_future_secrets", "mystery", "mystery", "", "  "]),
		).toEqual(["_emdash_future_secrets", "mystery"]);
		expect(findUnknownPublicTables(["users", "credentials", "ec_posts", "taxonomies"])).toEqual([]);
	});

	it("preflight psql argv is read-only and carries no password", () => {
		const args = buildListPublicTablesArgs("postgresql://postgres.ref@aws-1-x.pooler.supabase.com:5432/postgres");
		expect(args).toContain(LIST_PUBLIC_TABLES_SQL);
		expect(LIST_PUBLIC_TABLES_SQL).toMatch(/^SELECT /);
		expect(args.join(" ")).not.toMatch(/:[^@/]+@/);
	});

	it("truncate SQL aborts on unclassified tables and truncates only an explicit allowlist", () => {
		const sql = buildTruncateSql({ includeDerived: false });
		expect(sql).toContain("RAISE EXCEPTION 'INF-5 sync halted (SEC-11): unclassified public table(s)");
		expect(sql).toContain("tablename ~ '^ec_[a-z0-9_]+$'");
		expect(sql).toContain("tablename !~ '^ec_[a-z0-9_]+$'");
		// the check runs before the TRUNCATE
		expect(sql.indexOf("RAISE EXCEPTION")).toBeLessThan(sql.indexOf("TRUNCATE TABLE"));
		expect(sql).toMatch(/tablename IN \([^)]*'media'/);
	});
});

async function localDb(): Promise<pg.Client | null> {
	const c = new pg.Client({ connectionString: LOCAL_DB_URL, connectionTimeoutMillis: 1500 });
	try {
		await c.connect();
		return c;
	} catch {
		return null;
	}
}

describe("truncate guard on local Supabase (rolled back; skipped when local Supabase is not running)", async () => {
	const client = await localDb();
	it.skipIf(!client)("raises before truncating when the target has an unclassified public table", async () => {
		const c = client!;
		try {
			await c.query("BEGIN");
			await c.query("CREATE TABLE public.zz_sec11_unclassified (id int)");
			await expect(c.query(buildTruncateSql({ includeDerived: false }))).rejects.toThrow(/SEC-11.*zz_sec11_unclassified/);
		} finally {
			await c.query("ROLLBACK").catch(() => {});
			await c.end();
		}
	});
});
