#!/usr/bin/env bash
# Adds the raw-Markdown body field to the posts collection (D5, S0-4).
# Needs a running dev server (default http://localhost:4322); idempotent failure if it already exists.
# The CLI has no --options flag, so the textarea `rows` option must be set in the admin or the seed.
set -euo pipefail
cd "$(dirname "$0")/../.."
URL="${EMDASH_URL:-http://localhost:4322}"
pnpm exec emdash schema add-field posts body_md --type text --label "Body (Markdown)" -u "$URL"
