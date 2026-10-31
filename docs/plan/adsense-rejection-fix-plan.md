# AdSense Rejection Fix Plan — "Screens without publisher content" + "Low value content"

> Created: 2026-10-31 (re-analysed same day against the live site, see "Re-analysis" below)
> Status: **NOT STARTED**
> Scope: https://growgen.xyz (Astro static blog, Cloudflare)
> Related: `docs/plan/google-adsense-plan.md` (original rollout plan), `docs/plan/website-optimization-plan.md`
> Source: external crawler analysis of the live site (1,790 sitemap URLs) plus a review of this repo.

Do steps in order. Each step has a **gate** that must pass before continuing. Keep one commit per step so any step can be reverted alone. Approval is not guaranteed; the aim is to remove every likely trigger before resubmitting.

## Re-analysis (2026-10-31, live site, 1,790 sitemap URLs fetched)

The rejection now carries **two** reasons: (A) Google-served ads on screens without publisher content (no / low-value content, under construction, navigation-type pages) and (B) a general "low value content / site quality" notice (substantive unique value, steady presence, real user engagement). Findings below are from fetching the served HTML of every sitemap URL, plus `robots.txt`, `ads.txt` and a hostname check.

**What Google's policy actually says.** The policy page lists "no content or low-value content", "under construction" and "alerts, navigation or other behavioral purposes". Its glossary narrowly defines low-value content as unintelligible filler (lorem-ipsum style text), and says site navigation and related-content links do not count as publisher content. No word-count threshold is published, so the thresholds below are my own judgement, not Google rules.

**Verified on the live site:**

| # | Finding | Evidence |
| --- | --- | --- |
| 1 | The ad tag exists only on `/privacy/` | 1 of 1,790 URLs contains `adsbygoogle`; none of 984 posts do |
| 2 | Homepage shows no posts to a crawler and errors in the browser | Served HTML has about 4.7k characters (mostly bio), 0 article links, text "View 0 posts in 2026", "View All 0 Posts", "See 0 Desinations", "View Archivess"; the console logs React error #418 |
| 3 | 633 URLs have under 50 characters of text | 431 of 432 `/tag/*`, all 156 `/world/*`, all 20 `/series/*`, all 13 `/year/*`, plus 13 other pages (`/all`, `/lab`, `/tech`, `/life`, `/plan`, `/book`, `/gemini` etc.). Most contain only "Load More" (9 characters) |
| 4 | Unfinished pages are in the sitemap | `/cv/` is template filler ("Save your files… Supports 100+ languages"), `/gemini/` is blank, `/umap/` says "No posts with UMAP coordinates yet", `/about/`, `/contact/`, `/hero-gallery/` all serve the identical 726-character homepage bio |
| 5 | A sitemap URL returns 404 | `/tag/c%23/`; the footer also links to `/archive`, which is a 404 |
| 6 | Most posts are short | 481 English posts: 297 under 300 words, 92 under 100 words. 503 Chinese posts: 391 under 500 characters, 201 under 200 characters. Only about 149 of 984 posts (15%) pass my "substantial" bar of 500+ words or 800+ Chinese characters. 186 `/plan/` posts have a median of about 200 English words |
| 7 | Podcast pages are mostly stubs | 80 of 148 episode pages have under 150 characters; 40 have 500+ |
| 8 | Site hygiene | Both `www.growgen.xyz` and `growgen.xyz` serve the site with no redirect; `robots.txt` has no `Sitemap:` line (it contains only Cloudflare content-signal comments) |

**Fine:** `ads.txt` is valid, `/privacy/` exists, posts contain their full text in the HTML, no page is noindexed.

**Diagnosis.** Reason A is explained by findings 1–5: the only page where Google can see your ad code is `/privacy/` (a notice page), and the pages around it that a reviewer lands on are empty or placeholder pages. Reason B is explained by 6–7 plus the shape of the site: roughly 1,790 indexed URLs of which fewer than 150 are substantial articles, so thin and empty pages heavily outnumber real content. The site is a personal multilingual notebook with many short log-style entries. That is fine as a blog, but AdSense reviews it as a whole. The fix is both technical (steps 1–5, 7–8) and editorial (step 6), and the editorial part is what most affects reason B.

