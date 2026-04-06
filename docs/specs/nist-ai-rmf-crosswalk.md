# SINT Protocol — NIST AI RMF Crosswalk

**Version:** 0.2.0 — April 2026
**Status:** Draft for community review and NIST submission

---

## Purpose

This document maps SINT Protocol components to the NIST Artificial Intelligence Risk Management Framework (AI RMF 1.0, NIST AI 100-1, January 2023) to support enterprises seeking AI governance alignment.

SINT Protocol is an open-source security, governance, and audit enforcement layer that sits between AI agents and the systems they control (MCP tool servers, ROS 2 robots, IoT gateways, financial systems). Every agent action flows through a single `PolicyGateway` that enforces capability-based permissions, graduated approval tiers (T0–T3), and tamper-evident audit logging.

This crosswalk is intended to support:

1. Enterprise compliance teams evaluating SINT for AI governance programs
2. NIST reviewers assessing open-source reference implementations of the AI RMF
3. Organizations subject to the EU AI Act or ISO 42001 seeking mapping evidence
4. Researchers interested in the implementation gap between AI RMF controls and deployed systems

All claims in this document correspond to specific source files in the SINT Protocol repository. File paths are provided for every mapping row.

---

## NIST AI RMF Mapping Table

| NIST AI RMF | Sub-category | SINT Component | Evidence (source file) |
|---|---|---|---|
| GOVERN-1.1 | Policies, processes, and mechanisms to establish and maintain human oversight of AI systems | T2/T3 approval tiers; M-of-N quorum; `CircuitBreaker.trip()` | `packages/policy-gateway/src/approval-queue.ts`; `packages/policy-gateway/src/circuit-breaker-plugin.ts` |
| GOVERN-1.2 | Risk tolerance is established and communicated | Tier thresholds (T0–T3); `deploymentProfile` per-server policy ceilings | `packages/core/src/constants/tiers.ts`; `packages/policy-gateway/src/gateway.ts` |
| GOVERN-1.4 | Organizational teams are committed to a culture that includes AI risk management | Conformance test suite (1,197 tests); OWASP ASI regression tests required on every PR | `packages/conformance-tests/`; `CLAUDE.md` |
| GOVERN-4.1 | Organizational accountability for AI risk is clearly established | Evidence Ledger; SHA-256 hash-chained, append-only; proof receipts | `packages/evidence-ledger/src/ledger.ts` |
| GOVERN-5.1 | Mechanisms are in place for AI actors to report concerns | `CircuitBreaker.trip()` (operator stop); SIEM export for external reporting | `packages/policy-gateway/src/circuit-breaker-plugin.ts`; `packages/bridge-mcp/src/siem-exporter.ts` |
| GOVERN-6.1 | Risk tolerance is applied in AI system design | `SintDeploymentProfile` per-server policy (`maxTier`, `requireApproval`, `rateLimit`) | `packages/core/src/types/policy.ts` |
| MAP-1.1 | Context is established for the AI risk assessment | `ApprovalTier` T0–T3 classifies every request by consequence level | `packages/core/src/constants/tiers.ts`; `packages/bridge-mcp/src/tam.ts` |
| MAP-1.5 | Organizational risk priorities align with AI system risks | Per-server deployment profiles; OWASP ASI coverage map | `packages/core/src/constants/compliance.ts` |
| MAP-2.2 | Scientific findings and context of use are identified | `deploymentProfile` presets: `warehouse-amr`, `industrial-cell`, `swarm-coordinator` | `packages/core/src/types/policy.ts` |
| MAP-3.5 | Risks associated with AI system context of use are identified | CSML (Composite Safety Metric Level) 5-component formula; `computeCsml()` | `packages/avatar/src/csml.ts` |
| MAP-5.1 | Likelihood and magnitude of each identified AI risk is estimated | Physical constraints: `maxVelocityMps`, `maxForceNewtons`, geofence polygon | `packages/core/src/types/capability.ts` |
| MEASURE-1.1 | Approaches for measurement of AI risk are identified | CSML score (0.0–1.0); 5-component formula: anomaly freq., forbidden combos, human proximity, force margin, velocity margin | `packages/avatar/src/csml.ts` |
| MEASURE-2.5 | AI system bias and fairness are evaluated | Per-model CSML scoring; `computeCsmlPerModel()` detects model-specific behavioral drift | `packages/avatar/src/csml.ts` |
| MEASURE-2.6 | AI system operation is monitored | Evidence Ledger continuous monitoring; SHA-256 hash chain detects tampering | `packages/evidence-ledger/src/ledger.ts` |
| MEASURE-2.8 | AI system performance is evaluated for consistency | Policy Gateway p99 < 5ms benchmark; `pnpm bench` in CI | `packages/policy-gateway/bench/`; `docs/reports/` |
| MEASURE-3.3 | AI risks are monitored for new developments | CSML drift detection auto-escalates agents showing anomalous behavior; `ProactiveEscalationEngine` | `packages/avatar/src/proactive-escalation.ts` |
| MANAGE-1.3 | Risk response plans are developed and applied | Tier escalation (`T2_act → T3_commit` on human detection); `ProactiveEscalationEngine` | `packages/avatar/src/proactive-escalation.ts`; `packages/policy-gateway/src/gateway.ts` |
| MANAGE-2.2 | Mechanisms are applied to maximize benefits of AI while minimizing risk | Capability token attenuation (permissions only decrease on delegation); T0–T3 treatment tiers | `packages/capability-tokens/src/token.ts` |
| MANAGE-2.4 | Risk treatment is prioritized based on impact | Forbidden action sequence detection auto-escalates dangerous multi-step patterns | `packages/policy-gateway/src/forbidden-combos.ts` |
| MANAGE-4.1 | Post-deployment AI risks and benefits are evaluated | Ledger event queries; per-agent request history; `verifyChain()` integrity check | `packages/evidence-ledger/src/ledger.ts` |
| MANAGE-4.2 | Incident response and recovery processes are applied | `CircuitBreakerPlugin` (instant stop); `EvidenceLedger` forensic trail; SIEM export | `packages/policy-gateway/src/circuit-breaker-plugin.ts`; `packages/bridge-mcp/src/siem-exporter.ts` |

