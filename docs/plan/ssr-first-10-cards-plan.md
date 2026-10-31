# Plan — Server-render the first 10 post cards, continue loading on the client

> Parent: `docs/plan/adsense-rejection-fix-plan.md` (Step 2), follows `adsense-step2-3-ssr-hydration-plan.md`
> Status: **IMPLEMENTED** (option A, uncommitted on `master`). Verified: `pnpm check:hydration` clean on `/`, `/all`, `/year/2025`,
> `/lab`, `/tag/react`, `/podcast`; first 5 cards in the HTML; Load More adds 16 at a time with no duplicates; 165 unit tests pass.
> Notes: `SsrMasonry` (`packages/masonry/`) wraps `react-plock` again (cards flow left to right, as before). Until mount, server and first client render show the cards flat and visually hidden (in the HTML for crawlers); after mount the normal masonry replaces them. The CSS multi-column version (option A) was dropped because it flowed down columns. Load More streams one card at a time as before. Card dates are now formatted at build time (`dateText`) / in UTC (podcast) so server and client agree in any time zone.
> At 1440 px cards overlap slightly because of the card `min-width: 280px`; the live site did the same before this change.
>
> Decisions so far (from review):
> 0. **10 is a maximum, not a requirement.** Render `min(10, available)` cards; a list with 6 posts renders 6. A smaller number is also fine if it keeps HTML size down.
> 1. Home carousels (Latest, Time Machine) also server-render **10** posts.
> 2. **No grid fallback.** The masonry layout must be the real layout from the first paint (see "Masonry blocker").
> 3. Podcast list (`PodcastPlock`) is **in scope now**.

## Problem

List pages and the home carousels fetch their cards in the browser (`/api/.../N.ndjson`, `/api/cards/*.json`).
The served HTML therefore has no post links, so crawlers see an empty page. The earlier fix (a separate visible
list) was rejected. This plan renders the **real cards** on the server instead, so the user sees one list.

## Idea

1. At build time the Astro page maps the first **10** posts with the existing `mapServerPostToClient`.
2. They are passed to the React island as `initialPosts`; the island renders them on the first render (server and client
   identical), so they are in the HTML.
3. After mount the existing `streamPosts` keeps loading the rest, and "Load More" works as today.

## Why this fits the current code

- `streamPosts` already skips posts whose `id` is in the store (`existed` check in `packages/masonry/store/posts.ts`).
  The API pages hold 16 posts (`POST_COUNT_PER_PAGE = 16`). With 10 seeded, `$nextPage = floor(10/16) = 0`, so the mount
  fetch loads page 0, adds the missing 6, then Load More fetches page 1, 2, … No pagination change needed.
- `hasMorePosts = posts.length < totalCount` keeps working.

## Masonry blocker (found while reading the code)

`react-plock`'s `Masonry` starts with `columns: 0` and returns `null` until an effect reads `window.matchMedia`
(`node_modules/react-plock/dist/index.es.js`). So it renders **nothing** on the server *and* on the client's first
render; seeding `initialPosts` alone would not put a single card into the HTML. The server cannot know the viewport, which is
why the column count is unknown. The layout is round-robin: card `i` goes to column `i % n`.

Options (pick one before implementation):

| Option | SSR HTML | First paint | Notes |
| --- | --- | --- | --- |
| **A. Own `SsrMasonry`, CSS multi-column** (`column-count` by media query, `break-inside: avoid`) | 10 cards once, DOM order | Correct column count at every width, no JS needed | Order flows down each column (card 2 sits under card 1), not across. Appending cards on "Load More" can rebalance columns while loading. Replaces `react-plock` everywhere (list, podcast) |
| **B. Own `SsrMasonry`, one markup per breakpoint** (5 round-robin layouts, 4 hidden by CSS) | 10 cards x 5 in HTML | Exact current layout | Duplicate links in HTML, 5x payload, duplicate `id`s; bad for crawlers and size |
| **C. Fixed column count for server + first client render, then switch in an effect** | 10 cards once | Wrong column count at first, then a visible jump | This is the same kind of fallback as the rejected grid |
| **D. CSS `grid-lanes` (native masonry)** | 10 cards once, DOM order | Exact masonry, no JS | Browser support is still new; needs a feature check and a fallback, so not suitable as the only path |

**Recommendation: A.** It is the only option that gives real masonry from the first paint with the cards in the HTML once.
To limit the "rebalance on Load More" effect: render appended cards in batches of 16 (one API page) instead of one by one
(the current store inserts a card every 100 ms), so columns rebalance once per batch.
Please confirm A, or tell me which option you prefer.

## Changes

### A. List pages (`/all`, category, `/tag/*`, `/series/*`, `/year/*`, `/world/*`, `/lab`)

1. `src/pages/*` pass `posts={Astro.props.posts}` (already sorted) to `BlogListPage.astro` (these props existed before; they were
   removed with `PostIndexList`).
2. `BlogListPage.astro`: `const initialPosts = await mapServerPostToClient(posts.slice(0, 10))` and pass to
   `<BlogPlock initialPosts={initialPosts} …>`.
