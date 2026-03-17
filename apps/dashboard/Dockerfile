# SINT Dashboard — Multi-stage Docker build.
# Builds the React SPA and serves it with a lightweight nginx container.

# ── Stage 1: Build ──
FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy just the dashboard package for layer caching
COPY apps/dashboard/package.json apps/dashboard/
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Create minimal workspace structure for pnpm
RUN mkdir -p packages/core apps/gateway-server apps/sint-mcp && \
    echo '{"name":"@sint/core","version":"0.1.0"}' > packages/core/package.json && \
    echo '{"name":"@sint/gateway-server","version":"0.1.0"}' > apps/gateway-server/package.json && \
    echo '{"name":"@sint/mcp","version":"0.1.0"}' > apps/sint-mcp/package.json

RUN pnpm install --frozen-lockfile --filter @sint/dashboard

# Copy dashboard source
COPY apps/dashboard/ apps/dashboard/

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
