# SINT Protocol: A Layered Open Standard for Security, Governance, and Economic Enforcement in Physical AI Systems

**Version 0.2.0 — April 2026**

## Abstract

As AI agents gain the ability to control robots, execute code, move money, and operate machinery, the gap between "the model decided to act" and "the action happened in the physical world" represents an unaddressed safety risk. SINT Protocol defines a layered security, governance, and economic enforcement standard that sits between AI agents and the physical systems they control. Every agent action flows through a single Policy Gateway that enforces capability-based permissions, graduated approval tiers, and tamper-evident audit logging — ensuring no physical consequence occurs without appropriate authorization.

## 1. Problem Statement

### 1.1 The Authorization Gap

Current AI safety research focuses on alignment — making models want the right things. But even a perfectly aligned model operating through tool-use interfaces (MCP, function calling, ROS 2 actions) has no standardized mechanism to enforce:

- **Who** is authorized to perform an action
- **What** physical constraints apply (velocity limits, force ceilings, geofences)
- **When** human approval is required versus when autonomous operation is safe
- **How** to produce a tamper-evident audit trail of every decision

### 1.2 The Stakes

Physical AI failures are not reversible with `Ctrl+Z`. A robot arm that exceeds force limits, a financial agent that transfers funds without authorization, or a code execution agent that runs destructive commands all produce real-world consequences that cannot be undone. The authorization layer must be as rigorous as the physical systems it protects.

### 1.3 Existing Approaches Fall Short

- **API key / OAuth scoping** — coarse-grained, no physics awareness, no delegation chains
- **Robot safety controllers** — hardware-level, no AI agent awareness, no cross-system policy
- **MCP server permissions** — per-server, no cross-server policy coordination, no approval workflow
- **Smart contract governance** — on-chain latency incompatible with real-time robotics control loops

## 2. Architecture Overview

SINT Protocol defines four layers that compose into a unified security stack:

```
┌──────────────────────────────────────────────┐
│            Layer 4: Economic Enforcement      │
│   Budget limits, metering, billing codes,     │
│   cost-aware routing                          │
├──────────────────────────────────────────────┤
│            Layer 3: Governance                │
│   Approval tiers, escalation policies,        │
│   delegation chains, forbidden combos         │
├──────────────────────────────────────────────┤
│            Layer 2: Identity & Capability     │
│   Ed25519 tokens, resource scoping,           │
│   attenuation-only delegation                 │
├──────────────────────────────────────────────┤
│            Layer 1: Observation & Audit       │
│   Hash-chained evidence ledger,               │
│   tamper detection, proof receipts            │
└──────────────────────────────────────────────┘
```

### 2.1 Layer 1: Observation & Audit

The Evidence Ledger is a SHA-256 hash-chained append-only log. Every policy decision — allow, deny, or escalate — is recorded with:

- Timestamp and sequence number
- Agent identity and capability token reference
- Request details (tool, arguments, context)
- Decision outcome and reasoning
- Previous entry hash (chain integrity)

The ledger is INSERT-only by design. Any modification breaks the hash chain, providing tamper evidence without requiring blockchain infrastructure. Proof receipts allow any party to cryptographically verify that a specific decision was recorded.

### 2.2 Layer 2: Identity & Capability

Agents authenticate via Ed25519-signed capability tokens that encode:

- **Resource scope** — what the agent can access (`ros2:///cmd_vel`, `mcp://filesystem/*`)
- **Action restriction** — what operations are allowed (`publish`, `call`, `subscribe`)
- **Physical constraints** — max velocity (m/s), max force (N), geofence polygon (GeoJSON)
- **Time bounds** — not-before and not-after timestamps
- **Delegation chain** — up to 3 hops, attenuation only

The attenuation-only rule is critical: a delegated token can only reduce permissions, never escalate. An agent with write access to `/tmp` can delegate read-only access to `/tmp/safe`, but cannot delegate write access to `/`.

### 2.3 Layer 3: Governance

