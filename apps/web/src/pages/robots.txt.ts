import type { APIRoute } from "astro";

// Prerendered: static assets are served without waking the Worker (Free plan). Overrides EmDash's SSR /robots.txt.
// Non-production builds are also overwritten with disallow-all by scripts/post-build.mjs (D11, fail closed).
export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	// PUBLIC_SITE_ENV is baked in by astro.config.mjs (process.env is not populated inside the prerender workerd).
	const env = import.meta.env.PUBLIC_SITE_ENV;
	const origin = (site ?? new URL("https://growgen.xyz")).origin;
	const body =
		env === "production"
			? `User-agent: *\nAllow: /\nDisallow: /_emdash/\n\nSitemap: ${origin}/sitemap-index.xml\n`
			: "User-agent: *\nDisallow: /\n";
	return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
