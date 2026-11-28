# Scout: GON-269 (posts editor slug, hidden legacy fields, URL date)

Checked 2026-11-28 against `emdash@1.6.0` (apps/admin/node_modules/emdash, dist/*.mjs and .d.mts) and `@emdash-cms/admin@1.6.0`. Local Supabase and Docker are not running, so no DB query was made. Nothing was written outside this note.

## Need
Posts editor: one slug input, legacy/seed fields hidden (not deleted), new posts get `/<category>/YYYY/MM/DD/<slug>/` from first publish date, imports keep their URLs.

## Answers

**1. Hide a field? Remove `content`/`excerpt`?**
- No declarative hide. `CreateFieldInput`/`UpdateFieldInput` have no `hidden` (types-BbOWBoRk.d.mts:316-358). `CollectionAdminConfig` only has `listColumns`, `quickCreate` (types-BbOWBoRk.d.mts:162). The admin reads only `hiddenNavItems` for hiding (App bundle L84405), never a field flag.
- Mechanism that works: a trusted plugin field widget. `FieldRenderer` resolves `field.widget` "pluginId:name" to `pluginAdmins[pluginId].fields[name]` (App-6p4snG9E.js ~L49234, L51562+). A component returning `null` hides the field. The editor renders every field (L50980 `Object.entries(fields).map`), so nothing hides it otherwise.
- Round-trip is safe: form state starts as `item.data` (L49363) and save sends the whole `formDataRef` (L50189-50192). Hidden values are saved back unchanged. (Read from code; not yet tested at runtime.)
- Removal: `deleteField` deletes the `_emdash_fields` row and DROPS the column (registry-CSLrHSx1.mjs ~L5598-5625). Data in the column is lost. Do not use it for `legacy_id`/`legacy_date` (unique data for 995 posts) or as a first step for `content`/`excerpt`.
- Web reads neither `content` nor `excerpt` for posts (grep: only `PostCard` `post.excerpt`, which comes from `postExcerpt(body)` in listing.ts L126).

**2. Slug validation?**
- Core does not validate the entry slug. `contentCreateBody`/`contentUpdateBody` take `slug: z.string().nullish()` (entry-lock-DJgDNfMf.mjs L283-300). Only uniqueness is checked (`assertAliasAwareSlugAvailable`, content-2gjSbGP3.mjs L369). The admin input (App bundle L31501) has a placeholder and no pattern. `/` is accepted.
- `content:beforeSave` cannot see the slug. The hook gets `body.data` only (emdash-runtime-CF6KAut9.mjs L3553, L3669). The slug is applied later as `data._slug` (L3775) or as a column.
- `content:beforePublish` can. Its `event.content` is the full item incl. `slug` (`contentItemToRecord`, runtime L1310). Return `{ cancel: true, reason }` (`ContentPolicyDecision`, types-YTpIfKXX.d.mts:1066). It needs capability `hooks.content-policy:register` (hook-result-mOyk-VCt.mjs L2900). Limit: it blocks publishing only, so invalid drafts can still be saved.
- Existing admin plugin pattern to copy:
  - `apps/admin/astro.config.mjs` L13-20: `plugins: [rebuildOnPublish(), serviceDashboards(), podcastSync(), markdownEditor()]`.
  - `apps/admin/src/rebuild-on-publish.ts`: `definePlugin({ hooks: { "content:afterPublish": ... }, capabilities: ["content:read"] })`, descriptor `format: "native"`, `entrypoint`.
  - `apps/admin/src/markdown-editor/plugin.ts` + `admin.tsx`: `admin.fieldWidgets` in `definePlugin`, and `export const fields = { markdownEditor: Component }` in admin.tsx.
- `ContentSaveRejectedError` is exported from `emdash` (index.mjs L2125); its doc says it is thrown by `content:beforeSave`. Publish-policy hooks use the `{ cancel, reason }` return instead.

**3. Is `publishedAt` stable?**
- Column `ec_posts.published_at`, API `publishedAt`. There is no separate first-published column (grep for `first_published`/`firstPublished` in emdash dist: 0 hits).
- `publish()` keeps the existing value: `intendedPublishedAt = requestedPublishedAt ?? currentPublishedAt ?? now` (content-2gjSbGP3.mjs ~L1788). Only the first publish sets it to `now`.
- `unpublish()` SQL does not touch `published_at` (L1950-1960). `schedule()` and `restore()` do not touch it either (L1536-1550, L1240-1260). Scheduled publish also goes through `publish()` (`requireDue` flag), so the same rule applies (read from code, not run).
- Caveats:
  - Explicit override: `publishedAt` on create (contentCreateBody) and on publish (contentPublishBody, "Requires content:publish_any").
  - Editors (role >= Editor) can edit it in the admin: `PublicationDateDialog` (App bundle L31472). A URL built from it can drift. Option: a `content:afterPublish` hook that copies it into a frozen custom field once.
  - Date tokens use UTC (`applyDateTokens` uses `getUTC*`, resolve-Z5YK_6ew.mjs L40-60). Near midnight, an Estonian local date can differ. Format in `Europe/Tallinn` in apps/web.

**4. urlPattern placeholders?**
- `interpolateUrlPattern` supports only `{slug}`, `{id}`, and date tokens `{year} {month} {day} {hour} {minute} {second}` from `publishedAt` (resolve-Z5YK_6ew.mjs L69-86). The admin uses the same rules (App bundle L6094-6104, L41110-41130).
- No category or term token, so no pattern produces `/<category>/...`. `compileUrlPattern` (url-pattern-DViEwhDu.mjs) allows one placeholder per segment.
- Consequence: the admin "View" link cannot be correct for posts with any `urlPattern`. Options: (a) accept an approximate link, or (b) add a `PluginEditorAction` (config d.ts L1512, `route`, `placement`) that links to the category URL from the entry's category term. Also note `routable` only gates `getPublicUrl` (context-DCQrjN95.mjs L1009).
- `apply.mjs` never updates an existing collection. Changing `urlPattern` in an existing DB needs `PUT /schema/collections/posts` (UpdateCollectionInput has `urlPattern`).

**5. Does the import set slug = last segment of legacy_id?**
- **No.** The deleted MIG-1 importer set `contentSlug: legacyId.replace(/\//g, "-")` (`git show 31b9000d^:apps/web/scripts/import/mig1/import.mjs`, L274), and posted `slug: p.contentSlug` (L586). Example from MIG-1 report (docs/plan/emdash/reports/MIG-1.md L39): `2015-03-15-threejs`.
- Import did not pass `publishedAt`, so `published_at` = import time (matches the owner's note).
- Not verified in a DB. Run `select slug, legacy_id from ec_posts` locally before relying on it.

**6. Every place in apps/web keyed on legacy_id** (non-test files)

| File | Lines | What | Change for GON-269 |
|---|---|---|---|
| `src/lib/content.ts` | 217-220, 313-340 | `mapPost` returns `undefined` with no `legacy_id`; `postParams`; `href`; `date: parsePostDate(legacy_date, id)` | New posts have no `legacy_id`, so they vanish. Add a branch: synthesize id `YYYY/MM/DD/<slug>` from `publishedAt` (Tallinn) + entry slug, then reuse the rest. |
| `src/lib/legacy-url.ts` | 2-30 | `LEGACY_ID_RE`, `postParams`, `postPath`, `parsePostPath` | Keep. The synthetic id above avoids changes here. |
| `src/pages/[category]/[year]/[month]/[day]/[slug].astro` | 1-18 | `getStaticPaths` from `post.params` | No change if the id is synthetic. |
| `src/pages/rss.xml.ts` | 9, 33 | `postPath(e.id, ...)` | None if the list entries keep `id`. |
| `src/lib/listing.ts` | 6, 111-127 | legacy-data based listing | Only via derive output. |
| `scripts/derive/posts.ts` | 43-51 | SQL `where p.legacy_id is not null`, `order by p.legacy_id` | **New posts are excluded** from embeddings, relates, cards. Change to `coalesce(legacy_id, ...)` like `scripts/derive/media.ts` L60 (podcasts already do this). |
| `scripts/derive/index.ts` | 65, 70, 77, 98-111 | error when no `legacy_id` posts; hints; pruning; keys | Follow the posts.ts change. |
| `scripts/derive/cache.ts` | 27-88 | `post_hints`, `post_embeddings` keyed by `legacy_id` | Keys must stay stable. Synthetic id keeps them stable. |
| `scripts/derive/outputs.ts` | 42-44 | vector and coords by `legacyId` | Follows derive. |
| `scripts/seo/write-noindex.ts` | 17-22 | `where legacy_id is not null` | New posts never noindexed. Fine for now. |
| `scripts/seo/noindex-list.mjs` | 25-41 | URL to legacy id | Works with synthetic id. |
| `scripts/lib/emdash-rest.mjs` | 57-67 | entries keyed by `data.legacy_id` | Podcast/import helper; new posts map to `undefined`. |
| `scripts/gen-types.mjs` | 49-88 | generated types list `legacy_id` | Keep; types still exist. |
| `scripts/schema/apply.mjs` | 36-47 | posts fields, `urlPattern` | Add `widget` to hidden fields; change `urlPattern`; existing DBs need a PUT step (like `set-body-widget.mjs`). |
| Tests | `src/lib/content.test.ts`, `legacy-url.test.ts`, `derive/*.test.ts` | fixtures keyed by `legacy_id` | Update with the change. |

## Recommendation
Keep `legacy_id` and `legacy_date` in the DB for the 995 imports. Hide them; do not delete.

1. **Hide fields.** New native plugin in `apps/admin/src/post-fields/` (copy `markdown-editor/plugin.ts` and `admin.tsx`). `fields: { hidden: () => null }`. Register in `apps/admin/astro.config.mjs`. A one-time PUT sets `widget: "post-fields:hidden"` on `legacy_id`, `legacy_date`, `content`, `excerpt` (same pattern as `set-body-widget.mjs`). Declare `fieldTypes` for `string`, `text`, `portableText`. Set the same in `apply.mjs` for new environments. Do not call `deleteField`.
2. **Slug.** Add `content:beforePublish` in the same plugin (capability `hooks.content-policy:register`). For `posts`, reject unless `event.content.slug` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Before enabling, check that the 995 legacy slugs match, or publishing old posts will fail. Add a web-side guard in `mapPost`.
3. **Date.** Imports: unchanged (`legacy_date`). New posts: `published_at` in `Europe/Tallinn`. Later, consider freezing it with `content:afterPublish`.
4. **urlPattern.** Do not claim a pattern fixes the admin link. Either set `"/{year}/{month}/{day}/{slug}/"` and accept the approximate link, or drop it and add a `PluginEditorAction` for the category URL. Owner decision.
5. **Web.** In `mapPost`, when there is no `legacy_id`, synthesize `YYYY/MM/DD/<slug>` from the first publish date. Change derive SQL to `coalesce(legacy_id, slug, id)`.

## Free-tier impact
None. Everything is in the admin plugin and derive SQL. No new paid service.

## Not done
- No runtime test of the hidden-field round-trip or the publish hook. Both need local Supabase + Docker (not running).
- The Supabase CLI complained about a repo `.env` when I ran `supabase status`. I did not open or copy any env file.
