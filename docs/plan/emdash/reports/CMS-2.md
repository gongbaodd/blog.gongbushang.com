# CMS-2: Cloudinary media provider

Original build by Gemini (branch `emdash/CMS-2-cloudinary`). This file holds the review fixes.

## Review fixes

Review verdict was approve with fixes; all applied.

1. **`runtime.ts` keeps a static `import { env } from "cloudflare:workers"`** (the dynamic-import-with-silent-fallback `loadWorkersEnv` is removed). It is only loaded inside the Worker; the Node admin does not load it (INF-9 wraps `createCloudinaryProvider` with a `process.env` lookup in `apps/admin/src/cloudinary-media.ts`), so INF-9 needs nothing else from it. The unit test mocks `cloudflare:workers` with `vi.mock`.
2. **Raw files (pdf, zip).** `getEmbed` returns a `component` embed (`package: "@growgen/file-link"`, `export: "FileLink"`, props `href`, `filename`, `label`) instead of `type: "image"`; EmDash's `EmbedResult` has no file variant (only image, video, audio, component). `getThumbnailUrl` must return a string (no null in the contract), so it returns a generic file-icon `data:image/svg+xml` URI (`RAW_FILE_THUMBNAIL`), not the file URL. The `@growgen/file-link` package does not exist yet; a consumer must map it to a plain link (nothing in this repo calls `getEmbed` for raw files today).
3. **`sign.ts` `parseMediaId`:** an unprefixed id's last-segment dot is only treated as an extension when it is in the `MIME` table; otherwise the id is a legacy image public_id (`growgen/v1.2/cover`, `a.b`). `resolveMediaKind` in `provider.ts` got the same rule for extensions taken from the public_id.
4. **Knowledge note** added to `docs/plan/emdash/knowledge.md`: Admin API calls on every list/get against the 500 per hour Free limit, video derived-transcode credit cost, the EmDash embed/thumbnail contract, and the dot-in-public_id rule.

## Verification (CMS-2 + latest feat/emdash)

- `apps/web` vitest for `src/lib/cloudinary-media`: 20 passed. Full `apps/web` vitest: 289 passed, 2 failed in `route-parity.test.ts`, both because the build used `SKIP_PDFS=1` (18 resume PDFs absent); unrelated to this story.
- `apps/web` build ok (`SKIP_PDFS=1`, local Hyperdrive string); `wrangler deploy --dry-run`: Total Upload 20118.73 KiB (about 19.6 MiB) / gzip 5395 KiB against the 64 MiB limit; 5311 static asset files against 20,000.
- `astro check`: apps/web and root 0 errors. Root `test:unit`: 211 passed, 3 skipped.
- `apps/admin` is not part of this branch; see the INF-9 + CMS-2 trial merge in `INF-9.md`.
