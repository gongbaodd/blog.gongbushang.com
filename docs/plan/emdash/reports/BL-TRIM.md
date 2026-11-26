# GON-190: Trim EmDash admin locales

Set EmDash's supported `admin.locales` allowlist to `["en"]` in `apps/web/astro.config.mjs`. EmDash validates the allowlist and always retains its English source locale; no custom bundler plugin or alias was needed.

## Worker bundle

Measured with the local build and Wrangler dry-run (`cd apps/web && CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm build`, then `pnpm exec wrangler deploy --dry-run -c dist/server/wrangler.json`).

| | Total Upload | gzip |
|---|---:|---:|
| Before | 20,118.84 KiB | 5,397.03 KiB |
| After | 11,389.29 KiB | 2,553.14 KiB |
| Saved | 8,729.55 KiB | 2,843.89 KiB |

## Verification

- `pnpm --filter web exec vitest run`: passed, 42 files / 486 tests. Initial parallel run had one 5-second timeout; the standalone rerun passed.
- `pnpm --filter web parity`: passed; `Missing paths (0 total)`. The report also printed 25 unexpected extra paths; the command exited successfully.
- `cd apps/web && pnpm exec astro check`: passed, 0 errors, 0 warnings, 16 hints.
- `pnpm --filter admin build && pnpm --filter admin smoke`: passed.
