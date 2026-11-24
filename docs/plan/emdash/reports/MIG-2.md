# MIG-2 report: image inventory, download and rehost plan (phase 1, dry run)

Date: 2026-11-24. Owner: Migrator. Scripts: `apps/web/scripts/import/mig2/`. Source: the legacy checkout `src/content/_docs` (995 posts: 992 `.md` plus 3 `.mdx`). Scratch cache: `$TMPDIR/mig2-cache` (outside the repo, not committed).

**Phase 1 status: no uploads to Cloudinary, no legacy files changed.** Downloads are local only. The upload script is prepared with dry-run ON.

## 1. Commands run

```
node apps/web/scripts/import/mig2/inventory.mjs                    # writes $TMPDIR/mig2-cache/inventory.json
node apps/web/scripts/import/mig2/download.mjs                     # 742 unique external URLs, concurrency 4
node apps/web/scripts/import/mig2/download.mjs --concurrency 2     # retry of non-ok results (2 passes in total)
node apps/web/scripts/import/mig2/plan.mjs                         # writes rewrite-map.json, dead-links.json, upload-plan.json
node apps/web/scripts/import/mig2/upload.mjs --limit 3             # dry run only (no cld calls made)
```

No `cld` command was run in phase 1. The only cloud-related call is the dry run's printed command list.

## 2. Inventory (all 995 posts)

Each reference is counted once per occurrence. Code blocks and inline code are ignored.

| Class | References | Notes |
|---|---|---|
| `cloudinary` (res.cloudinary.com/dmq8ipket) | 2,029 | Left as-is. 290 of them are `cover.url`. |
| `local` (file in the checkout) | 271 | 258 unique and ok. 25 are `cover.url: ./...`. All resolved. |
| `external` | 770 | 746 non-duplicate, 742 unique URLs, 61 hosts. |
| `data:` URI | 0 | |
| `broken` (local file missing) | 0 | |
| `unparseable` | 0 | |

By reference kind: markdown `![]()` 2,494 (1 is a markdown link to an image), `<img src>` 206, frontmatter `cover.url` 369. Posts with at least one image reference: 488 of 995.

External hosts (occurrences): ww1/ww2/ww3/ww4.sinaimg.cn 404 combined (178, 59, 88, 79), wx1 to wx4.sinaimg.cn 107, ws1.sinaimg.cn 5, m.media-amazon.com 68, img1/img3/img9.doubanio.com 41, flutter.dev 22, rustwasm.github.io 20, api.triplydb.com 20, screenshots.firefoxusercontent.com 10, commons.wikimedia.org 9, img.itch.zone 7, upload.wikimedia.org 6. The remaining hosts have 1 to 5 each.

## 3. Download results (unique external URLs: 742)

| Status | URLs | Share |
|---|---|---|
| ok (image bytes verified by magic number) | 672 | 90.6% |
| 404 / 410 | 40 | flutter.dev 22, screenshots.firefoxusercontent.com 10 (410), others 8 |
| network error (ENOTFOUND, TLS, connect timeout) | 15 | |
| html-not-image (200 but an HTML page) | 5 | see anomalies |
| http 429 (rate limit) | 6 | wikimedia Special:FilePath |
| http 400 | 2 | upload.wikimedia.org thumbnails |
| 403 | 2 | media.licdn.com, opencollective S3 |

Request policy: browser-like User-Agent, a Referer for the host's site (`doubanio.com` to `https://movie.douban.com/`, `sinaimg.cn` to `https://blog.sina.com.cn/`, `hdslb.com` to `https://www.bilibili.com/`, `bdimg.com` to `https://www.baidu.com/`, otherwise the URL's own origin), 20 s timeout, one retry, concurrency 4 then 2. The User-Agent identifies no person or project.

## 4. Hotlink protection seen

- **sinaimg.cn (all ww/wx/ws hosts):** HTTP 403 without a Referer, 200 with a Referer. Gated. Our Referer of `https://blog.sina.com.cn/` works for all of them.
- **img*.doubanio.com:** HTTP 418 without a Referer, 200 with `https://movie.douban.com/`. Gated. Later probes from this machine returned a TLS error for img3 (see anomalies), so the probe is not conclusive for that host.
- **img2.imgtn.bdimg.com:** returns HTML with 200, with or without a Referer. A placeholder, not an image.
- **commons.wikimedia.org:** HTTP 429 under concurrency 4. Retry later with a slower rate.
- Not gated: m.media-amazon.com, rustwasm.github.io, api.triplydb.com, commons (after retry), i.imgur.com, others.

## 5. Dead-link summary (70 references, all listed in `dead-links.json`)

Examples (up to 10):
1. `flutter.dev/assets/get-started/.../basic-layout-*.png`: 404 (22 references, one host)
2. `screenshots.firefoxusercontent.com/images/*.jpg`: 410 (10)
3. `commons.wikimedia.org/wiki/Special:FilePath/...`: 429 (6)
4. `developer.getpebble.com/assets/images/.../1-blank.png`: DNS not found (3)
5. `ws1.sinaimg.cn/large/...jpg`: connect timeout (5)
6. `en.wikipedia.org/wiki/Glider_(Conway%27s_Life)`: HTML page, not an image
7. `www.youtube.com/watch?v=jDkV_Ror5Ds`: HTML page, not an image
8. `www.bilibili.com/video/bv14v411B7Tt`: HTML page, not an image
9. `upload.wikimedia.org/wikipedia/commons/thumb/...`: 400 (2)
10. `i0.hdslb.com/video/05/050dcbac....jpg`: 404 (1)

