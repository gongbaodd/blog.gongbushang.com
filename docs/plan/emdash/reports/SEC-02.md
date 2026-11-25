# SEC-02 report (GON-194): .dockerignore and build-time DATABASE_URL

Branch `emdash/SEC-02` from `feat/emdash` (06113427). Most of the story was already in INF-9.

## Already done before this story
- Root `.dockerignore` exists and contains every entry in the ticket list (`.git`, `node_modules`, `**/.env`, `**/.env.*`, `!**/.env.example`, `**/.dev.vars*`, `!**/.dev.vars.example`, `**/*.agekey`, `**/*.dump`, `**/*.dump.age`, `**/dist`, `**/.astro`, `src/content`).
- `apps/admin/astro.config.mjs` passes `PLACEHOLDER_DATABASE_URL` to `postgres()` at build time. The real `DATABASE_URL` is read at runtime, and a missing value throws. This differs from the ticket's `connectionString: ""` wording; the placeholder is what INF-9 chose and it stays.
- Root `.gitignore` already has `.env`, `.env.*`, `!.env.example`, `*.agekey`, `*.dump`, `*.dump.age`, and `.dev.vars*`, so nothing was added there.
- Dockerfile COPY sources (`apps/admin`, the two `apps/web/src/lib` paths, the package manifests) are not matched by any `.dockerignore` pattern.

## Changed in this story
- `apps/admin/scripts/check-no-baked-secrets.mjs` (new): scans `apps/admin/dist` for the three canary markers and prints file paths only.
- `apps/admin/package.json`: adds `check:secrets`.
- This report.

## Checks
- `DATABASE_URL=<canary> pnpm --filter admin build`: exit 0.
- `grep -rl` of `LEAKCHECK_SECRET`, `leakcheck_user`, `db.example.invalid` over `apps/admin/dist`: no matches for any of the three.
- `pnpm --filter admin check:secrets`: OK, 661 files scanned.
- Same script against a planted marker: exit 1, as expected.
- `pnpm --filter admin test`: 34 passed.
- `pnpm --filter admin smoke`: exit 0.

## Not done
- CI does not run `check:secrets` yet. The workflows are owned by builder-infra, so wiring it in is left to them.
- No `docker build` was run here.
- No Scout note exists for SEC-02 (`docs/plan/emdash/scout/` only has S0-x notes).
