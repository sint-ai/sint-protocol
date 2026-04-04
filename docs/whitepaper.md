# SINT Protocol: A Layered Open Standard for Security, Governance, and Economic Enforcement in Physical AI Systems

**Version 0.1 — Draft**
**Authors:** SINT AI Team
**Date:** March 2026

---

## Abstract

As AI agents gain the ability to control physical systems — robots, vehicles, industrial equipment, financial infrastructure — a critical gap has emerged: there is no standard security layer between "the model decided to act" and "the action occurred in the physical world." SINT Protocol fills this gap with a capability-based, tiered enforcement architecture that governs every interaction between AI agents and physical actuators.

This paper describes the protocol's design, its security model, and its approach to economic enforcement through staked capability tokens.

---

## 1. Introduction

### 1.1 The Problem

AI systems are increasingly autonomous. Foundation models can now execute tool calls, operate robotic arms, deploy code to production, and initiate financial transactions. Yet the security primitives available to constrain these systems remain inadequate:

- **Access control lists** are too coarse — they grant blanket permissions rather than scoped capabilities.
- **Prompt-level constraints** are brittle — they can be bypassed through prompt injection or context manipulation.
- **Manual approval workflows** don't scale — they create bottlenecks that defeat the purpose of automation.

The result is a binary choice: either restrict agents so heavily they can't be useful, or grant them broad access and hope nothing goes wrong.

### 1.2 SINT's Approach

SINT introduces a **Policy Gateway** — a single enforcement point through which every agent action must pass. The gateway evaluates each request against:

1. **Capability tokens** — Ed25519-signed, attenuating credentials that scope what an agent can do
2. **Tier classification** — A four-level system (T0–T3) that matches authorization requirements to physical consequence severity
3. **Physical constraints** — Hard limits on velocity, force, temperature, geofence boundaries
4. **Forbidden combinations** — Detection and blocking of dangerous action sequences
5. **Evidence ledger** — A SHA-256 hash-chained, append-only audit log of every decision

---

## 2. Architecture

### 2.1 Design Principles

- **Single choke point:** Every action flows through `PolicyGateway.intercept()`. No bridge, route handler, or service makes authorization decisions independently.
- **Result<T, E> — never throw:** All fallible operations return typed results. No exceptions for control flow.
- **Attenuation only:** Delegated tokens can only reduce permissions. Escalation is structurally impossible.
- **Append-only audit:** The evidence ledger is INSERT-only with hash chaining. No updates, no deletes.

### 2.2 System Topology

```
┌─────────────────────────────────┐
│  AI Agent (Claude, GPT, etc.)   │
│        (MCP Client)             │
└──────────┬──────────────────────┘
           │ stdio / SSE
┌──────────▼──────────────────────┐
│         SINT MCP Proxy          │
│  ┌───────────────────────────┐  │
│  │   Tool Aggregator         │  │
│  │   Policy Enforcer         │  │
│  │   Agent Identity          │  │
│  │   Approval Bridge         │  │
│  │   Audit Resources         │  │
│  └───────────────────────────┘  │
└──┬──────┬──────┬────────────────┘
   │      │      │   stdio connections
┌──▼──┐┌──▼──┐┌──▼──┐
│FS   ││Git  ││Shell│  ← Any MCP servers
│MCP  ││MCP  ││MCP  │
└─────┘└─────┘└─────┘
```

### 2.3 Approval Tiers

| Tier | Name | Auto-Approve? | Physical Consequence |
|------|------|---------------|---------------------|
| T0 | OBSERVE | Yes | None — read-only sensors, queries |
| T1 | PREPARE | Yes | Low — save waypoint, write config |
| T2 | ACT | No — escalate | Moderate — move robot, operate gripper |
| T3 | COMMIT | No — human required | Severe/irreversible — exec code, transfer funds |

---

## 3. Capability Token System

### 3.1 Token Structure

Each capability token is an Ed25519-signed credential containing:

- **Subject:** The agent's public key
- **Resource:** Scoped resource pattern (e.g., `ros2:///cmd_vel`, `mcp://filesystem/writeFile`)
- **Actions:** Permitted operations on that resource
- **Constraints:** Physical limits (max velocity, force bounds, geofence)
- **Expiry:** Token lifetime
- **Delegation chain:** Parent token references for attenuation verification

### 3.2 Attenuation

Tokens can be delegated, but only with equal or reduced permissions. A token for `ros2:///*` can delegate to `ros2:///cmd_vel`, but never the reverse. This is enforced cryptographically through the delegation chain.

---

## 4. Evidence Ledger

Every gateway decision — allow, deny, escalate — is recorded in a SHA-256 hash-chained append-only ledger. Each entry references the previous entry's hash, creating a tamper-evident audit trail.

```typescript
interface LedgerEntry {
  eventId: UUIDv7;
  previousHash: SHA256;
  timestamp: ISO8601;
  request: SintRequest;
  decision: Decision;
  tier: ApprovalTier;
  policySnapshot: PolicyHash;
}
```

The ledger supports verification: any entry can be validated against the chain, and any tampering is detectable.

---

## 5. Bridge Adapters

SINT is protocol-agnostic. Bridge adapters translate between domain-specific protocols and SINT requests:

- **MCP Bridge:** Intercepts Model Context Protocol tool calls, classifies risk, enforces policy
- **ROS 2 Bridge:** Intercepts robot middleware topics, services, and actions with physics extraction
- **gRPC Bridge:** (Planned) Generic gRPC service interception
- **HTTP Bridge:** (Planned) REST/GraphQL API interception

Each bridge adapter extracts domain-specific metadata (e.g., velocity vectors from ROS 2 messages) and attaches it to the SINT request for constraint evaluation.

---

## 6. Deployment Models

### 6.1 Sidecar
SINT runs as a sidecar container alongside the AI agent, intercepting all outbound tool calls.

### 6.2 Gateway
A centralized SINT gateway serves multiple agents, with per-agent policy configuration and a shared evidence ledger.

### 6.3 Embedded
For latency-critical applications, SINT's policy engine can be embedded directly into the agent runtime.

---

## 7. Roadmap

See [roadmap.md](roadmap.md) for the detailed development timeline.

**Phase 1 (Current):** Core protocol, MCP + ROS 2 bridges, in-memory persistence, 370+ tests
**Phase 2:** PostgreSQL/Redis persistence, WebSocket approval transport, gRPC bridge
**Phase 3:** Multi-agent orchestration, token economy, Python/Go SDKs
**Phase 4:** Conformance certification program, enterprise features

---

## 8. Conclusion

SINT Protocol provides the missing security infrastructure for physical AI. By enforcing capability-based permissions, graduated approval tiers, physical constraints, and tamper-evident auditing through a single policy gateway, SINT enables AI agents to operate in the physical world with appropriate guardrails — without sacrificing the autonomy that makes them useful.

---

## References

1. Dennis, J.B. & Van Horn, E.C. "Programming Semantics for Multiprogrammed Computations." Communications of the ACM, 1966.
2. Miller, M.S. et al. "Capability-based Financial Instruments." Financial Cryptography, 2000.
3. Model Context Protocol Specification. Anthropic, 2024.
4. ROS 2 Design. Open Robotics, 2017.