The Policy Gateway is the single choke point through which every agent action must flow. It implements graduated approval tiers mapped to physical consequence severity:

| Tier | Name | Authorization | Physical Consequence |
|------|------|---------------|---------------------|
| **T0** | OBSERVE | Auto-approved, logged | None (read-only) |
| **T1** | PREPARE | Auto-approved, audited | Reversible (file write, save waypoint) |
| **T2** | ACT | Requires review | Partially reversible (move robot, operate gripper) |
| **T3** | COMMIT | Requires human | Irreversible (execute code, transfer funds, mode change) |

Tier escalation triggers dynamically adjust authorization requirements:
- Human detected in robot workspace → T2 escalates to T3
- Untrusted or new agent → tier escalates by one level
- Forbidden action sequence detected → automatic T3
- Server policy override → `requireApproval: true` forces approval for all non-T0

**Forbidden Combinations** detect dangerous action sequences across tool boundaries:
- `filesystem.write` → `exec.run` (code injection pattern)
- `credential.read` → `http.request` (credential exfiltration)
- `database.write` → `database.execute` (SQL injection escalation)

### 2.4 Layer 4: Economic Enforcement

Budget limits, metering, and billing codes enable cost-aware policy decisions:
- Per-agent budget ceilings prevent runaway spending
- Billing codes enable cross-team cost attribution
- Cost-aware routing selects cheaper execution paths when safety permits
- Budget exhaustion triggers graceful degradation rather than hard failure

## 3. Agent Coordination Model

### 3.1 Multi-Agent Topology

SINT supports hierarchical agent topologies where parent agents can delegate capabilities to child agents:

```
CEO Agent (full capability set)
├── Research Agent (read-only, T0-T1)
├── Engineering Agent (write, T0-T2, geofenced)
│   ├── Build Agent (exec, T0-T1, /ci/ scope only)
│   └── Deploy Agent (exec, T0-T3, requires approval)
└── Finance Agent (transfer, T0-T3, $10K limit)
```

Each delegation attenuates the parent's capabilities. The CEO agent cannot grant the Finance Agent permissions the CEO itself does not hold.

### 3.2 Cross-System Policy

The MCP bridge and ROS 2 bridge translate protocol-specific actions into a unified policy evaluation format. A single policy can span:

- MCP tool calls (filesystem, database, HTTP)
- ROS 2 topic publications (cmd_vel, gripper commands)
- ROS 2 service calls (mode changes, calibration)
- ROS 2 action goals (navigation, manipulation)

This enables policies like "if the robot is moving (ROS 2 cmd_vel active), deny file system writes (MCP)" — cross-system invariants that no single-protocol safety system can enforce.

## 4. Integration Points

### 4.1 MCP Integration

SINT operates as a proxy MCP server that sits between any MCP client (Claude, Cursor, custom agents) and any number of downstream MCP servers. The proxy:

1. Discovers and aggregates tools from all downstream servers
2. Intercepts every tool call through the Policy Gateway
3. Enforces per-server policy ceilings (`maxTier`, `requireApproval`)
4. Exposes built-in `sint__*` tools for approval management and audit queries
5. Streams approval events via SSE for real-time dashboard updates

### 4.2 ROS 2 Integration

The ROS 2 bridge intercepts topic publications, service calls, and action goals. It extracts physical parameters (velocity, force, position) from ROS 2 messages and maps them to SINT capability token constraints. This enables enforcement of physics-aware policies at the protocol level.

### 4.3 Gateway HTTP API

The Gateway Server exposes a RESTful API for programmatic integration:
- `POST /v1/intercept` — evaluate a single request
- `POST /v1/intercept/batch` — evaluate multiple requests (207 Multi-Status)
- Token lifecycle (issue, delegate, revoke)
- Ledger queries with filtering
- Approval management with SSE streaming

## 5. Security Properties

### 5.1 Guarantees

