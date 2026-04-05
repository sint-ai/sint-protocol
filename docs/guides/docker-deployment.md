# Docker Deployment Guide

This guide covers running the full SINT stack (gateway, dashboard, PostgreSQL, Redis) with Docker Compose.

## Quick Start

```bash
# Clone and enter the repo
git clone https://github.com/your-org/sint-protocol.git
cd sint-protocol

# Build images and start all services
docker compose up --build

# Or run in the background
docker compose up --build -d
```

Services will be available at:

| Service   | URL                          | Notes                          |
|-----------|------------------------------|--------------------------------|
| Gateway   | http://localhost:3100        | Policy gateway HTTP API        |
| Health    | http://localhost:3100/v1/health | Returns `{"status":"ok"}`   |
| Dashboard | http://localhost:3201        | React approval dashboard       |
| Postgres  | localhost:5432               | Direct access (dev only)       |
| Redis     | localhost:6379               | Direct access (dev only)       |

## Startup Order

Docker Compose waits for health checks before advancing:

```
postgres (healthy) ──┐
                      ├──► gateway (healthy) ──► dashboard
redis    (healthy) ──┘
```

SQL migration files in `packages/persistence/migrations/` are applied automatically by PostgreSQL on first start via the `docker-entrypoint-initdb.d` volume mount.

## Environment Variable Reference

### Gateway (`gateway` service)

| Variable                  | Default         | Description                                               |
|---------------------------|-----------------|-----------------------------------------------------------|
| `SINT_PORT`               | `3100`          | HTTP server port                                          |
| `DATABASE_URL`            | _(required)_    | PostgreSQL connection string when `SINT_STORE=postgres`   |
| `REDIS_URL`               | _(required)_    | Redis connection string when `SINT_CACHE=redis`           |
| `SINT_STORE`              | `memory`        | Storage backend: `memory` or `postgres`                   |
| `SINT_CACHE`              | `memory`        | Cache backend: `memory` or `redis`                        |
| `SINT_LOG_LEVEL`          | `info`          | Log verbosity: `debug`, `info`, `warn`, `error`           |
| `SINT_API_KEY`            | _(unset)_       | Admin API key; if unset, auth is disabled (dev mode)      |
| `SINT_MAX_TIER`           | `T3_COMMIT`     | Maximum approval tier the gateway will accept             |
| `SINT_REQUIRE_SIGNATURES` | `false`         | Require Ed25519-signed requests                           |
| `SINT_RATE_LIMIT`         | `100`           | Max requests per minute per client                        |

### Dashboard (`dashboard` service)

| Variable                  | Default                    | Description                                        |
|---------------------------|----------------------------|----------------------------------------------------|
| `VITE_GATEWAY_URL`        | _(baked at build time)_    | Public gateway URL (set as a `--build-arg`)        |

The dashboard proxies `/v1/` and `/metrics` to the gateway via nginx, so in most deployments you do not need to set `VITE_GATEWAY_URL`.

## Running Migrations Manually

Migrations run automatically on the first `docker compose up`. To rerun them or apply new ones after a schema change:

```bash
# Connect to postgres and run a migration file manually
docker compose exec postgres psql -U sint -d sint \
  -f /docker-entrypoint-initdb.d/001_create_ledger.sql
```

Or from outside the container (with psql installed locally):

```bash
DATABASE_URL=postgresql://sint:sint@localhost:5432/sint
psql "$DATABASE_URL" -f packages/persistence/migrations/001_create_ledger.sql
psql "$DATABASE_URL" -f packages/persistence/migrations/002_create_tokens.sql
```

## Production Notes

### Use secrets — do not put credentials in `docker-compose.yml`

For production, use Docker secrets or an external secrets manager:

```bash
# Example: pass the API key from the shell
SINT_API_KEY=$(vault read -field=sint_api_key secret/sint) \
  docker compose up -d
```

Or use a `.env` file that is **not committed to git**:

```bash
# .env (add to .gitignore)
SINT_API_KEY=super-secret-key
POSTGRES_PASSWORD=stronger-password
DATABASE_URL=postgresql://sint:stronger-password@postgres:5432/sint
```

### Reduce log noise in production

```yaml
# docker-compose.override.yml
services:
  gateway:
    environment:
      SINT_LOG_LEVEL: warn
```

### Require request signatures

Enable Ed25519 signing for all agent requests:

```yaml
services:
  gateway:
    environment:
      SINT_REQUIRE_SIGNATURES: "true"
```

Agents must then sign every `SintRequest` with their Ed25519 private key.

### Capping the maximum approval tier

To prevent T3 (irreversible) actions in a deployment:

```yaml
services:
  gateway:
    environment:
      SINT_MAX_TIER: T2_ACT
```

### Persistent Redis data

The `redis` service is configured with `--appendonly yes` (AOF persistence). The `redisdata` volume survives container restarts. For production, also consider setting a `maxmemory` policy:

```yaml
services:
  redis:
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### Removing exposed database ports in production

The `ports` entries for `postgres` and `redis` expose them to the host for development convenience. Remove them in production:

```yaml
# docker-compose.override.yml
services:
  postgres:
    ports: []
  redis:
    ports: []
```

## Useful Commands

```bash
# View live gateway logs
docker compose logs -f gateway

# Open a psql shell
docker compose exec postgres psql -U sint -d sint

# Open a redis-cli shell
docker compose exec redis redis-cli

# Rebuild only the gateway image (e.g. after a code change)
docker compose build gateway && docker compose up -d gateway

# Stop everything and remove volumes (full reset)
docker compose down -v
```