---

## Summary of findings → steps

| Finding (see Re-analysis) | Step |
| --- | --- |
| 1 Ad tag only on `/privacy/` | 1 |
| 2 Homepage shows no posts; hydration error #418 | 2, 3 |
| 3 Empty list pages (633 URLs) | 2, 6 |
| 4 Unfinished pages, duplicate bio pages | 4, 5 |
| 5 404 in sitemap, bad footer link, typos | 4, 5 |
| 6–7 Thin posts and podcast stubs | 6 |
| 8 Hostname, `robots.txt` | 7, 8 |

## Repo reality check (differs from the analysis)

The analysis crawled the live site; this repo has these relevant facts:

- `public/ads.txt` and `src/pages/privacy.astro` exist in this checkout (the analysis said the folder lacked them; it is current enough).
- `packages/layouts/BlogPost.astro` loads `AdSenseHead` and `AdSenseSlot` **only when a per-post `adsense: true` flag and `PUBLIC_ADSENSE_SLOT_ID` are set**. No post is opted in, so **no article serves the tag** — this is the root of finding 1.
- `src/pages/privacy.astro` loads `AdSenseHead` only when `PUBLIC_ADSENSE_CONSENT_READY=true`. This is the only place the live site currently shows the tag.
- The earlier plan deliberately avoided Auto ads. Keep that: **do not turn on site-wide Auto ads.** Use the tag on posts plus manual units on reviewed posts. The tag-on-post change below is for Google's site review and does not by itself place ads.
- There is no `public/robots.txt` and no `src/pages/robots.txt.ts`.
- `astro.config.mjs` calls `sitemap()` with no `filter`; the tag route generator emits `/tag/c%23/` (the `#` in "C#"), which the live site serves as a 404. Encode tag slugs safely or drop that tag.
- Typos: `packages/carousel/BlogCarousel.tsx:71` ("View Archivess"), `packages/map/GLMap.tsx:90` ("Desinations"); bad link: `packages/footer/MantineFooter.tsx:118` (`/archive`).
- `www.growgen.xyz` is hard-coded in `packages/resume/components/Work.tsx` (and likely elsewhere; grep before step 7).

---

## Step 0 — Baseline and branch

1. `git checkout -b adsense-reject-fix`.
2. Save a baseline of the current build: `pnpm build`, then record page count and `dist/sitemap-0.xml` URL count in `docs/plan/baseline/adsense/BASELINE.md`.
3. Write a small script `scripts/audit-thin-pages.mjs` that walks `dist/**/*.html`, strips tags, and prints URLs whose visible text is under 50 characters, plus total counts by route type. Re-run it after every step.

**Gate:** baseline recorded; audit script runs and reproduces roughly the 633 thin-URL count.

---

## Step 1 — Put the AdSense tag on article pages (finding 1)

Goal: Google's crawler must see the publisher code on real content pages, not just on `/privacy/`.

1. In `packages/layouts/BlogPost.astro`, load `AdSenseHead` on **every post** (not only when `adsense: true`), gated only by a site-wide env flag, e.g. `PUBLIC_ADSENSE_ENABLED=true`.
2. Keep `AdSenseSlot` (the actual ad unit) behind the existing per-post `adsense: true` + `PUBLIC_ADSENSE_SLOT_ID` gate. Tag everywhere, units only on reviewed posts.
3. In AdSense → Ads → Auto ads, make sure Auto ads are **off** for the site, so the tag never places ads on thin pages. If Auto ads must stay on, add page exclusions: `/privacy/`, `/cv/`, `/about/`, `/contact/`, `/lab/`, `/world/*`, `/tag/*`, `/series/*`, `/year/*`, `/podcast/*`, `/all/`.
4. Keep the tag on `/privacy/` (needed for the consent revocation button) and exclude `/privacy/` from Auto ads → Page exclusions.
5. Do NOT add the tag to the homepage yet; add it only after Step 2 makes the homepage show real posts, and again only if Auto ads are off or the page is not excluded.
6. Complete the consent setup from the original plan: publish the EEA/UK/CH message in AdSense Privacy & messaging, set `PUBLIC_ADSENSE_CONSENT_READY=true`.

