# GrowGen Google AdSense Plan

> Created: 2026-10-06
> **Status: CODE PARTIALLY IMPLEMENTED 2026-10-06 — ad serving requires account setup and a display-unit ID.**
> Scope: https://growgen.xyz (Astro static blog)
> Method: Public-page review of the homepage, representative post, `/all`, `/about`, `/lab`, `/world`, `/resume`, podcast episode route, and sitemap; source review of the post layout, content schema, shared head, footer, and public assets; Google AdSense policy documentation.

---

## 1. Recommendation

Start with **one manually placed responsive display ad on selected, substantive blog posts only**. Do not enable site-wide Auto ads or place ads on the homepage, navigation/listing pages, interactive/portfolio surfaces, podcast episode shells, resume/CV/contact, or utility routes in the first rollout.

The post template is the best fit: `src/pages/[category]/[year]/[month]/[day]/[slug].astro` statically generates the blog archive, and `packages/layouts/BlogPost.astro` wraps each post body and related-post recommendations. Put the initial ad **after the article body and before Related Posts**, separated from both the article and recommendations and labelled **“Advertisements.”** This is a low-disruption first placement; test an in-article position only after checking longer posts and user experience.

Do not activate ad serving until the content review, privacy/consent work, account/site review, and ads.txt setup are complete. Approval and revenue are not guaranteed.

## 2. Current state (observed)

| Finding | Evidence | AdSense implication |
| --- | --- | --- |
| The homepage advertises **972 posts** and presents a personal blog with tech, life, travel, and study content, alongside a hero, map, podcast player, heatmap, tag cloud, and post sections. | Live homepage | There is a substantial article archive, but the homepage is not a clean first ad surface. |
| Article routes are statically generated from the `blog` collection. All use `packages/layouts/BlogPost.astro`; the layout renders `BlogContent`, then `RelatePosts`. | `src/pages/[category]/[year]/[month]/[day]/[slug].astro`; `packages/layouts/BlogPost.astro` | One shared, opt-in post slot can cover selected articles without putting ad code on every page. |
| Post length varies. The reviewed “Using Tailscale on GCP” page reports **0.36 min** reading time and has only a short explanation and code sample. | Live post: `/tech/2026/10/06/tailscale-gcp/` | Do not infer that all 972 posts are ad-ready or show an ad solely because a route is a post. Review each eligible article; no universal word-count threshold is assumed. |
| The site has dedicated non-post surfaces: `/`, `/all`, `/lab`, `/world`, `/year`, `/tag/*`, `/series/*`, `/podcast/*`, `/resume`, `/cv`, and `/about`. `/world` includes a map; `/lab` is a portfolio-tag listing; a podcast episode page is primarily metadata, a summary, and an external listen link. | Live pages and `src/pages/` | Keep these surfaces ad-free in the first rollout; many are navigation, interactive, or thin-content pages rather than the core editorial article. |
| At the initial live review `/ads.txt` returned 404 and `/privacy` returned 404. Source now adds `public/ads.txt`, a privacy page, and a footer consent-settings link; deployment and the AdSense message still require account setup. | Live routes at plan creation; current repo | Verify both routes after deploy and publish the configured consent message before serving ads. |
| The public homepage tag cloud includes `porn` and `nsfw` labels. This does not establish what those pages contain. | Live homepage | Audit pages reached through those tags and all other policy-sensitive content before enabling ads; exclude any page that is not eligible under current policies. |

**Unknown:** AdSense account/application status, site traffic by route, visitor geography, and a complete policy/quality review of all posts were not available from the public site or repository. The site owner must check these in AdSense and analytics before rollout.

## 3. Where ads should and should not appear

