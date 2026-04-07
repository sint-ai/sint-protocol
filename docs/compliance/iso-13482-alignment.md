# ISO 13482 Alignment Guide for SINT

Status: Published (Q3 roadmap artifact)
Last updated: 2026-04-05

## Scope

This guide aligns SINT controls with safety expectations for personal care and service robotics contexts where software agents can trigger motion and task execution.

## Alignment Matrix

| ISO 13482 Safety Intent (High-Level) | SINT Mechanism | Verification Approach |
|---|---|---|
| Prevent hazardous operation from control software | Policy gateway choke point, token scope, constraints (`velocity`, `force`, geofence) | Constraint violation tests + deny/escalate outcomes |
| Ensure safe human-robot interaction | Human-presence escalation (`Δ_human`) and higher-tier approval gating | Human-presence conformance scenarios |
| Maintain traceability for safety incidents | Tamper-evident ledger and proof receipts | Incident replay with ledger proof chain |
| Support operational risk reduction | Dynamic envelopes, corridor approvals, revocation propagation | Edge/disconnect/revocation fixture tests |
| Require controlled override paths | Quorum approvals and explicit resolver identity | Approval quorum tests + audit evidence |

## Deployment Checklist

- Map each robot command route to a SINT resource URI.
- Define per-resource constraints and tier defaults.
- Validate emergency stop and revocation behavior under load.
- Document operator escalation responsibilities and response SLAs.
- Archive benchmark/conformance evidence per release.

## Recommended Test Bundle

```bash
pnpm run test
pnpm --filter @sint/conformance-tests test -- src/industrial-benchmark-scenarios.test.ts
pnpm --filter @sint/conformance-tests test -- src/industrial-interoperability.test.ts
```

## Caveat

This document is a technical alignment aid and not a substitute for formal certification activities.
