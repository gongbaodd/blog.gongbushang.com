// Apply the (idempotent) derived-cache schema to the database the build uses.
//   pnpm --filter web derive:migrate
// Local: the Hyperdrive local connection string. testing/production: the session-pooler URL
// (CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=... or DERIVE_DATABASE_URL=...), see runbooks/data.md.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SCHEMA, connect, describeTarget, resolveConnectionString, webRoot } from "./db.ts";

const file = resolve(webRoot, "../../supabase/migrations/20261125000000_derived_schema.sql");
// DERIVE_SCHEMA (tests) renames the schema; the default leaves the file untouched.
const sql = readFileSync(file, "utf8").replace(/\bderived\b/g, SCHEMA);

const url = resolveConnectionString();
const client = await connect(url);
try {
	await client.query(sql);
	const r = await client.query("select table_name from information_schema.tables where table_schema = $1 order by 1", [SCHEMA]);
	console.log(`[derive:migrate] ${describeTarget(url)}: schema "${SCHEMA}" ready (${r.rows.map((x) => x.table_name).join(", ")})`);
} finally {
	await client.end();
}
