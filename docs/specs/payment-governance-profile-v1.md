# Payment Governance Profile v1

This profile defines a minimal conformance contract for agent payment safety controls in Economic Layer v1.

## Required Controls

1. Daily budget cap per agent.
2. Rolling-window spend cap to prevent micro-transaction drain loops.
3. Recipient allowlist enforcement.
4. Receipt replay rejection.
5. Reserve/commit settlement consistency (no commit without reserve).

## Decision Reasons

The following machine-readable outcomes are used in fixtures:

- `ALLOW`
- `BUDGET_EXCEEDED`
- `ROLLING_WINDOW_EXCEEDED`
- `RECIPIENT_NOT_ALLOWLISTED`
- `RECEIPT_REPLAY`
- `SETTLEMENT_MISMATCH`

## Fixture Contract

Fixture file:

- `packages/conformance-tests/fixtures/economy/payment-governance.v1.json`

Executable test:

- `packages/conformance-tests/src/payment-governance-fixtures-conformance.test.ts`

## Run

```bash
pnpm --filter @sint/conformance-tests test:fixtures
```

## Notes

- This profile is transport-agnostic and can be mapped to x402 or non-x402 payment rails.
- Implementations can vary internally, but externally observable outcomes for fixture scenarios should remain deterministic.
