# GrowGen Mixpanel Analytics Plan

> Created: 2026-11-21
> **Status: PHASES 1–3 IMPLEMENTED 2026-11-21 (uncommitted). Pending: Mixpanel project + Vercel env vars, GoatCounter/ViewCount replacement (§10.4), optional proxy (Phase 4).**
> Scope: https://growgen.xyz (Astro 7 static site on Vercel)
> Method: Source review of `packages/components/BaseHead.astro`, `packages/layouts/Global.astro`, `packages/footer/Footer.astro`, `packages/ads/*`, `src/pages/privacy.astro`, `src/env.d.ts`, `astro.config.mjs`, `vercel.json`, and the main interactive islands (search, podcast, map, tags).

---

## 1. Goal and recommendation

Add **Mixpanel product analytics** next to the existing GoatCounter page counter, so we can answer questions GoatCounter cannot: which posts are actually read to the end, what people search for, which navigation paths and islands (map, podcast, UMAP, lab) get used, and where outbound clicks go.

Recommendation:

- Load `mixpanel-browser` from npm through **one shared module** (`packages/analytics`) and initialise it from a single inline-free `<script>` in `BaseHead.astro`, so every page that already uses `BaseHead` gets it automatically.
- **Gate everything on `PUBLIC_MIXPANEL_TOKEN`.** No token → no script, no network request (local dev, previews, forks stay clean).
- Start **privacy-minimal**: no session replay, no autocapture of form/input text, `ip: false`, EU data residency, `localStorage` persistence, and honour Do Not Track. Add identified-user features never (the site has no accounts).
- Keep GoatCounter for at least one month as the baseline to compare page-view counts against, then decide whether to drop it.

## 2. Current state (observed)

| Finding | Evidence | Implication |
| --- | --- | --- |
| GoatCounter is loaded site-wide from the footer: `<script data-goatcounter=… async fetchpriority="low" src="//gc.zgo.at/count.js">`. | `packages/footer/Footer.astro:226` | There is already a cookieless page-view baseline. Mixpanel is additive. |
| Every page builds its `<head>` from `BaseHead.astro` via `slot="head"` (21 usages). | `src/pages/**`, `packages/layouts/BlogPost.astro` | `BaseHead` is the single injection point. |
| `ClientRouter` is imported in `Global.astro` but **not rendered**. Navigation is full-page loads plus CSS cross-document view transitions (`view-transition.css`). | `packages/layouts/Global.astro` | Mixpanel's built-in `track_pageview: true` is enough today. If `ClientRouter` is ever enabled, page views must be re-sent on `astro:page-load` (see §5.3). |
| `prefetch: { prefetchAll: true, defaultStrategy: "hover" }`. | `astro.config.mjs` | Prefetch fetches HTML only; it does not execute scripts, so it won't inflate page views. |
| Public env flags are typed in `src/env.d.ts` (`PUBLIC_ADSENSE_SLOT_ID`, `PUBLIC_ADSENSE_CONSENT_READY`). `.env` exists locally; Vercel holds prod values. | `src/env.d.ts`, `.env` | Follow the same pattern for `PUBLIC_MIXPANEL_*`. |
| AdSense uses Google Privacy & messaging (`googlefc`) for consent, only when `PUBLIC_ADSENSE_CONSENT_READY === "true"`. | `packages/ads/AdSenseHead.astro`, `src/pages/privacy.astro` | Mixpanel consent should reuse the same "manage preferences" area on `/privacy` instead of adding a second banner. |
| `/privacy` describes only GoatCounter, AdSense, and Cloudinary. | `src/pages/privacy.astro` | Must be updated **before** Mixpanel goes live. |
| No CSP headers are set (`vercel.json` only has install/build commands). | `vercel.json` | No CSP change needed now; if a CSP is added later, allow `api-eu.mixpanel.com` (or the proxy path). |

**Unknown:** whether a Mixpanel project already exists, which data-residency region it uses (EU vs US — this cannot be changed after creation), and visitor geography. The owner must decide those in Mixpanel before Phase 1.

## 3. What to measure (initial event taxonomy)

Keep the event list short and stable. Event names are `object_verb` snake_case (Mixpanel convention, renamed 2026-11-21 before any production data); properties are `snake_case`; empty/null values are omitted.

**Super properties** (registered once at init, sent with every event):

