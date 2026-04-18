# SINT Dashboard — Multi-stage Docker build.
# Builds the React/Vite SPA and serves it with nginx.
# Build context must be the repo root (docker-compose sets this automatically).

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm i -g pnpm@9.15.0

WORKDIR /app

# Workspace root manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./

# Package manifests for the full workspace graph that pnpm needs to resolve
COPY apps/dashboard/package.json              apps/dashboard/
COPY packages/core/package.json               packages/core/
COPY packages/capability-tokens/package.json  packages/capability-tokens/
COPY packages/evidence-ledger/package.json    packages/evidence-ledger/
COPY packages/policy-gateway/package.json     packages/policy-gateway/
COPY packages/persistence/package.json        packages/persistence/
COPY packages/avatar/package.json             packages/avatar/
COPY packages/bridge-a2a/package.json         packages/bridge-a2a/
COPY packages/bridge-economy/package.json     packages/bridge-economy/
COPY apps/gateway-server/package.json         apps/gateway-server/

# Install only dependencies needed for the dashboard
RUN pnpm install --frozen-lockfile --filter @sint/dashboard...

# Copy dashboard source
COPY apps/dashboard/ apps/dashboard/

# Optional build-time variable: bake a custom gateway URL into the SPA bundle.
# Example: docker build --build-arg VITE_GATEWAY_URL=https://gateway.example.com
ARG VITE_GATEWAY_URL=""
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL

RUN cd apps/dashboard && pnpm build

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy built SPA assets
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html

# nginx config handles SPA routing + reverse-proxy to the gateway
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3201

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3201/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
