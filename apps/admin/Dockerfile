# syntax=docker/dockerfile:1
# Multi-stage production Dockerfile for the EmDash Node admin app (D12, INF-9).
# Build context must be the monorepo root (see /.dockerignore):
#   docker build -f apps/admin/Dockerfile -t growgen-emdash-admin .
# No DATABASE_URL or other secret is needed (or accepted) at build time: the image is environment-agnostic.

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /workspace

# Workspace manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/shiki-plantuml/package.json ./packages/shiki-plantuml/package.json

RUN pnpm install --filter admin --frozen-lockfile

# Admin source plus the shared pure modules it imports from apps/web.
COPY apps/admin ./apps/admin
COPY apps/web/src/lib/cloudinary-media ./apps/web/src/lib/cloudinary-media
COPY apps/web/src/lib/lockdown.ts ./apps/web/src/lib/lockdown.ts
COPY apps/web/src/lib/setup-gate.ts ./apps/web/src/lib/setup-gate.ts
COPY apps/web/src/lib/site-live.ts ./apps/web/src/lib/site-live.ts
COPY apps/web/src/plugins/rebuild-on-publish ./apps/web/src/plugins/rebuild-on-publish

RUN pnpm --filter admin build

# Only admin's production dependencies, not the whole monorepo.
# (Not --legacy: that variant also drags in the root importer's deps, ~1.9 GB. Verified locally: this gives ~615 MB.)
RUN pnpm --config.inject-workspace-packages=true --filter admin deploy --prod /out

# Cloudflare Tunnel client (GON-212): hosts like Altare give the container only an IP:port, so `admin.growgen.xyz` reaches it
# through an outbound tunnel. Static Go binary, pinned by version and index digest. Started by scripts/start.mjs only when
# CF_TUNNEL_TOKEN is set; otherwise unused.
FROM cloudflare/cloudflared:2026.11.2@sha256:55c7e3e8d89d5e8d20b75a82f3602cbf98e06db406e73e282073cfdc5a9a3af6 AS cloudflared

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4322 \
    SESSION_DIR=/app/.astro/sessions

COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/apps/admin/scripts/start.mjs ./scripts/start.mjs
COPY --from=builder --chown=node:node /workspace/apps/admin/scripts/safety.mjs ./scripts/safety.mjs
COPY --from=builder --chown=node:node /workspace/apps/admin/dist ./dist
# SEC-09: the verified Supabase root CA (provenance: docs/plan/emdash/runbooks/supabase.md "Connect"). safety.mjs uses it for every
# remote database unless DATABASE_CA_CERT names another CA; there is no unverified TLS mode.
COPY --chown=node:node apps/web/scripts/certs/prod-ca-2021.crt ./certs/prod-ca-2021.crt

RUN mkdir -p /app/.astro/sessions /app/.emdash/uploads && chown -R node:node /app

USER node

EXPOSE 4322

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4322) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# start.mjs checks the environment (DATABASE_URL, production confirmation), logs the DB identity, then loads dist/server/entry.mjs.
CMD ["node", "scripts/start.mjs"]
