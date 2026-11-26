/**
 * The admin is never indexable, in any environment (SEC-06, D11/D12). Unlike apps/web, there is no "live" switch here:
 * `X-Robots-Tag: noindex, nofollow` on every response and a disallow-all `/robots.txt`.
 */
export const NOINDEX = "noindex, nofollow";
export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** Set the noindex header; responses with immutable headers (e.g. `Response.redirect`) are copied first. */
export function withNoindex(res: Response): Response {
	try {
		res.headers.set("X-Robots-Tag", NOINDEX);
		return res;
	} catch {
		const headers = new Headers(res.headers);
		headers.set("X-Robots-Tag", NOINDEX);
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	}
}

export function buildRobotsTxtResponse(): Response {
	return new Response(ROBOTS_TXT, {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
			"X-Robots-Tag": NOINDEX,
		},
	});
}
