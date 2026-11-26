#!/usr/bin/env node
// One-time EmDash sign-in link for an existing user at a given admin origin (GON-230, GON-233). OWNER-ONLY, run on the host.
//
// Passkeys are bound to the hostname they were enrolled on, so after moving the admin to https://admin.growgen.xyz the owner
// needs one way in to enroll a passkey there. This writes the same row EmDash's own sign-in handover writes
// (`createMagicLinkUrl` in @emdash-cms/auth: 32 random bytes, base64url; only the SHA-256 hash is stored in `auth_tokens`,
// type `magic_link`). Properties:
//   - single use: EmDash's verify POST deletes the row (`consumeToken`); the GET only shows a confirm page, so link
//     scanners cannot burn it;
//   - short: expires in 3 minutes, and any older unused sign-in links for that user are deleted first, in one transaction;
//   - not remote: there is no HTTP endpoint for this; it needs the production DB credential from the owner's .env;
//   - not logged: printed once to an interactive terminal only (refused in CI or when stdout is piped/redirected),
//     the token is never an argument, never written to a file, and error output never includes it or the DB URL.
//
//   set -a; . ./.env; set +a
//   node apps/web/scripts/admin/signin-link.mjs --email <you@example.com> --origin https://admin.growgen.xyz --yes-production
import pg from "pg";
import { buildLink, checkInteractive, EXPIRY_MS, mintToken, validateOrigin } from "./signin-link-lib.mjs";
import { pgClientConfig } from "./pg-tls.mjs";

function arg(name) {
	const i = process.argv.indexOf(name);
	return i === -1 ? undefined : process.argv[i + 1];
}
const die = (msg) => {
	console.error(`[signin-link] ${msg}`);
	process.exit(1);
};

const tty = checkInteractive({ stdoutIsTTY: Boolean(process.stdout.isTTY), env: process.env });
if (!tty.ok) die(tty.error);
const email = (arg("--email") ?? "").trim().toLowerCase();
if (!email) die("--email is required");
const o = validateOrigin(arg("--origin") ?? "", process.env);
if (!o.ok) die(o.error);
if (!process.argv.includes("--yes-production")) die("refusing without --yes-production (this writes one auth token to production)");
const url = process.env.SUPABASE_PRODUCTION_POOLER_URL;
if (!url) die("SUPABASE_PRODUCTION_POOLER_URL is not set (run `set -a; . ./.env; set +a` from the repo root)");

const { token, hash } = mintToken();
const db = new pg.Client(pgClientConfig(url));
try {
	await db.connect();
	await db.query("begin");
	const users = await db.query("select id, email, disabled from public.users where lower(email) = $1", [email]);
	if (users.rowCount !== 1) throw new Error(`expected exactly one user with that email, found ${users.rowCount}`);
	const user = users.rows[0];
	if (user.disabled) throw new Error("that user is disabled");
	await db.query("delete from public.auth_tokens where user_id = $1 and type in ('magic_link', 'recovery')", [user.id]);
	const now = Date.now();
	await db.query(
		"insert into public.auth_tokens (hash, user_id, email, type, role, invited_by, expires_at, created_at) values ($1, $2, $3, 'magic_link', null, null, $4, $5)",
		[hash, user.id, user.email, new Date(now + EXPIRY_MS).toISOString(), new Date(now).toISOString()],
	);
	await db.query("commit");
} catch (e) {
	await db.query("rollback").catch(() => {});
	// Message only: never the stack or the connection string.
	die(`failed: ${e instanceof Error ? e.message.replaceAll(url, "[db-url]") : "unknown error"}`);
} finally {
	await db.end().catch(() => {});
}

console.log(`[signin-link] one-time link for ${email}, valid ${EXPIRY_MS / 60000} minutes, single use:\n\n${buildLink(o.origin, token)}\n`);
