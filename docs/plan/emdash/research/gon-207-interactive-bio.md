# GON-207: Interactive Front-Page Description (Persona Tags / Cards)

Research, architecture, and low-fi prototype spec for making the home-page bio (`ParticleHero` right-hand `contentPanel`) interactive while preserving SEO, no-JS readability, and `TooltipStackCarousel` coexistence.

---

## 1. Inspiration References (Portfolio & Indie Web)

1. **Bruno Simon (`bruno-simon.com`) — Playable world as portfolio entry**
   * *Pattern:* Visitors drive a miniature 3D car around an interactive world to discover projects.
   * *Takeaway for GrowGen:* `ParticleHero` already provides the playful WebGL UMAP world on the left (`canvasColumn`). The bio beside it should **not** add a second heavy 3D/physics scene; instead, it should act as a lightweight **quest guide / compass** that pairs with the canvas.
2. **Rauno Freiberg (`rauno.me`) — Tactile micro-interactions & compact controls**
   * *Pattern:* Crisp pill/dock controls, subtle elevation, and responsive hover/focus states inside tight containers.
   * *Takeaway for GrowGen:* `contentPanel` is constrained to `minmax(280px, 520px)` on desktop (`>= 62em`) and stacks below the canvas on mobile (`< 62em`). Compact Mantine `Chip` / `Button` / `Card` primitives match the existing `LegendCategoryChips` visual language.
3. **Josh W. Comeau (`joshwcomeau.com`) — Personality-first narrative with inline playgrounds**
   * *Pattern:* Human, conversational voice paired with interactive widgets embedded directly in the reading column.
   * *Takeaway for GrowGen:* Keep Gong's signature voice (jQuery → React, **给我整**, Tallinn Digital Learning Games, gamification) front-and-center in SSR HTML, layering interactivity on top rather than replacing the narrative with cold links.
4. **Maggie Appleton (`maggieappleton.com`) — Digital garden topic trails**
   * *Pattern:* Curated entry points that turn an archive of hundreds of posts into approachable thematic trails.
   * *Takeaway for GrowGen:* Map each identity facet from `title.md` directly to real curated posts, podcast episodes, tags, and routes (`/lab/`, `/podcast/`, `/world/`, `/umap/`) instead of leaving 990+ posts behind flat category links.
5. **Derek Sivers / `neal.fun` style — Reader-controlled bio depth & "Choose your path"**
   * *Pattern:* A lightweight selector (`TL;DR` / `Builder` / `Explorer` / `Random`) that lets visitors tailor the intro in under 5 seconds.
   * *Takeaway for GrowGen:* A default **"Overview" (full bio)** state preserves the complete SSR intro for crawlers and first-time skimmers, while clicking a facet chip or card deals a tailored micro-story + 2–3 curated links.

---

## 2. Placement & Coexistence Decision

### Options Evaluated
| Option | Fit with `ParticleHero.module.css` | Coexistence with `TooltipStackCarousel` | Verdict |
| --- | --- | --- | --- |
| **A. Inside `ParticleHero`'s `contentPanel`** (keep `title.md` spanning top `heroTitle`) | Fits `grid-column: 2; grid-row: 2` (`minmax(280px, 520px)`) without pushing `MantineHeatWrapper` below the fold | `ParticleHero.tsx` swaps `contentPanel` to `TooltipStackCarousel` when `cardStack.length > 0`; lifting `selectedFacet` state restores the visitor's chosen facet on close | **Recommended** |
| **B. Unify into `title.md` role badges** | `heroTitle` spans `1 / -1`; expanding inline cards there pushes the WebGL canvas down on mobile (`< 62em`) | Leaves `contentPanel` static while `heroTitle` changes height | Not recommended |
| **C. Dedicated interactive hero block below `ParticleHero`** | Adds a second full-width section before the heatmap and duplicates intro context | No conflict, but splits the bio away from the canvas | Not recommended |

### How `contentPanel` Coexists with `TooltipStackCarousel`
In `apps/web/src/particle-hero/ParticleHero.tsx` (lines 463–487):
- When `cardStack.length > 0`, `ParticleHero` renders `TooltipStackCarousel`.
- When `cardStack.length === 0`, `ParticleHero` renders `description` + `"Follow me in social media"`.
- **Integration rule:** Keep `selectedFacetId` (default `"overview"`) in `ParticleHero` (or a persistent child state via CSS hiding rather than unmounting) so hovering a UMAP particle temporarily shows `TooltipStackCarousel`, and closing it restores the exact facet the visitor had open.
- **UMAP Canvas Bridge:** `Particles.js` `setPostFilter({ category, year })` already supports filtering visible particles by `category` (`fe`, `life`, `tech`, `plan`, `movie`, `book`, `sport`, `tv`, `music`, `podcast`, or `"all"`). Each facet carries an optional `canvasCategory` so an opt-in **"Highlight on canvas"** toggle can call `filter.selectCategory(facet.canvasCategory)` without modifying WebGL shaders. Tag/slug-level particle highlighting can follow later.

