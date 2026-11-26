Research notes by Claude Opus 5.5 for GON-221 (SEC-16), 2026-11-26. Research only: no settings, hooks or secret files were changed or read.

# SEC-16: Keep secrets out of agent transcripts

## Incident

On 2026-11-26 an agent's debugging `grep` printed `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` (from `apps/web/.dev.vars`) and `GITHUB_DISPATCH_TOKEN` (from the repo-root `.env`) into a session transcript. From there a value can reach the model provider, the local transcript store (`~/.claude/projects/...`), agent logs, Linear comments and PR text.

The root cause is not one bad command. Plaintext secret files sit inside the agents' working directory, the agents run as the owner's user, and nothing between the shell and the transcript checks for secrets.

## Current state (verified in this worktree, `origin/feat/emdash` at `72711bc8`)

- Plaintext secret files that exist on disk (names only, from `ls -a` of the main checkout): `/.env`, `apps/web/.env`, `apps/web/.dev.vars.bak-prod-build`, `apps/web/.dev.vars.testing`, `apps/admin/.env`, `apps/admin/.env.production`. `apps/web/.dev.vars` is the normal local file (`.dev.vars.example` documents it); it was absent at the time of listing, probably moved aside by the running production migration. `.dev.vars.testing` belongs to the `testing` environment that INF-10 retired.
- All of them are gitignored (root `.gitignore` lines 21-24 and 42-43, `apps/web/.gitignore`, `apps/admin/.gitignore`). Only `apps/admin/.env.example` and `apps/web/.dev.vars.example` are tracked. Git is not the leak path; the working tree is.
- Consumers of plaintext files:
  - `package.json` `deploy:production:build` runs `set -a && . ./.env`.
  - `apps/web/scripts/admin/start.mjs` (`pnpm admin:local`) reads `apps/web/.dev.vars` and the root `.env` and writes `apps/web/.dev.vars.admin-<env>` (mode 0600). It already redacts through `redact()` in `apps/web/scripts/admin/lib.mjs`.
  - `apps/web/scripts/derive/db.ts` and `apps/web/scripts/gen-types.mjs` read the DB URL from env, then `apps/web/.dev.vars`, then `wrangler.jsonc`.
  - `apps/web/scripts/admin/check-build-env.mjs` reads `.dev.vars` to refuse a local-DB override of a production build.
  - `apps/admin/docker-compose.yml` interpolates every variable from `${VAR}`; the runbook starts it with `docker compose --env-file .env.production up -d`.
- CI already uses GitHub encrypted secrets (`web-ci.yml`, `web-deploy.yml`, `web-guards.yml`). The Worker uses `wrangler secret put`. Neither needs a plaintext file.
- `GITHUB_DISPATCH_TOKEN` lives in the root `.env`, `apps/admin/.env*`, possibly `apps/web/.dev.vars`, and optionally as a `growgen-web` Worker secret (`runbooks/deploy-production.md`). `CLOUDINARY_*` lives in `apps/web/.dev.vars`, `apps/admin/.env*` and the GitHub repository secrets used by `cloudinary-usage` (`runbooks/backups.md`). It is not a Worker secret.
- Harness: `~/.claude/settings.json` has no `permissions.deny` rules and no `sandbox` block. Existing hooks there come from plugins. The repo has no `.claude/settings.json` and no `.agents/hooks.json`. agy is run through the cc-suite runner with `--sandbox read-only`, which still allows reads.
- The repository is **public**, so encrypted secret files must not be committed casually (see the dotenvx notes).
- `gen-types.mjs` accepts `-t/--token` for `EMDASH_TOKEN`. A secret on argv lands in the transcript and in `ps`. Docs show `gh secret set NAME --body "..."` (with a public age key, which is harmless, but the pattern is copied for real secrets).

## Recommendation

