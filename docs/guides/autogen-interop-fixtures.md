# AutoGen Interop Fixtures

This guide documents the executable fixture set for AutoGen interoperability in SINT.

Fixture file:

- `packages/conformance-tests/fixtures/interop/autogen-capability-trust.v1.json`

Conformance runner:

- `packages/conformance-tests/src/autogen-interop-conformance.test.ts`

## MVP Contract (Issue #213)

Minimal interop surface for AutoGen-style runtimes:

1. Pre-tool-call authorization calls `PolicyGateway.intercept()`
2. Typed policy outcomes map to runtime control flow
3. Every governed decision yields an evidence reference

### Request contract

`SintRequest` (minimum required fields):

- `requestId` (UUID v7)
- `agentId`
- `tokenId`
- `resource`
- `action`
- `params`

### Outcome contract

Accepted policy outcomes:

- `allow` -> execute tool call
- `deny` -> fail closed, return typed denial
- `escalate` -> suspend and wait for approval path
- `transform` -> apply constraints/overrides, then execute

### Evidence reference contract

For each governed decision, adapters must expose an evidence reference that can be traced in the ledger event stream:

- primary reference: `requestId`
- expected event types: `policy.evaluated` and trust-layer events where applicable (`economy.trust.evaluated`, `economy.trust.blocked`)

Silent drops are non-conformant.

## What is covered

- policy callback + capability validation hook behavior
- trust signal to tier escalation matrix
- evidence emission expectations (`policy.evaluated`, trust events)
- edge fail-closed behavior when central approval is unavailable for T2/T3

## Scenarios

1. Callback vs direct gateway parity for two representative tasks
2. Trust matrix outcomes:
   - `unrestricted`
   - `medium_risk`
   - `high_risk`
   - `blocked`
3. Edge disconnect fail-closed denial for trust-escalated actions
4. Evidence event presence for deny/escalate paths

## Reference adapter blueprint

The conformance test provides the canonical callback chain:

- trust gate callback (pre-policy)
- `PolicyGateway.intercept()` callback (authorization)
- trust-to-tier merge callback (post-policy)

Minimal TypeScript shape:

```ts
import type { PolicyGateway, SintRequest, PolicyDecision } from "@pshkv/gate-policy-gateway";

type TrustSignal = "unrestricted" | "low_risk" | "medium_risk" | "high_risk" | "blocked";

export async function authorizeAutogenToolCall(
  gateway: PolicyGateway,
  request: SintRequest,
  trustSignal: TrustSignal,
): Promise<PolicyDecision> {
  // 1) Pre-policy trust gate
  if (trustSignal === "blocked") {
    return {
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      action: "deny",
      assignedTier: "T3_commit",
      assignedRisk: "T3_irreversible",
      denial: { reason: "Trust signal blocked execution", policyViolated: "TRUST_BLOCKED" },
    };
  }

  // 2) Mandatory choke point
  const decision = await gateway.intercept(request);

  // 3) Runtime action mapping
  // allow     -> execute tool
  // deny      -> fail closed
  // escalate  -> suspend and await approval
  // transform -> apply overrides and execute
  return decision;
}
```

### Evidence extraction

Adapters should return `requestId` with decision payloads and expose the evidence stream references for operators:

- `policy.evaluated` for policy decisions
- `economy.trust.evaluated` for trust escalation
- `economy.trust.blocked` for trust gate denials

If your runtime cannot surface event IDs directly, `requestId` is the minimum trace key and is required.

## Run locally

```bash
pnpm --filter @sint/conformance-tests test -- src/autogen-interop-conformance.test.ts
pnpm --filter @sint/conformance-tests test:fixtures
```

## Maintainer notes

- Keep fixture schema stable; add new fields as optional first.
- If trust semantics change, update both fixture and expected matrix in one PR.
- For new edge behaviors, add deterministic fail-closed cases before merging runtime code.
