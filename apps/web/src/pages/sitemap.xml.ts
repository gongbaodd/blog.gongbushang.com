import type { APIRoute } from "astro";

// Prerendered placeholder. TODO(PORT-7): generate the full sitemap (posts, pages, taxonomies) at build time.
// Defining this route also stops EmDash from injecting its SSR /sitemap.xml, which static assets would never reach.
export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const origin = (site ?? new URL("https://growgen.xyz")).origin;
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${origin}/</loc></url>\n</urlset>\n`;
	return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
