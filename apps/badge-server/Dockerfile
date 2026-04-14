FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/badge-server/package.json apps/badge-server/

RUN pnpm install --frozen-lockfile

COPY apps/badge-server/ apps/badge-server/

RUN pnpm --filter @pshkv/badge-server build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache curl
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --from=builder /app/apps/badge-server/package.json apps/badge-server/
COPY --from=builder /app/apps/badge-server/dist/ apps/badge-server/dist/

RUN pnpm install --frozen-lockfile --prod

ENV PORT=3200

EXPOSE 3200

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3200}/health || exit 1

USER node

CMD ["node", "apps/badge-server/dist/server.js"]