---

## 3. Core Facets (8) & Curated Content

Derived directly from `apps/web/src/hero/fragments/title.md` and `description.md`. Every route and slug below is verified against `apps/web/tests/legacy-urls.txt`.

| ID | Facet | Canvas Category | Micro-angle | Verified Curated Links |
| --- | --- | --- | --- | --- |
| `builder` | 💻 Web Developer | `fe` | Coding since the jQuery era to React, Astro & Cloudflare Workers | `/resume/`, `/lab/`, `/fe/2020/02/27/rust-webassembly-game-of-life/`, `/fe/2025/02/21/puzzle-game/` |
| `games` | 🎮 Learning Games & HCI | `plan` | Studying Digital Learning Games in Tallinn; gamification for HCI | `/fe/2026/11/19/gameplay-atlas/`, `/life/2025/11/02/digiwise-gamejam/`, `/plan/2025/03/30/week-13-taltech-gamejam-2025-spring/` |
| `podcaster` | 🎙️ Podcaster | `podcast` | Tech & developer conversations on the podcast | `/podcast/`, `/podcast/TallinnJS-e34ho4e/`, `/podcast/Cloudflare-e3ovv36/`, `/podcast/Godot-e34q34c/` |
| `traveler` | 🌍 Traveler | `life` | Field notes from Tallinn, Estonia, and across China | `/world/`, `/plan/2025/05/23/week-22-tallinn-valencia-hack/`, `/life/2026/07/02/cv-tallinn/` |
| `surfer` | 🌊 Surfer | `life` | Chasing waves in Houhai / Dadonghai, Sanya | `/tag/surfing/`, `/life/2020/07/19/study-surfing-in-houhai-sanya/`, `/life/2020/09/07/great-east-sea-surfing-experience/` |
| `crossfitter` | 🏋🏻‍♂️ CrossFitter | `sport` | Training logs and movement discipline | `/sport/`, `/life/2020/12/15/crossfit/` |
| `maker` | 🎨🎵 Tattoo & Harmonica | `music` | Analog craft & visual/music experiments away from the keyboard | `/music/`, `/tag/harmonica/`, `/hero-gallery/` |
| `learner` | 🐦 Language Learner | `plan` | Duolingo streak, Estonian, and the "给我整" lifelong-learning mindset | `/tag/estonian/`, `/plan/2025/07/25/week-31-tallinn-summer-school/`, `/umap/` |

---

## 4. Low-Fi Prototype Variations Built on This Branch

Two composable low-fi variations are prototyped in `apps/web/src/particle-hero/components/BioFacetVariations.tsx` using data from `apps/web/src/particle-hero/bioFacets.ts` (without altering live `/` yet):

1. **Variation A — `BioPersonaChips` ("Choose a path" radio chips)**
   * Mantine `Chip.Group` matching `LegendCategoryChips` styling.
   * Defaults to `"overview"` (renders the untouched `children` / SSR `description` slot).
   * Selecting any of the 8 facet chips swaps the card body to that facet's micro-story, quick fact, curated links, and optional canvas-sync button, plus a subtle `Discovered X / 8` badge.
2. **Variation B — `BioCardDeck` ("Collectible Bio Deck")**
   * Tactile deck pager (`Prev` / `Next` / `🎲 Random` / `Full bio`) framed around 4 primary archetypes (`Builder`, `Game Researcher`, `Podcaster`, `Traveler` — or cycling all 8 facets) with a `Discovered X / 8` progress bar (`Pick 3 to explore`).
   * Compact vertical footprint inside `contentPanel` (`<= 520px` wide) and crisp keyboard focus states.

### Recommendation
Ship **Variation A (`BioPersonaChips`)** inside `ParticleHero`'s `contentPanel` first:
- Lowest visual risk and smallest footprint on `< 62em` mobile viewports.
- Visually consistent with `LegendCategoryChips` directly to its left.
- Can optionally borrow Variation B's `🎲 Surprise me` button and `Discovered X/8` counter for subtle gamification.

---

## 5. SEO, EmDash CMS, and Analytics Notes

- **SEO & No-JS:** `index.astro` keeps `SITE_DESCRIPTION` unchanged in `<Global description={SITE_DESCRIPTION}>`, and `"overview"` mode renders the full Markdown `description` HTML directly on SSR so bots and no-JS visitors receive 100% of the bio and section links.
- **EmDash vs. TypeScript Data:** Keep `bioFacets.ts` in TypeScript first—facet links point to hardcoded app routes (`/lab/`, `/world/`, `/umap/`) and `CATEGORY_COLORS` keys from `postsData.ts`. Move to an EmDash collection/setting only if non-code editorial updates become frequent.
- **Analytics:** When wired into `ParticleHero.tsx`, add a single discrete event to `apps/web/src/analytics/events.ts`:
  ```ts
  bio_facet_selected: { facet: string; variant: "chips" | "deck"; location: "hero" };
  ```
  and fire via `track("bio_facet_selected", ...)` only on explicit user click (respecting existing opt-in consent).
