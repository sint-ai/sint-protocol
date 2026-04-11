# Changelog

All notable changes to SINT Protocol are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-04-11

Initial public release — runtime authorization framework for physical AI agents.

### Added

**Core security primitives**
- `@sint/core` — Shared types, Zod schemas, tier constants, CL-1.0 Constraint Language (validator, merger, tighten-only checker)
- `@sint/gate-capability-tokens` — Ed25519 token issuance, delegation (max depth 3), cascade revocation
- `@sint/gate-evidence-ledger` — SHA-256 hash-chained append-only audit log, PostgreSQL persistence
- `@sint/gate-policy-gateway` — PolicyGateway.intercept() single choke point, 6 safety invariants, OWASP ASI01-10 coverage

**12 Protocol bridge adapters**
- `@sint/bridge-mcp` — MCP tool call interception, T3_COMMIT for bash/exec/eval (ASI05)
- `@sint/bridge-ros2` — ROS 2 cmd_vel/service enforcement, <5ms p99 latency
- `@sint/bridge-mavlink` — MAVLink v2 command interception
- `@sint/bridge-iot` — MQTT/CoAP, device profiles (PLC/actuator/sensor), e-stop detection
- `@sint/bridge-a2a` — Google A2A AgentSkill boundary enforcement
- `@sint/bridge-economy` — Agent payment authorization, per-agent budgets, receipt binding
- `@sint/bridge-swarm` — Multi-agent collective constraints (kinetic energy ceiling, min inter-agent distance)
- `@sint/bridge-grpc`, `@sint/bridge-opcua`, `@sint/bridge-open-rmf`, `@sint/bridge-mqtt-sparkplug`

**Ecosystem packages**
- `@sint/token-registry` — Public capability token registry, `/v1/registry` gateway routes
- `@sint/memory` — Ledger-backed operator memory (WorkingMemory + OperatorMemory)
- `@sint/interface-bridge` — Voice-first SINT Command HUD (Web Speech API, zero external deps)

**Safety plugins** (all integrated at PolicyGateway.intercept())
- GoalHijackPlugin (ASI01) — 5-layer heuristic injection detection
- MemoryIntegrityChecker (ASI06) — replay, privilege claims, credential funnel, velocity loops
- DefaultSupplyChainVerifier (ASI04) — model fingerprint hash + allowlist at runtime
- CircuitBreakerPlugin — EU AI Act Art. 14(4)(e) compliant emergency stop, HALF_OPEN recovery
- SafetyPermitPlugin — Async external hardware safety resolver, fail-open
- DynamicEnvelopePlugin — Environment-adaptive constraint tightening
- EconomyPlugin — Per-agent budgets with tiered approval
- ProactiveEscalationEngine — CSML behavioral drift monitoring across multi-turn windows

**Constraint Language CL-1.0** (`@sint/core`)
- Structured `ConstraintEnvelope`: physical / behavioral / model / attestation / dynamic / execution
- Full backward compatibility with legacy corridor fields
- `validateConstraintEnvelope()`, `resolveEffectiveConstraints()`, `mergeConstraintEnvelopes()`, `checkTightenOnlyViolations()`

**Compliance**
- OWASP Agentic Top 10 ASI01-10: 10/10 coverage (machine-readable: `docs/conformance/owasp-asi-mapping.md`)
- 29 regression fixture pairs: `packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json`
- EU AI Act Art. 14(4)(e): CircuitBreakerPlugin
- IEC 62443 / ISO 10218: physical constraints in cryptographic tokens

**SDKs**
- TypeScript SDK (`@sint/sdk`)
- Python SDK — OpenAI Agents + CrewAI adapters, fail-closed timeout semantics
- Rust SDK (`sint-client`) — fluent SintRequestBuilder, retry with backoff, ledger queries

**Stats:** 42 packages · 1,973+ tests · Apache 2.0

---

## 2026-03-21

### Added
- `ARCHITECTURE.md` created to define current SINT system architecture, invariants, and change rules. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `MODULES.md` created to define canonical app/package module map and governance update rules. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `CHANGELOG.md` baseline created for protocol-compliant per-task history. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
- `DECISIONS.md` baseline created for ADR tracking. (Agent: Linus / 116f366b-ccac-4412-8ba9-d22f1d84cc3b)
