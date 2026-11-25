/**
 * EmDash `middleware.outer` module (D12, INF-9): runs BEFORE EmDash's own `order: "pre"` middleware, so nothing of EmDash
 * (runtime init, DB lookups, sessions, auth redirects) runs for a request that fails the Cloudflare Access check.
 *
 * Order: `/healthz` (container healthcheck, no JWT, no DB) -> Cloudflare Access gate (see access.ts) -> next().
 */
import { defineMiddleware } from "astro:middleware";
import { ACCESS_HEADER, accessMode, verifyAccessJwt, type AccessEnv } from "./access.ts";
import { buildHealthzResponse } from "./pages/healthz.ts";

export interface OuterOptions {
	getEnv?: () => AccessEnv;
	/** Test seam for the Cloudflare Access JWKS. */
	verifyAccess?: typeof verifyAccessJwt;
}

export function createOuterMiddleware(options: OuterOptions = {}) {
	const getEnv = options.getEnv ?? (() => process.env as AccessEnv);
	const verifyAccess = options.verifyAccess ?? verifyAccessJwt;

	return defineMiddleware(async (context, next) => {
		// Exemption matches the RAW path only: no decoding, so `/%68ealthz` or `/healthz/x` never skip the gate.
		if (context.url.pathname === "/healthz" && (context.request.method === "GET" || context.request.method === "HEAD")) {
			return buildHealthzResponse();
		}
		const env = getEnv();
		const mode = accessMode(env);
		if (mode === "misconfigured") return new Response("Access misconfigured", { status: 503, headers: { "Cache-Control": "no-store" } });
		if (mode === "enforce") {
			const ok = await verifyAccess(context.request.headers.get(ACCESS_HEADER), env);
			if (!ok) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
		}
		return next();
	});
}

export const onRequest = createOuterMiddleware();
