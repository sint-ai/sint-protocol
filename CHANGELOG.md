# Changelog

All notable changes to SINT Protocol are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `EvidenceGatedEnvelopePlugin`, `Ed25519ConditionEvidenceVerifier`, and `EvidenceSequenceStore` in `@pshkv/gate-policy-gateway`: condition evidence activates a pre-authorized envelope only after cryptographic verification, freshness, ordering, replay, and conflict checks.
- `PolicyGatewayConfig.dynamicEnvelopeFailurePolicy` (`fallback` | `deny`) so a failing envelope source demotes the physical envelope instead of widening it. Default remains `fail-open` for compatibility.
- `envelopeBinding` on every decision (`transformations.additionalAuditFields`) and `envelopeDigest` on `policy.evaluated`; new ledger event types `policy.envelope.applied` and `policy.envelope.fallback`.
- Physical Envelope Attestation Profile v0.1: protocol-neutral adversarial fixture (25 cases), JSON schema, SINT reference runner, and `docs/specs/physical-envelope-attestation-profile-v0.1.md` (SINT × DriftCore).
- `scripts/check-md-links.mjs` and the `check:links` script; the conformance package now has a `typecheck` script included in the root typecheck.
- `docs/roadmap.md` rewritten as the single canonical roadmap; `ROADMAP.md` pointer at the root; `docs/archive/` index.

### Changed
- All documentation, comments, scripts, and templates now use the published `@pshkv` npm scope instead of the never-published `@sint` scope. This repairs the root `bench` and `sintctl` scripts and the sintctl certification command.
- Repository layout: April 2026 session reports and superseded plans moved to `docs/archive/`; marketing copy to `docs/marketing/`; papers, releases, specs, and the conformance matrix into their `docs/` subdirectories; `docs/sip` merged into `docs/sips`; the whitepaper is now `docs/whitepaper.md`.
- 131 TypeScript errors in `@pshkv/conformance-tests` fixed without changing test assertions.

### Removed
- Orphaned `packages/gate-capability-tokens/` stub (never built; the real package is `packages/capability-tokens`).
- Duplicate `apps/sint-scan-standalone/` (older copy of `apps/sint-mcp-scanner-standalone`, same npm name).
- Byte-identical duplicate `docs/rfc-001-policy-bundle.md` (canonical copy: `docs/rfcs/RFC-001-policy-bundle.md`).

### Fixed
- Broken relative links across the docs tree (now zero).
- Missing `LICENSE` files in `bridge-health`, `bridge-homeassistant`, and `bridge-matter`.

## [0.1.0] — 2026-04-11

Initial public release — runtime authorization framework for physical AI agents.

### Added

**Core security primitives**
- `@pshkv/core` — Shared types, Zod schemas, tier constants, CL-1.0 Constraint Language (validator, merger, tighten-only checker)
- `@pshkv/gate-capability-tokens` — Ed25519 token issuance, delegation (max depth 3), cascade revocation
- `@pshkv/gate-evidence-ledger` — SHA-256 hash-chained append-only audit log, PostgreSQL persistence
- `@pshkv/gate-policy-gateway` — PolicyGateway.intercept() single choke point, 6 safety invariants, OWASP ASI01-10 coverage

**12 Protocol bridge adapters**
- `@pshkv/bridge-mcp` — MCP tool call interception, T3_COMMIT for bash/exec/eval (ASI05)
- `@pshkv/bridge-ros2` — ROS 2 cmd_vel/service enforcement, <5ms p99 latency
- `@pshkv/bridge-mavlink` — MAVLink v2 command interception
- `@pshkv/bridge-iot` — MQTT/CoAP, device profiles (PLC/actuator/sensor), e-stop detection
- `@pshkv/bridge-a2a` — Google A2A AgentSkill boundary enforcement
- `@pshkv/bridge-economy` — Agent payment authorization, per-agent budgets, receipt binding
- `@pshkv/bridge-swarm` — Multi-agent collective constraints (kinetic energy ceiling, min inter-agent distance)
- `@pshkv/bridge-grpc`, `@pshkv/bridge-opcua`, `@pshkv/bridge-open-rmf`, `@pshkv/bridge-mqtt-sparkplug`

**Ecosystem packages**
- `@pshkv/token-registry` — Public capability token registry, `/v1/registry` gateway routes
- `@pshkv/memory` — Ledger-backed operator memory (WorkingMemory + OperatorMemory)
- `@pshkv/interface-bridge` — Voice-first SINT Command HUD (Web Speech API, zero external deps)

**Safety plugins** (all integrated at PolicyGateway.intercept())
- GoalHijackPlugin (ASI01) — 5-layer heuristic injection detection
- MemoryIntegrityChecker (ASI06) — replay, privilege claims, credential funnel, velocity loops
- DefaultSupplyChainVerifier (ASI04) — model fingerprint hash + allowlist at runtime
- CircuitBreakerPlugin — EU AI Act Art. 14(4)(e) compliant emergency stop, HALF_OPEN recovery
- SafetyPermitPlugin — Async external hardware safety resolver, fail-open
- DynamicEnvelopePlugin — Environment-adaptive constraint tightening
- EconomyPlugin — Per-agent budgets with tiered approval
- ProactiveEscalationEngine — CSML behavioral drift monitoring across multi-turn windows

**Constraint Language CL-1.0** (`@pshkv/core`)
- Structured `ConstraintEnvelope`: physical / behavioral / model / attestation / dynamic / execution
- Full backward compatibility with legacy corridor fields
- `validateConstraintEnvelope()`, `resolveEffectiveConstraints()`, `mergeConstraintEnvelopes()`, `checkTightenOnlyViolations()`

**Compliance**
- OWASP Agentic Top 10 ASI01-10: 10/10 coverage (machine-readable: `docs/conformance/owasp-asi-mapping.md`)
- 29 regression fixture pairs: `packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json`
- EU AI Act Art. 14(4)(e): CircuitBreakerPlugin
- IEC 62443 / ISO 10218: physical constraints in cryptographic tokens

**SDKs**
- TypeScript SDK (`@pshkv/sdk`)
- Python SDK — OpenAI Agents + CrewAI adapters, fail-closed timeout semantics
- Rust SDK (`sint-client`) — fluent SintRequestBuilder, retry with backoff, ledger queries

**Stats:** 42 packages · 1,973+ tests · Apache 2.0

---

## 2026-03-21

### Added
- `ARCHITECTURE.md` created to define current SINT system architecture, invariants, and change rules. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `docs/archive/planning/MODULES.md` created to define canonical app/package module map and governance update rules. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `CHANGELOG.md` baseline created for protocol-compliant per-task history. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `docs/tsc/DECISIONS.md` baseline created for ADR tracking. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
