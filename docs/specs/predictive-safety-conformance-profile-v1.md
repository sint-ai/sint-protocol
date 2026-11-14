# Predictive Safety Conformance Profile v1

Status: executable conformance profile

This profile records the T1 shadow contract for fixture
`predictive-safety-t1-shadow-v1`. A recorded T1 preparation action is allowed
when the receipt is missing, unsafe, or passing. The gateway still appends one
simulation receipt event. Shadow observations never authorize or block.

## Governed action

| Resource | Action | Tier |
|---|---|---|
| `mcp://workspace/stage-change` | `call` | T1 shadow |

## Recorded outcomes

1. `missing-receipt` is `allow`, appends `simulation.receipt.rejected`, and
   records `SIMULATION_EVIDENCE_MISSING`. Enforcement mode is `shadow`.
2. `unsafe-receipt` is `allow`, appends `simulation.receipt.rejected`, and
   records `SIMULATION_UNSAFE`. Enforcement mode is `shadow`.
3. `passing-receipt` is `allow` and appends `simulation.receipt.verified`.
   Enforcement mode is `shadow`.

## Fixture contract

Fixture file:

- `packages/conformance-tests/fixtures/predictive-safety/t1-shadow-evaluation.v1.json`

Executable test:

- `packages/conformance-tests/src/predictive-safety-shadow-conformance.test.ts`

Run:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/predictive-safety-shadow-conformance.test.ts
```

## Non-goals

- This profile does not publish an operator runbook.
- This profile does not promote T1 shadow observations to enforce mode.
- This profile does not cover a pilot-site canary.