**Gate:** `grep -c adsbygoogle dist/tech/**/index.html` shows the tag on posts; `dist/tag/**` and `dist/world/**` do not contain it; no ad `<ins>` renders on any post unless it has `adsense: true`.

---

## Step 1b — Dev/test-only ad block (so you can see how ads behave)

Goal: preview the ad slot's placement, spacing, dark mode and mobile layout locally, without serving real ads or risking invalid traffic on your account.

Important facts:
- **Never click real ads on your own site**, in dev or production. Google treats it as invalid activity and can disable the account. Use test mode or the placeholder below instead.
- `localhost` is not an approved site in your AdSense account and the site is not yet approved, so real ads will usually not fill in dev. A visible placeholder is what shows you the layout.
- Google's `data-adtest="on"` attribute on the `<ins>` element asks AdSense to return test ads that are not counted as impressions or clicks.

Changes:
1. Add an env flag `PUBLIC_ADSENSE_TEST=true` (set only in `.env.local`, never in Cloudflare production variables).
2. In `packages/ads/AdSenseSlot.astro`, read `import.meta.env.DEV || import.meta.env.PUBLIC_ADSENSE_TEST === "true"` as `isTest`. When `isTest`:
   - add `data-adtest="on"` to the `<ins class="adsbygoogle">`;
   - render a dashed placeholder box around it with the label "DEV ONLY: ad slot (slot id, size)", so the layout is visible even when no ad fills;
   - add a small inline script that logs `data-ad-status` (`filled` / `unfilled`) after load, to the console.
3. Make the test block appear on posts **without** needing `adsense: true` and a real `PUBLIC_ADSENSE_SLOT_ID`, by falling back to a fake slot id in test mode, so you can preview on any post.
4. Hard guard: in production builds (`import.meta.env.PROD` and `PUBLIC_ADSENSE_TEST` unset) the placeholder and test attribute must not be emitted. Add a unit test or a build check: `grep -r "adtest\|DEV ONLY" dist` returns nothing.
5. In test mode, do not load the AdSense script on pages that are not posts.
6. Check at 375px, 768px and desktop widths, in light and dark mode, and that the slot sits between the article body and Related Posts with clear separation and the "Advertisements" label.

Gate: `pnpm dev` shows the labelled placeholder on a post; a production `pnpm build` contains no `adtest` or "DEV ONLY" strings.

---

## Step 2 — Server-render post lists (finding 2)

Goal: every list page contains real, crawlable content in the HTML.

1. Find the list components: `packages/masonry/BlogPlock.tsx`, `packages/masonry/PodcastPlock.tsx`, `src/components/BlogListPage.astro`, `src/components/BlogSections.astro`, `src/components/YearFolders.astro`, and the page files under `src/pages/{tag,series,year,world}`, `[filter].astro`, `lab.astro`.
2. Render the first 10–20 posts (title, date, excerpt, link) in Astro at build time for each list page. Pass the same slice to the React island as initial data so hydration matches the server HTML.
3. Keep "Load More" for the remaining posts, fetched client-side from the existing JSON/API source.
4. Render real counts at build time, replacing "View 0 posts in 2026" and "View All 0 Posts" on the homepage.
5. Every post link must be a plain `<a href>` in the HTML.

**Gate:** re-run the audit script; the thin-URL count drops substantially (target: none of `/`, `/all`, `/lab`, `/year/*`, `/series/*` under 50 chars). `curl -s https://localhost/ | grep -c "<article"` (or equivalent) shows posts in the served HTML.

---

## Step 3 — Fix homepage hydration error #418 (finding 2)

