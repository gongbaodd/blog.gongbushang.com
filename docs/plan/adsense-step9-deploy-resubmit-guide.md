# Step 9 guide — Deploy, redirect, Search Console, resubmit

> Parent: `docs/plan/adsense-rejection-fix-plan.md` (Steps 7 and 9). Do these yourself, in order.
> Do not request an AdSense review until every checkbox in section 4 is ticked.

## 1. Before deploying (local)

- [ ] `pnpm build` and `pnpm test:unit` pass; `node scripts/audit-thin-pages.mjs dist 300` reviewed.
- [ ] Commit the `src/content` submodule first (two posts had `www.growgen.xyz` changed), push it, then commit the submodule pointer in the main repo.
- [ ] Set production env vars in Cloudflare: `PUBLIC_ADSENSE_ENABLED=true`. Set `PUBLIC_ADSENSE_CONSENT_READY=true` only after the consent message in step 3.2 is published. **Never** set `PUBLIC_ADSENSE_TEST` in production.
- [ ] Merge `adsense-reject-fix` and let Cloudflare deploy.

## 2. Step 7 — one canonical hostname (Cloudflare dashboard)

1. Cloudflare → your zone `growgen.xyz` → **DNS**: make sure a `www` record exists and is **proxied** (orange cloud). It can point at the same target as the root record (a dummy like `192.0.2.1` also works for redirect-only).
2. **Rules → Redirect Rules → Create rule**, custom filter:
   - Field *Hostname*, operator *equals*, value `www.growgen.xyz`.
   - Action: *Dynamic* → expression `concat("https://growgen.xyz", http.request.uri.path)`, status **301**, enable **Preserve query string**.
3. Test: `curl -sI https://www.growgen.xyz/tech/` → `301` and `location: https://growgen.xyz/tech/`.
4. Check `https://growgen.xyz/ads.txt` and `/robots.txt` return 200.

## 3. AdSense console

1. **Sites** → make sure `growgen.xyz` (no www) is listed.
2. **Privacy & messaging** → create and **publish** the EEA/UK/CH consent message; then set `PUBLIC_ADSENSE_CONSENT_READY=true` and redeploy.
3. **Ads → Auto ads**: turn **off** for the site (we only place manual units on reviewed posts).
4. **Sites → growgen.xyz → ads.txt**: status should read *Authorized*.

## 4. Verify the live site

- [ ] View source of any post: contains `adsbygoogle.js?client=ca-pub-7617483459228974`; no `DEV ONLY` / `data-adtest` anywhere.
- [ ] `/privacy/`, `/about/`, `/contact/`, `/tags/` load with real text; `/cv/`, `/gemini/`, `/umap/` contain `<meta name="robots" content="noindex,follow">`.
- [ ] `https://growgen.xyz/sitemap-index.xml` → 200 and does not list `/tag/`, `/world/`, `/series/`, `/cv/`.
- [ ] `https://growgen.xyz/robots.txt` shows the `Sitemap:` line.
- [ ] Footer links: Contact → `/contact`, Tags → `/tags`, Archive → `/year`, Sitemap → `/sitemap-index.xml`.
- [ ] Steps 2, 3 and 6 from the main plan are finished (homepage shows posts, no hydration error, thin posts noindexed). **Strongly recommended before resubmitting.**

## 5. Search Console

1. Add the property `https://growgen.xyz/` (Domain property via DNS TXT is best) if not already.
2. **Sitemaps** → remove old entries, submit `sitemap-index.xml`.
3. **URL inspection** → paste the homepage and 3–5 strong posts → *Request indexing*.
4. Later: **Pages** report; thin pages you noindexed should move to *Excluded by noindex*.

## 6. Wait, then resubmit

1. Wait 1–2 weeks for Google to recrawl (check Search Console *Crawl stats*).
2. AdSense → **Sites** → `growgen.xyz` → **Request review**.
3. If rejected again, note the exact reason text and compare with the main plan's findings table; the most likely remaining cause is content volume/quality (Step 6), not technical.
