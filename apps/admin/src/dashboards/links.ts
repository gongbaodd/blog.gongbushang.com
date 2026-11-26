/**
 * External SaaS dashboards shown in the EmDash admin (GON-201).
 *
 * This is the only file to edit to add, change or remove a dashboard link. Only dashboard URLs belong here: no tokens, no secrets.
 * Account/project IDs are not hard-coded (the repo is public): they are read from the runtime environment and the generic
 * dashboard URL is used when the variable is unset or malformed. Environments are `local` + a single `production` (INF-10),
 * so there are deliberately no testing/staging links.
 */

export interface DashboardEnv {
	SUPABASE_PRODUCTION_REF?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
	/** GON-216: YYYY-MM-DD expiry of GITHUB_DISPATCH_TOKEN (config, not read from the token). */
	GITHUB_DISPATCH_TOKEN_EXPIRES_AT?: string;
	SITE_ENV?: string;
}

export interface DashboardLinkDef {
	label: string;
	/** One short sentence: what this service handles for the blog. */
	purpose: string;
	url: string | ((env: DashboardEnv) => string);
}

export interface DashboardCategoryDef {
	id: string;
	title: string;
	links: DashboardLinkDef[];
}

export interface DashboardLink {
	label: string;
	purpose: string;
	url: string;
}

export interface DashboardCategory {
	id: string;
	title: string;
	links: DashboardLink[];
}

/** Every external link is opened like this (the EmDash host renders `external` Block Kit links the same way). */
export const LINK_TARGET = "_blank";
export const LINK_REL = "noopener noreferrer";

// Supabase project refs are 20 lowercase letters/digits; Cloudflare account IDs are 32 hex characters.
const SUPABASE_REF = /^[a-z0-9]{20}$/;
const CLOUDFLARE_ACCOUNT = /^[a-f0-9]{32}$/;

const supabaseUrl = (env: DashboardEnv) =>
	env.SUPABASE_PRODUCTION_REF && SUPABASE_REF.test(env.SUPABASE_PRODUCTION_REF)
		? `https://supabase.com/dashboard/project/${env.SUPABASE_PRODUCTION_REF}`
		: "https://supabase.com/dashboard/projects";

const cloudflareUrl = (path: string) => (env: DashboardEnv) =>
	env.CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID)
		? `https://dash.cloudflare.com/${env.CLOUDFLARE_ACCOUNT_ID}${path}`
		: "https://dash.cloudflare.com/";

export const DASHBOARD_CATEGORIES: DashboardCategoryDef[] = [
	{
		id: "infrastructure",
		title: "Infrastructure & Hosting",
		links: [
			{
				label: "Cloudflare: Workers & Pages",
				purpose:
					"growgen-web Worker and static assets, Hyperdrive, KV, Workers AI, Tunnel / Access, and the PV Worker (pv.growgen.xyz, source no longer in this repo).",
				url: cloudflareUrl("/workers-and-pages"),
			},
			{
				label: "Cloudflare: DNS",
				purpose: "DNS records and custom domains for growgen.xyz.",
				url: cloudflareUrl("/home"),
			},
			{
				label: "Supabase",
				purpose: "Production Postgres database and the derived.* pgvector tables.",
				url: supabaseUrl,
			},
			{
				label: "GitHub: Repository",
				purpose: "Source, pull requests, and environment configuration.",
				url: "https://github.com/gongbaodd/blog.gongbushang.com",
			},
			{
				label: "GitHub: Actions",
				purpose: "web-ci, web-deploy and web-guards (backups, keep-alive) workflow runs.",
				url: "https://github.com/gongbaodd/blog.gongbushang.com/actions",
			},
		],
	},
	{
		id: "media",
		title: "Media & Content",
		links: [
			{
				label: "Cloudinary",
				purpose: "Media library, image transforms (f_auto,q_auto) and free-tier credit usage.",
				url: "https://console.cloudinary.com/",
			},
			{
				label: "Spotify for Creators",
				purpose: "Podcast RSS feed management (formerly Anchor.fm).",
				url: "https://creators.spotify.com/",
			},
		],
	},
	{
		id: "analytics",
		title: "Analytics, Traffic & Monetization",
		links: [
			{
				label: "Mixpanel",
				purpose: "Product analytics (EU region, opt-in consent).",
				url: "https://eu.mixpanel.com/",
			},
			{
				label: "GoatCounter",
				purpose: "Traffic and page-view counter.",
				url: "https://gongbaodd.goatcounter.com/",
			},
			{
				label: "Google AdSense",
				purpose: "Ad units and EU Privacy & Messaging consent.",
				url: "https://adsense.google.com/",
			},
			{
				label: "Google Search Console",
				purpose: "Indexing, sitemap and search performance.",
				url: "https://search.google.com/search-console",
			},
		],
	},
	{
		id: "project",
		title: "Project Management",
		links: [
			{
				label: "Linear",
				purpose: "Blog project board (P-GON-6).",
				url: "https://linear.app/gongbaodd/project/blog-fc8994e42e5e",
			},
		],
	},
];

/** Resolve env-dependent URLs. Pure: pass `process.env` at the call site. */
export function resolveDashboards(
	env: DashboardEnv = {},
	categories: DashboardCategoryDef[] = DASHBOARD_CATEGORIES,
): DashboardCategory[] {
	return categories.map((category) => ({
		id: category.id,
		title: category.title,
		links: category.links.map((link) => ({
			label: link.label,
			purpose: link.purpose,
			url: typeof link.url === "function" ? link.url(env) : link.url,
		})),
	}));
}
