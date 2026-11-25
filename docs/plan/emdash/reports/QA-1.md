# QA-1 URL parity: review fixes

Branch `fix/QA-1` (from `emdash/QA-1-url-parity` + `feat/emdash`, because the story branch is checked out in another worktree).

## Review fixes
1. Wired in: `tests/parity.test.ts` is in `apps/web/vitest.config.ts`; `pnpm --filter web parity` runs `node tests/check-parity.mjs`; `web-ci.yml` runs `pnpm --filter web parity --fail-on-extra --allow-extra tests/parity-allow-extra.txt` right after the empty-build guard (actionlint reports nothing for web-ci.yml; it flags an existing SC2086 in `web-guards.yml`, untouched).
2. One implementation: `src/lib/route-parity.test.ts` now calls `runParityCheck` per group (same DONE / OWNED_LATER semantics, OWNED_LATER feeds `allowMissing`). `scripts/dev/parity-paths.ts` deleted (PORT-3 report ref updated).
3. `normalizePath` is strict: no trailing-slash stripping (`/about/` != `/about` != `/about.html`), `decodeURI` per path (so `/tag/c%23/` stays as written and matches the on-disk `c%23` dir in both builds), invalid escapes stay raw, no NFC. NFC is not needed: a test asserts every legacy URL is already NFC after decoding, and a second test documents that NFD/NFC spellings are not folded. The old fixture that put `c#` on disk was wrong (both legacy and new builds have a literal `c%23` directory) and was fixed.
4. `--fail-on-extra`: infra files (`/.assetsignore`, `/_headers`, `/_redirects`, `/_routes.json`, `/sitemap.xml`, `/_astro`, `/_emdash`, `_noop`) never count. Post-shaped paths (`/<cat>/YYYY/MM/DD/<slug>/`, `/api/cards|relates/YYYY/MM/DD/<slug>.json`) dated after the newest legacy post (20261124 in the current snapshot) are reported as "new posts" and never fail; a post dated earlier but absent from legacy still fails (renamed/moved URL). New `--allow-extra <path|glob|file>`. The report gains `newPostPaths`, `allowedExtraPaths`, `legacyLatestPostDate`.
   Real build result: 0 missing of 4945; 3 new-post paths; 24 further extras, all `/api/cards/<post>.json` for posts whose legacy build had no cards file (additive). They are listed in `tests/parity-allow-extra.txt` and passed in CI and `route-parity.test.ts`.
5. Docs: `check-parity.mjs --help` states Node >= 22.18 (native .ts import) and that "present" means the file exists (content is not inspected).

## Verification
- `pnpm --filter web exec vitest run`: 23 files, 177 tests pass (one earlier run under heavy machine load had 2 transient failures; rerun twice clean).
- Full build (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=... pnpm --filter web build`) then `pnpm --filter web parity --fail-on-extra --allow-extra tests/parity-allow-extra.txt`: PASS.
