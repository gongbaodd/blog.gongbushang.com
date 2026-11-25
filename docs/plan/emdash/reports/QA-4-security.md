# QA-4 Independent Security Audit — EmDash Migration

- **Linear Ticket:** `QA-4` (`GON-181`)
- **Audit Scope:** Secrets & env handling, Admin exposure & Cloudflare Worker lockdown (D11, D12), Database roles/RLS & Supabase pooler (D3, D10), Encrypted backups & CI supply chain (INF-4, INF-6)
- **Baseline Audited:** `feat/emdash` @ `b9b5fb2` (plus unmerged `emdash/INF-5-content-sync` @ `a6f15e1` for content sync scripts)
- **Auditor:** `security-auditor` (read-only code & config audit)

---

## 1. Executive Summary & Go / No-Go Verdict

The EmDash migration makes several strong architectural security choices: moving the admin plane off the public Cloudflare Worker (D12), fail-closed `SITE_ENV` gating for analytics/ads/`noindex` (D11), asymmetric offline-key `age` encryption for public-repo backups (INF-6), zero committed production secrets or client-bundle secret leaks (`PUBLIC_*` hygiene is clean), parameterized SQL across `scripts/derive/`, and transactional, non-cascading auth-table exclusion in `INF-5`.

However, the audit identified **1 Critical**, **4 High**, **6 Medium**, and **4 Low** findings. The most severe exposure is **SEC-01**: while `derived.*` is explicitly locked down with RLS and `REVOKE ALL`, the **73 EmDash tables in `public.*`** (including `auth_tokens`, `_emdash_api_tokens`, `_emdash_oauth_tokens`, `users`, `credentials`, `options`, and `_plugin_storage`) have **no RLS and no `anon`/`authenticated` revocations**, leaving them exposed through Supabase's default PostgREST Data API on projects whose refs are already published in this public repository.

### Finding Counts by Severity

| Severity | Count | IDs |
|---|---:|---|
| **Critical** | 1 | `SEC-01` |
| **High** | 4 | `SEC-02`, `SEC-03`, `SEC-04`, `SEC-05` |
| **Medium** | 6 | `SEC-06`, `SEC-07`, `SEC-08`, `SEC-09`, `SEC-10`, `SEC-11` |
| **Low** | 4 | `SEC-12`, `SEC-13`, `SEC-14`, `SEC-15` |
| **Total** | **15** | |

### Go / No-Go Verdict

| Milestone | Verdict | Mandatory Blockers Before Proceeding |
|---|---|---|
| **`next.growgen.xyz` Launch (Soak)** | **NO-GO (Conditional Go after fixes)** | Resolve **`SEC-01`** (lock down Supabase `public.*` RLS + disable Data API on `testing` & `production`), **`SEC-02`** (add `.dockerignore` & remove build-time `DATABASE_URL` baking before building `apps/admin` images), **`SEC-03`** (step-scope `DATABASE_POOLER_URL` off `pnpm install`), **`SEC-04`** (make deployed `worker.ts` fail-closed static-only + harden path canonicalization), **`SEC-10`** (configure `BACKUP_AGE_RECIPIENT` on `production` env), and **`SEC-12`** (ensure `next.growgen.xyz` builds with `SITE_ENV != production` so soak stays `noindex` + `Disallow: /`). |
| **`growgen.xyz` Cutover (`CUT-1`)** | **NO-GO** | All `next.growgen.xyz` blockers **plus**: **`SEC-05`** (fix or retire `sync-content.yml` before merging `feat/emdash` to `master`), **`SEC-06`** (unconditional `X-Robots-Tag: noindex, nofollow` + `/robots.txt` on `apps/admin`), **`SEC-07`** (use Dockerized `apps/admin` instead of `astro dev` against production), **`SEC-08`** (Cloudflare Tunnel + Access JWT check if hosting `apps/admin` online), **`SEC-09`** (verify Supabase TLS CA cert instead of `rejectUnauthorized: false`), **`SEC-10`** (SHA-pin Actions & verify PGDG key), **`SEC-11`** (least-privilege DB roles, explicit migration fingerprint, branch protection on `master`/`feat/emdash`, `INF-5` table classification guard), **`SEC-12`** (`workers_dev: false`, `preview_urls: false`, real production Hyperdrive/KV IDs, `EMDASH_PRODUCTION_ENCRYPTION_KEY`), and **WebAuthn passkey RP ID** enrolled on `admin.growgen.xyz` or `growgen.xyz` (never `next.growgen.xyz`). |

---

## 2. Findings Table (Ranked by Severity)

