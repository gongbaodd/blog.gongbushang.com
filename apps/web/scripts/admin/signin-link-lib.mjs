// Pure helpers for signin-link.mjs (GON-233). Kept free of I/O so they are unit-tested.
import { createHash, randomBytes } from "node:crypto";

/** A link is a credential: it lives 3 minutes and is consumed on first use (EmDash `consumeToken` deletes the row). */
export const EXPIRY_MS = 3 * 60 * 1000;
export const REDIRECT = "/_emdash/admin/settings/security?addPasskey=1";
/** Origins a link may point at. Anything else needs SIGNIN_LINK_EXTRA_ORIGINS (comma-separated exact origins). */
export const DEFAULT_ALLOWED_ORIGINS = ["https://admin.growgen.xyz", "http://localhost:4322"];

/** Exact-origin allowlist check. Rejects paths, credentials, query and fragments so the link cannot be steered elsewhere. */
export function validateOrigin(raw, env = {}) {
	let u;
	try {
		u = new URL(String(raw));
	} catch {
		return { ok: false, error: "--origin must be a URL, e.g. https://admin.growgen.xyz" };
	}
	if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
		return { ok: false, error: "--origin must be a bare origin (no credentials, path, query or fragment)" };
	}
	const extra = String(env.SIGNIN_LINK_EXTRA_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const allowed = [...DEFAULT_ALLOWED_ORIGINS, ...extra];
	if (!allowed.includes(u.origin)) return { ok: false, error: `--origin ${u.origin} is not allowed (allowed: ${allowed.join(", ")})` };
	return { ok: true, origin: u.origin };
}

/** Same token shape as EmDash: 32 random bytes, base64url; only the SHA-256 (base64url) is stored. */
export function mintToken(bytes = randomBytes(32)) {
	return { token: bytes.toString("base64url"), hash: createHash("sha256").update(bytes).digest("base64url") };
}

export function buildLink(origin, token) {
	const link = new URL("/_emdash/api/auth/magic-link/verify", origin);
	link.searchParams.set("token", token);
	link.searchParams.set("redirect", REDIRECT);
	return link.toString();
}

/** Refuse to print a credential anywhere that is not a person's terminal (CI logs, pipes, redirected files). */
export function checkInteractive({ stdoutIsTTY, env }) {
	if (env.CI || env.GITHUB_ACTIONS) return { ok: false, error: "refusing to run in CI" };
	if (!stdoutIsTTY) return { ok: false, error: "stdout is not a terminal; the link is a credential and is never written to pipes or files" };
	return { ok: true };
}
