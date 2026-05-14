# Persistence Baseline (Issue #1)

This guide describes the production baseline for SINT Gateway persistence.

## What is now baseline

- PostgreSQL-backed token + ledger stores (`SINT_STORE=postgres`)
- Redis-backed cache + revocation bus (`SINT_CACHE=redis`)
- Startup schema bootstrap (`ensurePgSchema`) for required tables/indexes
- Redis fail-fast connectivity checks at gateway boot
- Deterministic token-signing payload serialization via canonical JSON key ordering
- PostgreSQL token persistence that round-trips the full signed token envelope (including optional capability fields)

## Required environment

```bash
SINT_STORE=postgres
SINT_CACHE=redis
DATABASE_URL=postgresql://sint:sint@localhost:5432/sint
REDIS_URL=redis://localhost:6379
```

## Operational checks

1. `GET /v1/health` returns `status=ok`
2. `GET /v1/ready` returns `status=ready` and `checks.store.ok=true`, `checks.cache.ok=true`
3. Issue token, intercept request, and query `/v1/ledger`
4. Revoke token on one node and verify denial on another node

## Notes

- Schema creation is idempotent and runs at startup when `SINT_STORE=postgres`.
- Redis startup checks are fail-fast to avoid hidden partial-deploy failures.
- Capability token signing payloads now use deterministic canonical JSON serialization, so equivalent payloads produce stable signatures across runtimes and object insertion orders.
- Token persistence keeps optional signed fields (`modelConstraints`, `attestationRequirements`, `verifiableComputeRequirements`, `executionEnvelope`, `behavioralConstraints`, `passportId`, `delegationDepth`, `delegationChain`, `revocable`, `revocationEndpoint`) to avoid semantic drift between issuance and reload.
