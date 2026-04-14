FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable

# Copy the minimal workspace surface needed to build and run sint-mcp.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/sint-mcp ./apps/sint-mcp
COPY packages ./packages

RUN pnpm install --frozen-lockfile && pnpm --filter sint-mcp build

USER node

CMD ["node", "apps/sint-mcp/dist/index.cjs", "--stdio"]