By host: flutter.dev 22, screenshots.firefoxusercontent.com 10, commons.wikimedia.org 6, ws1.sinaimg.cn 5, and 21 other hosts with 1 to 3 each.

## 6. Upload plan (not run)

- Public id: `growgen/legacy/<YYYY>/<MM>/<DD>/<post-slug>/<sha1(original-ref).slice(0,12)>`, with no extension. The original ref is the URL as written, or the repo-relative path for local files. The slug is the Astro glob-loader slug of the file stem.
- Delivery URL: `https://res.cloudinary.com/dmq8ipket/image/upload/<public_id>`.
- Result: 934 unique assets (258 local, 676 external), with 0 non-ASCII or empty public_ids. Longest is 152 characters.
- `rewrite-map.json`: 184 posts, 934 references, each mapped to its future URL.
- `dead-links.json`: 70 entries.
- `upload-plan.json`: 934 entries. Input for `upload.mjs`.
- `upload.mjs`: dry run by default (`--dry-run` is implied; `--execute` is needed for real work). It runs `cld admin resource <public_id>` to skip existing assets, then `cld uploader upload <file> public_id=<id> overwrite=false resource_type=image`. Concurrency 1, pauses between calls, progress logged to `$TMPDIR/mig2-cache/upload.log`.

## 7. Storage estimate (1 credit = 1 GB)

| Item | Value |
|---|---|
| Bytes to upload (934 assets, one upload per public_id) | 190.6 MB (0.191 GB) |
| Bytes if identical content were uploaded once | 182.6 MB (0.183 GB) |
| Credits added (storage basis) | about +0.19 |
| Current usage | 4.42 of 25 |
| Projected after MIG-2 | about 4.61 of 25 (18%) |

This is a storage-only estimate. Delivery bandwidth and transformations also use credits. Those are not estimated here. Deduplicating by content would save 8 MB. The per-post public_id scheme means a URL shared by several posts is uploaded once per post. Only 4 URLs are affected, so the effect is small.

## 8. Anomalies (escalated to Lead, no fix applied)

1. **Page URLs used as `<img>` sources (5 refs).** Examples: `https://www.youtube.com/watch?v=jDkV_Ror5Ds...`, `https://www.bilibili.com/video/bv14v411B7Tt`, `https://en.wikipedia.org/wiki/Glider_(Conway%27s_Life)`. These return HTML. Decide whether they become links or are removed.
2. **Odd or self-hosted hosts.** Examples: `http://gongbushang.com:3000/gongbushang/pixijsPlayground/src/master/src/12-hsl_hsv.ts` (a `.ts` source file used as an image, DNS failure), `https://res-cloudinary-com.translate.goog/...` (a Google Translate proxy of a Cloudinary image, ok), `https://figma.growgen.xyz/...` (2 refs, ok). Decide whether these stay external or are replaced.
3. **Expired or dead assets.** flutter.dev 404 (22 refs), screenshots.firefoxusercontent.com 410 (10 refs). These images are gone. Decide whether to drop them or keep the text.
4. **TLS failure on img3.doubanio.com (2 refs).** Node reports `DEPTH_ZERO_SELF_SIGNED_CERT`, and curl exits 60 from this machine. This may be the local network, not the host. The scripts do not disable certificate checks. Retry from another network.
5. **Wikimedia rate limit (6 refs, 429) and bad thumbnail URLs (2 refs, 400).** Retry later at a slower rate, or accept the loss.
6. **Gallery.** `src/content/_gallery` has 75 JSON files and no image files. No post refers to a gallery image. The gallery is outside the 995-post inventory and is not covered here.
7. **Rule conflict.** AGENT_RULES.md says rehosting uses `cld migrate`. The plan (MIG-2, D8 and §11 item 8) rejected `cld migrate` because it fails on Douban hotlinking. This story specifies `cld uploader upload`, and that is what the upload script uses. Lead should confirm and update AGENT_RULES.md.
8. **Post counts.** 995 posts is 992 `.md` plus 3 `.mdx`. The `.mdx` files are included, and the MIG-0 count matches.

## 9. Idempotency and re-runs

- `inventory.mjs`, `plan.mjs`: deterministic. Same input gives the same JSON.
- `download.mjs`: ok entries are skipped on re-run. Non-ok entries are retried. Cache files are named by URL sha1.
- `upload.mjs`: the plan is idempotent. The upload index in the cache skips assets that were uploaded or found to exist. Each asset is checked with `cld admin resource` before upload.

## 10. Open items for phase 2

- Lead decisions on anomalies 1 to 3 and 7.
- Retry the 15 network errors, 6 rate-limited wikimedia URLs, and the TLS case from another network.
- Run `upload.mjs --execute` only after approval. Then verify delivery URLs and update the rewrite map if any are missing.
