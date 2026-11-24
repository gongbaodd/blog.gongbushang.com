#!/usr/bin/env bash
# Idempotently defines the full EmDash content model (CMS-1). Thin wrapper over apply.mjs.
#   scripts/schema/apply.sh -u http://localhost:4330 [--check]
#   EMDASH_URL=https://<site> EMDASH_TOKEN=<token> scripts/schema/apply.sh
# Folds in the former add-body-md.sh (posts.body_md).
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/schema/apply.mjs "$@"