1. **No bypass** — every agent action flows through the Policy Gateway
2. **Tamper evidence** — hash chain breaks on any ledger modification
3. **Attenuation only** — delegated permissions can only decrease
4. **Revocation** — instant token invalidation propagates to all delegates
5. **Forbidden combo detection** — dangerous sequences blocked across tool boundaries
6. **Physical constraints** — velocity, force, and geofence enforced at protocol level

### 5.2 Threat Model

SINT protects against:
- **Confused deputy** — agents acting beyond their authorization
- **Privilege escalation** — delegation chains that amplify permissions
- **Audit tampering** — modification of decision records
- **Dangerous sequences** — multi-step attack patterns across tools
- **Physical safety violations** — exceeding velocity, force, or geofence limits

SINT does not protect against:
- Compromised host OS or hardware
- Malicious SINT server operator (requires external attestation)
- Side-channel attacks on the policy evaluation process
- Denial of service against the Gateway itself

## 6. Design Principles

1. **Result\<T, E\> over exceptions** — all fallible operations return discriminated unions
2. **Interface-first persistence** — swap in-memory for Postgres/Redis without code changes
3. **Single choke point** — one Policy Gateway, no alternative paths
4. **Append-only audit** — INSERT-only ledger with hash chain integrity
5. **Attenuation only** — delegated tokens can only reduce permissions
6. **Physical safety first** — velocity, force, and geofence are first-class citizens
7. **Per-server policy** — each downstream system can have its own security ceiling

## 7. Roadmap

### v0.1 (Current) — Concept & Core
- Policy Gateway with tier-based authorization
- Ed25519 capability tokens with delegation
- Hash-chained evidence ledger
- MCP proxy with per-server policy
- ROS 2 bridge with physics extraction
- Approval dashboard

### v0.2 — Production Hardening
- PostgreSQL and Redis persistence backends
- Horizontal scaling with distributed policy evaluation
- Prometheus metrics and Grafana dashboards
- Comprehensive conformance test suite
- CI/CD with automated security testing

### v0.3 — Ecosystem
- Plugin system for custom policy rules
- Additional bridge adapters (gRPC, MQTT, HTTP webhooks)
- Multi-tenant support with organization isolation
- SDK for policy authoring (DSL or visual editor)

### v1.0 — Standard
- Formal specification document
- Independent security audit
- Reference implementations in multiple languages
- Conformance certification program
- Governance foundation for long-term stewardship

## 8. Regulatory Alignment

### 8.1 NIST AI Risk Management Framework

SINT Protocol directly addresses key NIST AI RMF controls:

| NIST Function | NIST Control | SINT Component |
|---|---|---|
| GOVERN | GOVERN-1.1 (human oversight policies) | T2/T3 escalation tiers, CircuitBreaker stop mechanism |
| GOVERN | GOVERN-6.1 (risk tolerance) | Per-deployment SintDeploymentProfile policies |
| MAP | MAP-1.1 (risk identification) | PolicyGateway tier assignment, CSML risk scoring |
| MAP | MAP-5.1 (stakeholder impact) | PhysicsConstraints with velocity/force/geofence limits |
| MEASURE | MEASURE-2.6 (monitoring and feedback) | EvidenceLedger with SIEM export, SHA-256 hash chain |
| MEASURE | MEASURE-2.8 (AI system operation) | ROS2ControlLoopLatency benchmarks, p99 < 10ms |
| MANAGE | MANAGE-2.2 (risk treatment) | CapabilityToken attenuation, T0–T3 treatment tiers |
| MANAGE | MANAGE-4.2 (incident response) | CircuitBreakerPlugin, EvidenceLedger forensic trail |

### 8.2 EU AI Act Alignment

Article 14(4)(e) of the EU AI Act requires that high-risk AI systems include technical measures enabling human oversight and the ability to override, interrupt, or reverse outputs. SINT's CircuitBreaker stop mechanism is designed to satisfy this requirement:

- `CircuitBreaker.trip()` immediately halts all T2/T3 agent actions
- Manual reset requires explicit human authorization
- All override events are recorded in the tamper-evident ledger