---

## Tier-to-NIST Consequence Mapping

SINT's four approval tiers map to the NIST AI RMF consequence severity spectrum:

| SINT Tier | Consequence Class | NIST AI RMF Pathway | Enforcement |
|-----------|-------------------|---------------------|-------------|
| T0_OBSERVE | Monitoring (no side effects) | MAP + MEASURE + MANAGE (low-consequence path) | Auto-approved, still ledgered |
| T1_PREPARE | Bounded write (reversible) | GOVERN + MANAGE (controlled low-impact) | Auto-approved, capability token + rate limit enforced |
| T2_ACT | Physical state change (partially reversible) | MANAGE (risk response) + GOVERN (accountability) | Escalate to operator approval; physical constraints enforced |
| T3_COMMIT | Irreversible commit (code exec, fund transfer, mode change) | GOVERN + MANAGE (highest-consequence authority) | Human sign-off required; M-of-N quorum optional; circuit breaker available |

Source: `packages/core/src/constants/compliance.ts` — `SINT_TIER_COMPLIANCE_CROSSWALK`.

---

## EU AI Act Alignment

The EU AI Act (Regulation 2024/1689) imposes obligations on providers and deployers of high-risk AI systems. SINT Protocol components directly address the following articles:

| EU AI Act Article | Requirement | SINT Component | Implementation |
|---|---|---|---|
| Article 9 — Risk management system | Continuous identification, analysis, and control of risks | `PolicyGateway` + CSML scoring | Every request evaluated; CSML auto-escalates on detected risk |
| Article 12 — Record-keeping | Automatic logging of events; tamper-evident, time-stamped | `EvidenceLedger` | SHA-256 hash-chained; INSERT-only; sequence numbers; ISO 8601 microsecond timestamps |
| Article 13 — Transparency | Technical documentation; capability disclosure | `CapabilityToken` scope fields | Resource pattern, actions, constraints, expiry all machine-readable |
| Article 14 — Human oversight | Effective human oversight; ability to intervene | T2/T3 approval tiers; M-of-N quorum | Escalation before execution; approval dashboard with SSE streaming |
| Article 14(4)(e) — Override capability | Override, interrupt, or reverse AI system outputs | `CircuitBreaker.trip()` | Instant halt of all T2/T3 actions; manual reset requires explicit human authorization |
| Article 15 — Accuracy, robustness, cybersecurity | Appropriate levels of accuracy and cyber resilience | Attenuation-only delegation; forbidden combos; GoalHijackPlugin | Permissions only decrease on delegation; dangerous sequences blocked |