1. **Rotate the three exposed credentials now** (plan below). Treat them as burned regardless of the other steps.
2. **No plaintext secrets in the working tree.** Use **dotenvx** (BSD-3-Clause, free, no account, no hosted service) to encrypt the files in place, with the private keys kept **outside the repo** (`~/.config/growgen/dotenvx.keys`, mode 0600, backed up in the owner's existing password manager). Commands that need secrets run as `dotenvx run -fk ~/.config/growgen/dotenvx.keys -f <file> -- <cmd>`, so plaintext only exists in the child process's environment. Replace `apps/web/.dev.vars` with process-env injection through wrangler's `secrets.required`.
3. **Make the agent unable to decrypt.** Turn on the Claude Code sandbox with `filesystem.denyRead` for the keys file and any remaining plaintext secret file, with `allowUnsandboxedCommands: false`. This is OS-level (Seatbelt on macOS) and also covers `node`/`python` subprocesses and `grep -r .`, which permission rules miss. Add `Read(...)` deny rules for the built-in tools, which the sandbox does not cover.
4. **Hooks as defence in depth**: a PreToolUse hook that denies commands which name secret files or print secrets (`dotenvx get|decrypt`, `printenv`, bare `env`, `docker inspect`, ...), and a PostToolUse hook that redacts known secret values and token patterns through `updatedToolOutput`. Mirror the PreToolUse hook and deny rules for agy. agy has no output redaction, so it gets no secret-bearing tasks.
5. **Canary scan of agent logs**, reusing the `check-no-baked-secrets.mjs` pattern: scan transcripts for the real values (inside a `dotenvx run` child) and print only file paths and variable names. Add `gitleaks` (free, open source) for pattern-based finds.
6. **Script hygiene**: secrets only via env or stdin, never argv, never echoed.

Why dotenvx and not a hosted manager: the threat is a process running as the same user, not a stolen laptop. Every option below ends with a decryption key or access token that the owner's shell can read. What protects that key is the sandbox in step 3, not the vendor. dotenvx adds no account, no network dependency, no free-tier cap, and no new place to leak a token. GitHub Actions and Workers already have native free secret stores, so a hosted manager would add a third copy, not remove one. If the owner later wants one source of truth across machines, Bitwarden Secrets Manager Free is the fallback (see the comparison).

1Password is excluded: it has no free plan (14-day trial, then $2.99-3.99/month for Individual), which breaks the free-plans-only rule.

## Secret managers compared (free tiers only)

| Option | Free tier (checked 2026-11-26) | wrangler (`.dev.vars`) | Docker (`apps/admin`) | GitHub Actions | Solo ergonomics | Agent exposure left |
| :- | :- | :- | :- | :- | :- | :- |
| **dotenvx** | Open source, BSD-3-Clause; no account. The optional hosted "ops" products are not needed. | `dotenvx run -- wrangler dev` / `astro dev`, with secrets declared in `secrets.required` (or `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` when no `.dev.vars` exists). | `dotenvx run -f apps/admin/.env.production -- docker compose up -d`; compose already reads every `${VAR}` from the process env, so `--env-file` goes away. | Not needed; keep GitHub secrets. Possible: one `DOTENV_PRIVATE_KEY_*` secret plus `dotenvx run`. | Very good: same file layout, works offline, one binary (`npm i -D @dotenvx/dotenvx` or brew). | The keys file. `dotenvx get` and `decrypt --stdout` print plaintext, so they must be hook-blocked and the keys file sandbox-denied. |
| **Bitwarden Secrets Manager** | Free: 2 users, 3 projects, 3 machine accounts, unlimited secrets (help center and FAQ; the business pricing page now shows only Teams/Enterprise, so recheck at signup). | `bws run -- wrangler dev`. | `bws run -- docker compose up -d`. | `bitwarden/sm-action`, needs one machine-account token as a GitHub secret. | Good: hosted, one source for several machines. 3 projects cover local / production / CI. | `BWS_ACCESS_TOKEN` must live somewhere the shell can read; same sandbox problem. `bws secret get` prints values. |
| **Doppler** | Developer (free): 10 projects, 4 environments, 50 service tokens, 3-day activity log; "free for 3 users" (the comparison table says 25, inconsistent). | `doppler run -- wrangler dev`; has Cloudflare sync integrations. | `doppler run -- docker compose up`. | Official action / sync. | Good, polished CLI. | CLI token in the OS keyring or config; `doppler secrets get` prints. 3-day log is weak for incident review. Extra vendor. |
| **Infisical Cloud** | Free: 5 identities (humans and machines share the cap), unlimited projects, 3 environments, 10 secret syncs, **no secret versioning**. | `infisical run -- wrangler dev`. | `infisical run -- docker compose up`. | Official action (machine identity). | OK; no versioning means no rollback after a bad edit. | Same token problem. |
| **1Password CLI** (`op run`, `op://`) | **No free plan.** Excluded. | Would be the best fit (biometric unlock per session gives a human gate). | `op run`. | `1password/load-secrets-action`. | Excellent. | Paid. |

Notes:
- With any of these the leak moves from "file in the repo" to "key or token on disk". On a single-user Mac only the OS sandbox (or a human unlock prompt, which only 1Password offers out of the box) stops a same-user agent process from using it.
- A macOS Keychain item read by `security find-generic-password -w` is not a gate either: the `security` binary is on the item's ACL by default, so the agent can call it. Block that command in the hook if the keys are ever moved there.

## Harness guardrails

### Claude Code (verified against code.claude.com docs, 2026-11-26)

- **Permission deny rules** (`permissions.deny`): `Read(path)` rules use gitignore semantics; bare names match at any depth (`Read(.env)` equals `Read(**/.env)`), and `!` negations carve out exceptions within the same settings source. They block the built-in Read tool and, best effort, Grep/Glob, `@file` mentions and IDE context. They also block Edit/Write on the same path. For Bash they cover redirections and recognized file commands (`cat`, `head`, `tail`, `sed`, `tee`). **They do not cover** `grep -r pattern .`, or any script (`node`, `python`, `pnpm`) that opens the file itself. That gap is how the incident happened.
- **Sandbox** (`sandbox.enabled`, `sandbox.filesystem.denyRead`, or `sandbox.credentials.files` with `mode: "deny"`): OS-level on macOS (Seatbelt) and Linux/WSL2 (bubblewrap); it applies to the command and every child process. It does not cover the built-in Read tool (use deny rules), hooks, local MCP servers, or `excludedCommands`. Claude can retry a failed command with `dangerouslyDisableSandbox`; set `sandbox.allowUnsandboxedCommands: false` (or add an ask rule `Bash(dangerouslyDisableSandbox:true)`) and `failIfUnavailable: true`. Blocking a path for the sandbox also blocks the owner's own agent-run builds that need it, which is why plaintext files have to go first.
- **PreToolUse hook**: exit 2, or JSON `hookSpecificOutput.permissionDecision: "deny"` with a reason. Deny rules still apply whatever the hook returns. Set `onFailure: "block"` so a timed-out hook fails closed. Matchers: `Bash`, `Read`, `Grep`, `Glob`. A text match is bypassable (variables, `sh -c`, base64), so the hook is a speed bump on top of the sandbox, not the control itself.
- **PostToolUse hook**: `hookSpecificOutput.updatedToolOutput` replaces the output **before it is sent to Claude**, for built-in tools too (the Bash shape is `{stdout, stderr, interrupted, isImage}`; a value that does not match the tool's schema is ignored and the original is used). Caveats from the docs: the command has already run; OpenTelemetry/analytics capture the original output; whether the local transcript JSONL keeps the original is not documented. Treat redaction as a backstop for the model provider, not as a guarantee for the local transcript. Hooks run outside the sandbox, so the redaction hook can itself decrypt the value list (`dotenvx run ... node redact.mjs`) without exposing it to the model.

Proposed project settings (for the follow-up ticket; not applied):

```jsonc
// .claude/settings.json
{
  "permissions": {
    "deny": [
      "Read(.env)", "Read(.env.*)", "Read(!.env.example)",
      "Read(.dev.vars)", "Read(.dev.vars.*)", "Read(!.dev.vars.example)",
      "Read(.env.keys)", "Read(~/.config/growgen/**)"
    ],
    "ask": ["Bash(dangerouslyDisableSandbox:true)"]
  },
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false,
    "filesystem": { "denyRead": ["~/.config/growgen/**"] }
  },
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash|Read|Grep|Glob", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PROJECT_DIR}/scripts/agent-guard/pre.mjs", "onFailure": "block" }] }],
    "PostToolUse": [{ "matcher": "Bash|Read|Grep", "hooks": [{ "type": "command", "command": "node ${CLAUDE_PROJECT_DIR}/scripts/agent-guard/post-redact.mjs" }] }]
  }
}
```

Verify on the installed version before relying on it: the `!` carve-out order, `onFailure` (needs v2.1.295+), and that the sandbox still lets `pnpm`, `wrangler`, `docker` and `supabase` reach their sockets and caches (they may need `excludedCommands`, which reopens the hole for those commands, or network allowances).

The PreToolUse guard should deny when the command or path:
- names a secret file: `(^|/)\.env($|\.)` except `.env.example`, `\.dev\.vars` except `.dev.vars.example`, `.env.keys`, `dotenvx.keys`, `~/.config/growgen`;
- prints secrets: `dotenvx (get|decrypt)`, `printenv`, bare `env` or `export -p`/`set` without arguments, `docker (inspect|exec .* env)`, `docker compose config` (prints interpolated values), `security find-generic-password .*-w`, `bws secret get`, `doppler secrets`, `wrangler secret` subcommands other than `list`;
- recursively searches the repo without excluding secret files (`grep -r`, `rg -uu`, `rg --hidden`, `rg --no-ignore`). Plain `rg` respects `.gitignore` and skips them.

### Antigravity CLI (agy) (verified against antigravity.google docs, 2026-11-26)

- **Permissions**: `~/.gemini/antigravity-cli/settings.json` → `permissions.allow|ask|deny` with `action(target)` rules, e.g. `read_file(.env)`, `command(sudo)`. A `read_file` deny also blocks `write_file` on that path. `read_file` defaults to ask, but workspace files are auto-allowed, and a forum report (CLI 1.1.1) says `.env` was read without asking. The docs do not say `read_file` denies apply to `command(cat .env)`; command rules are prefix matches, so they are weak.
- **Terminal sandbox**: on by default in Auto mode (macOS/Linux from v1.3.5). The docs say "sensitive files such as `~/.ssh` and `.env` are blocked", but give no way to extend that list. `.dev.vars` and `.env.production` coverage is unverified, and project folders are mounted read-write.
- **Hooks**: `.agents/hooks.json` (workspace; this repo already tracks `.agents/`) or `~/.gemini/config/hooks.json` (global). `PreToolUse` with a `matcher` on the tool name (e.g. `run_command`) can return `{"decision": "deny", "reason": "..."}`. `PostToolUse` **cannot change tool output** (its stdout is `{}`), so agy has no redaction.
- Plan: commit `.agents/hooks.json` that calls the same guard script (with an agy output adapter), add `read_file` denies for the same paths in the owner's global settings, and keep agy on review-only tasks that never need secrets. The cc-suite runner's `--sandbox read-only` does not stop reads.

## Tooling changes

- **Secrets via env or stdin only.** Remove argv secrets: `gen-types.mjs -t/--token` becomes env-only (`EMDASH_TOKEN`). Runbooks use `gh secret set NAME < file` or an interactive prompt, and `wrangler secret put NAME` (it prompts or reads stdin), never `--body`/`echo ... |` with a literal value.
- **Never echo.** Keep the `start.mjs` pattern: print variable names and `redact()`ed text only. Move `redact()` from `apps/web/scripts/admin/lib.mjs` into a small shared module so the derive, gen-types and admin scripts and the redaction hook share it. Extend it with token patterns (`github_pat_`, `ghp_`, `cloudinary://`, `postgres(ql)://user:pass@`).
- **Stop reading `.dev.vars` directly.** `derive/db.ts`, `gen-types.mjs` and `check-build-env.mjs` already prefer env; once `.dev.vars` is gone they need no file read. `check-build-env.mjs` can keep its guard by checking that no `.dev.vars*` exists.
- **Canary scan of agent logs** (`pnpm check:agent-logs`), modelled on `apps/admin/scripts/check-no-baked-secrets.mjs`:
  - It runs inside `dotenvx run` for every encrypted file, builds needles from every non-`PUBLIC_` value at least 8 characters long (and its URL-encoded form, as the canary script does), and scans `~/.claude/projects/**/*.jsonl`, the cc-suite job store, the agy session directory (path to be confirmed), and `tmp/`.
  - It prints only `file:line (VARIABLE_NAME)`, never values, and exits 1 on any hit. The canary script's `.env.example` name parsing and "file paths and variable names only" rule carry over directly.
  - Pair it with `gitleaks dir` (free, open source) over the same directories for credentials that are not in our files.
  - Run it from a `SessionEnd`/`Stop` hook (outside the sandbox) and before posting anything to Linear.
- **Existing `check:secrets` stays as is.** It answers a different question (baked into the build output); the shared pieces are the needle builder and the reporting format.

## Migration plan

Order matters: rotate first, encrypt next, then turn on the sandbox (turning it on first breaks builds that still read plaintext files).

### Phase 0: rotate (owner, now)
See the rotation plan below.

### Phase 1: root `/.env` (production ops values)
1. `pnpm add -Dw @dotenvx/dotenvx` (pin the exact version).
2. `mkdir -p ~/.config/growgen && chmod 700 ~/.config/growgen`.
3. Owner, in a terminal outside any agent session: `dotenvx encrypt -f .env -fk ~/.config/growgen/dotenvx.keys`. Copy the private key into the owner's password manager as the backup.
4. Change `deploy:production:build` from `set -a && . ./.env && set +a && ...` to `dotenvx run -f .env -fk ~/.config/growgen/dotenvx.keys -- sh -c '...'`. Same for `start.mjs`: read the root file through `dotenvx run` (or the dotenvx `config()` API with the keys path) instead of `parseEnvText` on plaintext.
5. Keep `.env` gitignored. The repo is public, so do not commit even the ciphertext: if a key ever leaks, git history keeps every old secret decryptable. Revisit only if multi-machine sync becomes necessary.

### Phase 2: `apps/web/.dev.vars` and `apps/web/.env`
1. Split values: non-secret local defaults (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` for local Supabase, `SITE_ENV=local`) move to `wrangler.jsonc` `vars` / `hyperdrive.localConnectionString` or to the scripts; they are not secrets.
2. Real secrets (`EMDASH_ENCRYPTION_KEY` for local, `CLOUDINARY_*`, `GITHUB_DISPATCH_*`, `SETUP_TOKEN`) go into an encrypted `apps/web/.env.local.secrets`, a name wrangler does not auto-load. Declare them in `wrangler.jsonc` `secrets.required`, which loads listed keys from `process.env` (Cloudflare docs). Run dev as `dotenvx run -f .env.local.secrets -fk ... -- astro dev`. Spike first: confirm that `@astrojs/cloudflare` 14's dev path honours `secrets.required` from `process.env`; the fallback is `CLOUDFLARE_INCLUDE_PROCESS_ENV=true` (only applies when no `.dev.vars` exists).
3. Rework `start.mjs`: today it writes a plaintext `.dev.vars.admin-<env>` because `.dev.vars` beats process env. With no `.dev.vars` at all, it can pass the values as process env to the child. If wrangler still needs a file, write it to a private temp dir outside the repo and delete it on `admin:stop`.
4. Remove `apps/web/.env` if it only holds `create emdash` output that is now in the encrypted file. Delete `apps/web/.dev.vars.testing` (testing environment retired by INF-10) and `.dev.vars.bak-prod-build` after the owner confirms nothing in them is still needed.
5. Make `.dev.vars` absence the norm: `check-build-env.mjs` fails if any `apps/web/.dev.vars*` other than the example exists.

### Phase 3: `apps/admin/.env` and `apps/admin/.env.production`
1. Encrypt both in place: `dotenvx encrypt -f apps/admin/.env.production -fk ~/.config/growgen/dotenvx.keys`.
2. Start with `dotenvx run -f apps/admin/.env.production -fk ... -- docker compose up -d`. `docker-compose.yml` already takes every value from `${VAR}`, so it needs no change; drop `--env-file` from `runbooks/admin-docker.md`.
3. Remaining exposure: environment variables are visible through `docker inspect` and `docker exec ... env`, so the hook blocks those. Optional later step: compose `secrets:` (sourced from the environment) mounted at `/run/secrets/*`, with `safety.mjs` reading `*_FILE`; that is an app change, so it is its own ticket.

### Phase 4: harness on
Add the project `.claude/settings.json` (deny rules, sandbox, hooks) and `.agents/hooks.json`, run a red-team checklist (`cat .env`, `grep -r CLOUDINARY .`, `node -e "readFileSync('.env')"`, `dotenvx get`, `printenv`, `docker inspect`), and confirm that each one is blocked or returns ciphertext only.

### Phase 5: CI and Workers
No change needed: GitHub encrypted secrets and `wrangler secret put` already keep values out of files. Add `::add-mask::` for any value a step derives from a secret (for example a URL built from `DATABASE_POOLER_URL`).

## Rotation plan

### Now (the three exposed values)
1. **Cloudinary key and secret** (they are one pair; rotate together). Cloudinary Console → Settings → API Keys → Generate New API Key (an emailed verification code is required). Update every consumer: `apps/web` local secrets, `apps/admin/.env` and `.env.production`, and the GitHub repository secrets `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (`gh secret set NAME`, value from stdin). Check whether the old key is the webhook key; if so, assign the new one first. Verify an upload from the Docker admin and a `cloudinary-usage` run in `web-guards`, then **disable** the old key, and delete it a week later.
2. **`GITHUB_DISPATCH_TOKEN`** (fine-grained PAT). GitHub → Settings → Developer settings → Fine-grained tokens: create a new token, scoped to `gongbaodd/blog.gongbushang.com` only, `Contents: write` only, with a 90-day expiry. Update the root `.env`, `apps/admin/.env*`, `apps/web` local secrets and, if it is set, the `growgen-web` Worker secret (`wrangler secret put GITHUB_DISPATCH_TOKEN -c wrangler.jsonc`, value from the prompt). Verify one publish dispatch (an `emdash-publish` run appears in Actions), then **revoke** the old token. Check the repo's Actions history and the account security log for dispatches the owner did not make between exposure and revocation.
3. **Transcript clean-up.** Locate the session JSONL under `~/.claude/projects/-Volumes-MacData-github-blog-gongbushang-com/` that contains the grep output (use the canary scanner once it exists, or search for the old values in an owner-run terminal) and delete or redact it. Check that no Linear comment, PR or report quoted the output. Values sent to the model provider cannot be recalled; rotation is the remedy for that.
4. **Out of scope for rotation:** `EMDASH_ENCRYPTION_KEY` / `EMDASH_PRODUCTION_ENCRYPTION_KEY` must not be rotated (stored plugin settings are encrypted with it, per `runbooks/deploy-production.md`). It was not reported as exposed. It is the strongest reason to finish Phases 1-4, because it cannot be fixed by rotation.

### Future exposures (runbook)
1. Treat any value seen in tool output as exposed. Stop the session and do not paste the output anywhere.
2. Run `pnpm check:agent-logs` to list every file and variable hit.
3. Rotate with the per-secret steps above (add Supabase DB password reset and Cloudflare API token roll as they become relevant), in this order: create new → update consumers → verify → revoke old.
4. Re-encrypt the affected dotenvx file (`dotenvx set KEY` reads the value from a prompt or stdin; do not pass it on argv).
5. Purge the hit transcripts, record the incident in `docs/plan/emdash/knowledge.md`, and add the command that leaked to the PreToolUse guard's block list.
6. Calendar: a 90-day PAT expiry reminder; review the Cloudinary keys and Worker secrets on the same cadence.

## Proposed follow-up tickets

1. **[SEC-16a] Rotate exposed Cloudinary key pair and GitHub dispatch PAT**: new keys, update every consumer, verify, revoke the old ones, purge the leaking transcript, check the Actions log.
2. **[SEC-16b] Adopt dotenvx for the root `.env`**: add the pinned dependency, keys file outside the repo, rewrite `deploy:production:build` and the root-file reads in `start.mjs` to use `dotenvx run`.
3. **[SEC-16c] Replace `apps/web/.dev.vars` with process-env injection**: spike `secrets.required` with `@astrojs/cloudflare` 14, move non-secrets into `wrangler.jsonc`, encrypt the rest, rework the `start.mjs` generated file, delete the stale `.dev.vars.*` files.
4. **[SEC-16d] Encrypt `apps/admin/.env*` and start compose through `dotenvx run`**: drop `--env-file`, update `runbooks/admin-docker.md`.
5. **[SEC-16e] Claude Code guardrails**: project `.claude/settings.json` with `Read` deny rules and a sandbox `denyRead` with no unsandboxed escape, verified against pnpm/wrangler/docker/supabase.
6. **[SEC-16f] Agent guard hooks**: shared `pre.mjs` (block secret paths and secret-printing commands, fail closed) and `post-redact.mjs` (`updatedToolOutput` redaction), with vitest cases for the bypass list.
7. **[SEC-16g] Antigravity guardrails**: `.agents/hooks.json` PreToolUse deny using the same guard, `read_file` denies in the owner's agy settings, a rule that agy gets no secret-bearing tasks.
8. **[SEC-16h] Agent-log canary scanner**: `check:agent-logs` (known values via `dotenvx run`, names-only output) plus `gitleaks dir`, run from a SessionEnd hook and before Linear posts.
9. **[SEC-16i] Script hygiene**: env-only `EMDASH_TOKEN` in `gen-types.mjs`, a shared `redact()` with token patterns, and runbooks switched to stdin/prompt secret entry.
10. **[SEC-16j] Optional: Docker secrets for `apps/admin`**: compose `secrets:` and `*_FILE` support in `safety.mjs`, so values are not visible through `docker inspect`.

## Sources

- Claude Code permissions (Read deny scope, Bash gap): https://code.claude.com/docs/en/permissions
- Claude Code hooks (PreToolUse deny, PostToolUse `updatedToolOutput`, caveats): https://code.claude.com/docs/en/hooks
- Claude Code sandboxing (`denyRead`, `allowUnsandboxedCommands`, subprocess coverage): https://code.claude.com/docs/en/sandboxing
- Antigravity permissions: https://antigravity.google/docs/permissions.md ; sandbox: https://antigravity.google/docs/sandbox.md ; hooks: https://antigravity.google/docs/hooks.md
- Antigravity `.env` forum report: https://discuss.ai.google.dev/t/antigravity-cli-workspace-permission-vs-env-permission/174516
- Wrangler local env (`.dev.vars`, `.env`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `secrets.required`): https://developers.cloudflare.com/workers/configuration/environment-variables/
- dotenvx (license, encrypt/run/get/decrypt): https://github.com/dotenvx/dotenvx ; `-fk`: https://dotenvx.com/docs/cli/get-key-fk
- Bitwarden Secrets Manager plans: https://bitwarden.com/help/secrets-manager-plans ; pricing: https://bitwarden.com/pricing/business/
- Doppler pricing: https://www.doppler.com/pricing
- Infisical pricing: https://infisical.com/pricing
- 1Password pricing: https://1password.com/pricing/password-manager
- Cloudinary key rotation: https://cloudinary.com/documentation/ts_how_to_rotate_api_keys_in_the_console