### 8.3 OWASP Agentic AI Top-10 Coverage

All 10 OWASP Agentic AI (ASI) categories are addressed with dedicated regression tests:

| ASI Category | SINT Control | Test Location |
|---|---|---|
| ASI01 Goal Hijacking | GoalHijackPlugin (5-layer heuristics) | conformance-tests/mcp-attack-surface.test.ts |
| ASI02 Prompt Injection | T3 classification, token scoping | conformance-tests/mcp-attack-surface.test.ts |
| ASI03 Insecure Output | Transformation constraints | conformance-tests/mcp-attack-surface.test.ts |
| ASI04 Tool Misuse | PolicyGateway tier assignment | conformance-tests/mcp-attack-surface.test.ts |
| ASI05 Shell via Tool Calls | T3 CRITICAL classifier | conformance-tests/mcp-attack-surface.test.ts |
| ASI06 Memory Poisoning | MemoryIntegrityChecker | conformance-tests/mcp-attack-surface.test.ts |
| ASI07 Excessive Autonomy | T2 escalation threshold | conformance-tests/mcp-attack-surface.test.ts |
| ASI08 Inadequate Logging | EvidenceLedger mandatory recording | conformance-tests/mcp-attack-surface.test.ts |
| ASI09 Supply Chain | CapabilityToken chain validation | conformance-tests/mcp-attack-surface.test.ts |
| ASI10 Rogue Agent | CircuitBreakerPlugin (EU AI Act stop button) | conformance-tests/mcp-attack-surface.test.ts |

---

## 9. Competitive Landscape

### 9.1 Feature Comparison

| Feature | Raw MCP | SROS2 Only | SINT Protocol |
|---|---|---|---|
| Authorization layer | ❌ | Partial | ✅ Ed25519 capability tokens |
| Human-in-the-loop | ❌ | ❌ | ✅ T2/T3 escalation |
| Tamper-evident audit | ❌ | ❌ | ✅ SHA-256 hash-chained ledger |
| Physics constraints | ❌ | Partial | ✅ Velocity, force, geofence |
| LLM agent awareness | ✅ | ❌ | ✅ |
| MCP protocol support | ✅ | ❌ | ✅ Bridge adapter |
| ROS 2 support | ❌ | ✅ | ✅ Bridge adapter |
| MAVLink / drone support | ❌ | ❌ | ✅ Bridge adapter |
| OWASP ASI coverage | ❌ | ❌ | ✅ 10/10 regression-tested |
| EU AI Act compliance | ❌ | ❌ | ✅ CircuitBreaker (Art. 14(4)(e)) |
| NIST AI RMF alignment | ❌ | ❌ | ✅ 8 controls addressed |
| Economic enforcement | ❌ | ❌ | ✅ Economy bridge with 9 event types |
| SIEM export | ❌ | ❌ | ✅ Structured event export |

### 9.2 Integration Path

SINT is designed to be adopted incrementally:

1. **Scan** — `npx sint-scan` audits existing MCP server tool definitions in seconds
2. **Intercept** — Add `MCPInterceptor` or `ROS2Interceptor` as a proxy — no server changes required
3. **Enforce** — Configure per-server `SintDeploymentProfile` policies for T0–T3 tiers
4. **Audit** — Export `EvidenceLedger` events to SIEM for compliance reporting

---

## 10. Conclusion

SINT Protocol addresses the critical gap between AI agent capabilities and physical-world safety requirements. By providing a layered, composable security standard with graduated authorization, tamper-evident auditing, and physics-aware constraints, SINT enables organizations to deploy physical AI systems with confidence that no action occurs without appropriate authorization.

The protocol is open-source (Apache-2.0), designed for composability, and built on audited cryptographic primitives. Regulatory alignment with NIST AI RMF and EU AI Act is built-in, not bolted on. We invite the community to contribute, review, and adopt SINT as the security foundation for the emerging physical AI ecosystem.

---

**Repository:** [github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)
**License:** Apache-2.0
**Contact:** GitHub Discussions on the repository