---

## ISO 42001 Alignment

ISO/IEC 42001:2023 is the AI management system standard. SINT Protocol addresses the operational clauses:

| ISO 42001 Clause | Requirement | SINT Component | Implementation |
|---|---|---|---|
| Clause 6 — Planning | Risk planning; AI impact assessment | Tier assignment + CSML monitoring; `deploymentProfile` | Risk classified at token issuance and re-evaluated at every intercept |
| Clause 8.1 — Operational planning | Processes to implement AI risk treatment | `PolicyGateway.intercept()` | Single choke point; all requests flow through; no bypass paths |
| Clause 8.2 — AI risk assessment | Systematic identification and assessment of AI risks | TAM validation; `validateAgainstTam()` | Per-tool risk declared in operator-controlled manifests |
| Clause 8.3 — AI risk treatment | Apply treatment controls; monitor effectiveness | Capability token constraints; circuit breaker | Physical constraints (force/velocity/geofence) enforced at token and gateway levels |
| Clause 9 — Performance evaluation | Monitor, measure, analyze, evaluate AI management system | `computeCsml()`; `EvidenceLedger` query API | CSML score computed per-agent; ledger queryable with filtering |
| Clause 10 — Improvement | Continual improvement; nonconformity and corrective action | Cascade revocation; token rotation | Compromised token → revoke entire subtree instantly; new token issued |

---

## OWASP Agentic AI Top 10 — Source of Truth

The OWASP Agentic Security Initiative (ASI) Top 10 for 2025 covers AI agent-specific risks. The authoritative coverage map is declared in:

```
packages/core/src/constants/compliance.ts → SINT_OWASP_COVERAGE
```

Summary:
- **Full coverage (8/10):** ASI01, ASI02, ASI03, ASI04, ASI07, ASI08, ASI09, ASI10
- **Partial coverage (2/10):** ASI05 (no semantic argument analysis), ASI06 (memory store not persisted cross-session)
- **Gap documentation:** Each partial entry includes a `gaps` field describing what is not yet addressed

All 10 categories have regression tests in `packages/conformance-tests/src/mcp-attack-surface.test.ts`.

---

## Conformance Test Suite

SINT Protocol's 1,197-test conformance suite provides evidence that security controls function as claimed:

| Test Area | Test File | Controls Verified |
|-----------|-----------|-------------------|
| Token issuance + validation | `capability-tokens.test.ts` | Ed25519 signing, expiry, attenuation constraints |
| Delegation chain | `delegation.test.ts` | Depth limits, attenuation-only rule, revocation propagation |
| Tier assignment | `tier-assignment.test.ts` | T0–T3 classification for MCP and ROS2 resources |
| Forbidden combos | `forbidden-combos.test.ts` | write→exec, credential→http, database sequences |
| Circuit breaker | `circuit-breaker.test.ts` | CLOSED→OPEN→HALF_OPEN state machine; manual trip |
| OWASP ASI | `mcp-attack-surface.test.ts` | All 10 ASI attack classes |
| Evidence ledger | `evidence-ledger.test.ts` | Chain integrity, tamper detection, proof receipts |
| Rate limiting | `rate-limit.test.ts` | Sliding window enforcement, burst handling |
| MCP interceptor | `mcp-interceptor.test.ts` | Forward/deny/escalate decisions; session tracking |

Run: `pnpm run test` from the repository root. All tests must pass before any PR is merged.

---

## Submission Note

This crosswalk document, together with the SINT Protocol v0.2.0 specification, the 1,197-test conformance suite, and the SPAI 2026 abstract ("Layered Security Enforcement for Physical AI: The SINT Protocol"), is being submitted to NIST for consideration in the development of agentic AI guidance supplements to AI RMF 1.0.

**Submission target:** [ai-inquiries@nist.gov](mailto:ai-inquiries@nist.gov)

**Repository:** [github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)

**License:** Apache-2.0

Organizations wishing to provide feedback on this crosswalk are encouraged to open a GitHub Discussion or Issue at the repository above.

---

*This document is not legal advice. Organizations should validate their specific regulatory obligations with qualified legal and compliance counsel.*
