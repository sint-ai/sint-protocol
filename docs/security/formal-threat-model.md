# SINT Formal Threat Model

Status: Published (Q3 roadmap artifact)
Last updated: 2026-04-05

## System Boundary

SINT sits between agent/tool invocation surfaces and physical execution surfaces.

Primary trust boundaries:

1. Agent runtime -> bridge adapters
2. Bridge adapters -> policy gateway
3. Policy gateway -> approval system/operators
4. Policy gateway -> physical executors (robots, PLC/OT, IoT)
5. Gateway -> evidence and persistence backends

## Assets

- Capability tokens and delegation chains
- Approval decisions and resolver identities
- Constraint envelopes and dynamic safety state
- Evidence ledger integrity
- Revocation and cache consistency state

## Adversary Objectives

- Execute unauthorized physical actions
- Downgrade tiering/escalation
- Bypass or forge approval outcomes
- Tamper with audit evidence
- Exploit bridge-specific mapping ambiguities

## Threat Classes and Controls

| Threat Class | Example | SINT Primary Control | Residual Risk |
|---|---|---|---|
| Token abuse/forgery | Stolen or altered token used for command injection | Signed tokens + revocation + attenuation checks | Key management errors outside SINT |
| Bridge mapping confusion | Alternate protocol path downgrades safety tier | Canonical resource mapping + interop equivalence fixtures | New unmapped bridge surfaces |
| Approval bypass | T2/T3 action executed without human gate | Mandatory escalation path + resolve APIs + audit trail | Misconfigured ops workflows |
| Fail-open on disconnect | Edge mode allowing unsafe elevated actions offline | T0/T1 local only; T2/T3 escalate/deny with reconciliation | Prolonged partition operations pressure |
| Ledger tampering | Decision/event history altered post-hoc | Hash-chained events + proof endpoint | Compromised infrastructure without independent anchoring |
| Policy drift | Runtime config diverges from documented safety profile | Versioned profiles + conformance guardrails + docs requirements | Manual process gaps |

## Assumptions

- Cryptographic primitives remain uncompromised.
- Operators enforce secure key custody and infrastructure access controls.
- Physical safety controllers are still required for final hardware-layer interlocks.

## Security Invariants

- No physical action reaches committed state without policy evaluation.
- Escalated actions require explicit approval resolution records.
- Revoked authority never re-enters allow path without reissuance.
- Evidence chain remains append-only and verifiable.

## Verification and Evidence

- Security regression suite (`packages/conformance-tests/src/security-regression.test.ts`)
- Industrial scenario suite (`industrial-benchmark-scenarios.test.ts`)
- Interoperability equivalence suite (`industrial-interoperability.test.ts`)
- Edge/fail-closed suite (`edge-mode-conformance.test.ts`)

## Next Steps

- Extend model into STRIDE-style per-component threat tables.
- Add formal model checking for selected invariants (Q4 formal methods item).
- Publish external audit delta report when third-party review completes.
