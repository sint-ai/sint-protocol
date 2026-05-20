# Gateway Production Hardening

The gateway now fails closed in production mode. If `SINT_ENV=production` or
`NODE_ENV=production`, startup requires durable storage, durable cache /
revocation transport, an admin API key, signed agent requests, and no API keys
in WebSocket query strings.

## Required Production Environment

```bash
SINT_ENV=production
SINT_STORE=postgres
SINT_CACHE=redis
DATABASE_URL=postgresql://sint:REDACTED@postgres:5432/sint
REDIS_URL=redis://redis:6379
SINT_API_KEY=REDACTED
SINT_REQUIRE_SIGNATURES=true
SINT_WS_ALLOW_QUERY_API_KEY=false
SINT_RATE_LIMIT=100
```

Production startup fails if any required value is missing or insecure.

## Boot-Time Contract

| Setting | Production requirement | Why |
|---------|------------------------|-----|
| `SINT_STORE` | `postgres` | Token and ledger state must survive process restarts. |
| `SINT_CACHE` | `redis` | Revocation propagation and hot-token cache need a shared backend. |
| `SINT_API_KEY` | non-empty | Admin routes such as token issuance and ledger reads must be authenticated. |
| `SINT_REQUIRE_SIGNATURES` | `true` | Agent write requests must be signed with Ed25519 keys. |
| `SINT_WS_ALLOW_QUERY_API_KEY` | `false` | API keys must not appear in URLs, logs, browser history, or proxy traces. |

Development and tests can still use in-memory backends by leaving
`SINT_ENV`/`NODE_ENV` unset or setting `SINT_ENV=development`.

## Readiness Gate

Production orchestration should probe:

```text
GET /v1/ready
```

Readiness returns `503` when the configured store or cache probe fails. Health
checks that only call `/v1/health` prove the process is alive, not that the
deployment can safely enforce policy.

## Release Checklist

Before tagging a production release:

- `pnpm run build`
- `pnpm run test`
- `pnpm run docs:build`
- `pnpm --filter @pshkv/gateway-server test -- __tests__/production-slice.test.ts`
- `SINT_ENV=production` boot test with Postgres and Redis configured
- `/v1/ready` returns `status=ready`
- token issuance requires `X-API-Key`
- `/v1/intercept` rejects unsigned write requests when signatures are enabled
- token revoke causes the same token to fail closed on the next intercept
- ledger proof endpoint returns `proofValid=true` for the policy decision event

## Migration And Rollback Notes

- Database schema bootstrap is idempotent through `ensurePgSchema`.
- Apply migrations before shifting traffic to a new gateway image.
- Do not roll back to an image that cannot read the current signed token shape.
- If rollback is required, keep Postgres data intact and roll back the gateway
  image only after verifying token round-trip tests against the target version.
- Redis may be restarted independently, but revocation state must be replayed or
  reloaded from durable token/ledger state before accepting traffic.

## Compose Profile

The `prod-lite` compose profile sets `SINT_ENV=production` and probes
`/v1/ready` for the gateway:

```bash
SINT_API_KEY=... \
POSTGRES_PASSWORD=... \
DATABASE_URL=postgresql://sint:...@postgres:5432/sint \
REDIS_URL=redis://redis:6379 \
pnpm run stack:prod-lite
```
