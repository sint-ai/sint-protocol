# Physical Work Market Governance Profile v1

Status: executable conformance profile

This profile defines a SINT-native governance contract for physical-work
markets: robot job broadcast, collateralized bidding, simulation proof,
deployment, proof-of-physical-work evidence, validator consensus, and settlement
release.

The profile is inspired by permissionless robotics market patterns, but it is
chain-neutral. SINT does not implement escrow, staking, gossip, robot identity
registries, or payout rails here. It defines the pre-action policy outcomes that
must happen before those systems execute.

## Scope

Physical-work markets need two controls at the same time:

1. **Market lifecycle control**: a robot, requester, model provider, validator,
   or settlement service may only move a job to the next state when the current
   state, identity, authority, collateral, and evidence allow it.
2. **Physical safety control**: simulation proof, execution approval, sensor
   evidence, and validator verdicts must remain bound to the same task,
   action reference, deadline, robot identity, and SINT policy decision.

Every governed action remains subject to `PolicyGateway.intercept()`. This
profile is an additional contract for bridge and market adapters, not a bypass.

## Governed Actions

| Resource | Action | Typical tier |
|---|---|---|
| `pwork://task/*` | `broadcast_task` | T1 or T2 when high value |
| `pwork://bid/*` | `submit_bid` | T1 or T2 when collateralized |
| `pwork://proof/*` | `submit_sim_proof` | T1 |
| `pwork://task/*` | `deploy_policy` | T2/T3 before physical execution |
| `pwork://proof/*` | `submit_popw` | T1, evidence-bound |
| `pwork://proof/*` | `verify_popw` | T2 when validator verdict changes settlement |
| `pwork://settlement/*` | `release_settlement` | T3 |

## Required Controls

1. Capability scope must include the requested physical-work action.
2. Requester, robot executor, and validator identities must be registered before
   reputation-bearing work.
3. Task subnet must be supported by the deployment.
4. Bid collateral must satisfy the subnet minimum before a bid can be accepted.
5. Simulation proof must include a digest, deterministic replay flag, and a
   safety score at or above the configured threshold before deployment.
6. Physical deployment must escalate to the tier required by the task.
7. PoPW bundles must include the required sensor classes, media hash, bundle
   hash, task ID, action reference, robot identity, and deadline binding.
8. Expired work cannot submit proof or settle.
9. Validator consensus must meet quorum and safety thresholds before a task can
   be marked verified.
10. Settlement release must only happen after verification and must reject
    receipt replay.
11. Deny, escalate, deployment, proof, verification, and settlement outcomes
    must carry evidence references.

## Decision Reasons

The executable fixture uses the following stable outcome reasons:

- `ALLOW`
- `SCOPE_NOT_AUTHORIZED`
- `IDENTITY_REQUIRED`
- `SUBNET_NOT_SUPPORTED`
- `STAKE_BELOW_MINIMUM`
- `VALUE_REQUIRES_APPROVAL`
- `STATE_TRANSITION_INVALID`
- `SIM_PROOF_REQUIRED`
- `POPW_BUNDLE_REQUIRED`
- `POPW_BUNDLE_INCOMPLETE`
- `VALIDATOR_QUORUM_NOT_MET`
- `VERIFIER_SAFETY_BELOW_THRESHOLD`
- `DEADLINE_EXPIRED`
- `SETTLEMENT_STATE_INVALID`
- `RECEIPT_REPLAY`

## Fixture Contract

Fixture file:

- `packages/conformance-tests/fixtures/physical-ai/physical-work-market.v1.json`

Executable test:

- `packages/conformance-tests/src/physical-work-market-conformance.test.ts`

Reusable evidence primitive:

- `packages/evidence-ledger/src/popw-bundle.ts`

Run:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/physical-work-market-conformance.test.ts
```

## Non-Goals

- This profile does not define a cryptocurrency, stablecoin, or L1.
- This profile does not implement auctions, escrow custody, or payout routing.
- This profile does not score vision or video directly.
- This profile does not permit physical execution without the existing SINT
  policy gateway, capability-token, physical-constraint, and e-stop controls.
