// Ported from packages/consts/index.ts (shell subset only; CUT-2 deletes the original).
// SITE_DESCRIPTION is inlined: the legacy file read it from an .mdx fragment (packages/hero/fragments/description.mdx).

export const SITE_TITLE = "GrowGen | 给我整";
export const SITE_TITLE_NICK = "GrowGen | 整";
export const SITE_DESCRIPTION =
	"Hi, I'm Gong. Web developer from China — coding since the jQuery era to the React era. Podcaster, tattoo artist, harmonica player. Traveler, surfer, language learner (Duolingo addict). This site is my space to share tech journals, daily life notes, travel stories, and study reflections. The name Grow Gen comes from continuous learning across generations and sounds like my name in Mandarin. Currently studying Digital Learning Games in Tallinn, Estonia. I believe the future of human–computer interaction lies in gamification.";

export enum ROUTE_LABEL {
	Home = "Home",
	Blog = "Blog",
	Lab = "Lab",
	World = "World",
	Archive = "Archive",
}

export enum ROUTE_HREF {
	Home = "/",
	Blog = "/all",
	Lab = "/lab",
	World = "/world",
	Archive = "/year",
}

export const ALL_ROUTE_LABEL = [
	ROUTE_LABEL.Home,
	ROUTE_LABEL.Blog,
	ROUTE_LABEL.Lab,
	ROUTE_LABEL.World,
	ROUTE_LABEL.Archive,
];

export const ALL_ROUTE_HREF = [
	ROUTE_HREF.Home,
	ROUTE_HREF.Blog,
	ROUTE_HREF.Lab,
	ROUTE_HREF.World,
	ROUTE_HREF.Archive,
];

export const ROUTES = ALL_ROUTE_LABEL.map((label) => ({
	label,
	href: ROUTE_HREF[label]!,
}));

export const PV_URL = "https://pv.growgen.xyz/";
