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

# Admin source plus the two shared pure modules it imports from apps/web.
COPY apps/admin ./apps/admin
COPY apps/web/src/lib/cloudinary-media ./apps/web/src/lib/cloudinary-media
COPY apps/web/src/lib/lockdown.ts ./apps/web/src/lib/lockdown.ts
COPY apps/web/src/plugins/rebuild-on-publish ./apps/web/src/plugins/rebuild-on-publish

RUN pnpm --filter admin build

# Only admin's production dependencies, not the whole monorepo.
# (Not --legacy: that variant also drags in the root importer's deps, ~1.9 GB. Verified locally: this gives ~615 MB.)
RUN pnpm --config.inject-workspace-packages=true --filter admin deploy --prod /out

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4322 \
    SESSION_DIR=/app/.astro/sessions

COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/apps/admin/scripts/start.mjs ./scripts/start.mjs
COPY --from=builder --chown=node:node /workspace/apps/admin/dist ./dist

RUN mkdir -p /app/.astro/sessions /app/.emdash/uploads && chown -R node:node /app

USER node

EXPOSE 4322

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4322) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# start.mjs checks the environment (DATABASE_URL, production confirmation), logs the DB identity, then loads dist/server/entry.mjs.
CMD ["node", "scripts/start.mjs"]
