# syntax=docker/dockerfile:1
# Multi-stage production Dockerfile for the EmDash Node admin app (D12, INF-9).
# Build context must be the monorepo root:
#   docker build -f apps/admin/Dockerfile -t growgen-emdash-admin .

FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /workspace

# Copy workspace manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/shiki-plantuml/package.json ./packages/shiki-plantuml/package.json

# Install only the admin workspace dependencies.
RUN pnpm install --filter admin --frozen-lockfile

# Copy admin source and the two shared pure modules from apps/web.
COPY apps/admin ./apps/admin
COPY apps/web/src/lib/cloudinary-media ./apps/web/src/lib/cloudinary-media
COPY apps/web/src/plugins/rebuild-on-publish ./apps/web/src/plugins/rebuild-on-publish

# Build the production standalone Node bundle, then prune devDependencies offline.
RUN pnpm --filter admin build && \
    CI=true pnpm install --filter admin --prod --frozen-lockfile --offline

FROM node:22-alpine AS runner
WORKDIR /app/apps/admin

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4322 \
    SESSION_DIR=/app/apps/admin/.astro/sessions

COPY --from=builder --chown=node:node /workspace/node_modules /app/node_modules
COPY --from=builder --chown=node:node /workspace/apps/admin/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/admin/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/apps/admin/dist ./dist

RUN mkdir -p /app/apps/admin/.astro/sessions /app/apps/admin/.emdash/uploads && \
    chown -R node:node /app

USER node

EXPOSE 4322

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4322) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/entry.mjs"]
