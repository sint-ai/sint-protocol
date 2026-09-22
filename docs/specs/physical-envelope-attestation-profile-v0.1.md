# Physical Envelope Attestation Profile v0.1 — Shared Adversarial Fixture

Status: draft for cross-project review (SINT × DriftCore OS / LifeCore-16)
License: Apache-2.0
Fixture: `packages/conformance-tests/fixtures/physical-ai/envelope-attestation-adversarial.v0.1.json`
Schema: `packages/conformance-tests/fixtures/physical-ai/envelope-attestation-fixture.schema.json`
SINT reference runner: `packages/conformance-tests/src/envelope-attestation-adversarial-conformance.test.ts`

## Purpose

This profile turns the five fixture requirements raised in the DriftCore review
thread into one protocol-neutral, runnable fixture that both projects can
execute and compare outcomes on:

1. Valid, fresh, correctly scoped evidence activates an already-authorized
   envelope. This is load-bearing: an implementation that rejects everything
   must fail the fixture.
2. False, expired, conflicting, or unverifiable evidence does not.
3. Losing verification causes a physical demotion, not merely an error.
4. Replay across restart is handled explicitly.
5. The execution authorization stays bound to the exact envelope evidence it
   relied on.

The fixture is deliberately narrow. It covers the path
*condition evidence → envelope selection → execution authorization*. It does
not claim that any policy layer physically enforces a limit; that remains
owned by firmware, a safety PLC, or mechanical protection.

## Vocabulary

| Term | Meaning in this profile |
| --- | --- |
| Authorized limits | The ceiling granted by the authority layer (SINT: signed capability-token constraints). Nothing below may exceed it. |
| Baseline envelope | The deployment's safe fallback. Always admissible. Active whenever the permissive envelope is not proven. |
| Permissive envelope | A pre-authorized, wider envelope that becomes active only while every declared operating condition is proven by fresh, verified evidence. |
| Condition evidence | A signed statement `{sourceId, condition, value, sequence, issuedAt, ttlMs}` from a registered attestor. |
| Effective limit | `min(authorizedLimits, activeEnvelope)`. Evidence can activate a pre-authorized envelope; it never creates authority. |
| Binding | The record attached to an authorization naming the active envelope, the effective limits, and a digest of the evidence relied on. |

## Evidence rules (normative)

An implementation MUST reject evidence, without changing state, when:

- the proof cannot be verified by an injected verifier against the key
  registered for `sourceId` (a non-empty but unrecognised proof is not proof);
- `sourceId` is not registered;
- `ttlMs` is non-finite, non-positive, or above the deployment maximum;
- the evidence is expired at ingestion, or issued beyond the clock-skew
  allowance in the future;
- `sequence` is lower than the committed high-water mark for
  `(sourceId, condition)`, or equal with identical content (replay);
- the verifier or the replay store is unavailable.

Two rules deliberately change state on rejection:

- **Conflict:** equal `sequence`, different content. The source's current
  reading for that condition is dropped until a strictly newer reading arrives.
- **Restart:** in-memory readings are not carried across a restart. The
  selector boots in the baseline. Evidence issued before boot is rejected even
  when the replay store is not durable.

Activation rules:

- a newer FALSE from any trusted source retracts an earlier TRUE, in any
  arrival order (sequence, not arrival, decides);
- any current disagreeing reading from a trusted source blocks activation;
  there is no majority vote;
- a deployment MAY require `minSources` independent attestors per condition;
- expiry is evaluated at decision time with the same clock used for
  ingestion. No timers, so "evidence expired" and "envelope demoted" cannot
  race.

Failure of the selector itself (it throws, rather than returning the
baseline) is handled by the authorization layer, which MUST either apply a
configured fallback envelope or refuse to authorize. It MUST NOT discard the
selector and continue on the authorized ceiling.

## Fixture format

All times are millisecond offsets from `clock.epoch`. Runners MUST use an
injectable clock. Signer keys are generated per run; only the trust
relationships in `signers` are normative.

Step operations:

| `op` | Effect |
| --- | --- |
| `ingest` | Build, sign (as `signer`), optionally corrupt (`proofOverride`, `tamperAfterSigning`), and submit one evidence item. Expect acceptance or a rejection code. |
| `probe` | Submit a physical command and check `outcome`, `activeEnvelope`, emitted `events`, and the `binding`. Digests can be captured (`captureAs`) and compared across probes. |
| `restart` | Recreate the selector and authorization layer, with or without the replay store. |
| `verifier` / `store` | Make the verifier or replay store unavailable or available. |
| `fault` | Make the selector throw instead of answering. |

Outcomes are protocol-neutral: `pass` (inside the effective envelope; normal
authorization continues), `violation` (outside it), `refused` (the authority
layer declined to decide because the envelope source was unavailable and the
deployment configured deny).

## SINT mapping

| Profile concept | SINT implementation |
| --- | --- |
| Authorized limits | `SintCapabilityToken.constraints.maxVelocityMps / maxForceNewtons` (Ed25519-signed, attenuation-only) |
| Selector | `EvidenceGatedEnvelopePlugin` (`@pshkv/gate-policy-gateway`), a `DynamicEnvelopePlugin` |
| Verifier | `ConditionEvidenceVerifier`, injected; reference `Ed25519ConditionEvidenceVerifier`; no default |
| Replay store | `EvidenceSequenceStore`, injected; `InMemoryEvidenceSequenceStore` is labelled non-durable |
| Effective limit | `PolicyGateway.intercept()` step 6, `min(token, executionEnvelope, dynamic)` |
| Selector fault | `PolicyGatewayConfig.dynamicEnvelopeFailurePolicy` (`fallback` or `deny`); legacy default remains `fail-open` |
| Binding | `PolicyDecision.transformations.additionalAuditFields.envelopeBinding`; `envelopeDigest` echoed on `policy.evaluated` |
| Events | `policy.envelope.applied`, `policy.envelope.fallback` |

Run:

```bash
pnpm --filter @pshkv/conformance-tests test:envelope-attestation
```

## Known gaps in SINT (as of this profile)

Recorded rather than normalised away:

- The gateway default for a throwing dynamic-envelope plugin is still
  `fail-open`. Deployments that rely on the plugin for T2/T3 physical actions
  must opt in to `fallback` or `deny`.
- `physicalContext` values on a request (velocity, force, human presence)
  are self-reported and unsigned. The profile treats them as the commanded
  value, not as evidence.
- `SafetyPermitPlugin` results are not part of the `min()`; hardware-reported
  limits are not yet an input to the effective envelope.
- Human approver identity in the approval queue is a string label, not a
  cryptographic principal. Out of scope for this profile; tracked separately.
- The binding is attached to the decision and the ledger event. It is not yet
  carried into the signed edge dispatch envelope (`@pshkv/sint-edge-agent`).

## Open questions for DriftCore review

1. Should a verifier outage demote immediately, or only prevent new
   activation until existing evidence expires (the fixture's current
   expectation, case 3a)?
2. Is "drop the reading on same-sequence conflict" the right fail-safe, or
   should a conflicting source be quarantined until an operator clears it?
3. Which of the rejection codes should be normative versus informative when
   comparing runners across implementations?
