/**
 * Lightweight `/healthz` endpoint for Docker and container platform healthchecks (D12).
 *
 * Also wired as EmDash's `middleware.outer` so health probes answer in <1 ms
 * without querying Postgres or failing on an unmigrated database.
 *
 * SEC-08: it is unauthenticated (exempt from the Cloudflare Access check), so the body is the minimum a probe needs,
 * `{"ok":true}`: no service name, environment or version. SEC-06: always noindex.
 */
import type { APIRoute } from "astro";
import { NOINDEX } from "../robots.ts";

export const prerender = false;

export function buildHealthzResponse(): Response {
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Robots-Tag": NOINDEX,
		},
	});
}

export const GET: APIRoute = () => buildHealthzResponse();
