# SINT Gateway Server — Multi-stage Docker build.
# Build context must be the repo root (docker-compose sets this automatically).

# ── Stage 1: Install & Build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm i -g pnpm@9.15.0

WORKDIR /app

# Copy workspace config first for better layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./

# Copy package.json files for every workspace package pnpm needs to resolve
COPY packages/core/package.json                    packages/core/
COPY packages/capability-tokens/package.json       packages/capability-tokens/
COPY packages/evidence-ledger/package.json         packages/evidence-ledger/
COPY packages/policy-gateway/package.json          packages/policy-gateway/
COPY packages/persistence/package.json             packages/persistence/
COPY packages/avatar/package.json                  packages/avatar/
COPY packages/bridge-a2a/package.json              packages/bridge-a2a/
COPY packages/bridge-economy/package.json          packages/bridge-economy/
COPY packages/memory/package.json                  packages/memory/
COPY packages/interface-bridge/package.json        packages/interface-bridge/
COPY packages/token-registry/package.json          packages/token-registry/
COPY apps/gateway-server/package.json              apps/gateway-server/

RUN pnpm install --frozen-lockfile

# Copy source trees and build
COPY packages/core/                    packages/core/
COPY packages/capability-tokens/       packages/capability-tokens/
COPY packages/evidence-ledger/         packages/evidence-ledger/
COPY packages/policy-gateway/          packages/policy-gateway/
COPY packages/persistence/             packages/persistence/
COPY packages/avatar/                  packages/avatar/
COPY packages/bridge-a2a/             packages/bridge-a2a/
COPY packages/bridge-economy/          packages/bridge-economy/
COPY packages/memory/                  packages/memory/
COPY packages/interface-bridge/        packages/interface-bridge/
COPY packages/token-registry/          packages/token-registry/
COPY apps/gateway-server/              apps/gateway-server/

RUN pnpm run build

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner

# curl is needed for HEALTHCHECK
RUN apk add --no-cache curl

WORKDIR /app

# Reproduce the minimal pnpm workspace so Node can resolve package aliases
RUN npm i -g pnpm@9.15.0

ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Workspace package manifests
COPY --from=builder /app/packages/core/package.json                    packages/core/
COPY --from=builder /app/packages/capability-tokens/package.json       packages/capability-tokens/
COPY --from=builder /app/packages/evidence-ledger/package.json         packages/evidence-ledger/
COPY --from=builder /app/packages/policy-gateway/package.json          packages/policy-gateway/
COPY --from=builder /app/packages/persistence/package.json             packages/persistence/
COPY --from=builder /app/packages/avatar/package.json                  packages/avatar/
COPY --from=builder /app/packages/bridge-a2a/package.json              packages/bridge-a2a/
COPY --from=builder /app/packages/bridge-economy/package.json          packages/bridge-economy/
COPY --from=builder /app/packages/memory/package.json                  packages/memory/
COPY --from=builder /app/packages/interface-bridge/package.json        packages/interface-bridge/
COPY --from=builder /app/packages/token-registry/package.json          packages/token-registry/
COPY --from=builder /app/apps/gateway-server/package.json              apps/gateway-server/

# Built artefacts
COPY --from=builder /app/packages/core/dist/                    packages/core/dist/
COPY --from=builder /app/packages/capability-tokens/dist/       packages/capability-tokens/dist/
COPY --from=builder /app/packages/evidence-ledger/dist/         packages/evidence-ledger/dist/
COPY --from=builder /app/packages/policy-gateway/dist/          packages/policy-gateway/dist/
COPY --from=builder /app/packages/persistence/dist/             packages/persistence/dist/
COPY --from=builder /app/packages/persistence/migrations/       packages/persistence/migrations/
COPY --from=builder /app/packages/avatar/dist/                  packages/avatar/dist/
COPY --from=builder /app/packages/bridge-a2a/dist/              packages/bridge-a2a/dist/
COPY --from=builder /app/packages/bridge-economy/dist/          packages/bridge-economy/dist/
COPY --from=builder /app/packages/memory/dist/                  packages/memory/dist/
COPY --from=builder /app/packages/interface-bridge/dist/        packages/interface-bridge/dist/
COPY --from=builder /app/packages/token-registry/dist/          packages/token-registry/dist/
COPY --from=builder /app/apps/gateway-server/dist/              apps/gateway-server/dist/

# Install production dependencies only (node_modules for native deps like pg, ioredis)
RUN pnpm install --frozen-lockfile --prod

# Runtime environment defaults (override via docker-compose or -e flags)
ENV SINT_PORT=3100 \
    PORT=3100 \
    SINT_STORE=memory \
    SINT_CACHE=memory \
    SINT_LOG_LEVEL=info \
    DATABASE_URL="" \
    REDIS_URL="" \
    SINT_API_KEY="" \
    SINT_MAX_TIER="T3_COMMIT"

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${SINT_PORT:-3100}/v1/health || exit 1

# Drop to non-root user for runtime
USER node

CMD ["node", "apps/gateway-server/dist/index.js"]