| Surface | Initial decision | Reason |
| --- | --- | --- |
| Substantive, original blog article with explicit editorial approval | **One responsive display ad after the article body, before Related Posts.** | The post is the site's primary editorial content and the shared template offers a predictable insertion point. Keep a clear boundary from body copy and related links. |
| Short notes, mostly metadata/media/external links, or policy-sensitive articles | **No ad unless reviewed and explicitly approved.** | The reviewed post sample is very short; a route or word-count alone is not an adequate quality/policy check. |
| Homepage and `/all`, `/year`, `/tag/*`, `/series/*`, category and archive listings | **No ad in the initial rollout.** | These are navigation-heavy surfaces with dense links and cards; ads risk being confused with site content or reducing content discoverability. |
| `/lab`, `/world`, `/umap`, `/hero`, `/gemini` and other tool/map/interactive pages | **No ad in the initial rollout.** | Keep ads away from controls, maps, canvases, and interactive areas where placement can interrupt use or cause accidental clicks. |
| Podcast episode/listing pages | **No ad in the initial rollout.** | The reviewed episode page is a description and external playback link, not the same content depth as a post. |
| `/about`, `/contact`, `/resume`, `/cv`, `/404`, RSS/API routes | **No ad.** | These are profile, contact, utility, error, or machine-readable pages, not article inventory. |

No floating, sticky, anchor, vignette, pop-up, or video-pre-roll ads in the initial rollout. Avoid ad placements beside buttons, downloads, navigation, media controls, or game/map surfaces. Never invite clicks or use imagery/formatting that makes an ad resemble a post card or navigation item.

## 4. Implementation plan

### Phase 0 — Account, inventory, and policy gate

- [ ] Check AdSense account status, domain ownership/verification, site review requirements, and the account's current instructions. Treat approval as a Google decision, not a plan acceptance criterion.
- [ ] Use site analytics to identify the most visited article routes; that ranking is not available in this review.
- [ ] Audit the candidate posts for original/substantive publisher content, working navigation, rights to included material, policy-sensitive topics, and accidental-click risks. Include pages linked from the `porn` / `nsfw` tags in that manual review; a tag alone is not a policy finding.
- [ ] Keep all posts ineligible by default. Start with a small manually reviewed allowlist; do not bulk-enable ads across 972 pages.
- [ ] Review the complete Google Publisher Policies and placement rules before choosing formats. Google does not permit ads on non-content-based pages or deceptive placements; publishers remain responsible for pages carrying their ad code.

### Phase 1 — Privacy and consent readiness

- [ ] Add a dedicated `/privacy` page and a direct footer link. Disclose advertising-related third-party technologies/data use, cookies or similar storage, personalization, and how users can manage choices. Publish accurate details for the actual CMP and ad configuration; obtain legal review for applicable privacy obligations.
- [ ] Replace the footer's placeholder `#cookies` link with a working “Privacy / cookie settings” action that opens the consent settings again.
- [ ] Choose a current Google-certified CMP that supports the IAB TCF for the site's web deployment. Configure Google Privacy & messaging or another certified CMP, including ad partners and a usable consent/withdrawal flow.
- [ ] Do not send personalized ad requests to users in the EEA, UK, or Switzerland without the required certified TCF CMP and valid consent signals. Test the consent and refusal paths; make ad requests follow the CMP result. Re-check Google's current regional requirements before launch.

### Phase 2 — Ads.txt and controlled Astro integration

- [ ] Publish the Google ads.txt seller record at `public/ads.txt` and verify the deployed root URL. The source now uses the standard Google record with the provided publisher ID; confirm its status in AdSense.
- [ ] Add a boolean opt-in field such as `adsense: false` by default to the blog collection schema in `src/content.config.ts`. Set it to `true` only on articles that passed the manual review. Missing metadata must continue to mean no ad.
- [ ] Add a small Astro ad-slot component for the approved responsive display unit. Render it from `packages/layouts/BlogPost.astro` only when the post's opt-in is true; place it between `BlogContent` and `RelatePosts`.
- [ ] Load the AdSense tag only on explicitly opted-in post pages and `/privacy` when `PUBLIC_ADSENSE_CONSENT_READY=true`. Do not add it unconditionally to `packages/components/BaseHead.astro` or `packages/layouts/Global.astro`.
- [ ] Create a responsive display ad unit in AdSense and set the build variable `PUBLIC_ADSENSE_SLOT_ID` to its `data-ad-slot` value. Set the readiness gate only after publishing the consent message and disabling Auto ads (or confirming an equivalent page exclusion).
- [ ] Separate the unit visibly from article content and recommendations, label it “Advertisements,” and reserve/handle ad space so filled units do not cause avoidable layout shift while empty units do not leave a large blank panel.
- [ ] Keep a switch/rollback path that disables rendering and requests without removing content or breaking static builds.

