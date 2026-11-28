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

### Build & container settings (for hosts that build from source; Altare pulls the GHCR image instead)

- **Dockerfile path**: `apps/admin/Dockerfile`
- **Build context**: monorepo root (`.`)
- **Command**: `node scripts/start.mjs` (runs as non-root `node` user; **never** run `astro dev` in a container)
- **Port**: `4322` (`HOST=0.0.0.0`, `PORT=4322`)
- **Healthcheck**: `GET /healthz` (HTTP `200`, body exactly `{"ok":true}`; it names no service or environment because it is unauthenticated (SEC-08), and it does not query Postgres, so it won't prevent Supabase idle pause or fail before migrations)
- **Database connection**: Supabase direct hosts (`db.<ref>.supabase.co`) are IPv6-only; container platforms without IPv6 egress **must** use the Supabase **IPv4 session pooler** URL (port `5432`) as `DATABASE_URL`.

### Altare deployment (GON-212)

The target is a single container on Altare, managed from [console.altare.gg](https://console.altare.gg), served at `https://admin.growgen.xyz`.

1. **Image.** `.github/workflows/admin-image.yml` publishes `ghcr.io/gongbaodd/growgen-admin` on every admin change to `master` (tags `sha-<short>` and `latest`), or on demand with `gh workflow run admin-image.yml --ref master`. After the first run, make the package **public** once (GitHub → Packages → growgen-admin → Package settings → Change visibility), so Altare can pull it without credentials. The image holds no secrets (`check:secrets` guards that).
2. **Altare service.** Image `ghcr.io/gongbaodd/growgen-admin:latest` (or a `sha-` tag to pin), port `4322`, health check `GET /healthz`.
3. **Secrets live only in Altare's environment variables**, typed by the owner in the console. They are never in the image, the repo or GitHub: `DATABASE_URL` (IPv4 session pooler), `EMDASH_ENCRYPTION_KEY` (= `EMDASH_PRODUCTION_ENCRYPTION_KEY`), `CLOUDINARY_*`, `GITHUB_DISPATCH_TOKEN`, plus `SITE_ENV=production`, `ADMIN_CONFIRM_PRODUCTION=yes`, `SUPABASE_PRODUCTION_REF`, `EMDASH_SITE_URL=https://admin.growgen.xyz`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_TUNNEL_TOKEN`, `HOST=0.0.0.0`. Leave `SETUP_TOKEN` empty.
4. **Hostname: Cloudflare Tunnel inside the container (GON-230).** Altare gives the container only an IP:port and cannot serve a custom domain over HTTPS, and Cloudflare's proxy cannot forward to an arbitrary port. The image therefore ships `cloudflared`, and `scripts/start.mjs` starts it when `CF_TUNNEL_TOKEN` is set. In Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**, copy the token into Altare's `CF_TUNNEL_TOKEN`, and add the public hostname `admin.growgen.xyz` → `http://localhost:4322` (Cloudflare creates the DNS record). Altare's own port is then unused. The token reaches only the `cloudflared` child process (as `TUNNEL_TOKEN`); the database URL, encryption key and other secrets are stripped from its environment, and if `cloudflared` exits the container exits so Altare restarts it. On a host that does serve custom domains, a proxied DNS record to the host's URL works instead and `CF_TUNNEL_TOKEN` stays empty.
5. **Cloudflare Access** self-hosted application on `admin.growgen.xyz` (below). Copy its team domain and AUD into step 3.
6. **Which build is running (GON-273).** Signed-in users see an **Admin build** widget on the dashboard (and a page of the same name in the sidebar). The workflow bakes the commit into the image (`BUILD_SHA`, `BUILD_TIME` build-args, runtime ENV), and the plugin (`apps/admin/src/build-info/`) compares it with the head commit of the last successful `admin-image` run on `master` (GitHub API, cached 5 minutes; failures retry after 1 minute). It is compared against the last image build, not the `master` head, because docs-only commits build no image. Readings:
   - **Up to date**: running the latest published image.
   - **A newer admin image is available (sha-xxxxxxx), redeploy on Altare**: pull `latest` again (or pin the shown `sha-` tag) in the Altare console.
   - **Couldn't check for the latest version (reason)**: GitHub was unreachable or rate limited (60 requests an hour per IP without a token). This says nothing about whether the build is current. Optionally set a read-only `ADMIN_VERSION_CHECK_TOKEN` (a fine-grained PAT with no permissions beyond public read) in Altare to lift the limit; it is never required.
   - **dev build**: no commit baked in (`pnpm --filter admin dev`, or a local `docker build` without `--build-arg BUILD_SHA=<40-hex sha>`).

   The widget is Block Kit served through the plugin's `admin` route, so it sits behind the Access gate and EmDash sign-in; `/healthz` still answers only `{"ok":true}`.

### Origin protection (SEC-08)

Cloudflare Access is a policy on the hostname, so it does not by itself stop someone opening the Altare URL directly. The origin closes that gap: with `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` set, every request except `/healthz` and `/robots.txt` must carry a valid `Cf-Access-Jwt-Assertion` signed for this application, or gets `403` (section 6, `src/outer.ts`). A production target listening beyond loopback refuses to serve anything (`503`) until both are set. A direct hit on the Altare IP:port therefore reaches no admin page, whether or not the tunnel is used.

Passkeys are bound to the hostname: enroll them on `https://admin.growgen.xyz` only, never on the Altare URL.

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

## 4a. Sign in with Google (GON-252)

Google sign-in sits next to passkeys. It uses EmDash 1.6.0's built-in Google provider (`emdash/auth/providers/google`), not custom OAuth and not Cloudflare Access as identity provider. Cloudflare Access stays in front of the admin, and Google sign-in still needs the Access JWT on the callback request (the browser sends `CF_Authorization` on the redirect from Google).

**Owner steps (GON-253)**

1. Google Cloud Console, project of your choice: APIs & Services, OAuth consent screen. User type External, publish the app to **Production** (Testing caps users and token lifetime). Scopes `openid`, `email`, `profile` only (non-sensitive, no verification review). Skip the logo.
2. Credentials, Create OAuth client ID, type Web application. Authorized redirect URIs (exact origin of `EMDASH_SITE_URL`):
   - local: `http://localhost:4322/_emdash/api/auth/oauth/google/callback`
   - production: `https://admin.growgen.xyz/_emdash/api/auth/oauth/google/callback`
3. Set these as runtime env (local `apps/admin/.env`, production the Altare console), never in the image or the repo:
   - `EMDASH_OAUTH_GOOGLE_CLIENT_ID`, `EMDASH_OAUTH_GOOGLE_CLIENT_SECRET` (EmDash's own names; the ticket's `GOOGLE_OAUTH_*` are not read)
   - `ADMIN_ALLOWED_EMAILS`: comma-separated Google emails, case-insensitive. Empty or unset refuses every Google sign-in.
4. Restart the container. The login page shows "Sign in with Google" (the button is always registered; without the env it ends on a "provider not configured" error).

**How it is enforced** (`src/outer.ts`, `src/google-allowlist.ts`): EmDash's callback runs first, because the email is only known after the token exchange. Afterwards, an account not in `ADMIN_ALLOWED_EMAILS` gets its session destroyed and a redirect to `/_emdash/admin/login?error=oauth_denied`. Any user row or Google link that request created is deleted, so a refused account leaves nothing behind. A pre-existing user (for example an invited editor) is kept, only the new Google link is removed. `email_verified` must be true: EmDash refuses to link an existing user otherwise, and a user created by the refused request is rejected when the flag is 0. Any error in the check fails closed.

**Hardening details**: the callback is recognised on the decoded, normalised path (trailing and double slashes, percent-encoding, dot segments, case) and for every HTTP method (HEAD runs the GET handler). Any other path under `/_emdash/api/auth/oauth/` (other providers, unknown sub-paths, malformed escapes) answers 404. After every callback, success or EmDash error, users created since the request started whose email is not on the list are deleted, so an error after user creation leaves no row. A user counts as created by the request if its `created_at` is at most 5 s before the request start (clock slack); a user on the allow-list is never deleted, and a throw anywhere in the callback denies (session destroyed, `oauth_denied`).

**Before go-live (read-only SQL on the target database)**: `select value from options where name = 'emdash:setup_complete'` must be true, and `select * from allowed_domains where enabled = 1` must return no rows. Otherwise EmDash's callback would self-sign-up strangers (the cleanup above removes them again, but do not rely on it). Finish the passkey setup (section 1/2) before enabling Google on a fresh database: a refused first sign-in on an incomplete setup would still mark setup complete.

**Smoke test**: sign in with an allow-listed account (lands on `/_emdash/admin`), then with a non-listed one (login page error, no session). Check `users` has no new row afterwards.

---

## 5. Publish → Static site rebuild flow

1. Clicking **Publish** in `apps/admin` triggers the `rebuild-on-publish` native plugin (`content:afterPublish` hook).
2. When `SITE_ENV=production` and `GITHUB_DISPATCH_TOKEN` + `GITHUB_DISPATCH_REPO` are set, the plugin sends a `repository_dispatch` (`event_type: "emdash-publish"`, `client_payload: { environment, collection, id, slug }`) to GitHub.
3. GitHub Actions (`web-deploy.yml`) rebuilds the static site from Supabase and deploys the updated assets to Cloudflare Workers.
4. When `SITE_ENV=local` (or unset), dispatch is skipped so local testing never triggers a cloud deployment.

## 5a. Markdown editor for post bodies (GON-249)

The `markdown-editor` native plugin (`apps/admin/src/markdown-editor/`) replaces the plain textarea on `posts.body_md` with CodeMirror 6, a split preview and an **Image** button that opens the EmDash media library (Cloudinary). The stored value is still the raw Markdown string: opening and saving a post changes no bytes. Pure-CRLF posts (21 of them) keep CRLF, and Enter inserts CRLF there.

- **Turn it on.** The field opts in through `_emdash_fields.widget = "markdown-editor:markdownEditor"`. Fresh databases get it from `apply.mjs`. An existing database needs a one-time step after the admin image with the plugin is deployed:
  ```
  node apps/web/scripts/schema/set-body-widget.mjs -u http://localhost:4322 --check   # local: report only
  node apps/web/scripts/schema/set-body-widget.mjs -u http://localhost:4322           # local: set it (dev admin, dev-bypass auth)
  # production: EMDASH_TOKEN and EMDASH_HEADERS (Access service-token headers, one per line) in the environment
  node apps/web/scripts/schema/set-body-widget.mjs -u https://admin.growgen.xyz --yes-remote
  ```
- **Turn it off.** `--revert` puts back the default textarea. If the widget throws, EmDash's error boundary shows the default editor too, so content is never blocked.
- **Preview.** Runs in the browser (`render-browser.ts`, the shared plugin list in `apps/web/src/lib/markdown-shared.ts`), inside an iframe without `allow-scripts`. Embedded `<iframe>`s in a post therefore show without their scripts. Mermaid, KaTeX and Shiki grammars load lazily. `.mdx` bodies use the same rewrite as the public site.
- **Cost (measured 2026-11-27, `docker run --memory=1g --cpus=0.5`, local DB).** Image `/app` 638 → 645 MB. Container RAM idle 45 MiB both before and after; peak while serving every client asset 53 → 58 MiB. Client JS: CodeMirror chunk 163 KB gzip (shared with EmDash's own code editor, now deduped), preview 255 KB gzip on first preview, all admin JS 5.7 → 7.0 MB gzip (the growth is mostly lazy Shiki grammars and Mermaid). No CDN.

---

## 6. Safety rails and access control (INF-9 review fixes)

**Required exposure: Cloudflare Access with origin JWT verification (SEC-08).** Put the hostname behind a Cloudflare Access application and set `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD`. The origin verifies the Access JWT itself (below), so the container's own provider URL or a misrouted port is not an open admin. A Cloudflare Tunnel (`CF_TUNNEL_TOKEN`, section 3) is needed when the host cannot serve the custom hostname, as on Altare.

| Variable | Effect |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` | When `CF_ACCESS_AUD` is set, every request except GET/HEAD on the exact raw paths `/healthz` and `/robots.txt` must carry a valid `Cf-Access-Jwt-Assertion` (RS256, `exp` required, signature from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, issuer = team origin, audience = AUD). The team domain must be `<team>` or `<team>.cloudflareaccess.com`. Otherwise `403`. The check is EmDash's `middleware.outer` (`src/outer.ts`), so it runs before any EmDash middleware: no runtime init, DB lookups, sessions or 302/401 for an unauthenticated request. |
| Production target | Access is mandatory unless the server listens on loopback only. "Production" means `SITE_ENV=production` **or** a `DATABASE_URL` whose project ref (`postgres.<ref>` pooler user) equals `SUPABASE_PRODUCTION_REF`, whatever `SITE_ENV` says (INF-5 rule). Missing or half-configured Access then answers `503` to everything except `/healthz` and `/robots.txt`. `start.mjs` pins `HOST` (default `127.0.0.1`) and exports `ADMIN_REQUIRE_ACCESS=1` for the request-time gate; an unset `HOST` is never treated as loopback. |
| `ADMIN_CONFIRM_PRODUCTION=yes` | Required for any production target (the analogue of `--yes-production` in [`admin.md`](./admin.md)). Without it `scripts/start.mjs` exits 1. |
| `SUPABASE_PRODUCTION_REF` | **Required for any remote database** (fail closed, as in INF-5), and the URL's ref must equal it: there is exactly one remote project (production, `ckpozotzgubrjbjstvjg`), so any other remote database is refused whatever `SITE_ENV` says. `SITE_ENV=testing` is refused outright (retired by INF-10). Production keeps its confirmation (`ADMIN_CONFIRM_PRODUCTION=yes`) and Cloudflare Access requirements. |
| `SITE_ENV=local` with a remote DB | Refused unless `ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL=yes`. `SITE_ENV=production` with a loopback DB is refused too. Only `?sslmode=` is accepted as a URL query parameter (libpq would let `user=`/`host=` override what was checked). `sslmode` itself is **stripped** before connecting, because pg would let it override our TLS settings; a remote URL with `disable`, `no-verify`, `allow` or `prefer` is refused (`require`, `verify-ca`, `verify-full` are accepted and mean "use our computed TLS"). |
| `DATABASE_URL` | Required at runtime, **not** baked into the image (`astro build` only sees a placeholder; missing value fails closed). Pool size 3. |
| `DATABASE_CA_CERT` | Optional; normally leave it unset. TLS to any non-loopback database is **always verified** (verify-full, SEC-09): by default against the Supabase root CA that the image ships at `/app/certs/prod-ca-2021.crt` (copied from `apps/web/scripts/certs/prod-ca-2021.crt`; provenance in supabase.md "Connect"). Set it only to trust a different CA, as a **file path** (a PEM in an env var often arrives with literal `\n`, which is rejected). There is no unverified mode: a blank value, an unreadable file or a missing default CA is a startup error. |
| `ADMIN_RESTART` | Compose restart policy, default `no`. Use `unless-stopped` only for local. |
| `GITHUB_API_URL` | Honoured only when `SITE_ENV=local`; otherwise the real `api.github.com` is used. |

**Same rules without the launcher.** The rules live in `scripts/safety.mjs` and run in three places: `start.mjs` (refuses to start), the runtime pool (`db-config.ts` throws) and `src/outer.ts` (every request except `/healthz` and `/robots.txt` gets 503 on an unsafe configuration, and a production target turns Access on). Running `node dist/server/entry.mjs` directly is therefore no less safe.

**Public assets.** `/_astro/*` build assets are served by the Node adapter before middleware and are not behind Access; they contain no content or secrets.

**Tunnel caveat.** Whether Access is enforced depends on `HOST`, not on where requests come from. The in-container `cloudflared` reaches the server on `localhost`, so keep `HOST=0.0.0.0` (the image default): with `HOST=127.0.0.1` a production target counts as loopback-only and the origin Access check is switched off.

At start `scripts/start.mjs` connects with the runtime `DATABASE_URL` and logs `DB IDENTITY: SITE_ENV=... -> host:port/db (database, role)` (never the password) before the server listens. Check that line in `docker compose logs admin` before editing anything.

Verify a build locally against local Supabase only (never the remote database): `pnpm --filter admin build && pnpm --filter admin smoke`. It checks that `dist/` holds no credential, `/healthz` is 200, `/_emdash/admin/setup` is 404 without `SETUP_TOKEN`, the DB identity is logged, Access enforce mode answers 403 (and misconfigured Access 503) for `/_emdash/admin`, `/_emdash/api/manifest` and `/_emdash/api/auth/me` on the real built server, and the startup refusals above.

The image uses `pnpm --config.inject-workspace-packages=true --filter admin deploy --prod /out` (about 615 MB of `node_modules`, versus about 2.3 GB when the whole workspace was copied), and the root `.dockerignore` keeps `.env*`, `.dev.vars*`, `node_modules`, `.claude`, `src/content` and similar out of the build context.

**Naming secrets:** Astro inlines any env var whose *name* appears as a substring in a file that uses bare `import.meta.env` (including Astro's own runtime). Give secret variables distinctive, prefixed names (never `KEY`, `TOKEN`, `HOST`), and add every new runtime variable to `apps/admin/.env.example` so `pnpm --filter admin check:secrets` canary-tests it.
