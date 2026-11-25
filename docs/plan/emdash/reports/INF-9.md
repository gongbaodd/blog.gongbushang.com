# INF-9: Dockerized Node EmDash admin (apps/admin)

Original build by Gemini (branch `emdash/INF-9-admin`). This file holds the review fixes.

## Review fixes

Review requested changes; all items below were addressed on the story branch.

1. **`@astrojs/node` ^10 -> ^11.1.0** (resolves 11.1.14, peer astro ^7.2.1). The `getLogger` crash is gone: `node dist/server/entry.mjs` boots. New `apps/admin/scripts/smoke.mjs` (`pnpm --filter admin smoke`, local Supabase only) boots the built server and checks `/healthz` (200), the gated `/_emdash/admin/setup` (404), DB identity log, and the fail-closed start conditions.
2. **No build-time DATABASE_URL.** `astro.config.mjs` uses `PLACEHOLDER_DATABASE_URL` (`src/db-config.ts`); the vite plugin replaces `createDialect` so the pool is built from `process.env.DATABASE_URL` at runtime and throws if it is missing. Verified: built with `DATABASE_URL=postgresql://marker:markerpw9@marker.invalid:5432/markerdb`, `grep -r "markerpw9\|marker.invalid" dist` found nothing (only the placeholder is present). The smoke test also scans `dist/` for the credential.
3. **TLS.** `sslFor()`: loopback and `host.docker.internal` = no ssl, everything else `{ rejectUnauthorized: false }` (same as `start.mjs` / `scripts/derive/db.ts`). Pool `max` is 3.
4. **Image size.** Dockerfile now uses `pnpm --config.inject-workspace-packages=true --filter admin deploy --prod /out`. Measured locally: 615 MB of `node_modules` (plain `--legacy` deploy pulls the root importer too, 1.9 GB, so it is not used). A server booted from the deployed tree answers `/healthz` 200. **`docker build` itself was not run**: the keychain is locked in this session (`error getting credentials ... keychain cannot be accessed`); not worked around. Run it once after unlocking.
5. **Root `.dockerignore`** added (`.env*` except examples, `.dev.vars*`, `node_modules`, `dist`, `.astro`, `.claude`, `.venv`, `target`, `src/content`, `.git`, docs, supabase, ...).
6. **`server.host` defaults to 127.0.0.1**; the container sets `HOST=0.0.0.0` itself.
7. **Cloudflare Access enforced** (`src/access.ts`, `src/middleware.ts`, uses `jose` 6.2.18, the version already in the lockfile via emdash). Env: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`. With AUD set, all requests except `/healthz` need a valid `Cf-Access-Jwt-Assertion` (RS256, JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, issuer and audience checked) or get 403. `SITE_ENV=production` with a non-loopback `HOST` requires it: missing or half configured gives 503 for everything. Tunnel-only exposure is documented as the recommended setup in `runbooks/admin-docker.md` section 6.
8. **INF-7 rails in Docker.** `scripts/start.mjs` (image CMD): production needs `ADMIN_CONFIRM_PRODUCTION=yes`; testing/production with a loopback DB is refused; logs `DB IDENTITY: SITE_ENV=... -> host:port/db (database, role)` before listening; compose `restart` defaults to `no` (`ADMIN_RESTART`); `GITHUB_API_URL` is honoured only when `SITE_ENV=local`.
9. **Minors.** `normalize` is now `normalizePath` from `apps/web/src/lib/lockdown.ts` (the Dockerfile copies that file); setup cookie `secure` is false only for plain-http loopback; session dir moved to `/app/.astro/sessions`; lockfile diff is limited to the intended change (see below).

Tests: `apps/admin/src/access.test.ts` (new: Access modes and JWT accept/reject with a local key, middleware 403/503/healthz exemption, db config) and updated `admin.test.ts` (cookie `secure`, `GITHUB_API_URL` gating). 25 tests pass.

Lockfile: `pnpm install --lockfile-only` gives a minimal diff (`@astrojs/node` 10.1.4 -> 11.1.14, `jose` added to admin, `@astrojs/internal-helpers` 0.10.0/`picomatch@4.0.4` dropped, one `yaml 2.9.0 -> 2.9.1` bump). A full `pnpm install --no-frozen-lockfile` flipped `jiti` across many entries, so that result was discarded in favour of the lockfile-only one.

## Verification (INF-9 + feat/emdash merged)

- `apps/admin`: build ok, `astro check` 0 errors, 25 tests pass, `pnpm smoke` all ok.
- `apps/web`: build ok (`SKIP_PDFS=1`, local Hyperdrive string); `wrangler deploy --dry-run`: Total Upload 20093.80 KiB (about 19.6 MiB) / gzip 5388 KiB, against the 64 MiB limit; 5314 static asset files, against 20,000.
- `astro check`: apps/web and root 0 errors. Root `test:unit`: 211 passed, 3 skipped.
