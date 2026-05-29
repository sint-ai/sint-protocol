# Agent Commerce Governance Profile v1

Status: executable conformance profile

This profile defines a transport-neutral governance contract for agent-to-agent
task markets, x402-style machine payments, and machine-router workflows. It is
inspired by current task-market patterns such as bounty, claim, pitch,
benchmark, and auction modes, but it is not vendor-specific.

## Scope

Agent commerce systems need two separate controls:

1. **Market state control**: an agent should only create, bid, claim, submit,
   accept, rate, or settle a task when the task state and agent authority allow
   that transition.
2. **Payment control**: an agent should only sign or submit x402-style payment
   permits when spend caps, expiry, recipient, session, and policy limits are
   valid.

SINT provides the pre-action policy boundary for both. Marketplaces remain free
to implement escrow, identity registries, reputation, and settlement rails; SINT
defines the observable policy outcomes that must happen before execution.

## Governed Actions

The profile uses these resource and action names:

| Resource | Action | Typical tier |
|---|---|---|
| `market://task/*` | `create` | T1 or T2 when reward is high |
| `market://task/*` | `pitch` | T1 |
| `market://task/*` | `bid` | T1 or T2 when paid |
| `market://task/*` | `claim` | T2 when exclusive or staked |
| `market://task/*` | `submit` | T1 |
| `market://task/*` | `submit_proof` | T1 |
| `market://task/*` | `select_worker` | T2 |
| `market://task/*` | `accept` | T3 when payment releases |
| `market://settlement/*` | `release` | T3 |
| `x402://session/*` | `authorize_permit` | T2 or T3 when cap is high |

## Required Controls

1. Agent identity must be registered before reputation-bearing work.
2. Capability scope must include the requested market action.
3. Task-mode state transitions must be monotonic and valid.
4. Exclusive claim tasks must deny non-selected workers.
5. Auction bids must satisfy the active price-discovery rule.
6. Benchmark submissions must include a proof digest and metric value.
7. x402 permits must enforce cap, expiry, recipient, and session constraints.
8. Settlement must only release after accepted work and must reject receipt
   replay.
9. High-value task creation or settlement must escalate to human approval.
10. Every deny, escalate, accept, and release decision must carry an evidence
    reference.

## Decision Reasons

The executable fixtures use the following stable outcome reasons:

- `ALLOW`
- `AGENT_IDENTITY_REQUIRED`
- `SCOPE_NOT_AUTHORIZED`
- `REPUTATION_BELOW_THRESHOLD`
- `VALUE_REQUIRES_APPROVAL`
- `STATE_TRANSITION_INVALID`
- `BID_NOT_COMPETITIVE`
- `PROOF_REQUIRED`
- `X402_CAP_EXCEEDED`
- `X402_PERMIT_EXPIRED`
- `RECIPIENT_NOT_ALLOWLISTED`
- `SETTLEMENT_STATE_INVALID`
- `RECEIPT_REPLAY`

## Fixture Contract

Fixture file:

- `packages/conformance-tests/fixtures/economy/agent-commerce-governance.v1.json`

Executable test:

- `packages/conformance-tests/src/agent-commerce-governance-conformance.test.ts`

Run:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/agent-commerce-governance-conformance.test.ts
```

## Reference Systems

The profile is designed to map cleanly onto emerging agent-commerce systems:

- Task modes such as bounty, claim, pitch, benchmark, and auction:
  `https://docs-market.daydreams.systems/concepts/task-modes`
- x402 permit/session routing with spend caps and expiry:
  `https://router.daydreams.systems/how-it-works`
- scoped device signing and revocation:
  `https://docs-market.daydreams.systems/identity/device-setup`
- ERC-8004 style agent identity and reputation linkage:
  `https://docs-market.daydreams.systems/identity/agent-registration`

## Non-Goals

- This profile does not implement escrow, auctions, or x402 settlement.
- This profile does not claim compatibility with any specific marketplace API.
- This profile does not define a new payment rail.

It defines the policy contract SINT can enforce before those systems execute.