1. Run `pnpm build && pnpm preview`, open the homepage with the console open, and capture the #418 stack (use the unminified React build or `astro dev`).
2. Typical causes here: `Date`/locale formatting or `Math.random()` rendered during SSR, `window`/`localStorage` reads in render, and counts that differ between server and client. Make server and client render identical first output; move client-only values into `useEffect` or use `client:only` for purely client widgets (map, heatmap, player).
3. Confirm the hydration fix does not reintroduce an empty list (Step 2).

**Gate:** no hydration warnings in the console on `/`, `/all`, and one tag page; `pnpm test:unit` green.

---

## Step 4 — Remove or noindex unfinished pages and filter the sitemap (finding 3)

1. Decide per page: **delete**, **noindex**, or **finish**.
   - `/cv/` — template filler ("Save your files…"); delete or replace with real content, otherwise noindex.
   - `/gemini/` — empty; noindex or remove.
   - `/umap/` — "No posts with UMAP coordinates yet."; noindex or remove until data exists.
   - `/hero-gallery/`, `/hero/*` — duplicates of the homepage bio; noindex.
   - `/about/` and `/contact/` — do not repeat the homepage bio (see Step 5).
2. Add `<meta name="robots" content="noindex,follow">` through a `noindex` prop on the shared head/layout.
3. Configure the sitemap in `astro.config.mjs`:

   ```js
   sitemap({
     filter: (page) =>
       !/\/(cv|gemini|umap|hero|hero-gallery|privacy)\/?$/.test(page) &&
       !/\/tag\//.test(page) &&
       !/\/world\//.test(page) &&
       !/\/series\//.test(page),
   })
   ```

   Adjust after Step 6 decides which thin sections stay in.
4. Remove the `/tag/c%23/` URL (404) from the sitemap by fixing tag slug encoding.
5. Note: a noindex page must not be blocked in `robots.txt`, or Google cannot see the tag.

**Gate:** `dist/sitemap-0.xml` no longer lists the removed or noindexed URLs; the noindexed pages carry the robots meta.

---

## Step 5 — Fix footer, typos, and write a real About page (finding 3)

1. `packages/footer/MantineFooter.tsx:118`: change `/archive` to `/year` (or `/all`).
2. `packages/carousel/BlogCarousel.tsx:71`: "View Archivess" → "View Archive".
3. `packages/map/GLMap.tsx:90`: "Desinations" → "Destinations".
4. Write a distinct `/about/` page: who the author is, what the site covers, publishing history, contact method. 300+ words, not a copy of the homepage bio. Make `/contact/` a short page with a working contact method and no duplicate bio.
5. Search for other broken internal links: run a link checker over `dist/` (for example `npx linkinator ./dist --recurse --skip "^https?://(?!localhost)"`).

**Gate:** link checker reports no internal 404s; About page has unique text.

---

## Step 6 — Thin content strategy (finding 4)

1. Extend the audit script to list posts by word count (EN) and character count (ZH), and by series (weekly "plan" posts, podcast pages).
2. For thin sections, choose per group:
   - **Weekly "plan" posts (186)** and other very short notes: set `noindex` in frontmatter (add a `noindex` field to the content schema in `src/content.config.ts`) and exclude from the sitemap; keep them on the site for readers.
   - **Podcast episode pages without show notes:** noindex and exclude from sitemap. Add real show notes (summary, key points, links, ideally a transcript) to the best episodes and keep those indexable.
   - **Tag, city (`/world/*`), and series pages:** exclude from sitemap and noindex any page with fewer than ~5 posts; keep large ones with the server-rendered list from Step 2.
