# Predictive Safety Operator Runbook

Status: operator runbook for the shipped simulation worker and client.

This runbook records how to start the reference worker and what the shipped
controls do. A health response does not authorize execution. Policy Gateway
remains the only authorizer. This is not a pilot-site canary, a Gazebo worker,
or a production release.

## Start

Build, then start the reference worker:

```bash
pnpm --filter @pshkv/simulation-server start
```

Production startup fails closed unless the persistent signer, bearer token, and
model are set. `SINT_SIM_BEARER_TOKEN is required in production`.
`SINT_SIM_MODEL is required in production`. `SINT_SIM_SIGNER_PUBLIC_KEY and SINT_SIM_SIGNER_PRIVATE_KEY must be set together`.

## Health

`GET /v1/health` reports `authorizesExecution: false`. A health response does
not authorize execution.

## Quota

When `SINT_SIM_MAX_SIMULATE_REQUESTS` is set, an authenticated simulate call
past that limit is rejected with `QUOTA_EXCEEDED` and
`Simulation request quota is exhausted`, and `retryable` is false. A health
check or unauthenticated request does not consume it.

## In-flight limit

When `SINT_SIM_MAX_IN_FLIGHT_REQUESTS` is set, an authenticated simulate call
while that many calls are still running is rejected with `QUEUE_FULL` and
`Simulation request queue is full`, and `retryable` is true. The next call is
accepted after an in-flight call finishes. Unset means no limit. A non-positive
value fails configuration.

## Tenant

When `SINT_SIM_TENANT_ID` is set, a simulate request for a different tenant, or
one that omits the tenant, is rejected with `TENANT_MISMATCH` and
`Simulation request tenant does not match this worker`. The bound tenant still
returns a receipt.

## Retired signer

`SINT_SIM_RETIRED_SIGNER_KEYS` is an optional comma-separated list of lowercase
Ed25519 public keys. Startup fails when the active signer is listed:
`SINT_SIM_SIGNER_PUBLIC_KEY is retired and cannot sign new receipts`. A
malformed entry fails configuration:
`SINT_SIM_RETIRED_SIGNER_KEYS entries must be lowercase Ed25519 public keys`.
A different retired key is still accepted. Unset means no retired keys.

## Mutual TLS

The mutual-TLS listener closes the handshake when the client presents no
certificate. When `SINT_SIM_TRUST_DOMAIN` is set, a client certificate outside
that domain, or one that omits its SPIFFE ID, is closed, and a matching SPIFFE
ID still reaches the worker. A blank value or a full SPIFFE URI fails
configuration. Unset means the listener does not check the SPIFFE ID.

## Client

`failureThreshold`: that many consecutive retryable worker failures stop the
next call. The next call does not reach the worker. Unset means no limit.

When `modelDigest` and `receiptCache` are both set, a verified receipt is
reused for the same effect plan, world digest, and model digest. The next call
does not reach the worker. Unset means no cache.

When `region` matches an entry in `regions`, the call goes to that entry's base
URL and does not reach another region's worker. Unset region means `baseUrl`.

## Conformance profile

The T1 shadow profile is
`docs/specs/predictive-safety-conformance-profile-v1.md`.

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/predictive-safety-shadow-conformance.test.ts
```

Shadow observations never authorize or block.

## Out of scope

- This runbook does not add gRPC.
- This runbook does not add a Gazebo worker.
- This runbook does not add a GPU or vendor industrial simulator.
- This runbook does not record a pilot-site canary.
- This runbook does not authorize execution.
