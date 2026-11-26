/**
 * First-admin setup gate & noindex middleware for the Node admin app (D11, D12).
 *
 * The Cloudflare Access check lives in outer.ts (EmDash `middleware.outer`), which runs before EmDash itself.
 *
 * EmDash has no built-in lock on the setup wizard: on a fresh DB the first visitor to
 * /_emdash/admin/setup who completes passkey registration becomes admin. This gate returns 404 for the
 * setup page and setup API unless the visitor presents `process.env.SETUP_TOKEN`, first as
 * `?setup_token=...` (which sets an httpOnly cookie, then redirects to the clean URL) and afterwards via
 * that cookie. No SETUP_TOKEN configured => setup is closed (fail closed), except in `astro dev`.
 */
import { defineMiddleware } from "astro:middleware";
import { normalizePath } from "../../web/src/lib/lockdown.ts";
import { isLoopbackHost } from "./access.ts";

export const SETUP_GATE_COOKIE = "growgen_setup_gate";
const GATED = [/^\/_emdash\/admin\/setup(\/|$)/, /^\/_emdash\/api\/setup(\/|$)/];

export interface AdminMiddlewareEnv {
	SETUP_TOKEN?: string;
	SITE_ENV?: string;
}

export interface AdminMiddlewareOptions {
	getEnv?: () => AdminMiddlewareEnv;
	isDev?: boolean;
}

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function matches(candidate: string | null | undefined, secret: string): Promise<boolean> {
	if (!candidate || !secret) return false;
	const [a, b] = await Promise.all([digest(candidate), digest(secret)]);
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

/** Non-production envs (and unset SITE_ENV): add X-Robots-Tag: noindex, nofollow on SSR responses. */
async function withRobots(next: () => Promise<Response>, siteEnv: string | undefined): Promise<Response> {
	const res = await next();
	if (!siteEnv || siteEnv !== "production") {
		try {
			res.headers.set("X-Robots-Tag", "noindex, nofollow");
		} catch {
			// immutable headers (e.g. redirect responses): ignore
		}
	}
	return res;
}

/** Shared with apps/web's Worker lockdown (`normalizePath`): decode, lowercase, collapse slashes. */
export const normalize = normalizePath;

const defaultIsDev = Boolean(
	import.meta.env.DEV && !import.meta.env.VITEST && process.env.NODE_ENV !== "test",
);

export function createAdminMiddleware(options: AdminMiddlewareOptions = {}) {
	const getEnv = options.getEnv ?? (() => process.env as AdminMiddlewareEnv);
	const isDev = options.isDev ?? defaultIsDev;

	return defineMiddleware(async (context, next) => {
		const env = getEnv();
		const pathname = normalize(context.url.pathname);
		if (pathname === null) return new Response("Bad request", { status: 400 });

		if (!GATED.some((re) => re.test(pathname))) return withRobots(next, env.SITE_ENV);
		if (isDev) return withRobots(next, env.SITE_ENV);

		const secret = env.SETUP_TOKEN;
		if (!secret) return new Response("Not found", { status: 404 });

		const queryToken = context.url.searchParams.get("setup_token");
		if (queryToken && (await matches(queryToken, secret))) {
			context.cookies.set(SETUP_GATE_COOKIE, queryToken, {
				path: "/_emdash/",
				httpOnly: true,
				// Browsers drop Secure cookies on plain http except for localhost; keep Secure for every real origin.
				secure: !(context.url.protocol === "http:" && isLoopbackHost(context.url.hostname)),
				sameSite: "strict",
				maxAge: 3600,
			});
			const clean = new URL(context.url);
			clean.searchParams.delete("setup_token");
			return context.redirect(clean.pathname + clean.search);
		}
		if (await matches(context.cookies.get(SETUP_GATE_COOKIE)?.value, secret)) {
			return withRobots(next, env.SITE_ENV);
		}
		return new Response("Not found", { status: 404 });
	});
}

export const onRequest = createAdminMiddleware();
