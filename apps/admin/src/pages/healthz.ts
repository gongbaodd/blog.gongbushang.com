/**
 * Lightweight `/healthz` endpoint for Docker and container platform healthchecks (D12).
 *
 * Also wired as EmDash's `middleware.outer` so health probes answer in <1 ms
 * without querying Postgres or failing on an unmigrated database.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export function buildHealthzResponse(env: NodeJS.ProcessEnv = process.env): Response {
	const siteEnv = env?.SITE_ENV || "local";
	const headers = new Headers({
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	if (siteEnv !== "production") {
		headers.set("X-Robots-Tag", "noindex, nofollow");
	}
	return new Response(
		JSON.stringify({
			ok: true,
			status: "ok",
			service: "emdash-admin",
			environment: siteEnv,
		}),
		{ status: 200, headers },
	);
}

export const GET: APIRoute = () => buildHealthzResponse();
