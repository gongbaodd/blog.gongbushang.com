# PORT-1: site shell (Builder-Core)

Branch `emdash/PORT-1` (from `feat/emdash`). Plan §4 E4, features F16/F20, decision D1.

## What was ported
Everything is **copied** into `apps/web` (legacy still builds). Full source -> dest table: `apps/web/PORTING.md` ("PORT-1" section). Deviations from the template: `apps/web/TEMPLATE_DIFF.md`.

- Layouts: `src/layouts/Global.astro` (props `title/description/image/canonical/noindex/content`; renders `BaseHead`, EmDash `EmDashHead/BodyStart/BodyEnd`, `ConsentBanner` slot, `<slot name="head">`), `src/layouts/BlogPost.astro` (skeleton only, PORT-2 wires data).
- `src/components/{BaseHead,HeaderLink,TransitionFrom}.astro`, `view-transition.css`, `MantineAnchor`, `TransitionSkeletons`, `ViewCount`.
- `src/header/*`, `src/footer/*` (open-source blurb inlined, no MDX), `src/stores/{CustomMantineProvider,layout,pv,skeletons}`, `src/skeletons/*`, `src/icons/*`, `src/consts.ts`, `src/utils/mantine-classes.ts`, favicons/manifest in `public/`.
- Tailwind 3.4 + shadcn theme: `tailwind.config.mjs`, `src/styles/globals.css`; `postcss.config.mjs` now runs Tailwind v3 + autoprefixer **only for CSS outside `node_modules`** (EmDash admin CSS is Tailwind v4 and breaks under v3; verified the build passes and the admin CSS is untouched).
- Fonts: `@fontsource/noto-sans-sc` latin-400/700 (same as legacy Resume; the legacy global layout imported no font). Importing the full CJK set would add ~hundreds of asset files, so deliberately not done.
- `astro.config.mjs`: `site` from `EMDASH_SITE_URL` / `SITE_URL` (default https://growgen.xyz), `prefetch: { prefetchAll: true, defaultStrategy: "hover" }`, Vite alias `@` -> apps/web root. `tsconfig.json`: `paths {"@/*": ["./*"]}`, react-jsx. Ported code writes `@/src/...` (legacy `@/packages/x` rewritten to `src/x`).
- `/` (`src/pages/index.astro`) renders the starter posts list inside Global + Header + Footer, `prerender = true`. `/_emdash/*` untouched. S0 spike pages kept, not linked.
- Stubs with TODO (slots kept): `src/analytics/{MixpanelHead,ConsentBanner}.astro`, `src/ads/{AdSenseHead,AdSenseSlot}.astro` (PORT-7). Header `<Search>` slot is a TODO (search story); `@mantine/spotlight` CSS import deferred with it.
- SEO: canonical/OG/Twitter/description now come from `<EmDashHead>` (editor SEO-panel overrides apply) instead of the legacy BaseHead; Global passes canonical = `Astro.site` + pathname (legacy parity).

## Peer-version check (no blocking conflicts)
| Package | Legacy root | apps/web now | Peer requirement |
|---|---|---|---|
| react / react-dom | ^19.2.6 | 19.2.4 (template pin, kept) | Mantine 9.2.2 needs ^19.2.0; EmDash >=18; @astrojs/react 7.1.9 ok |
| @astrojs/react | ^6.0.6 | ^7.0.0 (7.1.9) | EmDash peers `>=5.0.0-beta.0`; differs from root, intentional |
| astro | 7.3.3 | ^7.4.13 | @astrojs/cloudflare 14.4 needs >=7.4 (S0-2) |
| @mantine/core,hooks,carousel | ^9.2.1 | ^9.2.1 (9.2.2) | core peers hooks 9.2.2, ok |
| tailwindcss | ^3.4.1 | ^3.4.1 | EmDash admin uses v4 internally (bundled CSS); isolated by postcss scoping |
| nanostores / @nanostores/react | ^1.0.1 / ^1.1.0 | same | none |
| MUI 7, @react-three/*, three, rapier | present | **not added** | not needed by the shell; later page stories add them (Three 0.167 vs drei 10 etc. already working in legacy) |
Residual notes: react 19.2.4 (apps/web) vs 19.2.6 (root) means two React copies in the pnpm store; harmless, align when convenient. `pnpm-lock.yaml` changed (new deps only).

## Verification (all run from the worktree)
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0; `/index.html` prerendered (115 KB, header + footer + 5 islands, Mantine AppShell header present, `<link rel="canonical" href="https://growgen.xyz/">`, `og:title`, description). 285 static asset files.
- `pnpm exec vitest run` in apps/web -> 3 files, 19 tests pass (new `src/header/shell.test.ts`: routes, pathname normalization, Mantine global classes).
- Legacy `pnpm test:unit` (repo root) -> 33 files pass, 209 tests pass, 3 skipped (unchanged).
- `pnpm exec astro dev --port 4331` + `curl /` -> 200; contains `mantine-AppShell-header`, `<footer`, 5 `astro-island`, Mantine `styles.css` and carousel `styles.css` injected. Dev server stopped (`astro dev stop`).
- Not run: `astro check` (`pnpm --filter web typecheck`); not part of the requested checks.

## Worker bundle impact
`wrangler deploy --dry-run --outdir <scratch> -c dist/server/wrangler.json`: **Total 668 modules, 21357.68 KiB; upload 21446.82 KiB / gzip 5697.44 KiB.** Baseline (S0-2) was 671 modules, ~20.9 MiB. So no growth. No `MantineProvider` / `mantine-AppShell` strings in `dist/server` or the dry-run output: React/Mantine render at prerender time only and do not land in the Worker. Bindings unchanged (EMDASH_ROOMS, SESSION, HYPERDRIVE, ASSETS).

## Open questions
1. `ViewCount` still fetches `https://pv.growgen.xyz/pv` (legacy pv worker, removed from repo). Keep, replace, or drop in the footer? Left as-is.
2. Footer still loads the GoatCounter script (legacy); PORT-7 should decide with the Mixpanel work.
3. Footer open-source blurb now says Cloudflare + EmDash instead of Vercel; confirm wording.
4. `favicon.svg` and the default `blog-placeholder-1.jpg` referenced by legacy BaseHead do not exist in legacy `public/` either; `/favicon.svg` 404s as before.
5. Header nav targets (`/all`, `/lab`, `/world`, `/year`) 404 until the page stories land.
6. Plan Gantt: PORT-1 marked `active`. To be marked `done` after merge.
7. Align apps/web React to ^19.2.6 (root) when convenient.
