/**
 * First-admin setup gate & noindex middleware for the Node admin app (D11, D12).
 *
 * The Cloudflare Access check lives in outer.ts (EmDash `middleware.outer`), which runs before EmDash itself.
 *
 * EmDash has no built-in lock on the setup wizard: on a fresh DB the first visitor to
 * /_emdash/admin/setup who completes passkey registration becomes admin. This gate returns 404 for the
 * setup page and setup API unless the visitor presents `process.env.SETUP_TOKEN`, first as
 * `?setup_token=...` (which sets an httpOnly cookie holding an HMAC-SHA256 derived token, never the raw secret, then
 * redirects to the clean URL with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`) and afterwards via
 * that cookie (SEC-15). No SETUP_TOKEN configured => setup is closed (fail closed), except in `astro dev`.
 */
import { defineMiddleware } from "astro:middleware";
import { normalizePath } from "../../web/src/lib/lockdown.ts";
import {
	SETUP_GATE_COOKIE,
	deriveSetupGateToken,
	hardenSetupRedirect,
	matches,
	shouldUseSecureCookie,
} from "../../web/src/lib/setup-gate.ts";
import { NOINDEX, withNoindex } from "./robots.ts";

export { SETUP_GATE_COOKIE, deriveSetupGateToken, matches };
const GATED = [/^\/_emdash\/admin\/setup(\/|$)/, /^\/_emdash\/api\/setup(\/|$)/];

export interface AdminMiddlewareEnv {
	SETUP_TOKEN?: string;
	SITE_ENV?: string;
}

export interface AdminMiddlewareOptions {
	getEnv?: () => AdminMiddlewareEnv;
	isDev?: boolean;
}

/**
 * SEC-06: the admin is never indexable, in any environment (SITE_ENV=production included). outer.ts sets the same header on
 * every response it sees; this covers responses produced here directly.
 */
async function withRobots(next: () => Promise<Response>): Promise<Response> {
	return withNoindex(await next());
}

/** Shared with apps/web's Worker lockdown (`normalizePath`): decode, lowercase, collapse slashes. */
export const normalize = normalizePath;

const defaultIsDev = Boolean(
	import.meta.env?.DEV && !import.meta.env?.VITEST && process.env.NODE_ENV !== "test",
);

export function createAdminMiddleware(options: AdminMiddlewareOptions = {}) {
	const getEnv = options.getEnv ?? (() => process.env as AdminMiddlewareEnv);
	const isDev = options.isDev ?? defaultIsDev;

	return defineMiddleware(async (context, next) => {
		const env = getEnv();
		const pathname = normalize(context.url.pathname);
		if (pathname === null) return new Response("Bad request", { status: 400 });

		if (!GATED.some((re) => re.test(pathname))) return withRobots(next);
		if (isDev) return withRobots(next);

		const secret = env.SETUP_TOKEN;
		if (!secret) return withNoindex(new Response("Not found", { status: 404 }));

		const queryToken = context.url.searchParams.get("setup_token");
		if (queryToken && (await matches(queryToken, secret))) {
			context.cookies.set(SETUP_GATE_COOKIE, await deriveSetupGateToken(secret), {
				path: "/_emdash/",
				httpOnly: true,
				// Secure on https and on every non-loopback origin; plain http://localhost only (Safari drops Secure cookies there).
				secure: shouldUseSecureCookie(context.url),
				sameSite: "strict",
				maxAge: 3600,
			});
			const clean = new URL(context.url);
			clean.searchParams.delete("setup_token");
			return hardenSetupRedirect(context.redirect(clean.pathname + clean.search, 302), { "X-Robots-Tag": NOINDEX });
		}
		if (await matches(context.cookies.get(SETUP_GATE_COOKIE)?.value, await deriveSetupGateToken(secret))) {
			return withRobots(next);
		}
		return withNoindex(new Response("Not found", { status: 404 }));
	});
}

export const onRequest = createAdminMiddleware();