3. Make longer pieces easy to reach: on the homepage add a "Featured / Start here" section of 5–8 substantial posts (for example the Paris travel diary), server-rendered.
4. Do not enable ad units on thin pages. Only opt in (`adsense: true`) posts that were individually reviewed.
5. **This is the step that addresses the "low value content" notice.** Technical fixes alone are unlikely to be enough for a site where about 85% of posts are short. Before resubmitting, aim for a visible core of substantial, original articles: for example publish or expand to at least 30–50 strong posts (my suggestion, not a Google threshold) in one or two focus areas (tech write-ups, travel diaries), each with a clear point of view, and link them from the homepage and the main nav.
6. Merge or retire the weakest content where it makes sense: roll the 186 weekly `plan` posts into monthly or quarterly summaries, or keep them noindexed.
7. Confirm none of the content is auto-generated or unreviewed; Google's policy calls out unreviewed automated content explicitly.
8. Review the policy-sensitive tags noted in the original plan (`porn`, `nsfw`) and exclude those pages from ads and, if needed, the sitemap.

**Gate:** sitemap URL count drops from ~1,790 to the set of substantial pages; remaining indexed pages are mostly > 300 words / 500 characters.

---

## Step 7 — Canonical hostname (finding 5)

1. Pick **`growgen.xyz`** (no www): it matches `site` in `astro.config.mjs`, `public/CNAME`, canonical tags, and the sitemap.
2. Add a Cloudflare redirect rule (Rules → Redirect Rules): `www.growgen.xyz/*` → `https://growgen.xyz/${1}`, 301, preserving path and query.
3. Replace hard-coded `https://www.growgen.xyz` with `https://growgen.xyz` in the source (`packages/resume/components/Work.tsx` and any other hits from `grep -rn "www.growgen" src packages public`).
4. Update AdSense → Sites to list the bare domain, and confirm `ads.txt` is served at `https://growgen.xyz/ads.txt` after the redirect.

**Gate:** `curl -sI https://www.growgen.xyz/` returns 301 to the bare domain; `grep -rn "www.growgen" dist` returns nothing.

---

## Step 8 — robots.txt with Sitemap line (finding 5)

1. Add `public/robots.txt`:

   ```
   User-agent: *
   Allow: /

   Sitemap: https://growgen.xyz/sitemap-index.xml
   ```

2. Do not `Disallow` noindexed pages (see Step 4). Allow `Mediapartners-Google` so the AdSense crawler can read pages.

**Gate:** `dist/robots.txt` exists and the Sitemap URL returns 200.

---

## Step 9 — Verify and resubmit

1. Full local verification: `pnpm build`, `pnpm test:unit`, `astro check`, re-run the thin-page audit and link checker; spot-check a post, the homepage, a tag page, `/about/`, `/privacy/` in view-source.
2. Deploy to Cloudflare. On the live site confirm: tag on posts, posts in the homepage HTML, no hydration errors, redirects, `robots.txt`, `ads.txt` on the bare domain, trimmed sitemap.
3. In Search Console: resubmit `sitemap-index.xml`, and request indexing for the homepage and 3–5 strong posts.
4. Wait 1–2 weeks for recrawl, then request AdSense site review again (AdSense → Sites).

**Gate:** all checks above pass before requesting review.

---

## Checklist

- [ ] 0 Baseline + audit script
- [ ] 1 Tag on posts, Auto ads off or page-excluded, `/privacy/` excluded
- [ ] 1b Dev/test-only ad block, verified absent from production build
- [ ] 2 Server-rendered post lists and real counts
- [ ] 3 Hydration #418 fixed
- [ ] 4 Unfinished pages removed or noindexed; sitemap `filter` added
- [ ] 5 Footer link, typos, real About/Contact
- [ ] 6 Thin content noindexed/trimmed; featured section on homepage
- [ ] 7 www → bare domain redirect; hard-coded links updated
- [ ] 8 `robots.txt` with Sitemap line
- [ ] 9 Deploy, Search Console, wait, resubmit

## References

- [Google-served ads on screens without publisher-content](https://support.google.com/publisherpolicies/answer/11112688)
- [Publisher policies glossary (low-value content, publisher-content)](https://support.google.com/publisherpolicies/table/10563033?hl=en)
- [More ads than publisher-content](https://support.google.com/publisherpolicies/answer/11169917)
- [Astro sitemap `filter`](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
