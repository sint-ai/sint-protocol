# SINT Protocol Whitepaper — Outline

> **Status:** Draft outline. Full whitepaper in progress.

## Abstract

SINT Protocol is a layered open standard for security, governance, and economic enforcement in physical AI systems. As AI agents gain the ability to control robots, execute code, move funds, and operate machinery, SINT provides the missing security stack between "the LLM decided to do X" and "X happened in the physical world."

## 1. Introduction

- The rise of autonomous AI agents with physical-world capabilities
- The security gap: no standard enforcement layer between AI decisions and physical actions
- Why existing approaches (prompt engineering, model alignment) are insufficient for physical safety
- SINT's thesis: security must be enforced at the protocol level, not the model level

## 2. Problem Statement

- **Uncontrolled agent autonomy** — agents can chain tool calls with no authorization checks
- **No audit trail** — actions disappear after execution, making forensics impossible
- **Permission sprawl** — agents inherit the full permissions of their host environment
- **Physical safety** — a software bug becomes a physical hazard when agents control actuators
- **Delegation risk** — agents delegating to other agents with no attenuation guarantees

## 3. Architecture

### 3.1 Design Principles
- Single choke point (Policy Gateway)
- Result types over exceptions
- Append-only audit
- Attenuation-only delegation
- Physical constraints as first-class citizens

### 3.2 Layer Model
- **Layer 0: Identity** — Ed25519 keypairs, agent sessions, delegation chains
- **Layer 1: Policy** — Capability tokens, tier classification, constraint enforcement
- **Layer 2: Enforcement** — Policy Gateway intercept, forbidden combination detection
- **Layer 3: Evidence** — Hash-chained ledger, proof receipts, tamper detection
- **Layer 4: Bridges** — Protocol-specific adapters (MCP, ROS 2, gRPC, MQTT)

### 3.3 Approval Tiers
- T0 OBSERVE → T1 PREPARE → T2 ACT → T3 COMMIT
- Mapping physical consequence severity to authorization requirements
- Dynamic escalation triggers (human proximity, untrusted agent, forbidden sequences)

## 4. Capability Token System

- Ed25519-signed tokens with resource scoping and action restrictions
- Physical constraint embedding (max velocity, max force, geofence polygons)
- Delegation chains with max 3-hop depth and mandatory attenuation
- Revocation: instant invalidation via revocation store
- Token lifecycle: issuance → delegation → exercise → expiry/revocation

## 5. Policy Gateway

- The single intercept point for all agent actions
- Tier assignment algorithm
- Constraint validation (physical bounds checking)
- Forbidden combination detection (temporal sequence analysis)
- Per-server policy enforcement (maxTier ceilings, requireApproval overrides)
- Batch evaluation for atomic multi-action requests

## 6. Evidence Ledger

- SHA-256 hash-chained append-only log
- Event schema and chain integrity
- Proof receipts for individual decisions
- Query interface for forensics and compliance
- Storage backend abstraction (in-memory, PostgreSQL, Redis)

## 7. Bridge Architecture

### 7.1 MCP Bridge
- Tool call interception and risk classification
- Multi-server aggregation with per-server policy
- Built-in security tools (sint__ prefix)

### 7.2 ROS 2 Bridge
- Topic, service, and action interception
- Physics extraction from ROS 2 messages (velocity, force, position)
- Real-time constraint enforcement for robot commands

### 7.3 Future Bridges
- gRPC service interception
- MQTT topic filtering
- HTTP/REST API gateway mode

## 8. Economic Layer (Future)

- Token-gated access to SINT infrastructure
- Staking for agent identity and reputation
- Economic penalties for policy violations
- Marketplace for policy templates and bridge adapters
- Governance: protocol upgrades via token holder voting

## 9. Security Analysis

- Threat model: compromised agent, malicious delegation, replay attacks
- Formal properties: no bypass, no escalation, tamper evidence
- Comparison with existing approaches (OAuth, RBAC, ABAC)
- Limitations and known trade-offs

## 10. Implementation

- Reference implementation: TypeScript monorepo
- Package architecture and dependency graph
- Performance characteristics and benchmarks
- Deployment models: embedded, sidecar, gateway

## 11. Related Work

- Model Context Protocol (MCP) — Anthropic
- Robot Operating System 2 (ROS 2)
- Capability-based security (Dennis & Van Horn, 1966)
- SPIFFE/SPIRE for workload identity
- Open Policy Agent (OPA)

## 12. Conclusion & Roadmap

- Current status: working public reference implementation with docs, examples, and conformance tooling
- Near-term: production hardening, additional bridges, conformance certification
- Medium-term: economic layer, governance framework, ecosystem growth
- Long-term: industry standard for physical AI security

## Appendices

- A. API Reference
- B. Configuration Examples
- C. Conformance Test Specification
- D. Glossary of Terms
