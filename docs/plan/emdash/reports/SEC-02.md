# SEC-02 report (GON-194): .dockerignore, build-time DATABASE_URL, and bake guards

Branch `emdash/SEC-02` from `feat/emdash` (06113427). INF-9 had already done most of the story.

## Already done before this story
- Root `.dockerignore` contained every entry in the ticket list.
- `apps/admin/astro.config.mjs` passes `PLACEHOLDER_DATABASE_URL` at build time. The real `DATABASE_URL` is read at runtime and fails closed. This differs from the ticket's `connectionString: ""` wording. The placeholder is what INF-9 chose, and it stays.
- Root `.gitignore` already covers `.env*`, `*.agekey`, `*.dump`, `*.dump.age` and `.dev.vars*`.

## Changed
- `apps/admin/src/middleware.ts`: `import.meta.env?.X` becomes `import.meta.env.X`. The `?.` form made Astro inline every private variable in the file, including `SETUP_TOKEN` and the build machine's `NODE` path.
- `apps/admin/scripts/check-import-meta-env.mjs` (new): fails on any `import.meta.env` not followed by `.`, under `apps/admin/src` and the shared `apps/web` files the admin image compiles.
- `apps/admin/scripts/check-no-baked-secrets.mjs` (rewritten, self-contained): builds into a temp `outDir` with a random canary for each private variable in `.env.example` plus the secret-bearing names, and for the parts of `DATABASE_URL`. It scans the output and the build log, including URL-encoded forms. It prints file paths and variable names only.
- `apps/admin/package.json`: `check:secrets` runs the static guard, then the canary build.
- `.github/workflows/admin-ci.yml` (new): typecheck, test, build, `check:secrets` and smoke, with a `postgres:17` service. No secrets. Actions are pinned by SHA (checkout `11d5960a`, setup-node `49933ea5`, pnpm/action-setup `b906affc`). `actionlint` passes.
- `.dockerignore`: adds `**/*.pem`, `**/*.crt`, `**/*.key`, `**/*.p12`, `**/.npmrc`, `**/.envrc`, `**/.emdash`, `**/uploads`, `**/*.sql`, `**/*.sql.gz`. No Dockerfile COPY source is affected. The only tracked matches are Supabase migrations, and `supabase/` is already excluded.
- `docs/plan/emdash/runbooks/admin-docker.md`: states that `PUBLIC_*` and `EMDASH_SITE_URL` are baked by design, so a secret must never sit behind those names.

## Exemption
- `PORT` is excluded from the canary set. A dependency references `import.meta.env.PORT`, so Astro inlines its build-time value. It is a listen port, not a credential. This is the only hit the canary build found, and it appeared once the `?.` fix was in place.

## Checks
- `pnpm --filter admin build`: exit 0.
- `pnpm --filter admin typecheck`: 0 errors.
- `pnpm --filter admin test`: 34 passed.
- `pnpm --filter admin check:secrets`: guard OK (20 files). Canary build OK (661 files, 24 canaries, no hits).
- `pnpm --filter admin smoke`: 36 ok, 0 failures, against local Supabase.
- The three ticket greps (`LEAKCHECK_SECRET`, `leakcheck_user`, `db.example.invalid`) over `apps/admin/dist`: no matches.
- The guard regex flags the old `import.meta.env?.DEV` line and passes the fixed one.

## Not verified
- The `admin-ci.yml` job has not run on GitHub. Docker's daemon was down here, so smoke was not run against an empty `postgres:17` container. Smoke ran against local Supabase instead.
- The `postgres:17` service image is referenced by tag, not digest.
- `.dockerignore` is checked by reading the patterns, not with `docker build`.
