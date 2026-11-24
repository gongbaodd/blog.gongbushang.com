/**
 * First-admin setup gate (D11).
 *
 * EmDash has no built-in lock on the setup wizard: on a fresh DB the first visitor to
 * /_emdash/admin/setup who completes passkey registration becomes admin. This gate returns 404 for the
 * setup page and setup API unless the visitor presents the SETUP_TOKEN Worker secret, first as
 * `?setup_token=...` (which sets an httpOnly cookie, then redirects to the clean URL) and afterwards via
 * that cookie. No SETUP_TOKEN configured => setup is closed (fail closed), except in `astro dev`.
 */
import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";

const COOKIE = "growgen_setup_gate";
const GATED = [/^\/_emdash\/admin\/setup(\/|$)/, /^\/_emdash\/api\/setup(\/|$)/];

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function matches(candidate: string | null | undefined, secret: string): Promise<boolean> {
	if (!candidate) return false;
	const [a, b] = await Promise.all([digest(candidate), digest(secret)]);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

/** Non-production envs: noindex on dynamic (SSR) responses too. Static assets get it from dist/client/_headers. */
async function withRobots(next: () => Promise<Response>): Promise<Response> {
	const res = await next();
	const siteEnv = (env as unknown as { SITE_ENV?: string }).SITE_ENV;
	if (siteEnv && siteEnv !== "production") {
		try {
			res.headers.set("X-Robots-Tag", "noindex, nofollow");
		} catch {
			// immutable headers (e.g. redirect responses from assets): ignore
		}
	}
	return res;
}

/** Decode, lowercase and collapse slashes so encoded/cased variants (e.g. `/_emdash/api/%73etup`) can't bypass the gate. */
function normalize(pathname: string): string | null {
	try {
		return decodeURIComponent(pathname).toLowerCase().replace(/\/{2,}/g, "/");
	} catch {
		return null;
	}
}

export const onRequest = defineMiddleware(async (context, next) => {
	const pathname = normalize(context.url.pathname);
	if (pathname === null) return new Response("Bad request", { status: 400 });
	if (!GATED.some((re) => re.test(pathname))) return withRobots(next);
	if (import.meta.env.DEV) return withRobots(next);

	const secret = (env as unknown as { SETUP_TOKEN?: string }).SETUP_TOKEN;
	if (!secret) return new Response("Not found", { status: 404 });

	const queryToken = context.url.searchParams.get("setup_token");
	if (queryToken && (await matches(queryToken, secret))) {
		context.cookies.set(COOKIE, queryToken, {
			path: "/_emdash/",
			httpOnly: true,
			secure: true,
			sameSite: "strict",
			maxAge: 3600,
		});
		const clean = new URL(context.url);
		clean.searchParams.delete("setup_token");
		return context.redirect(clean.pathname + clean.search);
	}
	if (await matches(context.cookies.get(COOKIE)?.value, secret)) return withRobots(next);
	return new Response("Not found", { status: 404 });
});
