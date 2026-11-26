import { CATEGORY_COLORS } from "./postsData";

export type BioArchetype = "builder" | "player" | "creator" | "explorer";

export interface IBioFacetLink {
  label: string;
  href: string;
}

export interface IBioFacet {
  id: string;
  emoji: string;
  label: string;
  archetype: BioArchetype;
  /** Category key in `postsData.ts` (`CATEGORY_COLORS`) or `"all"` for UMAP canvas sync. */
  canvasCategory: keyof typeof CATEGORY_COLORS | "all";
  headline: string;
  story: string;
  quickFact: string;
  links: IBioFacetLink[];
}

export const BIO_FACETS: readonly IBioFacet[] = [
  {
    id: "builder",
    emoji: "💻",
    label: "Web Dev",
    archetype: "builder",
    canvasCategory: "fe",
    headline: "From the jQuery era to React, Astro & edge Workers",
    story:
      "Building fast, playful web experiences—most recently migrating nearly a thousand posts onto EmDash, Cloudflare Workers, and WebGL particle maps.",
    quickFact: "Stack: TypeScript · React · Astro · Three.js",
    links: [
      { label: "CV / Resume", href: "/resume/" },
      { label: "Lab & Portfolio", href: "/lab/" },
      { label: "Rust + Wasm Game of Life", href: "/fe/2020/02/27/rust-webassembly-game-of-life/" },
    ],
  },
  {
    id: "games",
    emoji: "🎮",
    label: "Learning Games",
    archetype: "player",
    canvasCategory: "plan",
    headline: "Studying Digital Learning Games in Tallinn",
    story:
      "Exploring how game mechanics, spatial interfaces, and playful feedback loops can make human–computer interaction and learning genuinely engaging.",
    quickFact: "Base: Tallinn, Estonia · Focus: Gamification & HCI",
    links: [
      { label: "Gameplay Atlas", href: "/fe/2026/11/19/gameplay-atlas/" },
      { label: "Digiwise Game Jam", href: "/life/2025/11/02/digiwise-gamejam/" },
      {
        label: "TalTech Spring GameJam",
        href: "/plan/2025/03/30/week-13-taltech-gamejam-2025-spring/",
      },
    ],
  },
  {
    id: "podcaster",
    emoji: "🎙️",
    label: "Podcaster",
    archetype: "creator",
    canvasCategory: "podcast",
    headline: "Talking software, communities & new tools on air",
    story:
      "Recording episodes on frontend architecture, XR/game engines, local meetups, and the behind-the-scenes craft of shipping personal projects.",
    quickFact: "150+ episodes archived in /podcast/",
    links: [
      { label: "All Episodes", href: "/podcast/" },
      { label: "TallinnJS Meetup", href: "/podcast/TallinnJS-e34ho4e/" },
      { label: "Cloudflare Notes", href: "/podcast/Cloudflare-e3ovv36/" },
    ],
  },
  {
    id: "traveler",
    emoji: "🌍",
    label: "Traveler",
    archetype: "explorer",
    canvasCategory: "life",
    headline: "Stories between China, Tallinn & the Baltic coast",
    story:
      "Collecting city notes, hackathons, and quiet coastal detours—mapped interactively across the world archive.",
    quickFact: "Explore the interactive map in /world/",
    links: [
      { label: "World Map", href: "/world/" },
      { label: "Tallinn & Valencia Hack", href: "/plan/2025/05/23/week-22-tallinn-valencia-hack/" },
      { label: "CV in Tallinn", href: "/life/2026/07/02/cv-tallinn/" },
    ],
  },
  {
    id: "surfer",
    emoji: "🌊",
    label: "Surfer",
    archetype: "explorer",
    canvasCategory: "life",
    headline: "Chasing clean lines in Houhai & Dadonghai",
    story:
      "Balancing screen time with salt water—learning patience, wave reading, and wipeout recovery from Sanya's reefs.",
    quickFact: "Favorite breaks: Houhai & Dadonghai, Sanya",
    links: [
      { label: "Surfing Tag", href: "/tag/surfing/" },
      { label: "Surfing in Houhai", href: "/life/2020/07/19/study-surfing-in-houhai-sanya/" },
      { label: "Dadonghai Session", href: "/life/2020/09/07/great-east-sea-surfing-experience/" },
    ],
  },
  {
    id: "crossfitter",
    emoji: "🏋🏻‍♂️",
    label: "CrossFitter",
    archetype: "player",
    canvasCategory: "sport",
    headline: "Consistent reps, conditioning & measurable progress",
    story:
      "Treating fitness a lot like debugging: show up, log the numbers, respect technique, and celebrate small PRs over years.",
    quickFact: "Category: /sport/",
    links: [
      { label: "Sport Posts", href: "/sport/" },
      { label: "CrossFit Journal", href: "/life/2020/12/15/crossfit/" },
    ],
  },
  {
    id: "maker",
    emoji: "🎨",
    label: "Tattoo & Harmonica",
    archetype: "creator",
    canvasCategory: "music",
    headline: "Analog craft—ink lines & pocket blues",
    story:
      "When the laptop closes, hands-on tactile practice takes over: sketching flash, practicing harmonica bends, and color studies.",
    quickFact: "Visual archive & music experiments",
    links: [
      { label: "Music Archive", href: "/music/" },
      { label: "Harmonica Tag", href: "/tag/harmonica/" },
      { label: "Hero Gallery", href: "/hero-gallery/" },
    ],
  },
  {
    id: "learner",
    emoji: "🐦",
    label: "Language Learner",
    archetype: "builder",
    canvasCategory: "plan",
    headline: "“给我整” — lifelong learning across languages",
    story:
      "Grow Gen comes from Northeastern Chinese slang (“just do it!”) and continuous learning across generations—currently wrestling with Estonian alongside Duolingo.",
    quickFact: "Currently leveling up: Estonian & English",
    links: [
      { label: "Estonian Tag", href: "/tag/estonian/" },
      { label: "Tallinn Summer School", href: "/plan/2025/07/25/week-31-tallinn-summer-school/" },
      { label: "UMAP Post Universe", href: "/umap/" },
    ],
  },
];

export function getBioFacet(id: string): IBioFacet | undefined {
  return BIO_FACETS.find((facet) => facet.id === id);
}
