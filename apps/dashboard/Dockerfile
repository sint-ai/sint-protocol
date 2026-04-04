# SINT Dashboard — Multi-stage Docker build.
# Builds the React SPA and serves it with a lightweight nginx container.

# ── Stage 1: Build ──
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace root files for pnpm resolution
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy actual package.json files from all workspace packages
# (pnpm needs the full workspace graph to resolve dependencies correctly)
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/core/package.json packages/core/
COPY apps/gateway-server/package.json apps/gateway-server/
COPY apps/sint-mcp/package.json apps/sint-mcp/
COPY packages/capability-tokens/package.json packages/capability-tokens/
COPY packages/evidence-ledger/package.json packages/evidence-ledger/
COPY packages/policy-gateway/package.json packages/policy-gateway/
COPY packages/bridge-mcp/package.json packages/bridge-mcp/
COPY packages/bridge-ros2/package.json packages/bridge-ros2/
COPY packages/persistence/package.json packages/persistence/
COPY packages/client/package.json packages/client/
COPY packages/conformance-tests/package.json packages/conformance-tests/

RUN pnpm install --frozen-lockfile --filter @sint/dashboard...

# Copy dashboard source
COPY apps/dashboard/ apps/dashboard/

# Build-time env vars (optional, baked into the SPA bundle)
ARG VITE_GATEWAY_URL=""
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

# Build the SPA
RUN cd apps/dashboard && pnpm build

# ── Stage 2: Serve with nginx ──
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html

# Custom nginx config for SPA routing + API proxy
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3201

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3201/ || exit 1
