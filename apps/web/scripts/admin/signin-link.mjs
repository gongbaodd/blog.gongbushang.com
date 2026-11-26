#!/usr/bin/env node
// One-time EmDash sign-in link for an existing user at a given admin origin (GON-230).
//
// Use when no passkey works on the new admin hostname: passkeys are bound to the hostname they were enrolled on, so after
// moving the admin to https://admin.growgen.xyz the owner needs one way in to enroll a passkey there. This writes the same
// row EmDash's own sign-in handover writes (`createMagicLinkUrl` in @emdash-cms/auth: 32 random bytes, base64url; only the
// SHA-256 hash is stored in `auth_tokens`, type `magic_link`), valid for 5 minutes and single use. The link opens Security
// settings ready to add a passkey. Nothing else is changed. OWNER-ONLY.
//
//   set -a; . ./.env; set +a
//   node apps/web/scripts/admin/signin-link.mjs --email <you@example.com> --origin https://admin.growgen.xyz --yes-production
//
// Reads SUPABASE_PRODUCTION_POOLER_URL (TLS verified against the Supabase root CA). Prints the link once; it is a credential:
// open it straight away and do not paste it anywhere else.
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { pgClientConfig } from "./pg-tls.mjs";

const EXPIRY_MS = 5 * 60 * 1000;
const REDIRECT = "/_emdash/admin/settings/security?addPasskey=1";

function arg(name) {
	const i = process.argv.indexOf(name);
	return i === -1 ? undefined : process.argv[i + 1];
}
const die = (msg) => {
	console.error(`[signin-link] ${msg}`);
	process.exit(1);
};

const email = (arg("--email") ?? "").trim().toLowerCase();
const originArg = arg("--origin") ?? "";
if (!email) die("--email is required");
let origin;
try {
	origin = new URL(originArg);
} catch {
	die("--origin must be a URL, e.g. https://admin.growgen.xyz");
}
if (origin.protocol !== "https:" && origin.hostname !== "localhost") die("--origin must be https (or http://localhost)");
if (!process.argv.includes("--yes-production")) die("refusing without --yes-production (this writes one auth token to production)");
const url = process.env.SUPABASE_PRODUCTION_POOLER_URL;
if (!url) die("SUPABASE_PRODUCTION_POOLER_URL is not set (run `set -a; . ./.env; set +a` from the repo root)");

const bytes = randomBytes(32);
const token = bytes.toString("base64url");
const hash = createHash("sha256").update(bytes).digest("base64url");

const db = new pg.Client(pgClientConfig(url));
await db.connect();
try {
	const users = await db.query("select id, email, disabled from public.users where lower(email) = $1", [email]);
	if (users.rowCount !== 1) die(`expected exactly one user with that email, found ${users.rowCount}`);
	const user = users.rows[0];
	if (user.disabled) die("that user is disabled");
	const now = Date.now();
	await db.query(
		"insert into public.auth_tokens (hash, user_id, email, type, role, invited_by, expires_at, created_at) values ($1, $2, $3, 'magic_link', null, null, $4, $5)",
		[hash, user.id, user.email, new Date(now + EXPIRY_MS).toISOString(), new Date(now).toISOString()],
	);
} finally {
	await db.end().catch(() => {});
}

const link = new URL("/_emdash/api/auth/magic-link/verify", origin);
link.searchParams.set("token", token);
link.searchParams.set("redirect", REDIRECT);
console.log(`[signin-link] one-time link for ${email}, valid 5 minutes, single use:\n\n${link}\n`);