### Phase 3 — Limited release and measurement

- [ ] Deploy to a small set of reviewed posts first. Inspect direct loads on mobile and desktop; verify the unit does not cover or resemble article links, controls, media, or related-post cards.
- [ ] Confirm ineligible pages produce no ad unit and do not load the ad script. `/privacy` loads the tag only after the readiness gate is enabled; keep Auto ads disabled so it remains ad-free.
- [ ] Verify `/ads.txt`, account diagnostics, ad rendering, empty-fill behavior, and Core Web Vitals against a pre-launch baseline. Do not click live ads or ask anyone to click them.
- [ ] Expand the explicit allowlist only after policy checks and user-experience review. Consider a natural mid-article placement or Auto ads only as a separate measured experiment; do not enable either site-wide by default.

## 5. Source map for implementation

| Change | Existing source |
| --- | --- |
| Per-post opt-in metadata | `src/content.config.ts` |
| Shared ad placement and post eligibility | `packages/layouts/BlogPost.astro` |
| Generated article route | `src/pages/[category]/[year]/[month]/[day]/[slug].astro` |
| Global head (leave ad loader out of global default) | `packages/components/BaseHead.astro`; `packages/layouts/Global.astro` |
| Privacy route and footer settings link | New `src/pages/privacy.astro`; `packages/footer/MantineFooter.tsx` |
| Seller record | New `public/ads.txt`, populated only from AdSense |

## 6. Launch acceptance checklist

- [ ] AdSense account/site status and publisher ID are confirmed by the owner; all current program/placement policies are checked.
- [ ] `/privacy` is live; the footer privacy/settings link works; CMP is configured and its regional consent signals control ad requests.
- [ ] `ads.txt` returns the exact account-provided record over HTTPS.
- [ ] Only manually approved posts with `adsense: true` render a responsive unit when `PUBLIC_ADSENSE_SLOT_ID` is configured and `PUBLIC_ADSENSE_CONSENT_READY=true`; missing/false metadata and all excluded routes render no unit or ad loader.
- [ ] Ad is clearly labelled and visually distinct, does not interfere with navigation/content, and does not introduce unacceptable layout shift on mobile or desktop.
- [ ] Ad requests, consent/refusal behavior, and deployment diagnostics are observed on the live deployment; no self-click or incentivized-click testing is used.
- [ ] Performance and UX are compared with a pre-launch baseline before expanding the eligible-post list.

## 7. Official references

- [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en)
- [Ad placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
- [Best practices for ad placement](https://support.google.com/adsense/answer/1282097?hl=en)
- [Google consent management requirements for publishers serving ads in the EEA, UK, and Switzerland](https://support.google.com/adsense/answer/13554116?hl=en)
- [Manage GDPR ad partners](https://support.google.com/adsense/answer/10960670?hl=en)
- [Create a display ad unit](https://support.google.com/adsense/answer/9274025?hl=en)
- [Ads.txt guide](https://support.google.com/adsense/answer/12171612?hl=en)

## 8. Implementation status (2026-10-06)

- Added the `adsense` content flag with a default of `false`; no article is opted in until individually reviewed.
- Added the provided AdSense loader, a responsive slot between article content and related posts, and two build-time gates: per-post `adsense: true` plus `PUBLIC_ADSENSE_SLOT_ID`, and `PUBLIC_ADSENSE_CONSENT_READY=true` after account configuration.
- Added `/privacy`, a footer link to its ad-preference section, and a Google `googlefc.showRevocationMessage()` control. The tag is omitted from `/privacy` by default because a local browser probe showed the AdSense loader inserting an extra `<ins>` there; enable the readiness gate only after Auto ads are disabled or the privacy page is excluded in AdSense.
- Added `public/ads.txt` using Google's documented direct-seller format and the supplied publisher ID.
- No post is opted in, so no article currently requests ads. The supplied loader does not include a display-unit ID, and AdSense account status cannot be inspected here.
- Before launch, create/publish the EEA/UK/Switzerland message in AdSense Privacy & messaging, disable Auto ads, create a responsive display unit, set both build variables, review candidate posts, and verify the account/site is ready. Legal review of the privacy notice is also still required.
