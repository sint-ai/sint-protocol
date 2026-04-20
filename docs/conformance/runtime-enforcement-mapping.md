# SINT Protocol — Runtime Enforcement Mapping (OWASP)

**Document ID:** `sint-conformance-runtime-enforcement-v1`
**Schema version:** `2026-04-20`
**Status:** Draft addendum to `owasp-asi-mapping.md`
**Companion fixture pack:** `packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json`
**Inbound context:** [OWASP/www-project-top-10-for-large-language-model-applications#802](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/issues/802)

---

## Purpose

`owasp-asi-mapping.md` maps SINT's enforcement checkpoints to each ASI01–ASI10 control. This addendum maps each SINT fixture vector to the **runtime integrity invariant** it exercises, using the four-layer decomposition converging in OWASP#802:

1. **Transmission integrity** — authorization decisions, tokens, and evidence survive the wire without silent mutation
2. **Authorization integrity at execution** — `request_authorized == request_executed` at the moment the tool call is made
3. **Execution integrity** — the runtime environment performing the action matches what was authorized
4. **Intent integrity** *(upper layer — advisory, not runtime-enforceable in SINT's deterministic layer)*

The distinction matters for conformance claims: implementations should claim coverage against a specific invariant, not the broader OWASP category. A goal-hijack detector (intent layer) is not the same conformance guarantee as a monotonic-delegation check (authorization layer).

---

## Invariant → Fixture map

### Layer 1 — Transmission integrity

SINT's contribution: capability tokens are Ed25519-signed over RFC 8785 canonical JSON (recursive key sort, `signature` field stripped, `undefined` omitted, `null` preserved — see [ADR on canonical signing payload](https://github.com/sint-ai/sint-protocol/blob/main/docs/specs/sint-protocol-v1.0.md#411-canonical-signing-payload)). This means a token that leaves one service and arrives at another via any lossy transport (HTTP JSON body, Postgres JSONB, message queue) verifies byte-identically on both ends.

| Fixture vector | Invariant it exercises |
|----------------|------------------------|
| `ASI03-attack-expired-token` | Transmission preserves `expiresAt`; expired tokens rejected regardless of transport |
| `ASI03-attack-subject-mismatch` | Transmission preserves `subject`; subject-bound tokens cannot be replayed by a different agent |
| `ASI03-safe-valid-token-correct-subject` | Round-trip signature verification succeeds after normal transport |

**Not yet covered by fixture pack:** explicit JSONB-round-trip vectors (tokens with populated `modelConstraints`, `attestationRequirements`, `delegationChain`). Tracked in [#175](https://github.com/sint-ai/sint-protocol/issues/175).

---

### Layer 2 — Authorization integrity at execution

This is SINT's primary enforcement layer. `PolicyGateway.intercept()` re-validates the token on every tool call — synchronous, in the critical path, no LLM in the enforcement loop. The invariant: the authorization decision that arrives at the gateway is the decision that gets executed, with no widening, no drift, no async-dispatch divergence.

| Fixture vector | Invariant it exercises |
|----------------|------------------------|
| `ASI02-attack-scope-mismatch-exec-with-filesystem-token` | Resource glob re-validated at execution; token for `mcp://filesystem/*` cannot authorize `mcp://exec/run` |
| `ASI02-attack-wrong-action-on-resource` | Action re-validated at execution; `call` token cannot authorize `subscribe` |
| `ASI02-safe-matching-scope-and-action` | Authorized scope is executed scope |
| `ASI07-attack-delegation-depth-exceeded` | Delegation chain is monotonically narrowing; depth cap prevents chain-based widening |
| `ASI07-safe-valid-delegation-chain` | Attenuated chain executes at the narrowed scope, not the parent scope |
| `ASI08-attack-rate-limit-exhaustion` | Rate-limit constraint on the token is enforced per call, not at session start |
| `ASI09-attack-revoked-token-bypass` | Revocation is checked pre-tier-assignment on every call |
| `ASI09-attack-t2-escalation-no-human` | T3 action requires explicit human approval; no path to auto-allow |
| `ASI09-safe-t1-auto-allow` | T1 scope is correctly bounded; oversight applies only where authorized |
| `ASI05-attack-exec-resource-escalates` | `mcp://exec/*` → `T3_COMMIT` regardless of token scope — authorization tier cannot be bypassed by presentation |

**Core invariant claim:** for any fixture above, the authorized payload (token scope) and the executed payload (gateway decision input) are the same bytes. SINT does not re-serialize, re-parse, or reinterpret between validation and enforcement.

---

### Layer 3 — Execution integrity

The runtime environment actually performing the action matches what was authorized. Includes model-identity binding, execution-history-aware decisions, and memory-state integrity checks.

| Fixture vector | Invariant it exercises |
|----------------|------------------------|
| `ASI04-attack-model-fingerprint-mismatch` | Model weights running at execution match the `modelFingerprintHash` in the token; substitution detected |
| `ASI04-attack-model-id-not-allowlisted` | Model ID allowlist enforced; unknown model instances rejected at execution |
| `ASI04-safe-fingerprint-match` | Authorized model fingerprint == executing model fingerprint |
| `ASI05-attack-write-then-exec-forbidden-combo` | Execution history is part of the authorization input; write→exec sequences force escalation |
| `ASI05-safe-read-no-forbidden-combo` | Clean history allows execution at nominal tier |
| `ASI06-attack-memory-privilege-claim` | Injected privilege claims in execution history rejected pre-decision |
| `ASI06-attack-history-repetition-anomaly` | Anomalous execution patterns flagged |
| `ASI06-safe-clean-history` | Normal execution context passes |
| `ASI08-attack-circuit-breaker-tripped` | Operator-tripped circuit halts execution regardless of token validity |
| `ASI10-attack-circuit-breaker-auto-trip-on-denials` | Auto-trip on consecutive denials halts rogue execution |
| `ASI10-attack-manual-operator-stop-button` | Manual stop (EU AI Act Art. 14(4)(e)) halts execution with no auto-recovery |
| `ASI10-safe-circuit-closed-normal-operation` | Circuit CLOSED → normal execution proceeds |

---

### Layer 4 — Intent integrity (upper layer, advisory)

Goal hijack detection, prompt injection defense, persona-anomaly scoring. These operate on natural-language content and emit heuristic signals. **SINT treats these as advisory signals, not deterministic authorization decisions** — they can deny at high confidence but they are not in the cryptographic enforcement path.

This separation is load-bearing: the cryptographic layer below (layers 1–2) must remain deterministic and LLM-free to be conformance-testable. Intent-layer heuristics evolve; cryptographic invariants do not.

| Fixture vector | Invariant it exercises | Enforcement class |
|----------------|------------------------|--------------------|
| `ASI01-attack-prompt-injection-ignore-previous` | Regex-layer detection of `ignore previous instructions` pattern family | Advisory → deny at confidence ≥ 0.6 |
| `ASI01-attack-role-override-you-are-now` | Role-override pattern family | Advisory → deny at confidence ≥ 0.6 |
| `ASI01-safe-clean-read-request` | No false-positive on clean params | Advisory → allow |
| `ASI05-attack-arg-injection` | Shell metacharacter + dangerous command keyword combination | Advisory → deny at high severity |

**Conformance claim caveat:** any implementation claiming "ASI01 coverage" must specify whether the claim is cryptographic (deterministic) or heuristic (advisory). SINT's claim is heuristic with fail-open semantics — plugin errors do not block requests. Implementations that overclaim intent integrity as runtime-enforceable at the deterministic layer create a false sense of conformance.

---

## Invariant-level conformance summary

| Integrity invariant | SINT coverage class | Fixture vector count |
|---------------------|---------------------|----------------------|
| **Transmission integrity** | Ed25519 + RFC 8785 JCS (deterministic) | 3 |
| **Authorization integrity at execution** | Gateway re-validation (deterministic) | 10 |
| **Execution integrity** | Model fingerprint + history + circuit breaker (deterministic) | 12 |
| **Intent integrity** | Goal-hijack + arg-injection detectors (advisory, fail-open) | 4 |

29 of 30 fixture vectors map cleanly onto invariants 1–3 (deterministic enforcement). The 4 intent-layer vectors are explicitly scoped as advisory to prevent conformance overclaiming.

---

## Recommended use

For implementers claiming ASI conformance via SINT fixtures:

1. Claim against an **invariant**, not just a control ID. "`ASI02 coverage`" is ambiguous; "`ASI02 via authorization-integrity-at-execution, fixtures X/Y/Z`" is testable.
2. For the intent layer, state explicitly whether the coverage is **deterministic or advisory**. SINT's intent-layer coverage is advisory with fail-open semantics.
3. Transmission-integrity claims must include the specific serialization guarantee. "JCS with recursive key sort, `undefined` omitted, `null` preserved" is testable; "canonical JSON" is not.

---

## Open items

- **Transmission-integrity fixtures gap:** no current vectors for JSONB-round-trip-with-all-optional-fields-populated. Closing via [#175](https://github.com/sint-ai/sint-protocol/issues/175).
- **Intent-layer calibration data:** cross-reference with [HeadyZhang/agent-audit#5](https://github.com/HeadyZhang/agent-audit/issues/5) production defense rates (6% unicode, 4% indirect-injection) to anchor advisory-layer claims in observed data rather than synthetic fixtures.
- **Layer 1 crypto coverage expansion:** explicit fixtures for `undefined`/`null` interaction in `delegationChain.parentTokenId` (followup from #168 review).

---

*Companion to `docs/conformance/owasp-asi-mapping.md`. Feedback via OWASP#802 or sint-ai/sint-protocol issues.*