3. New `packages/masonry/SsrMasonry.tsx` (option A, pending confirmation) replaces `react-plock`'s `Masonry` in `BlogPlock.tsx`, `PodcastPlock.tsx` and any other user (`grep -rn react-plock`). It renders on the server with the same breakpoints as today (`28/48/75/88/110` rem -> 1..5 columns) and gaps (`48/16/32/32/32`). Then remove the `react-plock` entries from `astro.config.mjs`.
4. `BlogPlock.tsx`: accept `initialPosts?: IPost[]`. Seed the store **synchronously before the first render**
   (same pattern used for `$pathname` in `MantineHeader`): `if (initialPosts && !$posts.get()[key]) $posts.setKey(key, initialPosts)`.
   Keep the existing `useEffect` that calls `streamPosts(key)`.
5. Add a constant `INITIAL_SSR_POSTS` (now 5) (upper limit) in `packages/consts`; always use `posts.slice(0, INITIAL_SSR_POSTS)`, so shorter lists simply render fewer. `hasMorePosts` stays `posts.length < totalCount`, so no "Load More" button appears when everything is already rendered.

### B. Home page carousels

1. `BlogSections.astro`: map the latest 10 with `mapServerPostToClient(getAllPostByDateDesc().slice(0,10))`. For "Time Machine" reuse the selection logic now inside `src/pages/api/cards/history.json.ts` (same-month posts by day proximity, covers first, optional gallery post): move it to a shared helper in `packages/utils/` used by both the endpoint and the page, with the limit raised from 5 to 10. `latest.json.ts` also raises its limit from 5 to 10.
2. `LatestCarousel` / `HistoryCarousel`: use the prop as the initial value (`$latest` / `$history` seeded synchronously),
   then the existing `requestLatestPosts()` refreshes it. Remove the `totalCount` workaround if no longer needed.
3. `client:visible` islands are still server-rendered, so their HTML contains the cards.

### B2. Podcast list (`/podcast`)

1. `src/pages/podcast.astro` already reads `readPodcastData()`; pass the first 10 episodes (mapped to `IPodcastEpisode`, same shape as
   `/api/podcast/[page].ndjson`) to `PodcastPlock` as `initialEpisodes`.
2. `PodcastPlock`: seed `$episodes["podcast"]` synchronously before the first render; the existing `streamPodcastEpisodes()` mount call
   fetches page 0 and skips ids already present (verify the guard exists in `src/stores/podcast.ts`, add it if not).
3. Uses `SsrMasonry` like the post lists.

### C. Not in scope

Ads stay off these pages. Heatmap and map are unchanged. No separate visible list (the earlier `PostIndexList` stays removed).

## Risks to check (these cause hydration error #418)

| Risk | Where | Mitigation |
| --- | --- | --- |
| `react-plock` renders `null` until `matchMedia` runs, so it cannot server-render cards | `BlogPlock.tsx`, `PodcastPlock.tsx` | See "Masonry blocker"; replace with an SSR-capable masonry. Visual check at 375, 768, 1440 px against the current layout |
| Time Machine is date-dependent (`dayjs()` at build time) | `BlogSections.astro` | Already the case for the JSON endpoint; both use the same build-time value, so server and client agree |
| Carousel (Embla) measures widths on mount | `BlogCarousel.tsx` | Slides render in the HTML; verify no hydration warning and no layout jump |
| `dayjs(post.date).format("YYYY-MM-DD")` uses the machine time zone | `PostCard.tsx` | Format with `dayjs.utc` or take the date string from the post id (`YYYY/MM/DD`) |
| Card state set in `useEffect` (`coverImage`, `coverOpacity`) | `PostCard.tsx` | Already client-only after mount; first render is identical. Verify in the hydration check |
| `ViewCount` fetches counts after mount | `src/components/ViewCount.tsx` | Renders a placeholder on both sides; verify |
| Same `id` appearing twice (seed + stream) | store | Existing `existed` guard; add a unit test |
| HTML size: 10 cards appear in the markup and again in the island props | all list pages | Measure `dist` size before/after; if > ~100 KB per page, cut the limit (e.g. 6-8) or strip unused fields (`data` colours, long `excerpt`) from `initialPosts` |
| Build time: `mapServerPostToClient` for 10 posts on ~1,200 pages | build | Measure; results are cached per post if needed |

## Steps

1. Record baseline: `dist/all/index.html` size, build time, links count (`grep -c '<a ' …`).
2. Build `SsrMasonry`; implement A for `BlogPlock` and `/all` only; run `pnpm check:hydration` (dev-React build, see the other plan) at three widths.
3. Roll out to the other list pages.
4. Implement B (home carousels) and B2 (podcast); re-run the hydration check on `/`.
5. Unit tests (vitest): store seeding does not duplicate ids; `getKey` unchanged.
6. Compare size/build time with the baseline.

## Gates

- `grep -c 'href="/' dist/all/index.html` shows ≥ 10 post links inside the cards; the same for one tag, one year and `/`.
- `pnpm check:hydration` passes on `/`, `/all`, `/year/2025`, `/lab`, `/tag/react` at 375/768/1440 px.
- In the browser: first paint shows 10 cards without a spinner, the rest appear after load, "Load More" still works, no duplicate cards.
- `pnpm build` and `pnpm test:unit` green.

## Rollback

Each part is a separate commit (A, B). Reverting A means `initialPosts` is simply not passed; the store logic is backward compatible.

## Open questions for you

1. Confirm masonry option A (CSS multi-column `SsrMasonry`, replaces `react-plock`), or choose B/C/D.
2. Is the column-wise card order of option A acceptable (card 2 under card 1 instead of beside it)?
3. Batch appends (16 cards at once) instead of one card every 100 ms on Load More: OK?
