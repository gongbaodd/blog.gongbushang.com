# Admin runbook: Dockerized Node EmDash admin (D12, INF-9)

The public Cloudflare Worker (`apps/web`) serves static prerendered pages only and locks down `/_emdash/*` with a 404 because EmDash's authenticated admin routes exceed the 10 ms CPU limit on Cloudflare Workers Free.

`apps/admin` is a minimal, EmDash-only Astro application built with `@astrojs/node` (`mode: "standalone"`) and `emdash/db` `postgres()`. It runs as a production Node server (`node scripts/start.mjs`, which checks the environment then loads `dist/server/entry.mjs`) inside Docker—either locally via `docker compose` or on a free-tier container host (such as Altare's 4 GB RAM free tier behind Cloudflare Access)—with zero blog UI, Three.js, Rapier, Shiki, Mermaid, or Chromium dependencies.

For the host-native `astro dev` workflow (`pnpm admin:local|production`), see [`admin.md`](./admin.md).

---

## 1. Environment variables & database targets

Copy `apps/admin/.env.example` to `apps/admin/.env` (or separate `.env.local`, `.env.production` files — all gitignored) and fill in the target values. **Never commit real secrets.**

| Variable | Required | Purpose |
|---|---|---|
| `SITE_ENV` | Yes | `local` or `production` (INF-10: `testing` is retired and refused at startup with a clear message). Only `production` fires GitHub `repository_dispatch` on publish. Any value other than `production` sets `X-Robots-Tag: noindex, nofollow` on the admin itself (the admin is never a public site). |
| `DATABASE_URL` | Yes | PostgreSQL connection URL. For the remote Supabase (production, project `ckpozotzgubrjbjstvjg`), always use the **IPv4 session pooler** (port `5432`, `aws-0-ap-southeast-1.pooler.supabase.com`). For `local` Supabase (`pnpm db:start`) from inside Docker, use `postgresql://postgres:postgres@host.docker.internal:54322/postgres`. |
| `EMDASH_ENCRYPTION_KEY` | Yes (production) | Must match `EMDASH_PRODUCTION_ENCRYPTION_KEY` (`emdash_enc_v1_...`) so encrypted plugin settings can be read. |
| `EMDASH_SITE_URL` | Yes | Browser-facing origin of this admin instance (`http://localhost:4322` locally, or `https://admin.growgen.xyz` online). Determines the WebAuthn passkey Relying Party ID (RP ID). |
| `EMDASH_ALLOWED_ORIGINS` | Optional | Comma-separated additional passkey origins sharing the same registrable parent domain. |
| `SETUP_TOKEN` | First setup only | Fail-closed setup gate token. When empty/unset, `/_emdash/admin/setup` and `/_emdash/api/setup` return `404`. |
| `SESSION_DRIVER` | Optional | `fs-lite` (default, stored in `/app/.astro/sessions` volume) or `memory`. |
| `CLOUDINARY_CLOUD_NAME` | For media | Cloudinary cloud name for media browsing/uploads (`growgen` folder). |
| `CLOUDINARY_API_KEY` | For media | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | For media | Cloudinary API secret. |
| `GITHUB_DISPATCH_TOKEN` | For publish | Fine-grained GitHub PAT (`Contents: write` on the repo) for the `rebuild-on-publish` plugin (`emdash-publish` dispatch). |
| `GITHUB_DISPATCH_REPO` | For publish | Defaults to `gongbaodd/blog.gongbushang.com`. |

**Baked by design.** `PUBLIC_*` variables and `EMDASH_SITE_URL` are inlined into the build output by Astro, so they are public. Never put a secret behind a `PUBLIC_` prefix or in `EMDASH_SITE_URL`. Every other variable must come from the runtime environment only. `pnpm --filter admin check:secrets` (SEC-02) enforces this with a canary build, and fails if a runtime secret is inlined. It also rejects any bare or optional-chained `import.meta.env` in the admin sources.

---

## 2. Running locally with Docker Compose

From `apps/admin/`:

```bash
cd apps/admin
cp .env.example .env
# Edit .env with your target DATABASE_URL, EMDASH_ENCRYPTION_KEY, CLOUDINARY_*, GITHUB_DISPATCH_TOKEN
```

### Build and start

```bash
# Default (.env):
docker compose up --build -d

# Or switch environments explicitly with separate env files:
docker compose --env-file .env.local up -d
docker compose --env-file .env.production up -d
```

By default `docker-compose.yml` binds `127.0.0.1:4322:4322` on the host so the admin is only reachable from your machine, while listening on `HOST=0.0.0.0` `PORT=4322` inside the container.

### Verify health and open the admin

```bash
curl -fsS http://127.0.0.1:4322/healthz
# {"ok":true,"status":"ok","service":"emdash-admin","environment":"local"}
```

Then open `http://localhost:4322/_emdash/admin`.

### Stop

```bash
docker compose down
```

---

## 3. Hosting online (e.g. Altare 4 GB free tier behind Cloudflare Access)

If you want to edit from any device without running Docker locally, deploy `apps/admin/Dockerfile` to a free-tier container host such as **Altare** (4 GB RAM free tier) or any OCI container platform.

### Build & container settings

- **Dockerfile path**: `apps/admin/Dockerfile`
- **Build context**: monorepo root (`.`)
- **Command**: `node scripts/start.mjs` (runs as non-root `node` user; **never** run `astro dev` in a container)
- **Port**: `4322` (`HOST=0.0.0.0`, `PORT=4322`)
- **Healthcheck**: `GET /healthz` (HTTP `200`, body exactly `{"ok":true}`; it names no service or environment because it is unauthenticated (SEC-08), and it does not query Postgres, so it won't prevent Supabase idle pause or fail before migrations)
- **Database connection**: Supabase direct hosts (`db.<ref>.supabase.co`) are IPv6-only; container platforms without IPv6 egress **must** use the Supabase **IPv4 session pooler** URL (port `5432`) as `DATABASE_URL`.

### Mandatory: Cloudflare Tunnel, no public inbound port (SEC-08)

An online admin **must** be reached only through **Cloudflare Tunnel (`cloudflared`)**: run `cloudflared` next to the container (same Docker network), publish **no** host port (remove the `ports:` mapping, or bind it to `127.0.0.1`), and pick a host that gives the container no public IP or default `*.provider` URL. If the platform always exposes a public URL, do not host the admin there (or use mTLS Authenticated Origin Pulls plus a firewall limited to Cloudflare's IP ranges, which is more work to get right). Cloudflare Access is a policy on the hostname; it does not protect an origin that can be reached directly.

Defence in depth on the origin: set `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD`, so every request except `/healthz` and `/robots.txt` must carry a valid `Cf-Access-Jwt-Assertion` (section 6, `src/outer.ts`). A production target turns this on automatically when the server listens beyond loopback.

The admin is never indexable, in any environment (SEC-06): every response carries `X-Robots-Tag: noindex, nofollow` and `/robots.txt` is `Disallow: /`, whatever `SITE_ENV` says.

### Protect with Cloudflare Access

1. Put the admin subdomain (e.g. `admin.growgen.xyz`) behind a **Cloudflare Access** self-hosted application policy allowing only the owner's email/GitHub identity before traffic reaches the container.
2. Keep `SETUP_TOKEN` **unset/empty** in normal operation so `/_emdash/admin/setup` and `/_emdash/api/setup` fail closed with `404`.
3. Only set `SETUP_TOKEN` temporarily when initializing a brand-new database:
   - Visit `https://admin.growgen.xyz/_emdash/admin/setup?setup_token=<SETUP_TOKEN>`. It sets an `httpOnly`, `SameSite=Strict` cookie holding an HMAC-SHA256 value derived from the token (never the token itself), `Secure` on every origin except plain-HTTP `localhost`/`127.0.0.1`, and redirects to the clean URL with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (SEC-15).
   - Register the admin passkey, then remove `SETUP_TOKEN` from the container environment and restart.

---

## 4. WebAuthn passkeys & per-origin `EMDASH_SITE_URL`

WebAuthn passkeys are cryptographically bound to the **Relying Party ID (RP ID)** derived from `EMDASH_SITE_URL`:

- **Local admin** (`EMDASH_SITE_URL=http://localhost:4322`): passkeys are bound to RP ID `localhost`. Note: open `http://localhost:4322/_emdash/admin` (not `http://127.0.0.1:4322`), because WebAuthn treats `localhost` and `127.0.0.1` as distinct origins/RP IDs.
- **Online admin** (`EMDASH_SITE_URL=https://admin.growgen.xyz`): passkeys are bound to RP ID `admin.growgen.xyz` (or `growgen.xyz` if shared across subdomains via `EMDASH_ALLOWED_ORIGINS`).
- **Registering a passkey for a second origin**: A passkey registered on `localhost` will not authenticate on `admin.growgen.xyz` (different RP ID). To sign in on a newly deployed online admin against an already-initialized database:
  1. Sign in locally at `http://localhost:4322/_emdash/admin` and create an invite link / recovery link (or register under the shared domain), **or**
  2. Temporarily access the local admin via a Cloudflare Tunnel on the same hostname (`admin.growgen.xyz`) to register a passkey for that RP ID.

---

## 5. Publish → Static site rebuild flow

1. Clicking **Publish** in `apps/admin` triggers the `rebuild-on-publish` native plugin (`content:afterPublish` hook).
2. When `SITE_ENV=production` and `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set, the plugin sends a `repository_dispatch` (`event_type: "emdash-publish"`, `client_payload: { environment, collection, id, slug }`) to GitHub.
3. GitHub Actions (`web-deploy.yml`) rebuilds the static site from Supabase and deploys the updated assets to Cloudflare Workers.
4. When `SITE_ENV=local` (or unset), dispatch is skipped so local testing never triggers a cloud deployment.

---

## 6. Safety rails and access control (INF-9 review fixes)

**Required exposure: Cloudflare Tunnel only (SEC-08).** Run `cloudflared` next to the container, publish no host port (drop the `ports:` mapping or keep it on `127.0.0.1`), and put the hostname behind a Cloudflare Access application. The origin then verifies the Access JWT itself (below), so a leaked container URL or a misrouted port is not an open admin.

| Variable | Effect |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` | When `CF_ACCESS_AUD` is set, every request except the exact raw path `/healthz` must carry a valid `Cf-Access-Jwt-Assertion` (RS256, `exp` required, signature from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, issuer = team origin, audience = AUD). The team domain must be `<team>` or `<team>.cloudflareaccess.com`. Otherwise `403`. The check is EmDash's `middleware.outer` (`src/outer.ts`), so it runs before any EmDash middleware: no runtime init, DB lookups, sessions or 302/401 for an unauthenticated request. |
| Production target | Access is mandatory unless the server listens on loopback only. "Production" means `SITE_ENV=production` **or** a `DATABASE_URL` whose project ref (`postgres.<ref>` pooler user) equals `SUPABASE_PRODUCTION_REF`, whatever `SITE_ENV` says (INF-5 rule). Missing or half-configured Access then answers `503` to everything except `/healthz`. `start.mjs` pins `HOST` (default `127.0.0.1`) and exports `ADMIN_REQUIRE_ACCESS=1` for the request-time gate; an unset `HOST` is never treated as loopback. |
| `ADMIN_CONFIRM_PRODUCTION=yes` | Required for any production target (the analogue of `--yes-production` in [`admin.md`](./admin.md)). Without it `scripts/start.mjs` exits 1. |
| `SUPABASE_PRODUCTION_REF` | **Required for any remote database** (fail closed, as in INF-5), and the URL's ref must equal it: there is exactly one remote project (production, `ckpozotzgubrjbjstvjg`), so any other remote database is refused whatever `SITE_ENV` says. `SITE_ENV=testing` is refused outright (retired by INF-10). Production keeps its confirmation (`ADMIN_CONFIRM_PRODUCTION=yes`) and Cloudflare Access requirements. |
| `SITE_ENV=local` with a remote DB | Refused unless `ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL=yes`. `SITE_ENV=production` with a loopback DB is refused too. Only `?sslmode=` is accepted as a URL query parameter (libpq would let `user=`/`host=` override what was checked). `sslmode` itself is **stripped** before connecting, because pg would let it override our TLS settings; a remote URL with `disable`, `no-verify`, `allow` or `prefer` is refused (`require`, `verify-ca`, `verify-full` are accepted and mean "use our computed TLS"). |
| `DATABASE_URL` | Required at runtime, **not** baked into the image (`astro build` only sees a placeholder; missing value fails closed). Pool size 3. |
| `DATABASE_CA_CERT` | Optional. **Use a file path** (mounted into the container): a PEM passed through an env var often arrives with literal `\n` sequences, which is rejected. When set, TLS to the pooler is verified (verify-full); when unset the certificate is not verified. A blank (whitespace-only) value or an unreadable file is a startup error. Production should set it to the verified Supabase root CA committed at `apps/web/scripts/certs/prod-ca-2021.crt` (mount it read-only, e.g. `/run/certs/prod-ca-2021.crt`; provenance in supabase.md "Connect", SEC-09). |
| `ADMIN_RESTART` | Compose restart policy, default `no`. Use `unless-stopped` only for local. |
| `GITHUB_API_URL` | Honoured only when `SITE_ENV=local`; otherwise the real `api.github.com` is used. |

**Same rules without the launcher.** The rules live in `scripts/safety.mjs` and run in three places: `start.mjs` (refuses to start), the runtime pool (`db-config.ts` throws) and `src/outer.ts` (every request except `/healthz` gets 503 on an unsafe configuration, and a production target turns Access on). Running `node dist/server/entry.mjs` directly is therefore no less safe.

**Public assets.** `/_astro/*` build assets are served by the Node adapter before middleware and are not behind Access; they contain no content or secrets.

**Sidecar caveat.** With `HOST=127.0.0.1` and a `cloudflared` sidecar in the same network namespace, every request arrives from loopback and the Access check is switched off for a production target. Keep the default container setup (`HOST=0.0.0.0`, port unpublished, `cloudflared` reaching it over the Docker network) so origin verification stays on.

At start `scripts/start.mjs` connects with the runtime `DATABASE_URL` and logs `DB IDENTITY: SITE_ENV=... -> host:port/db (database, role)` (never the password) before the server listens. Check that line in `docker compose logs admin` before editing anything.

Verify a build locally against local Supabase only (never the remote database): `pnpm --filter admin build && pnpm --filter admin smoke`. It checks that `dist/` holds no credential, `/healthz` is 200, `/_emdash/admin/setup` is 404 without `SETUP_TOKEN`, the DB identity is logged, Access enforce mode answers 403 (and misconfigured Access 503) for `/_emdash/admin`, `/_emdash/api/manifest` and `/_emdash/api/auth/me` on the real built server, and the startup refusals above.

The image uses `pnpm --config.inject-workspace-packages=true --filter admin deploy --prod /out` (about 615 MB of `node_modules`, versus about 2.3 GB when the whole workspace was copied), and the root `.dockerignore` keeps `.env*`, `.dev.vars*`, `node_modules`, `.claude`, `src/content` and similar out of the build context.

**Naming secrets:** Astro inlines any env var whose *name* appears as a substring in a file that uses bare `import.meta.env` (including Astro's own runtime). Give secret variables distinctive, prefixed names (never `KEY`, `TOKEN`, `HOST`), and add every new runtime variable to `apps/admin/.env.example` so `pnpm --filter admin check:secrets` canary-tests it.
