/**
 * EmDash `middleware.outer` module (D12, INF-9): runs BEFORE EmDash's own `order: "pre"` middleware, so nothing of EmDash
 * (runtime init, DB lookups, sessions, auth redirects) runs for a request that fails the Cloudflare Access check.
 *
 * Public assets under `/_astro/*` are served by the adapter before middleware and are therefore NOT behind Access (they are
 * build output only: no content, no secrets).
 *
 * Order: `/healthz` (container healthcheck, no JWT, no DB) -> `/robots.txt` (disallow all, no JWT, no DB) -> Cloudflare
 * Access gate (see access.ts) -> next(). The Google callback additionally passes the ADMIN_ALLOWED_EMAILS check. Every response that passes through here, EmDash's included, gets
 * `X-Robots-Tag: noindex, nofollow` whatever SITE_ENV says (SEC-06: the admin is never indexable).
 */
import { defineMiddleware } from "astro:middleware";
import { evaluateStartup } from "../scripts/safety.mjs";
import { ACCESS_HEADER, accessMode, verifyAccessJwt, type AccessEnv } from "./access.ts";
import {
	classifyOAuthPath,
	deniedRedirect,
	enforceGoogleAllowlist,
	isSuccessfulCallback,
	kyselyStore,
	type GoogleSignInStore,
} from "./google-allowlist.ts";
import { buildHealthzResponse } from "./pages/healthz.ts";
import { buildRobotsTxtResponse, withNoindex } from "./robots.ts";

export interface OuterOptions {
	getEnv?: () => AccessEnv & Record<string, string | undefined>;
	/** Run the startup safety rules per request (default). Tests of the Access gate alone switch it off. */
	checkStartup?: boolean;
	/** Test seam for the Cloudflare Access JWKS. */
	verifyAccess?: typeof verifyAccessJwt;
	/** Test seam: how to reach the users store after the EmDash callback ran (default: `locals.emdash.db`). */
	getGoogleStore?: (locals: unknown) => GoogleSignInStore | undefined;
}

function defaultGoogleStore(locals: unknown): GoogleSignInStore | undefined {
	const db = (locals as { emdash?: { db?: unknown } } | undefined)?.emdash?.db;
	return db ? kyselyStore(db) : undefined;
}

export function createOuterMiddleware(options: OuterOptions = {}) {
	const getEnv = options.getEnv ?? (() => process.env as AccessEnv);
	const verifyAccess = options.verifyAccess ?? verifyAccessJwt;
	const getGoogleStore = options.getGoogleStore ?? defaultGoogleStore;

	return defineMiddleware(async (context, next) => {
		// Exemption matches the RAW path only: no decoding, so `/%68ealthz` or `/healthz/x` never skip the gate.
		if (context.url.pathname === "/healthz" && (context.request.method === "GET" || context.request.method === "HEAD")) {
			return buildHealthzResponse();
		}
		if (context.url.pathname === "/robots.txt" && (context.request.method === "GET" || context.request.method === "HEAD")) {
			return buildRobotsTxtResponse();
		}
		let env = getEnv();
		// Same rules as scripts/start.mjs, so running dist/server/entry.mjs directly cannot bypass them. Errors fail closed (503);
		// a production target (even one mislabelled by SITE_ENV) turns Access on.
		if (options.checkStartup !== false) {
			const plan = evaluateStartup(env) as { errors: string[]; requireAccess: boolean };
			if (plan.errors.length > 0) return withNoindex(new Response("Unsafe startup configuration", { status: 503, headers: { "Cache-Control": "no-store" } }));
			if (plan.requireAccess) env = { ...env, ADMIN_REQUIRE_ACCESS: "1" };
		}
		const mode = accessMode(env);
		if (mode === "misconfigured") return withNoindex(new Response("Access misconfigured", { status: 503, headers: { "Cache-Control": "no-store" } }));
		if (mode === "enforce") {
			const ok = await verifyAccess(context.request.headers.get(ACCESS_HEADER), env);
			if (!ok) return withNoindex(new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } }));
		}
		// Google sign-in (GON-252). Classified on the decoded, normalised path and for every method (HEAD runs the GET handler):
		// trailing/double slashes, percent-encoding and case cannot skip the check. Any other OAuth provider is refused (404).
		const oauthPath = classifyOAuthPath(context.url.pathname);
		if (oauthPath === "blocked") return withNoindex(new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } }));
		if (oauthPath === "google-callback") {
			// EmDash's callback runs below us; afterwards only an allow-listed account may keep the session it started, and no
			// user it created for a refused account may remain (see google-allowlist.ts). A throw anywhere denies.
			const startedAt = new Date().toISOString();
			const allowlist = (env as Record<string, string | undefined>).ADMIN_ALLOWED_EMAILS;
			const session = context.session as never;
			let res: Response;
			try {
				res = await next();
			} catch {
				await enforceGoogleAllowlist({ session, store: getGoogleStore(context.locals), allowlist, startedAt, successful: false });
				try {
					await (session as { destroy?: () => unknown } | undefined)?.destroy?.();
				} catch {
					/* the redirect below carries no session */
				}
				return withNoindex(deniedRedirect());
			}
			const verdict = await enforceGoogleAllowlist({
				session,
				store: getGoogleStore(context.locals),
				allowlist,
				startedAt,
				successful: isSuccessfulCallback(res),
			});
			return withNoindex(verdict.ok ? res : deniedRedirect());
		}
		return withNoindex(await next());
	});
}

export const onRequest = createOuterMiddleware();
