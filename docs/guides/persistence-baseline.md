# Persistence Baseline (Issue #1)

This guide describes the production baseline for SINT Gateway persistence.

## What is now baseline

- PostgreSQL-backed token + ledger stores (`SINT_STORE=postgres`)
- Redis-backed cache + revocation bus (`SINT_CACHE=redis`)
- Startup schema bootstrap (`ensurePgSchema`) for required tables/indexes
- Redis fail-fast connectivity checks at gateway boot

## Required environment

```bash
SINT_STORE=postgres
SINT_CACHE=redis
DATABASE_URL=postgresql://sint:sint@localhost:5432/sint
REDIS_URL=redis://localhost:6379
```

## Operational checks

1. `GET /v1/health` returns `status=ok`
2. Issue token, intercept request, and query `/v1/ledger`
3. Revoke token on one node and verify denial on another node

## Notes

- Schema creation is idempotent and runs at startup when `SINT_STORE=postgres`.
- Redis startup checks are fail-fast to avoid hidden partial-deploy failures.