| ID | Severity | Domain | Summary | Primary Reference(s) |
|---|---|---|---|---|
| `SEC-01` | **Critical** | DB / RLS | 73 `public.*` EmDash tables (auth/API tokens, passkeys, drafts) have no RLS and remain exposed to Supabase PostgREST `anon`/`authenticated` roles | `supabase/config.toml:14,23-27`, `docs/plan/emdash/runbooks/supabase.md:6-7,31` |
| `SEC-02` | **High** | Secrets / Docker | Missing `.dockerignore` + build-time `DATABASE_URL` serialization leaks `.env*` secrets into `apps/admin` Docker layers and `dist/` | `apps/admin/Dockerfile:20-26`, `apps/admin/astro.config.mjs:33,44-55`, `docs/plan/emdash/runbooks/admin-docker.md:38-51` |
| `SEC-03` | **High** | CI Supply Chain | Live `DATABASE_POOLER_URL` (`postgres` owner) exposed in job-level `env:` during `pnpm install` (reachable by npm lifecycle scripts) | `.github/workflows/web-deploy.yml:78,108`, `.github/workflows/web-ci.yml:49,62` |
| `SEC-04` | **High** | Worker Lockdown | Denylist `normalizePath`/`normalize` misses `%2e`/`%2e%2e`/`%5c` dot-segment & backslash forms; deployed Worker falls through to EmDash `handler.fetch` on every 404 (DB write & CPU DoS) | `apps/web/src/worker.ts:14-19`, `apps/web/src/lib/lockdown.ts:9-23`, `apps/web/src/middleware.ts:43-54`, `apps/admin/src/middleware.ts:51-71` |
| `SEC-05` | **High** | CI Supply Chain | Legacy `sync-content.yml` has direct `${{ ... }}` shell injection with `contents: write`, reachable if `GITHUB_DISPATCH_TOKEN` is compromised | `.github/workflows/sync-content.yml:24-25,40,59` |
| `SEC-06` | **Medium** | Admin Exposure | `apps/admin` omits `X-Robots-Tag: noindex, nofollow` and has no disallow-all `robots.txt` when `SITE_ENV=production` | `apps/admin/src/middleware.ts:38-48`, `apps/admin/src/pages/healthz.ts:18-20` |
| `SEC-07` | **Medium** | Admin Exposure | `pnpm admin:production` runs `astro dev` against LIVE production DB (`DEV=true` disables `SETUP_TOKEN` gate & enables `/_emdash/api/auth/dev-bypass`); prints `127.0.0.1` (invalid WebAuthn RP ID) | `apps/web/scripts/admin/start.mjs:136,191`, `apps/web/src/middleware.ts:55`, `apps/web/scripts/schema/apply.mjs:117` |
| `SEC-08` | **Medium** | Admin Exposure | Online `apps/admin` behind Cloudflare Access lacks origin-bypass defense (`cloudflared` requirement / `Cf-Access-Jwt-Assertion` verification); `/healthz` leaks service & env | `docs/plan/emdash/runbooks/admin-docker.md:73-93`, `apps/admin/src/middleware.ts:63-95`, `apps/admin/src/pages/healthz.ts:21-29` |
| `SEC-09` | **Medium** | DB / Transport | Remote Postgres TLS certificate verification is disabled (`ssl: { rejectUnauthorized: false }`) in admin probe and derive scripts | `apps/web/scripts/admin/start.mjs:159`, `apps/web/scripts/derive/db.ts:49` |
| `SEC-10` | **Medium** | Backups / CI | `BACKUP_AGE_RECIPIENT` missing & unvalidated; public-repo backup artifacts include `auth_tokens`; unverified PGDG APT key; Actions pinned to mutable `@v4` tags | `.github/workflows/web-guards.yml:41-45,54-75`, `.github/workflows/web-ci.yml:51-57`, `.github/workflows/web-deploy.yml:97-103`, `docs/plan/emdash/runbooks/ci.md:22` |
| `SEC-11` | **Medium** | DB / CI AuthZ | `postgres` owner role used for all CI/guard jobs; `apply_migrations` self-scrapes fingerprint; shared `GITHUB_DISPATCH_TOKEN` spans testing & prod; `INF-5` uses table denylist | `.github/workflows/web-deploy.yml:47-68,116-123`, `.github/workflows/web-guards.yml:30-31,49-65`, `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:43-107` |
| `SEC-12` | **Low** | Worker Config | Production `wrangler.jsonc` leaves `workers_dev` (default `true`) and `preview_urls` unset; `next.growgen.xyz` soak `noindex` posture not explicitly enforced | `apps/web/wrangler.jsonc:6-49`, `apps/web/scripts/post-build.mjs:8-18` |
| `SEC-13` | **Low** | Secrets / Media | `apps/admin` honors `GITHUB_API_URL` in production (token exfiltration if misconfigured); Cloudinary `get()`/`delete()` do not confine `publicId` to configured `folder` | `apps/admin/src/rebuild-on-publish.ts:26`, `apps/admin/docker-compose.yml:37`, `apps/web/src/lib/cloudinary-media/provider.ts:346-407` |
| `SEC-14` | **Low** | Secrets / Local | Root `.gitignore` omits `.env.*` / `*.agekey` / `*.dump`; `INF-5` & `web-guards` pass DB passwords via `argv`; `pull.mjs --dump-file` omits `0600` mode | `.gitignore:21-31`, `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:360,385,463`, `emdash/INF-5-content-sync:apps/web/scripts/sync/pull.mjs:201-207` |
| `SEC-15` | **Low** | CI / Cookies | `web-ci.yml` size guard omits `set -o pipefail` before `tee`; setup-gate stores raw `SETUP_TOKEN` in cookie, lacks `no-store`/`no-referrer` on 302, and sets `secure: true` on local HTTP | `.github/workflows/web-ci.yml:95-100`, `apps/admin/src/middleware.ts:79-89`, `apps/web/src/middleware.ts:62-72` |

---

## 3. Detailed Findings & Remediation

### `SEC-01` [Critical] — `public.*` EmDash Tables Lack RLS & Remain Exposed to Supabase PostgREST (`anon` / `authenticated`)

- **Evidence:**
  - `supabase/config.toml:14` exposes `schemas = ["public", "graphql_public"]`, and `supabase/config.toml:23-27` documents that `auto_expose_new_tables` defaults to `true` (matching Supabase Cloud), automatically granting `anon` and `authenticated` privileges on every table created by `postgres` in `public`.
  - `docs/plan/emdash/runbooks/supabase.md:31` confirms EmDash creates 73 `public.*` tables owned by `postgres`. Per `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:43-94`, these include `users`, `credentials`, `auth_tokens`, `auth_challenges`, `oauth_accounts`, `_emdash_api_tokens`, `_emdash_oauth_tokens`, `_emdash_oauth_clients`, `options`, `_plugin_storage`, `_plugin_state`, and `ec_posts`.
  - `supabase/migrations/20261125000000_derived_schema.sql:60-77` and `supabase/migrations/20261125010000_derived_podcast_gallery.sql:30-41` enable RLS and `REVOKE ALL` from `anon`/`authenticated` **only** on `derived.*`. There is no migration securing `public.*` (nor `ALTER DEFAULT PRIVILEGES` for future tables in `derived` or `public`).
  - Both Supabase project refs (`ckpozotzgubrjbjstvjg`, `epewqznhtgjirbfeqfrj`) are committed in this public repo (`docs/plan/emdash/runbooks/supabase.md:6-7`).
