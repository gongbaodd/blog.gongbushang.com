# Deploy runbook: testing

Worker `growgen-web-testing` (workers.dev, no routes). Production is a placeholder until CUT-1.

## Resources (account 2c1ea12e37cd89d9a6f6a62c6798d3a0)
| What | Name | Id |
|---|---|---|
| Hyperdrive | `growgen-testing-db` (caching disabled), origin direct host `db.<testing ref>.supabase.co:5432` | `319cee5eca8a4c47a00b2091cff565f3` |
| KV (SESSION) | `growgen-testing-session` | `55d3e3f70475477a9eef931679726407` |
| Durable Object | `EMDASH_ROOMS` / `EmDashRoom` (SQLite-backed, in-worker) | n/a |

Fallback if Hyperdrive cannot reach the direct host at runtime (IPv6-only on Free): `wrangler hyperdrive update 319cee5eca8a4c47a00b2091cff565f3 --connection-string "$SUPABASE_TESTING_POOLER_URL"` (session pooler, port 5432), no redeploy needed.

## Secrets (names only; `wrangler secret put <NAME> --env testing`, value on stdin)
| Name | State | Notes |
|---|---|---|
| `EMDASH_ENCRYPTION_KEY` | set | backup in `.env` as `EMDASH_TESTING_ENCRYPTION_KEY`; losing it loses encrypted plugin settings |
| `SETUP_TOKEN` | set | backup in `.env` as `GROWGEN_TESTING_SETUP_TOKEN`; gates the setup wizard |
| `EMDASH_SITE_URL` | TODO | the workers.dev URL, set after the first deploy prints it, then redeploy not needed (read at runtime) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `GITHUB_DISPATCH_TOKEN` | TODO | owner has not provided them yet |

## Build and deploy
```
pnpm deploy:testing:build        # CLOUDFLARE_ENV=testing bakes env.testing into dist/server/wrangler.json, then post-build writes noindex
pnpm deploy:testing:dry-run
cd apps/web && pnpm exec wrangler deploy -c dist/server/wrangler.json     # needs Lead go-ahead
```
Env selection is by `CLOUDFLARE_ENV` at build time; the generated config has no `env` block, so do not pass `--env`. `pnpm --filter web build` now runs the static-route guard, `astro build` and `post-build.mjs` (idempotent, so the root script running it again is harmless). Note the build applies EmDash migrations/seed to the testing DB.

## First-deploy claim procedure (D11)
Anyone who reaches `/_emdash/admin/setup` first becomes admin. The Worker gates it (src/middleware.ts): 404 unless `SETUP_TOKEN` matches.
1. Deploy. Do not share the URL.
2. Open `https://<worker>.workers.dev/_emdash/admin/setup?setup_token=<GROWGEN_TESTING_SETUP_TOKEN>` (sets an httpOnly 1 h cookie, redirects to the clean URL).
3. Complete the wizard and enroll the passkey in the same browser session.
4. Verify: `curl -i https://<worker>.workers.dev/_emdash/api/setup/status` returns 404 without the cookie and `/_emdash/admin` redirects to login.
5. Optionally `wrangler secret delete SETUP_TOKEN --env testing` afterwards (setup endpoints then stay closed).

## Noindex
`SITE_ENV` (wrangler var, `testing` here, `production` at top level): non-production gets `X-Robots-Tag: noindex, nofollow` on SSR responses (middleware) and on assets (`dist/client/_headers`), plus a disallow-all `robots.txt`, both written by `apps/web/scripts/post-build.mjs`. Production builds run with `SITE_ENV=production` and write nothing.

## After deploy
- `wrangler tail --env testing` while loading `/_emdash/admin`; record CPU time per invocation against the 10 ms Free limit.
- Cron: testing `*/15`, production `*/5`. The handler runs `runScheduledTasks` (publishes scheduled posts, housekeeping) and its DB query also keeps Supabase from pausing.