| Property | Value |
| --- | --- |
| `site_section` | First path segment mapped to `home`, `blog` (category routes), `lab`, `world`, `podcast`, `tag`, `series`, `year`, `about`, `resume`, `other` |
| `color_scheme` | `dark` / `light` (from Mantine's `data-mantine-color-scheme`) |
| `build_sha` | `VERCEL_GIT_COMMIT_SHA` short hash, injected at build time — helps correlate regressions |

**Events:**

| Event | Trigger | Key properties | Where |
| --- | --- | --- | --- |
| `Page View` (`$mp_web_page_view`) | Automatic, `track_pageview: true` | URL, referrer, UTM (Mixpanel default) | `packages/analytics` init |
| `post_read` | Reader reaches 25 / 50 / 75 / 100 % of the article body (fire each threshold once) | `slug`, `category`, `year`, `depth`, `reading_time_min`, `tags[]` | `packages/layouts/BlogPost.astro` (IntersectionObserver sentinels in the content area) |
| `search_opened` | Spotlight opens (button or hotkey) | `source`: `button` / `hotkey` | `packages/search/Search.tsx` |
| `search_performed` | Debounced query (already debounced in `Search.tsx`) with ≥ 2 chars | `query` (trimmed, max 100 chars), `query_length`, `result_count` — owner decided to collect search text; disclosed on `/privacy` | `packages/search/Search.tsx` |
| `search_result_clicked` | User picks a result | `rank`, `slug` | `packages/search/Search.tsx` |
| `outbound_link_clicked` | Click on `a[target=_blank]` whose host ≠ `growgen.xyz` (rehype-external-links already marks them) | `domain`, `from_slug` | Delegated listener in `packages/analytics` |
| `tag_clicked` | Tag chip/cloud click | `tag`, `location` | `packages/tags/Tags.astro` |
| `podcast_listen_clicked` | External listen link / player play | `episode`, `provider` | `src/components/PodcastEpisodeContent.tsx`, `PodcastSidebar.tsx` |
| `city_opened` | Map city selected | `city` | `packages/map`, `src/pages/world/[city].astro` |
| `related_post_clicked` | Click in Related Posts | `from_slug`, `to_slug`, `rank` | `RelatePosts` in `BlogPost.astro` |

Out of scope for phase 1: session replay, heatmaps, autocapture, identify/alias, revenue events.

## 4. Privacy and consent

- [ ] **Data residency:** create the project in **EU** residency and set `api_host: "https://api-eu.mixpanel.com"`. Region cannot be changed later.
- [ ] **Config defaults:** `ip: false` (no IP-based geolocation stored), `property_blacklist: ["$current_url_search"]` if query strings are not needed, `persistence: "localStorage"`, `ignore_dnt: false`, `record_sessions_percent: 0`, `autocapture: false`.
- [ ] **Consent model — DECIDED: opt-in everywhere.** Mixpanel loads with `opt_out_tracking_by_default: true` and sends nothing until the visitor allows it. Option B below is not used.
- [ ] Original options considered:
  - **A. Opt-out by default in EEA/UK/CH, opt-in elsewhere.** Use `opt_out_tracking_by_default: true` when `navigator.language`/timezone heuristics or a Vercel geo header suggest EEA, and call `mixpanel.opt_in_tracking()` from the consent control. Simpler variant: opt-out by default everywhere until the visitor accepts.
  - **B. Rely on Google's consent message.** Read the TCF signal via `__tcfapi` (available once `PUBLIC_ADSENSE_CONSENT_READY` is on) and only call `opt_in_tracking()` when purpose 1 + 8/9 (measurement) are consented. Ties Mixpanel to AdSense rollout, so only choose this if AdSense consent is already live.
- [ ] Add a **"Analytics preferences"** toggle (Allow / Don't allow) inside `#ad-preferences` on `/privacy`, wired to `opt_in_tracking()` / `opt_out_tracking()`, with current state shown via `has_opted_in_tracking()`.
- [ ] Update `/privacy`: new "Product analytics (Mixpanel)" section — what is collected (events in §3, device/browser, referrer), what is not (no IP stored, no account data); note that search text typed into site search is collected, storage (`localStorage` key `mp_<token>_mixpanel`), region (EU), retention, and how to opt out. Bump "Last updated".
- [ ] Never send post content, email addresses, or anything from contact/resume forms as properties.

## 5. Implementation plan

### Phase 0 — Account setup (owner, outside the repo)

- [ ] Create Mixpanel project "GrowGen" with **EU residency**; create a separate "GrowGen (dev)" project for testing.
- [ ] Record both project tokens. Tokens are public by design (they ship to the browser), but keep them in env vars, not source.
- [ ] Set project timezone to the owner's timezone; enable "Strict mode" / data-type validation if available; add Lexicon descriptions for each event in §3.
- [ ] Add Vercel env vars: `PUBLIC_MIXPANEL_TOKEN` (Production → prod token, Preview → dev token), `PUBLIC_MIXPANEL_API_HOST=https://api-eu.mixpanel.com`, optional `PUBLIC_MIXPANEL_DEBUG=true` for Preview.

### Phase 1 — Analytics package

- [ ] `pnpm add mixpanel-browser` and `pnpm add -D @types/mixpanel-browser` (check whether types are bundled first; recent versions ship their own).
- [ ] Create workspace package `packages/analytics/` (`package.json` with `"name": "analytics"`, matching other packages):
  - `index.ts` — exports `initAnalytics()`, `track(event, props?)`, `optIn()`, `optOut()`, `hasOptedIn()`.
    - Every export is a **no-op** when `import.meta.env.PUBLIC_MIXPANEL_TOKEN` is empty or when running on the server (`typeof window === "undefined"`).
    - `mixpanel-browser` is loaded with **dynamic `import()`** inside `initAnalytics()` so it stays out of every island bundle and off the critical path; calls made before load are queued in a small in-memory array and flushed on init.
    - Init is idempotent (guard flag) so multiple islands calling `track` don't re-init.
  - `events.ts` — a typed union of event names + property shapes from §3 (`type AnalyticsEvent = { name: "post_read"; props: { slug: string; depth: 25|50|75|100; … } } | …`) so `track()` is type-checked and the taxonomy lives in one file.
  - `outbound.ts` — one delegated `click` listener on `document` for outbound links.
  - `MixpanelHead.astro` — renders nothing if no token; otherwise a bundled (not `is:inline`) `<script>` that calls `initAnalytics()` in `requestIdleCallback` (fallback `setTimeout(…, 1)`), registers super properties, and installs the outbound listener.
- [ ] Type the new vars in `src/env.d.ts`: `PUBLIC_MIXPANEL_TOKEN?: string; PUBLIC_MIXPANEL_API_HOST?: string; PUBLIC_MIXPANEL_DEBUG?: string;`.
- [ ] Add `<MixpanelHead />` at the end of `packages/components/BaseHead.astro` (before `<slot />`). This covers all 21 pages without touching each one.
- [ ] Add `.env` entry `PUBLIC_MIXPANEL_TOKEN=` (empty) to local `.env` and document it in `CLAUDE.md` Commands/Architecture if useful.

### Phase 2 — Event instrumentation

Do these one PR at a time so each can be verified in Mixpanel's Live View.

- [ ] **Post Read** — in `BlogPost.astro`, add four zero-height sentinel elements at 25/50/75/100 % positions of the content wrapper (or a single script that computes positions), observed with one `IntersectionObserver`; fire once per threshold per page load. Pass `slug`, `category`, `tags`, `reading_time_min` via `data-*` attributes from frontmatter.
- [ ] **Search** — in `Search.tsx`, call `track` from the existing `spotlight.open` path, the `useHotkeys` handler, the debounced search callback (length + count only), and the result action handler.
- [ ] **Tag / Related / Podcast / City** — add `track` calls at the existing click handlers listed in §3. For `.astro` components, add a small bundled `<script>` with delegated listeners using `data-analytics-*` attributes rather than per-element handlers.
- [ ] Do **not** add analytics calls inside WebGL/Three.js render loops or `useFrame` callbacks (see `.agents/skills/webgl-components/SKILL.md`); only track discrete user actions.

### Phase 3 — Consent wiring and privacy page

- [ ] Implement the consent model chosen in §4 inside `initAnalytics()`.
- [ ] Add the Analytics preferences control and copy to `src/pages/privacy.astro`.
- [ ] Update the footer privacy/cookie-settings link text if it now covers analytics too.

### Phase 4 (optional) — First-party proxy

Ad/tracker blockers drop a large share of requests to `*.mixpanel.com`. If Phase 5 shows Mixpanel page views far below GoatCounter:

- [ ] Add Vercel rewrites in `vercel.json`, e.g. `{ "source": "/mp/:path*", "destination": "https://api-eu.mixpanel.com/:path*" }`, and set `PUBLIC_MIXPANEL_API_HOST=https://growgen.xyz/mp`.
- [ ] Mention the proxy in `/privacy` (data still goes to Mixpanel).

### 5.3 If `ClientRouter` is enabled later

`track_pageview: true` only fires on full loads. With `<ClientRouter />` rendered in `Global.astro`, either set `track_pageview: "url-with-path"` (fires on History API changes) or call `mixpanel.track_pageview()` in an `astro:page-load` listener and skip the first event. Also re-run `post_read` sentinel setup on `astro:page-load` (same pattern as `packages/tags/Tags.astro:60`).

## 6. Testing and verification

- [ ] **Unit (Vitest):** `packages/analytics/index.test.ts`
  - no token → `track()` never imports `mixpanel-browser` (mock with `vi.mock`) and never throws;
  - queued calls before init are flushed in order after init;
  - `initAnalytics()` twice → `mixpanel.init` called once;
  - opted-out state → `track` is a no-op;
  - `site_section` mapping for representative paths.
- [ ] **E2E (Cucumber/Playwright, `pnpm test:e2e`):** one `@smoke` scenario that builds with a dummy token, intercepts `**/track*` / `**/engage*` requests, loads a post, scrolls to the bottom, and asserts a `Page View` and a `post_read` (depth 100) payload were sent; and one that asserts **no** Mixpanel request when the token is empty.
- [ ] **Performance:** compare Lighthouse/`web-perf` before and after on `/` and a long post; Mixpanel must not add to LCP/TBT (dynamic import + idle init). Check `pnpm build` bundle sizes — `mixpanel-browser` should appear in its own chunk only.
- [ ] **Hydration:** run `pnpm check:hydration` to confirm no island changes break SSR/hydration.
- [ ] **Live check:** deploy a Vercel Preview with the dev token, open Mixpanel Live View, click through each event in §3, confirm properties and that no raw search text or IP appears.
- [ ] **Consent:** with opt-out default, confirm zero requests until "Allow" is pressed on `/privacy`; after "Don't allow", confirm requests stop and the `localStorage` key is cleared.

## 7. Rollout

1. Merge Phases 1–3 with `PUBLIC_MIXPANEL_TOKEN` set **only on Preview**; verify §6.
2. Set the production token; watch Live View for 24 h.
3. After 2–4 weeks, compare Mixpanel `Page View` totals with GoatCounter. Decide on the proxy (Phase 4) and whether to keep GoatCounter.
4. Build first Mixpanel reports: post read-through funnel (25 → 100 %), top searches by result count = 0 (content gaps), outbound domains, section usage over time.

## 8. Files touched (expected)

| File | Change |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | add `mixpanel-browser` |
| `packages/analytics/*` (new) | init, typed `track`, outbound listener, `MixpanelHead.astro`, tests |
| `packages/components/BaseHead.astro` | render `<MixpanelHead />` |
| `src/env.d.ts` | `PUBLIC_MIXPANEL_*` types |
| `packages/layouts/BlogPost.astro` | `post_read` sentinels, related-post click data |
| `packages/search/Search.tsx` | search events |
| `packages/tags/Tags.astro`, podcast components, `packages/map` | click events |
| `src/pages/privacy.astro` | Mixpanel disclosure + analytics preference control |
| `vercel.json` | (Phase 4 only) proxy rewrite |
| `e2e/` | analytics smoke scenario |

## 9. Open decisions for the owner

1. EU or US data residency (recommend EU; irreversible).
2. Consent model A (opt-out by default, own toggle) or B (follow Google TCF signal).
3. Whether raw search queries may ever be collected (recommend no; length + result count only).
4. Keep or remove GoatCounter after the comparison period.

## 10. Decisions (2026-11-21)

1. **Data residency:** Mixpanel offers **US, EU, and India (IN)** residency — there is no Singapore region. The client takes the ingestion host from `PUBLIC_MIXPANEL_API_HOST` (default `https://api-eu.mixpanel.com`; India is `https://api-in.mixpanel.com`), so the code does not depend on the choice. The owner picks the region when creating the project.
2. **Consent:** opt-in. Nothing is sent until the visitor allows analytics (consent banner + toggle on `/privacy`).
3. **Search queries:** collected (`query`, trimmed, max 100 chars).
4. **GoatCounter:** to be removed. **Blocker:** the footer `ViewCount` (`src/components/ViewCount.tsx`, `src/stores/pv.ts`) reads per-page counts from `https://pv.growgen.xyz/pv`, which serves GoatCounter API data. Removing the GoatCounter script freezes those counts. Before removal, either drop `ViewCount` or replace its data source (e.g. a server-side endpoint querying Mixpanel's Query API with a service-account secret). GoatCounter removal is therefore a separate follow-up step, not part of Phases 1–3.
