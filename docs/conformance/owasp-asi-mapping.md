# SINT Protocol — OWASP ASI01–ASI10 Conformance Mapping

**Document ID:** `sint-conformance-owasp-asi-v1`
**Schema version:** `2026-04-10`
**Status:** Certified (Phase 3 complete)
**Companion fixture pack:** `packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json`
**Companion test file:** `packages/conformance-tests/src/owasp-asi-conformance.test.ts`

---

## Overview

This document maps each control in the [OWASP Agentic Security Initiative (ASI) Top 10](https://owasp.org/www-project-agentic-security-initiative/) to the SINT Protocol enforcement checkpoint, the implementation class, and the test coverage status.

SINT is a security enforcement layer for physical AI. Every agent action — tool call, ROS 2 topic publish, actuator command — flows through `PolicyGateway.intercept()`. No action bypasses the gateway. This architecture allows all ASI controls to be enforced at a single choke point.

---

## Control-to-Checkpoint Mapping

### ASI01 — Goal Hijack / Prompt Injection

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 1a, before token resolution |
| **Implementation** | `DefaultGoalHijackDetector` (`packages/policy-gateway/src/goal-hijack.ts`) |
| **Config field** | `PolicyGatewayConfig.goalHijackDetector` |
| **Heuristics** | 5 layered pattern families: prompt injection, role override, cross-agent injection, semantic escalation, system-prompt exfiltration |
| **Deny condition** | `hijackDetected && confidence >= 0.6` |
| **Policy violated** | `GOAL_HIJACK` |
| **Fail behaviour** | Fail-open: plugin errors do not block requests |
| **Fixture cases** | `ASI01-attack-prompt-injection-ignore-previous`, `ASI01-attack-role-override-you-are-now`, `ASI01-safe-clean-read-request` |

**Enforcement detail:** `DefaultGoalHijackDetector.analyze()` recursively extracts all string values from `request.params`, concatenates them, and evaluates 25+ regex patterns across five families. The highest-weight match dominates; a small additive bonus rewards multi-pattern hits. Confidence ≥ 0.6 triggers a deny with `GOAL_HIJACK`.

---

### ASI02 — Tool Misuse / Resource Scope Abuse

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 4, `validateCapabilityToken()` |
| **Implementation** | `validateCapabilityToken` (`packages/capability-tokens/src/`) + `assignTier` |
| **Deny condition** | Token `resource` glob does not match `request.resource`, or token `actions` does not include `request.action` |
| **Policy violated** | `RESOURCE_MISMATCH` / `ACTION_NOT_PERMITTED` |
| **Fixture cases** | `ASI02-attack-scope-mismatch-exec-with-filesystem-token`, `ASI02-attack-wrong-action-on-resource`, `ASI02-safe-matching-scope-and-action` |

**Enforcement detail:** Each capability token carries a resource glob (e.g., `mcp://filesystem/*`) and an explicit actions list (e.g., `["call"]`). The gateway validates both against the incoming request before any tier assignment. A token scoped to `mcp://filesystem/*` cannot authorize `mcp://exec/run`.

---

### ASI03 — Identity Abuse / Token Forgery

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — steps 3–4: revocation check + `validateCapabilityToken()` |
| **Implementation** | `validateCapabilityToken` Ed25519 signature check, expiry check, subject match |
| **Deny conditions** | Token expired (`TOKEN_EXPIRED`), Ed25519 signature invalid, token subject ≠ `request.agentId` |
| **Policy violated** | `TOKEN_EXPIRED`, `INVALID_TOKEN`, `SUBJECT_MISMATCH` |
| **Fixture cases** | `ASI03-attack-expired-token`, `ASI03-attack-subject-mismatch`, `ASI03-safe-valid-token-correct-subject` |

**Enforcement detail:** Tokens are Ed25519-signed by the issuer keypair using `@noble/ed25519`. The validator checks the signature, verifies `expiresAt > now`, and confirms `token.subject === request.agentId`. Any mismatch yields a deny before tier assignment.

---

### ASI04 — Supply Chain / Model Fingerprint

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 4e, after token validation |
| **Implementation** | `DefaultSupplyChainVerifier` (`packages/policy-gateway/src/supply-chain.ts`) |
| **Config field** | `PolicyGatewayConfig.supplyChainVerifier` |
| **Checks** | (1) `token.modelConstraints.modelFingerprintHash` vs `request.executionContext.model.modelFingerprintHash`; (2) `token.modelConstraints.allowedModelIds` allowlist; (3) bridge protocol consistency |
| **Deny condition** | Any check fails at `severity = "high"` |
| **Policy violated** | `SUPPLY_CHAIN_VIOLATION` |
| **Fail behaviour** | Fail-open: plugin errors do not block requests |
| **Fixture cases** | `ASI04-attack-model-fingerprint-mismatch`, `ASI04-attack-model-id-not-allowlisted`, `ASI04-safe-fingerprint-match` |

**Enforcement detail:** At token-issuance time, operators embed a SHA-256 hash of the approved model weights and/or an ID allowlist in `modelConstraints`. At runtime, `DefaultSupplyChainVerifier` compares these against the model metadata in `request.executionContext`. A fingerprint mismatch signals potential model substitution or supply chain compromise.

---

### ASI05 — Unsafe Code Execution

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | (a) `PolicyGateway.intercept()` — step 5, `assignTier()`; (b) `checkForbiddenCombos()` — combo detection; (c) step 6b, `argInjectionDetector` — parameter semantic analysis |
| **Implementation** | `assignTier` tier rules (`mcp://exec/*` → `T3_COMMIT`); `checkForbiddenCombos` (`packages/policy-gateway/src/forbidden-combos.ts`); `DefaultArgInjectionDetector` (`packages/policy-gateway/src/arg-injection-detector.ts`) |
| **Config field** | `PolicyGatewayConfig.argInjectionDetector` |
| **Full coverage** | `mcp://exec/*` resource is classified as `T3_COMMIT` and escalated; `filesystem.write → exec.run` sequence triggers forbidden combo; shell metacharacters, path traversal, env variable injection, and code patterns in params are detected and denied |
| **Deny condition** | `injResult.detected && injResult.severity === "high"` (confidence > 0.5) |
| **Policy violated** | `ESCALATION_REQUIRED` (via escalate action), `FORBIDDEN_COMBO`, `ARG_INJECTION_DETECTED` |
| **Fail behaviour** | Fail-open: plugin errors do not block requests |
| **Fixture cases** | `ASI05-attack-write-then-exec-forbidden-combo`, `ASI05-attack-exec-resource-escalates`, `ASI05-attack-arg-injection`, `ASI05-safe-read-no-forbidden-combo` |

**Enforcement detail:** The tier assigner maps `mcp://exec/*` to `T3_COMMIT` unconditionally. The forbidden combos checker matches the `recentActions` array against built-in rules; `filesystem.writeFile` in history before `exec.run` triggers a forced `T3_COMMIT` escalation, requiring human approval before execution. `DefaultArgInjectionDetector` recursively scans all string values in `request.params` for four pattern families: (1) shell metacharacters combined with dangerous command keywords (`rm`, `curl`, `wget`, `nc`, `bash`, `sh`, `python`, `eval`); (2) path traversal sequences (`../`, `/etc/`, `/proc/`, `~/.ssh/`, `/root/`); (3) environment variable injection (`$HOME`, `$PATH`, `${...}`, `%APPDATA%`); (4) code execution patterns (`import os`, `subprocess`, `exec(`, `eval(`). A high-severity match with confidence > 0.5 immediately denies the request with `ARG_INJECTION_DETECTED`.

---

### ASI06 — Memory Poisoning / Context Injection

| Attribute | Value |
|-----------|-------|
| **Coverage** | Partial |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 1b-pre, before circuit breaker check |
| **Implementation** | `DefaultMemoryIntegrityChecker` (`packages/policy-gateway/src/memory-integrity.ts`) |
| **Config field** | `PolicyGatewayConfig.memoryIntegrity` |
| **Checks** | (1) History length overflow (> 50); (2) Unauthorized privilege claims; (3) Suspicious repetition (> 5 consecutive identical); (4) Impossible action sequences; (5) UUIDv7 timestamp monotonicity (rollback detection) |
| **Deny condition** | `severity = "high"` (privilege claim, timestamp rollback) |
| **Policy violated** | `MEMORY_POISONING` |
| **Known gaps** | No vector-embedding anomaly analysis; no cross-session memory correlation |
| **Fail behaviour** | Fail-open: plugin errors do not block requests |
| **Fixture cases** | `ASI06-attack-memory-privilege-claim`, `ASI06-attack-history-repetition-anomaly`, `ASI06-safe-clean-history` |

**Enforcement detail:** `DefaultMemoryIntegrityChecker.check()` inspects `request.recentActions` for patterns indicating injected or fabricated history. Unauthorized privilege claims (`"admin approved"`, `"granted full access"`, etc.) are classified as high-severity and immediately deny the request. Repetition anomalies and impossible sequences are medium/low severity — they warn via the ledger but do not block.

---

### ASI07 — Inter-Agent Trust / Delegation Chain

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | (a) `delegateCapabilityToken()` at delegation time; (b) `PolicyGateway.intercept()` step 4 for chain validation; (c) A2A bridge `A2AInterceptor` for DID key verification |
| **Implementation** | `delegateCapabilityToken` (`packages/capability-tokens/src/`); `A2AInterceptor` (`packages/bridge-a2a/src/`) |
| **Delegation depth limit** | Max 3 hops (depth 0→3); depth 4 fails with `DELEGATION_DEPTH_EXCEEDED` |
| **A2A trust** | `did:key` validation on agent cards; delegation chain integrity verified per hop |
| **Fail condition** | `delegateCapabilityToken` returns `{ ok: false, error: "DELEGATION_DEPTH_EXCEEDED" }` |
| **Fixture cases** | `ASI07-attack-a2a-missing-did-key`, `ASI07-attack-delegation-depth-exceeded`, `ASI07-safe-valid-delegation-chain` |

**Enforcement detail:** Delegation is attenuation-only — each delegated token can only narrow permissions. The maximum delegation depth is 3. Attempting a 4th hop returns an error at token issuance time, preventing deep chains that obscure accountability. The A2A bridge validates `did:key` cryptographic identifiers before forwarding inter-agent requests.

---

### ASI08 — Resource Exhaustion

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 4b (rate limiting) and step 1b (circuit breaker) |
| **Implementation** | `InMemoryRateLimitStore` (`packages/persistence/`); `InMemoryCircuitBreaker` (`packages/policy-gateway/src/circuit-breaker.ts`) |
| **Config fields** | `PolicyGatewayConfig.rateLimitStore`, `PolicyGatewayConfig.circuitBreaker` |
| **Rate limit** | Per-token sliding window: `token.constraints.rateLimit.maxCalls` per `windowMs` |
| **Circuit breaker** | `failureThreshold` denials → OPEN; `halfOpenAfterMs` → HALF_OPEN probe; `successThreshold` successes → CLOSED |
| **Policy violated** | `RATE_LIMIT_EXCEEDED`, `CIRCUIT_OPEN` |
| **Fixture cases** | `ASI08-attack-rate-limit-exhaustion`, `ASI08-attack-circuit-breaker-tripped`, `ASI08-safe-within-rate-limit` |

**Enforcement detail:** Rate limiting is enforced via a sliding-window bucket keyed by `tokenId`. The circuit breaker tracks denials per agent; excess denials open the circuit and block all subsequent requests. The circuit auto-transitions to HALF_OPEN after `halfOpenAfterMs` to test recovery, unless it was manually tripped by an operator.

---

### ASI09 — Human Oversight Bypass

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — steps 5–7: tier assignment → escalation decision |
| **Implementation** | `assignTier` tier rules; `ApprovalQueue` (`packages/policy-gateway/src/approval-flow.ts`) |
| **T2 / T3 escalation** | `T2_ACT` requires operator approval; `T3_COMMIT` requires human approval with configurable timeout |
| **Fail-closed** | On approval timeout, fallback is `deny` or `safe-stop` (never auto-allow) |
| **Policy violated** | Escalation response (action=`escalate`), `TOKEN_REVOKED` |
| **Fixture cases** | `ASI09-attack-t2-escalation-no-human`, `ASI09-attack-revoked-token-bypass`, `ASI09-safe-t1-auto-allow` |

**Enforcement detail:** The tier system enforces human-in-the-loop for all T2/T3 actions. `T3_COMMIT` (e.g., code execution, fund transfer, mode change) always returns `action = "escalate"` — there is no path to auto-allow. The `ApprovalQueue` manages pending decisions with configurable quorum and timeout; on timeout, the action is denied (fail-closed). Revoked tokens are rejected pre-tier-assignment, preventing any bypass.

---

### ASI10 — Rogue / Autonomous Agent

| Attribute | Value |
|-----------|-------|
| **Coverage** | Full |
| **Enforcement checkpoint** | `PolicyGateway.intercept()` — step 1b (circuit breaker state check) and step 5c (CSML auto-trip) |
| **Implementation** | `InMemoryCircuitBreaker` (`packages/policy-gateway/src/circuit-breaker.ts`); CSML auto-trip in gateway step 5c |
| **Config field** | `PolicyGatewayConfig.circuitBreaker` |
| **Stop button** | `CircuitBreaker.trip(agentId, reason)` — operator manual OPEN; stays OPEN indefinitely (no auto-recovery) |
| **Auto-trip** | CSML anomalous persona score → `trip()` called automatically by gateway |
| **Recovery path** | `CircuitBreaker.reset(agentId)` — operator explicit reset only for manual trips |
| **Policy violated** | `CIRCUIT_OPEN` |
| **EU AI Act** | Implements Article 14(4)(e) human oversight requirement |
| **Fixture cases** | `ASI10-attack-circuit-breaker-auto-trip-on-denials`, `ASI10-attack-manual-operator-stop-button`, `ASI10-safe-circuit-closed-normal-operation` |

**Enforcement detail:** The circuit breaker is the primary rogue-agent containment mechanism. After `failureThreshold` consecutive denials within `windowMs`, the circuit opens and all requests for that agent return `CIRCUIT_OPEN`. Operators can also manually trip the circuit via `trip()`. Manual trips set `manualTrip = true` which prevents the auto-HALF_OPEN transition — only an explicit `reset()` call re-opens the agent. The CSML escalation plugin additionally auto-trips the circuit when an anomalous persona score is detected.

---

## Coverage Summary

| Control | Coverage | Key Class | Policy Violated |
|---------|----------|-----------|-----------------|
| ASI01 Goal Hijack | **Full** | `DefaultGoalHijackDetector` | `GOAL_HIJACK` |
| ASI02 Tool Misuse | **Full** | `validateCapabilityToken` | `RESOURCE_MISMATCH` |
| ASI03 Identity Abuse | **Full** | `validateCapabilityToken` (Ed25519) | `TOKEN_EXPIRED`, `INVALID_TOKEN` |
| ASI04 Supply Chain | **Full** | `DefaultSupplyChainVerifier` | `SUPPLY_CHAIN_VIOLATION` |
| ASI05 Code Execution | **Full** | `assignTier` + `checkForbiddenCombos` + `DefaultArgInjectionDetector` | `ESCALATION_REQUIRED`, `ARG_INJECTION_DETECTED` |
| ASI06 Memory Poisoning | **Partial** | `DefaultMemoryIntegrityChecker` | `MEMORY_POISONING` |
| ASI07 Inter-Agent Trust | **Full** | `delegateCapabilityToken` + `A2AInterceptor` | `DELEGATION_DEPTH_EXCEEDED` |
| ASI08 Resource Exhaustion | **Full** | `InMemoryCircuitBreaker` + rate limiting | `RATE_LIMIT_EXCEEDED`, `CIRCUIT_OPEN` |
| ASI09 Human Oversight Bypass | **Full** | T2/T3 escalation + `ApprovalQueue` | `ESCALATION_REQUIRED` |
| ASI10 Rogue/Autonomous Agent | **Full** | `InMemoryCircuitBreaker.trip()` + CSML | `CIRCUIT_OPEN` |

### Known Gaps

- **ASI05:** Argument injection detection added via `DefaultArgInjectionDetector`. Shell metacharacters, path traversal, env injection, and code patterns in params are now detected and denied at high severity.
- **ASI06:** No vector-embedding anomaly analysis for semantic memory poisoning. The checker uses regex heuristics on string history entries, not embedding-space distance metrics.

---

## Certification Notes

- All 10 ASI controls are addressed. 9 of 10 are fully covered; 1 (ASI06) has partial coverage with documented gaps.
- The fixture pack (`owasp-asi-conformance.v1.json`) provides 30 machine-readable test vectors (attack + safe cases per control).
- Tests in `owasp-asi-conformance.test.ts` run against a live `PolicyGateway` instance with real plugins instantiated.
- These tests are part of the `@sint/conformance-tests` suite and must pass on every PR touching `@sint/gate-policy-gateway`, `@sint/gate-capability-tokens`, or any bridge adapter.

---

*Generated by SINT Protocol Phase 3 — 2026-04-10*
