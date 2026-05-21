# Production Slice Verification

This guide defines the smallest supported production-readiness path for SINT's
first operator-facing surface. It intentionally avoids broad bridge coverage and
focuses on the core path needed to make one deployment claim repeatable:

1. Issue a capability token through the gateway HTTP API.
2. Persist the issued token through the configured token store.
3. Submit a request through `PolicyGateway.intercept()` via `/v1/intercept`.
4. Record the policy decision in the append-only Evidence Ledger.
5. Persist the ledger event through the configured ledger store.
6. Return a chain-of-custody proof for the decision event.
7. Revoke the token and verify the same request fails closed.

The executable guard for this path is
`apps/gateway-server/__tests__/production-slice.test.ts`.

## Local Verification

Run the production-slice gate directly:

```bash
pnpm --filter @pshkv/gateway-server test -- __tests__/production-slice.test.ts
```

Generate the public signed artifact for external evaluators:

```bash
pnpm run security:production-slice-artifact
```

Artifact outputs:

- `docs/reports/production-slice-validation-artifact.json`
- `docs/reports/production-slice-validation-artifact.md`
- `docs/reports/production-slice-validation-vitest.json`

Run the full gateway package checks:

```bash
pnpm --filter @pshkv/gateway-server test
pnpm --filter @pshkv/gateway-server build
```

Run the workspace build gate:

```bash
pnpm run build
```

## Supported Surface

The current production slice covers:

- `apps/gateway-server`
- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `packages/persistence`

The test uses in-memory stores, but it asserts only the shared persistence
interfaces: token lookup, ledger event query, and ledger chain verification.
PostgreSQL adapters must preserve the same behavior for production deployments.

## Out Of Scope

This verification path does not certify every bridge, dashboard workflow,
economy route, memory route, or external runtime integration. Those remain
separate conformance and integration gates.
