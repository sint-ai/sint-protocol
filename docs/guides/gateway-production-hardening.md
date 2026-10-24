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

### Required service integration gate

After building the workspace, run `pnpm run test:integration` with both
`DATABASE_URL` and `REDIS_URL` exported. CI provisions PostgreSQL 16 and Redis 7
and runs this command directly, outside Turbo's filtered environment.
Missing/invalid connection URLs, service failures, failed processes, empty
files, missing files, or any skipped/pending/todo case fail the gate. Unit-only
developer runs can still omit services; their optional skips do not count as
integration validation.

The explicit inventory in `scripts/lib/integration-gate.mjs` includes the
PostgreSQL stores, Redis cache/revocation bus, gateway restart, and signed-token
SQL matrix. Add new service integration files to this inventory. Each run writes
fresh JSON reports and a success summary under `coverage/integrations/run-*`;
CI uploads the reports as evidence, including available reports after a failure.

PostgreSQL fixtures require permission to create schemas and use random schemas
for every store case; cleanup only drops schemas owned by that case. Redis
fixtures use random namespaces for cache keys and revocation channels, with
subscription acknowledgement before delivery assertions. They do not clear
the default cache namespace or flush the database.

`RedisCache(redis, namespace?)` and
`RedisRevocationBus(publisher, subscriberFactory?, namespace?)` support these
isolated namespaces. Existing callers use `sint:cache:` and `sint:revocations`;
namespaced participants must select the same namespace to communicate. These
options partition keys/channels, not credentials or access control. The cache
clear pattern escapes glob characters in namespaces.

### Production release checks

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

- Token policies `autonomyPolicy`, `humanAuthorityRequirements`, and
  `regulatedDataPolicy` are signed data. The PostgreSQL adapter preserves them
  as JSONB in both insert/update and read-by-ID/read-by-subject paths.
  `ensurePgSchema` adds these columns for existing installations; deployments
  applying SQL migrations directly should run
  `packages/persistence/migrations/007_token_policy_fields.sql` before the new
  adapter serves requests. Both upgrade paths are additive and idempotent.
- Missing policy columns on an older stored token cannot be reconstructed from
  its signature. Recover the original signed token from a trusted source or
  reissue through the authorized issuer; do not infer or backfill policy values.
- Keep the new columns and their data during an application rollback. Older
  adapters that omit these signed fields can reject affected tokens with
  `INVALID_SIGNATURE`. Test the target version against the actual token shapes
  before shifting traffic; a plain token round trip is insufficient.
- CI's required PostgreSQL persistence gate checks legacy-schema upgrades,
  repeated migration/bootstrap, all three policy combinations, all optional
  signed metadata, SQL tampering, signed replacements, and restart continuity.
  It runs outside Turbo's filtered environment so a missing database connection
  cannot silently turn this release gate into skipped tests.
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