- **Impact:** Anyone who obtains the publishable Supabase `anon` key (which Supabase's security model treats as public/client-safe) can query, tamper with, or delete every EmDash table via `https://<ref>.supabase.co/rest/v1/*` — including extracting active admin sessions (`auth_tokens`), API/OAuth bearer tokens (`_emdash_api_tokens`), encrypted plugin secrets (`options`/`_plugin_storage`), and unpublished drafts, or overwriting live blog posts.
- **Concrete Fix:**
  1. **Disable PostgREST / Data API exposure** in both `growgen-testing` and `growgen-production` Supabase Dashboards (`Settings -> Data API`: disable Data API, or remove `public` and `graphql_public` from Exposed Schemas) since neither `apps/web` nor `apps/admin` uses Supabase PostgREST.
  2. **Add an idempotent defense-in-depth SQL migration** (run after `emdash migrate` in every environment) that locks down `public.*` and sets default privileges:
     ```sql
     do $$
     declare r record;
     begin
       for r in select tablename from pg_tables where schemaname = 'public' loop
         execute format('alter table public.%I enable row level security', r.tablename);
       end loop;
       if exists (select 1 from pg_roles where rolname = 'anon') then
         revoke all on schema public, derived from anon;
         revoke all on all tables in schema public, derived from anon;
         revoke all on all sequences in schema public, derived from anon;
         revoke all on all functions in schema public, derived from anon;
         alter default privileges for role postgres in schema public, derived revoke all on tables from anon;
         alter default privileges for role postgres in schema public, derived revoke all on sequences from anon;
       end if;
       if exists (select 1 from pg_roles where rolname = 'authenticated') then
         revoke all on schema public, derived from authenticated;
         revoke all on all tables in schema public, derived from authenticated;
         revoke all on all sequences in schema public, derived from authenticated;
         revoke all on all functions in schema public, derived from authenticated;
         alter default privileges for role postgres in schema public, derived revoke all on tables from authenticated;
         alter default privileges for role postgres in schema public, derived revoke all on sequences from authenticated;
       end if;
     end $$;
     ```
  3. Update `supabase/config.toml:9-27` (`enabled = false` or `schemas = []`, `auto_expose_new_tables = false`) so local development matches production posture.

---

### `SEC-02` [High] — Missing `.dockerignore` + Build-Time `DATABASE_URL` Serialization Leaks `.env*` Secrets Into `apps/admin` Docker Builds

- **Evidence:**
  - Repository scan confirmed **zero `.dockerignore` files** exist anywhere in the repo.
  - `docs/plan/emdash/runbooks/admin-docker.md:13,38-51` instructs operators to create `apps/admin/.env` (and `.env.testing` / `.env.production`) containing `DATABASE_URL`, `EMDASH_ENCRYPTION_KEY`, `CLOUDINARY_API_SECRET`, and `GITHUB_DISPATCH_TOKEN`, then run `docker compose up --build -d`.
  - `apps/admin/docker-compose.yml:11-13` uses build context `../..` (monorepo root) with `apps/admin/Dockerfile`.
  - `apps/admin/Dockerfile:20` runs `COPY apps/admin ./apps/admin`, copying every `apps/admin/.env*` file directly into the `builder` stage before `RUN pnpm --filter admin build` (`Dockerfile:25`).
  - `apps/admin/astro.config.mjs:33` passes `database: postgres({ connectionString: process.env.DATABASE_URL })`, which EmDash serializes into `virtual:emdash/config` at build time (`astro.config.mjs:44-55` only overrides it if `process.env.DATABASE_URL` is non-empty at runtime, leaving `cfg.connectionString` embedded in `dist/server/`).
- **Impact:**
  1. Plaintext production secrets in `apps/admin/.env*` are copied into Docker `builder` cache layers (and the entire repo-root `.env` and `.git/` are sent to the Docker daemon context).
  2. When Vite/Astro loads `apps/admin/.env` during `astro build` (or when `DATABASE_URL` is exported in the shell during `pnpm --filter admin build`), the live Postgres connection string with password is baked verbatim into `apps/admin/dist/server/` and copied into the final `runner` image (`Dockerfile:39`). If the image is ever pushed to a registry (e.g. for Altare hosting), live credentials are exposed.
- **Concrete Fix:**
  1. Add a repo-root `.dockerignore` excluding `.git`, `node_modules`, `**/.env`, `**/.env.*`, `!**/.env.example`, `**/.dev.vars*`, `!**/.dev.vars.example`, `**/*.agekey`, `**/*.dump`, `**/*.dump.age`, `**/dist`, `**/.astro`, `src/content`.
  2. In `apps/admin/astro.config.mjs:33`, pass `database: postgres({ connectionString: "" })` (never read `process.env.DATABASE_URL` at build time), and in the `admin-runtime-database-url` Vite plugin (`astro.config.mjs:51`) read strictly `process.env.DATABASE_URL` at runtime (throwing a clear error if unset).

---

### `SEC-03` [High] — Live `DATABASE_POOLER_URL` Exposed in Job-Level `env:` During `pnpm install` in CI/CD

- **Evidence:**
  - `.github/workflows/web-deploy.yml:78` defines `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: ${{ secrets.DATABASE_POOLER_URL }}` at the **job `env:` level** (pointing to the **production** `postgres` owner credentials on production deploys), making it available to `pnpm install --frozen-lockfile` (`line 108`).
  - `.github/workflows/web-ci.yml:49` similarly exposes `testing`'s `DATABASE_POOLER_URL` at job level to `pnpm install` (`line 62`), `vitest run` (`line 65`), and `typecheck` (`line 68`).
- **Impact:** Any compromised transitive npm package running a lifecycle script during `pnpm install` (or malicious code in a branch PR during `web-ci.yml` `vitest`) can read `process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` and exfiltrate full `postgres` owner database credentials.
- **Concrete Fix:**
  - Remove `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` from job-level `env:` in both `web-deploy.yml:78` and `web-ci.yml:49`.
  - Attach it strictly as step-level `env:` only on the `Migrations are up to date`, `Apply migrations`, and `Build` steps (matching how `CLOUDFLARE_API_TOKEN` is already scoped at `web-deploy.yml:153-155` and `web-ci.yml:104-106`).
  - Consider adding `--ignore-scripts` (or explicit `pnpm.onlyBuiltDependencies` allowlist) for CI installs.

---

### `SEC-04` [High] — Path-Normalization Gaps in Lockdown/Setup Gates & Deployed Worker Fallthrough to EmDash Runtime on Every 404

- **Evidence:**
  - `apps/web/src/lib/lockdown.ts:9-15`:
    ```ts
    export function normalizePath(pathname: string): string | null {
      try {
        return decodeURIComponent(pathname).toLowerCase().replace(/\/{2,}/g, "/");
      } catch { return null; }
    }
    ```
    The same logic is duplicated in `apps/web/src/middleware.ts:43-49` and `apps/admin/src/middleware.ts:51-57`.
  - `apps/web/src/worker.ts:14-19`:
    ```ts
    if (!import.meta.env.DEV && isLockedPath(new URL(request.url).pathname)) {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    return handler.fetch!(request as never, env as never, ctx);
    ```
  - `apps/web/scripts/check-static-routes.mjs:10` confirms `ALLOW_SSR = []` (every single public route in `apps/web/src/pages/` has `export const prerender = true`).
- **Impact:**
  1. **Canonicalization bypass risk:** WHATWG `new URL(request.url).pathname` does **not** decode `%2e` (`.`) or `%5c` (`\`) before resolving dot segments. Passing `/%2e/_emdash/admin`, `/a/%2e%2e/_emdash/admin`, `/%5c_emdash/admin`, or `/_emdash/admin/%2e/setup` produces `"/./_emdash/admin"`, `"/a/../_emdash/admin"`, `"/\\_emdash/admin"`, and `"/_emdash/admin/./setup"` — **none** of which match `LOCKED` (`lockdown.ts:17`) or `GATED` (`middleware.ts:13-14`). Double-encoded paths (`/%255femdash/admin`) also pass single-decode checks. If any downstream router/proxy normalizes dot segments or backslashes after decoding, the gate is bypassed.
  2. **Unauthenticated 404 DB-write & CPU DoS + future SSR route exposure:** Because `worker.ts:18` falls through to `handler.fetch(...)` for every non-locked asset miss, any unauthenticated scanner probing random 404 URLs wakes the full EmDash Worker runtime, connects over Hyperdrive to Supabase Free (500 MB storage cap), writes rows into `_emdash_404_log`, and consumes Workers Free CPU/request quota. It also exposes any non-`/_emdash/` SSR route EmDash or a plugin may add in future upgrades.
- **Concrete Fix:**
  1. **Switch `apps/web/src/worker.ts:14-19` to fail-closed static-only when `!import.meta.env.DEV`:** never invoke `handler.fetch` on deployed Workers. Return bare `404` (`cache-control: no-store`) for locked paths, and for all other asset misses fetch `/404.html` directly from `env.ASSETS` with status `404` (or return bare `404`), preserving `scheduled: createScheduledHandler()` for cron only.
  2. **Harden `normalizePath` / `normalize` (required for `apps/admin/src/middleware.ts` and defense-in-depth in `apps/web`):** iteratively decode (max 2-3 passes, or reject if `%` remains after one decode), replace `\` with `/`, collapse slashes, and resolve dot segments via `new URL(clean, "http://localhost").pathname.toLowerCase()`. Add unit tests for `/%2e/_emdash/admin`, `/a/%2e%2e/_emdash/admin`, `/_emdash/admin/%2e/setup`, `/%5c_emdash/admin`, and `/%255femdash/admin`.

---

### `SEC-05` [High] — Script Injection in Legacy `.github/workflows/sync-content.yml` With `permissions: contents: write`

- **Evidence:**
  - `.github/workflows/sync-content.yml:24-25`: `permissions: contents: write`
  - `.github/workflows/sync-content.yml:40`: `TARGET="${{ inputs.sha || github.event.client_payload.sha }}"`
  - `.github/workflows/sync-content.yml:59`: `commit -m "chore: sync src/content to ${{ steps.bump.outputs.target }}"`
- **Impact:** Although `sync-content.yml` is a legacy workflow slated for removal at `CUT-2`, it listens on `repository_dispatch` (`content-updated`) in the **same repository** where `rebuild-on-publish` uses `GITHUB_DISPATCH_TOKEN` (a PAT with `Contents: write`, per `docs/plan/emdash/runbooks/admin-docker.md:65`). Any attacker who compromises `GITHUB_DISPATCH_TOKEN` (e.g., from a `testing` admin container) can dispatch `content-updated` with a shell-injection payload in `client_payload.sha` (e.g. `$(...)`) and obtain arbitrary code execution with `contents: write` on the default branch. *(By contrast, the new `web-ci.yml`, `web-deploy.yml`, and `web-guards.yml` workflows have zero `${{ ... }}` interpolations inside `run:` blocks.)*
- **Concrete Fix:** Either pass `TARGET` via `env:` and validate `[[ "$TARGET" =~ ^[0-9a-f]{7,40}$ ]]` immediately (and pass `steps.bump.outputs.target` via `env:` on line 59), or remove `sync-content.yml` at cutover (`CUT-2`) if legacy Cloudflare Pages sync is no longer needed.

---

### `SEC-06` [Medium] — `apps/admin` Omits `X-Robots-Tag: noindex, nofollow` and Disallow-All `robots.txt` When `SITE_ENV=production`

- **Evidence:**
  - `apps/admin/src/middleware.ts:38-48`: `if (!siteEnv || siteEnv !== "production")` skips setting `X-Robots-Tag: noindex, nofollow` when `SITE_ENV=production`.
  - `apps/admin/src/pages/healthz.ts:18-20`: identically omits `X-Robots-Tag` when `SITE_ENV === "production"`.
  - `apps/admin/src/pages/` has no `robots.txt` route (falling back to EmDash's default SSR `/robots.txt`).
  - `docs/plan/emdash/runbooks/admin-docker.md:17` requires `SITE_ENV=production` on the production admin container so `rebuild-on-publish` dispatches production rebuilds.
- **Impact:** Unlike `apps/web` (the public blog), `apps/admin` is **strictly an administrative UI** and must never be indexed in any environment. Omitting `noindex` under `SITE_ENV=production` exposes `admin.growgen.xyz` to search engine indexing if Cloudflare Access is ever misconfigured or bypassed.
- **Concrete Fix:** Unconditionally set `X-Robots-Tag: noindex, nofollow` on every response in `apps/admin/src/middleware.ts` and `apps/admin/src/pages/healthz.ts` regardless of `SITE_ENV`, and add `apps/admin/src/pages/robots.txt.ts` returning `User-agent: *\nDisallow: /\n`.

---

### `SEC-07` [Medium] — `pnpm admin:production` Runs `astro dev` Against LIVE Production DB With `dev-bypass` Active

- **Evidence:**
  - `apps/web/scripts/admin/start.mjs:136` spawns `pnpm exec astro dev --background --port <port> --host 127.0.0.1` against `SUPABASE_PRODUCTION_POOLER_URL`.
  - `apps/web/src/middleware.ts:55` skips the `SETUP_TOKEN` gate whenever `import.meta.env.DEV` is true.
  - `apps/web/scripts/schema/apply.mjs:117` confirms EmDash exposes `/_emdash/api/auth/dev-bypass` in dev mode (issuing an authenticated admin session cookie with zero passkey verification).
  - `apps/web/scripts/admin/start.mjs:191` and `docs/plan/emdash/runbooks/admin.md:9` instruct opening `http://127.0.0.1:4322/_emdash/admin` — whereas WebAuthn (§5.4.1) forbids raw IP addresses like `127.0.0.1` as RP IDs (`localhost` is required, as noted in `admin-docker.md:100`).
- **Impact:** While `pnpm admin:production` runs as a background daemon on the developer's Mac, any local process or malicious website exploiting DNS rebinding against `127.0.0.1:4322` can hit `/_emdash/api/auth/dev-bypass` and gain full unauthenticated write access to the **live production database**.
- **Concrete Fix:** Standardize production and testing editing on the Dockerized production Node build (`apps/admin`, `NODE_ENV=production`, `node dist/server/entry.mjs`) which has `DEV=false`, no `dev-bypass`, and active `SETUP_TOKEN` fail-closed middleware. Deprecate `pnpm admin:production` (or require explicit acknowledgment and immediate `pnpm admin:stop`, and print `http://localhost:4322/_emdash/admin`).

---

### `SEC-08` [Medium] — Online `apps/admin` Behind Cloudflare Access Lacks Origin-Bypass Protection

- **Evidence:**
  - `docs/plan/emdash/runbooks/admin-docker.md:73-93` documents deploying `apps/admin/Dockerfile` to a public container host (e.g. Altare) behind Cloudflare Access (`admin.growgen.xyz`).
  - `apps/admin/src/middleware.ts:63-95` performs no verification of Cloudflare Access's `Cf-Access-Jwt-Assertion` header.
  - `apps/admin/src/pages/healthz.ts:21-29` returns `{ ok: true, status: "ok", service: "emdash-admin", environment: siteEnv }` unauthenticated and runs as `middleware.outer` (`apps/admin/astro.config.mjs:36`).
- **Impact:** If the container host allocates a public IP or default provider subdomain (`*.altare.*`) reachable directly over the internet, attackers can bypass Cloudflare Access entirely and interact directly with EmDash's `/_emdash/admin` and `/_emdash/api/*` endpoints (reducing protection to EmDash's own auth alone and enabling brute-force/DoS against Supabase).
- **Concrete Fix:**
  1. Update `docs/plan/emdash/runbooks/admin-docker.md` to mandate **Cloudflare Tunnel (`cloudflared`)** with zero exposed public inbound ports on the container host (or mTLS Authenticated Origin Pulls + firewall restricted to Cloudflare IP ranges).
  2. Add optional fail-closed Cloudflare Access JWT verification (`Cf-Access-Jwt-Assertion` verified against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and `aud`) in `apps/admin/src/middleware.ts` when `CF_ACCESS_AUD` is configured.
  3. Reduce `/healthz` output to `{ "ok": true }` (omit `service` and `environment`).

---

### `SEC-09` [Medium] — Disabled TLS Certificate Verification (`rejectUnauthorized: false`) on Remote Postgres Connections

- **Evidence:**
  - `apps/web/scripts/admin/start.mjs:159`: `const sslFor = (url) => (/(localhost|127\.0\.0\.1)/.test(url) ? false : { rejectUnauthorized: false });`
  - `apps/web/scripts/derive/db.ts:49`: `const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });`
  - `docs/plan/emdash/runbooks/supabase.md:22` instructs connecting with `ssl: { rejectUnauthorized: false }`.
- **Impact:** Disabling TLS certificate validation makes remote Postgres connections vulnerable to active MITM attacks (e.g. on public Wi-Fi or compromised network paths), exposing the `postgres` owner password and allowing tampering with derived-cache/CMS queries.
- **Concrete Fix:** Download Supabase's official root CA (`prod-ca-2021.crt` from Supabase Dashboard -> Database -> SSL Configuration), commit the public CA certificate (non-secret) or reference it via `SUPABASE_CA_CERT_PATH` / `NODE_EXTRA_CA_CERTS`, and configure `ssl: { ca, rejectUnauthorized: true }`.

---

### `SEC-10` [Medium] — Backup Configuration, Artifact Exposure & CI Supply-Chain Hardening Gaps

- **Evidence:**
  - `docs/plan/emdash/runbooks/ci.md:22`: `BACKUP_AGE_RECIPIENT` is **currently missing** in the `production` GitHub environment.
  - `.github/workflows/web-guards.yml:54`: checks `[ -n "${BACKUP_AGE_RECIPIENT:-}" ]` only (no format check against `^age1[0-9a-z]{58}$`).
  - `.github/workflows/web-guards.yml:55-75`: dumps the entire `public` schema (including `auth_tokens`, `_emdash_api_tokens`, `_plugin_storage`, `users`, `credentials`) and uploads `production-db-backup` as a GitHub Actions artifact on a **public repository** (downloadable by any authenticated GitHub account for 14 days).
  - `.github/workflows/web-guards.yml:42`: fetches `https://www.postgresql.org/media/keys/ACCC4CF8.asc` via `curl` without verifying the key's SHA-256 or PGP fingerprint.
  - `.github/workflows/web-ci.yml:51,55,57`, `.github/workflows/web-deploy.yml:97,101,103`, `.github/workflows/web-guards.yml:70,82,84`: all Actions (including third-party `pnpm/action-setup@v4`) are pinned to mutable major tags (`@v4`), not full 40-char commit SHAs.
- **Impact:** Nightly backups will fail until `BACKUP_AGE_RECIPIENT` is provisioned. Because artifacts in public repos can be scraped by anyone, any future compromise of the `age` private key exposes historical session/API tokens stored inside archived dumps ("harvest now, decrypt later"). Mutable Action tags and unverified APT signing keys expose workflows carrying production credentials to upstream supply-chain compromise.
- **Concrete Fix:**
  1. Generate the offline `age` keypair (`age-keygen`) and set `BACKUP_AGE_RECIPIENT` in the `production` GitHub environment before `next.growgen.xyz` launch; add `[[ "$BACKUP_AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]]` validation in `web-guards.yml`.
  2. Consider excluding volatile token/log tables (`--exclude-table-data=public.auth_tokens --exclude-table-data=public._emdash_404_log --exclude-table-data=public._emdash_rate_limits`) from public-repo backup artifacts (or shipping encrypted backups to private storage such as a private GitHub repo / B2 / R2 bucket when available).
  3. Verify the SHA-256 checksum of `apt.postgresql.org.asc` in `web-guards.yml:42` before adding it to APT keyrings.
  4. Pin all GitHub Actions in `web-*.yml` to full 40-character commit SHAs (e.g. `actions/checkout@<sha> # v4`) and enable Renovate/Dependabot updates.
  5. Perform and record a restore drill (`age -d` + `pg_restore --list` + restore to `local`) per `docs/plan/emdash/runbooks/backups.md:57-91`.

---

### `SEC-11` [Medium] — Database Least Privilege, Migration Fingerprint Bypass, Shared Dispatch PAT & `INF-5` Denylist Risk

- **Evidence:**
  - `.github/workflows/web-guards.yml:30-31,49-65`, `web-ci.yml:49`, `web-deploy.yml:78`, and `docs/plan/emdash/runbooks/supabase.md:17,31`: all jobs—including `keepalive-testing` (`select 1`) and `backup-production` (`pg_dump`)—connect as the full `postgres` owner role.
  - `.github/workflows/web-deploy.yml:116-123`: `apply_migrations` parses the fingerprint printed by `emdash migrate --status` and feeds it straight into `--expected-target-fingerprint "$fp"`, neutralizing EmDash's database-identity safeguard.
  - `docs/plan/emdash/runbooks/admin.md:37` recommends sharing one `GITHUB_DISPATCH_TOKEN` (`Contents: write`) across `local`, `testing`, and `production`, while `.github/workflows/web-deploy.yml:47-68` deploys to `production` whenever `client_payload.environment === "production"`.
  - `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:43-107` (unmerged @ `a6f15e1`) excludes 34 auth/env/runtime tables via a hardcoded **denylist** (`EXCLUDED_TABLES`).
- **Impact:**
  1. Compromise of any read-only job (`keepalive-testing`, `backup-production`) yields full write/DDL ownership of the database.
  2. If `DATABASE_POOLER_URL` is mispointed, `apply_migrations` blindly migrates the wrong database instead of halting on fingerprint mismatch.
  3. A compromised `testing` admin holding the shared `GITHUB_DISPATCH_TOKEN` can trigger `production` deployments and push commits to unprotected branches.
  4. Future EmDash upgrades adding a new auth/session/secret table will cause `INF-5` `pull.mjs` to copy and truncate it across environments without warning.
- **Concrete Fix:**
  1. Provision least-privilege Postgres roles for `backup-production` (`GRANT pg_read_all_data`) and `keepalive-testing` (`CONNECT` only) in Supabase.
  2. Replace auto-scraping in `web-deploy.yml:120` with an environment variable (`vars.EMDASH_TARGET_FINGERPRINT` per GitHub environment) or required manual `workflow_dispatch` input.
  3. Enable GitHub **branch protection / rulesets** on `master` and `feat/emdash` (no direct pushes via PAT), restrict `GITHUB_DISPATCH_TOKEN` to `Contents: write` on this repo only with expiry/rotation, and avoid sharing the production dispatch PAT with untrusted testing hosts.
  4. In `INF-5` (`lib.mjs`/`pull.mjs`), before dumping/truncating, query `pg_tables` and **fail closed** if any `public.*` table is neither in `EXCLUDED_TABLES` nor in an explicit `SYNCED_CONTENT_TABLES` / `^ec_` allowlist. (Also update unused `DERIVED_TABLES` in `lib.mjs:106-112` to include `podcast_embeddings` and `gallery_traces` from `MIG-3`.)

---

### `SEC-12` [Low] — Production `wrangler.jsonc` Leaves `workers_dev` Default-Enabled & `next.growgen.xyz` Soak `noindex` Posture

- **Evidence:**
  - `apps/web/wrangler.jsonc:6-44` (top-level production config) omits `"workers_dev": false` and `"preview_urls": false` (whereas `env.testing` explicitly sets `"workers_dev": true, "preview_urls": false` at `lines 48-49`), and still holds placeholder `00000000000000000000000000000000` IDs for `HYPERDRIVE` (`line 20`) and `SESSION` KV (`line 26`).
  - `apps/web/scripts/post-build.mjs:8-18` and `apps/web/src/pages/robots.txt.ts:9-15` make the site indexable whenever `SITE_ENV=production`.
- **Impact:** Deploying production with Wrangler's default `workers_dev: true` exposes an indexable duplicate site at `growgen-web.<account>.workers.dev` with production Mixpanel/AdSense enabled. Similarly, launching `next.growgen.xyz` with `SITE_ENV=production` during the 2-week soak would cause search engines to index `next.growgen.xyz` alongside `growgen.xyz` (violating D11).
- **Concrete Fix:** Add `"workers_dev": false, "preview_urls": false` to top-level `apps/web/wrangler.jsonc` before `CUT-1`. Run the `next.growgen.xyz` soak with `SITE_ENV=testing` (or `SITE_ENV=soak`, any value other than `"production"`) so `X-Robots-Tag: noindex, nofollow` and `Disallow: /` stay enforced until `CUT-1` flips DNS to `growgen.xyz`.

---

### `SEC-13` [Low] — Arbitrary `GITHUB_API_URL` in `apps/admin` Production & Missing Cloudinary Folder Confinement

- **Evidence:**
  - `apps/admin/src/rebuild-on-publish.ts:26` and `apps/admin/docker-compose.yml:37` pass `GITHUB_API_URL` unconditionally to `dispatchOnPublish` even when `SITE_ENV=production` (unlike `apps/web/scripts/admin/lib.mjs:98-102`, which restricts `GITHUB_API_URL` to `local` only).
  - `apps/web/src/lib/cloudinary-media/provider.ts:346-407`: `get(id)` and `delete(id)` accept any `publicId` without checking the configured `${folder}/` prefix or rejecting `..` path segments (`encodeURIComponent("..")` returns `".."` in `encodePublicIdPath` at `line 183`).
- **Impact:** Env tampering or misconfiguration of `GITHUB_API_URL` on `apps/admin` sends `Authorization: Bearer <GITHUB_DISPATCH_TOKEN>` to a third-party host. Unconfined `publicId`s in `provider.ts` allow reading or destroying Cloudinary assets outside the `growgen/` folder within the same Cloudinary account.
- **Concrete Fix:**
  1. In `apps/web/src/plugins/rebuild-on-publish/dispatch.ts:36` (or `apps/admin/src/rebuild-on-publish.ts:26`), ignore `GITHUB_API_URL` unless `SITE_ENV === "local"` (or assert `new URL(base).origin === "https://api.github.com"` for `testing`/`production`).
  2. In `apps/web/src/lib/cloudinary-media/provider.ts`, add a helper validating that `parsed.publicId` starts with `${folder}/` and has no `..` or empty segments before calling Cloudinary `get`/`delete`.

---

### `SEC-14` [Low] — Root `.gitignore` Gaps, Postgres Passwords in Process `argv`, and Unhardened `--dump-file` Mode

- **Evidence:**
  - `.gitignore:21-31` ignores `.env` (duplicated on lines 22 & 31) and `.env.production` (line 23), but omits `.env.*`, `*.agekey`, `*.dump`, and `*.dump.age`.
  - `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:360,385,463` and `.github/workflows/web-guards.yml:31,56,64` pass full `postgresql://user:pass@...` URLs as CLI arguments (`argv`, visible in `ps aux`).
  - `emdash/INF-5-content-sync:apps/web/scripts/sync/pull.mjs:201-207` creates `--dump-file <path>` with default umask (`0644`), unlike `restoreSqlFile` which enforces `0o600` (`lines 221-222`).
- **Impact:** Creating `.env.testing` or `growgen-backup.agekey` at the repo root risks accidental `git add`; local multi-user process listings can observe DB passwords in `argv` during sync/dump runs; saved dump files may be world-readable on disk.
- **Concrete Fix:** Add `.env.*`, `!.env.example`, `*.agekey`, `*.dump`, `*.dump.age` to root `.gitignore`; pass Postgres connection details via `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars where supported; call `chmodSync(rawDumpFile, 0o600)` after `pg_dump` in `pull.mjs`.

---

### `SEC-15` [Low] — Missing `pipefail` on `web-ci.yml` Size Guard & Setup-Gate Cookie Hardening

- **Evidence:**
  - `.github/workflows/web-ci.yml:95-100`: `pnpm exec wrangler deploy --dry-run ... 2>&1 | tee "$RUNNER_TEMP/dry.log"` lacks `set -o pipefail` (unlike `Build` on `line 76`).
  - `apps/admin/src/middleware.ts:79-89` and `apps/web/src/middleware.ts:62-72`: store the raw `SETUP_TOKEN` string directly as the `growgen_setup_gate` cookie value, omit `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on the 302 redirect, and hardcode `secure: true` (which Safari rejects on `http://localhost:4322` during local Docker setup).
- **Impact:** A failing `wrangler --dry-run` in `web-ci.yml` can yield `bytes=0` and silently pass the 60 MiB guard. Storing the raw `SETUP_TOKEN` in `Set-Cookie` increases sensitivity of proxy/browser cookie dumps, and `secure: true` breaks Safari local HTTP bootstrap.
- **Concrete Fix:** Add `set -o pipefail` to `web-ci.yml:95` (or invoke `apps/web/scripts/guards/worker-budget.mjs`); store an HMAC/SHA-256 derived cookie token (or verify against `digest(secret)`) instead of raw `SETUP_TOKEN`, add `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on the 302 redirect, and set `secure: context.url.protocol === "https:"` (only permitting non-HTTPS on loopback `localhost`).

---

## 4. WebAuthn Passkey Domain Binding & Cutover Analysis (`next.growgen.xyz` -> `growgen.xyz`)

WebAuthn passkeys are cryptographically bound to the **Relying Party ID (RP ID)** derived from `EMDASH_SITE_URL` (`apps/admin/astro.config.mjs:11`, `docs/plan/emdash/runbooks/admin-docker.md:96-105`). Because Cloudflare Worker lockdown (D12) permanently disables `/_emdash/*` on the public Worker (`apps/web/src/worker.ts:15`), passkeys are **never** authenticated on the public static site (`next.growgen.xyz` or `growgen.xyz`); they authenticate strictly against the admin origin (`apps/admin`).

| Admin Origin | Valid WebAuthn RP ID? | Survives `next.growgen.xyz` -> `growgen.xyz` Cutover? | Notes / Risk |
|---|---|---|---|
| `http://localhost:4322` (Docker local) | Yes (`localhost`) | **Yes** (origin unchanged) | Cannot authenticate on `admin.growgen.xyz` (different RP ID). |
| `http://127.0.0.1:4322` (`start.mjs` default) | **No** (IP literals invalid per WebAuthn §5.4.1) | N/A | Browsers reject IP RP IDs; also `astro dev` enables `dev-bypass` (`SEC-07`). |
| `https://growgen-web-testing.workers.dev` | Yes (PSL suffix, exact host only) | **No** (`workers.dev` is on the Public Suffix List) | Historical pre-D12 testing passkeys are isolated and unusable on `growgen.xyz` / `admin.growgen.xyz`. |
| `https://next.growgen.xyz` | Yes | **NO if RP ID = `next.growgen.xyz`** | If an admin passkey is enrolled with `EMDASH_SITE_URL=https://next.growgen.xyz`, retiring `next.growgen.xyz` at `CUT-1` **breaks sign-in** unless RP ID was explicitly scoped to `growgen.xyz` or a new passkey is enrolled on `admin.growgen.xyz` / `localhost`. |
| `https://admin.growgen.xyz` (Online `apps/admin`) | Yes (`admin.growgen.xyz`, or shared `growgen.xyz` via `EMDASH_ALLOWED_ORIGINS`) | **Yes** (independent of `next.` -> apex cutover) | **Recommended online admin origin**, placed behind Cloudflare Tunnel + Cloudflare Access (`SEC-08`). Enroll passkey directly on `admin.growgen.xyz` (plus a backup passkey on `localhost:4322` or a second hardware key). |

**Cutover Rule:** Never enroll production admin passkeys against `next.growgen.xyz`. Enroll production passkeys against `http://localhost:4322` (local Docker) and/or `https://admin.growgen.xyz` (online Docker behind Cloudflare Tunnel + Access), and verify recovery/second-passkey enrollment before archiving the legacy repo (`CUT-2`).

---

## 5. Secrets & Client-Bundle Hygiene Summary

Verified across `apps/web/src/**`, `apps/admin/src/**`, `apps/web/astro.config.mjs`, `apps/admin/astro.config.mjs`, `.dev.vars.example`, `apps/admin/.env.example`, and `.github/workflows/web-*.yml`:

- **No committed live secrets:** `git ls-files` and regex scans across `apps/`, `supabase/`, `.github/`, and `docs/plan/emdash/` found zero live API tokens, `EMDASH_ENCRYPTION_KEY` values, `age` private keys, or remote Postgres passwords. Only loopback local defaults (`postgres:postgres@127.0.0.1:54322`) and unit-test dummy strings appear.
- **No client-bundle secret leaks (`PUBLIC_*`):** `apps/web/astro.config.mjs:53-57` only exposes `PUBLIC_SITE_ENV` and `PUBLIC_BUILD_SHA` via `vite.define`. All `import.meta.env.PUBLIC_*` references are strictly public values (Mixpanel project token/host/debug, AdSense flags/slot, build SHA, site env). Server-only secrets (`EMDASH_ENCRYPTION_KEY`, `CLOUDINARY_API_SECRET`, `GITHUB_DISPATCH_TOKEN`, `SETUP_TOKEN`, `DATABASE_URL`, `DATABASE_POOLER_URL`) are never prefixed `PUBLIC_` and never imported into client islands.
- **No secret logging:** `apps/web/src/plugins/rebuild-on-publish/dispatch.ts:62-81`, `apps/web/scripts/guards/cloudinary-usage.mjs:24-41,228-230`, `apps/web/scripts/admin/lib.mjs:112-118`, and `emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:155-200` avoid logging credentials and redact Postgres URLs/tokens in error output. (Minor gap: `apps/web/scripts/admin/start.mjs:103` does not separately add the URL-decoded DB password to `secretValues`, unlike `INF-5`'s `extractUrlPassword`.)
- **SQL injection:** All queries in `apps/web/scripts/derive/*.ts` and `apps/web/scripts/admin/start.mjs:177` use `$1..$N` parameter binding; `DERIVE_SCHEMA` is regex-validated (`db.ts:13`); EmDash content reads run inside `BEGIN READ ONLY ... ROLLBACK` transactions (`posts.ts:40-55`, `media.ts:41-48`). `INF-5` uses `spawnSync` argument arrays (no shell) and `format('%I.%I', ...)` with `SAFE_IDENT_RE` validation (`lib.mjs:120-127,418`).

---

## 6. D11 / D12 Security Control Verification Checklist

| Control | Decision | Status | Evidence & Notes |
|---|---|---|---|
| No secrets committed to git / `.env.example` clean | D11 | **Pass** | Verified via `git ls-files` & pattern scan; only loopback defaults & placeholders committed. |
| No server secrets leaked into client bundles (`PUBLIC_*`) | D11 | **Pass** | Only `PUBLIC_SITE_ENV`, `PUBLIC_BUILD_SHA`, Mixpanel, and AdSense public vars reach client bundles (`apps/web/astro.config.mjs:53-57`). |
| Fail-closed `SETUP_TOKEN` gate (404 when unset) | D11 | **Pass** | Verified in `apps/web/src/middleware.ts:57-58` and `apps/admin/src/middleware.ts:74-75` (unit tested in `apps/admin/src/admin.test.ts:102-122`). |
| Timing-safe `SETUP_TOKEN` comparison | D11 | **Pass** | Both middlewares SHA-256 digest candidate & secret then constant-time XOR loop (`apps/web/src/middleware.ts:16-26`, `apps/admin/src/middleware.ts:25-35`). |
| Setup-gate cookie flags (`httpOnly`, `secure`, `sameSite`) | D11 | **Needs Action** | `httpOnly: true, secure: true, sameSite: "strict", path: "/_emdash/", maxAge: 3600` set, but stores raw secret, omits `no-store`/`no-referrer` on 302, and `secure: true` breaks Safari on local HTTP (`SEC-15`). |
| Path-normalization bypass resistance | D11 / D12 | **Needs Action** | Single `decodeURIComponent` + lowercase + `//` collapse misses `%2e`/`%2e%2e`, `%5c`, and double encoding (`SEC-04`). |
| Deployed Cloudflare Worker blocks `/_emdash/*` & `/.well-known/oauth*` | D12 | **Needs Action** | `wrangler.jsonc:15` sets `run_worker_first: false` (guarded by `wrangler-lockdown.test.ts`), and `worker.ts:15` 404s `isLockedPath`, **but** asset misses still invoke EmDash `handler.fetch` instead of failing closed static-only (`SEC-04`). |
| Non-production `X-Robots-Tag: noindex, nofollow` & disallow-all `robots.txt` on `apps/web` | D11 | **Pass** | Fail-closed in `apps/web/scripts/post-build.mjs:8-18`, `apps/web/src/pages/robots.txt.ts:9-15`, and `apps/web/src/middleware.ts:29-40`. (Ensure `next.growgen.xyz` soak builds with `SITE_ENV != production` and top-level `wrangler.jsonc` sets `workers_dev: false` — `SEC-12`.) |
| Always-on `X-Robots-Tag: noindex, nofollow` on `apps/admin` | D11 / D12 | **Needs Action** | Disabled when `SITE_ENV=production` in `apps/admin/src/middleware.ts:40` and `healthz.ts:18`; no `robots.txt` (`SEC-06`). |
| `apps/admin` runs production server (no `astro dev`) & non-root Docker user | D12 | **Pass** | `apps/admin/Dockerfile:44,51` runs `USER node` and `CMD ["node", "dist/server/entry.mjs"]` with `HEALTHCHECK` against `/healthz`. (Note: host launcher `pnpm admin:production` still runs `astro dev` — `SEC-07`.) |
| Docker build context excludes `.env*` & does not bake `DATABASE_URL` | D12 | **Needs Action** | No `.dockerignore` exists; `apps/admin/astro.config.mjs:33` serializes build-time `DATABASE_URL` (`SEC-02`). |
| Online `apps/admin` Cloudflare Access & origin-bypass posture | D12 | **Needs Action** | Runbook mentions Cloudflare Access (`admin-docker.md:88`), but lacks `cloudflared` tunnel / origin lock requirement and `Cf-Access-Jwt-Assertion` verification (`SEC-08`). |
| WebAuthn passkey RP ID domain binding safe for cutover | D11 / D12 | **Needs Action** | Documented in `admin-docker.md:96-105`, but `start.mjs:191` prints invalid RP ID `127.0.0.1` (`SEC-07`); production passkeys must be enrolled on `admin.growgen.xyz` / `localhost`, never `next.growgen.xyz`. |
| `derived.*` RLS enabled & `anon`/`authenticated` revoked | D3 / D10 | **Pass** | Enabled & revoked in `20261125000000_derived_schema.sql:61-77` and `20261125010000_derived_podcast_gallery.sql:30-41` (add `ALTER DEFAULT PRIVILEGES` alongside `SEC-01`). |
| `public.*` EmDash tables RLS enabled & PostgREST `anon` blocked | D3 / D11 | **Needs Action** | **Critical blocker (`SEC-01`):** no RLS or revocations on 73 `public.*` tables; PostgREST exposes `public` by default. |
| Auth/passkey/secret tables excluded in `INF-5` content sync | D4 / D11 | **Needs Action** | 34 auth/env/runtime tables excluded via denylist (`emdash/INF-5-content-sync:apps/web/scripts/sync/lib.mjs:43-107`, not yet merged to `feat/emdash`); upgrade to fail-closed exhaustive table check (`SEC-11`). |
| Encrypted `age` production backups on public repo | INF-6 | **Needs Action** | `set -euo pipefail` + asymmetric `age -r` + >1024 B check implemented (`web-guards.yml:52-75`), but `BACKUP_AGE_RECIPIENT` is missing/unvalidated, APT key unverified, and restore drill unrecorded (`SEC-10`). |
| GitHub Actions `permissions:` least privilege, PR fork protection & `${{ ... }}` safety | INF-4 / INF-6 | **Needs Action** | `web-*.yml` use `permissions: contents: read`, fork PR guard (`web-ci.yml:43`), and zero `${{ ... }}` in `run:`. Needs Action for job-level `DATABASE_POOLER_URL` during `pnpm install` (`SEC-03`), legacy `sync-content.yml` shell injection (`SEC-05`), and SHA-pinning `@v4` Actions (`SEC-10`). |
