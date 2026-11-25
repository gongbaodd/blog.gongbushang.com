# `growgen-colorize` Worker

Standalone, zero-dependency Cloudflare Worker that extracts `{ bgColor, titleColor }` from cover images for post cards — matching the legacy `getColorSet` contract (`bgColor` hex + nearest Mantine CSS variable from `TITLE_COLOR_MAP`) in <2 ms CPU on Workers Free.

## How it works

1. Rewrites Cloudinary URLs (`res.cloudinary.com/<cloud>/image/upload/...`) to a tiny 32×32 PNG thumbnail (`f_png,w_32,h_32,c_limit`).
2. Decodes the PNG in pure TypeScript using the Web standard `DecompressionStream("deflate")` API (supporting color types 0, 2, 3+PLTE/tRNS, 4, 6; filter types 0–4; and Adam7 interlacing).
3. Quantizes pixels via 5-bit RGB median-cut (MMCQ) and scores Vibrant / Muted swatches.
4. Maps the vibrant swatch to the nearest `--mantine-color-*` variable using pure-TS sRGB → CIE Lab (D65) → CIEDE2000.

## HTTP API

| Endpoint | Method | Request | Response |
| --- | --- | --- | --- |
| `/health` | `GET` | — | `200 { "ok": true }` |
| `/colorize` | `POST` | `{ "url": "https://res.cloudinary.com/..." }` | `200 { "bgColor": "#...", "titleColor": "--mantine-color-...", "thumbnailUrl": "..." }` |
| `/colorize` | `GET` | `?url=https://res.cloudinary.com/...` | `200 { "bgColor": "#...", "titleColor": "--mantine-color-...", "thumbnailUrl": "..." }` |

## Environment variables

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `COLORIZE_TOKEN` | Secret (optional) | unset (open) | When set, `/colorize` requires `Authorization: Bearer <token>` (constant-time verified). `/health` stays public. |
| `ALLOWED_HOSTS` | Var (optional) | `res.cloudinary.com` (in `wrangler.jsonc`) | Comma-separated allowlist of permitted image hostnames (supports `*.example.com`). Set to `*` or unset to allow any safe public HTTP(S) host. Private, loopback, link-local, metadata, and non-HTTP(S) URLs are always blocked. |
| `MAX_IMAGE_BYTES` | Var (optional) | `524288` (512 KB) | Hard response body size cap enforced on both `Content-Length` and streamed bytes. |
| `FETCH_TIMEOUT_MS` | Var (optional) | `8000` | Upstream fetch timeout in milliseconds. |

## Local development & verification

```bash
# Run unit tests (from repo root)
pnpm exec vitest run apps/colorize/src/colorize.test.ts

# Typecheck
pnpm --dir apps/colorize typecheck

# Local dev server
pnpm --dir apps/colorize dev

# Bundle dry-run (no remote deploy)
pnpm --dir apps/colorize dry-run
```

## Deploy

```bash
# Optional: configure bearer token secret
pnpm --dir apps/colorize exec wrangler secret put COLORIZE_TOKEN

# Deploy Worker
pnpm --dir apps/colorize deploy
```
