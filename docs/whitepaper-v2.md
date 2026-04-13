# SINT: Autonomous AI Infrastructure for the Physical World

## A Comprehensive Technical Whitepaper

**Version 2.0 — April 2026**

**SINT AI Lab / PSHKV Inc. — Los Angeles, CA**

**Authors:** Illia Pashkov & SINT Agent Network

---

## Abstract

SINT is an integrated AI operations ecosystem comprising a runtime authorization protocol for physical AI systems, a full-stack agent orchestration platform, an autonomous content engine, a 3D avatar interface, an outreach automation framework, and a public agent trust registry. The ecosystem is designed to enable AI agents to safely operate in the physical world — controlling robots, drones, surgical instruments, and industrial machinery — while maintaining human oversight, cryptographic accountability, and economic sustainability.

The flagship component, **SINT Protocol**, inserts a single enforcement point — the **Policy Gateway** — between every AI agent and its physical or digital actions. Every request flows through graduated approval tiers (T0–T3), capability token validation, physical safety constraint checking, forbidden action sequence detection, and SHA-256 hash-chained audit logging. The reference implementation spans **24 packages**, **5 applications**, **3 SDKs** (TypeScript, Python, Go), and **1,363 tests** covering conformance against OWASP Agentic Security Top 10, IEC 62443, EU AI Act Article 13, and NIST AI RMF.

The broader ecosystem includes:
- **SINT Operators Platform** — React 19 orchestration dashboard with 30+ Redux slices, visual workflow canvas, Web3 bridge, and 1,276+ tests
- **Virtual CMO** — AI content engine (331 files, 18 skills) that turns one video into a week of multi-platform content at ~$1.50/video
- **SINT Avatars** — 3D talking avatar system with ARKit 52 blendshapes and ElevenLabs character-level lipsync
- **SINT Outreach** — B2B LinkedIn automation with Ulinc/GHL integration and AI reply generation
- **Open Agent Trust Registry** — Public federated registry of trusted attestation issuers with Ed25519 threshold governance
- **Autonomous Execution Engine** — Marketing site with VRM avatar integration and Supabase backend

This whitepaper presents the complete technical architecture, implementation details, and research agenda for every component.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Design Principles](#2-design-principles)
3. [SINT Protocol Architecture](#3-sint-protocol-architecture)
4. [Core Primitives](#4-core-primitives)
5. [Approval Tier System](#5-approval-tier-system)
6. [Capability Token Framework](#6-capability-token-framework)
7. [Forbidden Combination Detection](#7-forbidden-combination-detection)
8. [Evidence Ledger](#8-evidence-ledger)
9. [Bridge Adapters](#9-bridge-adapters)
10. [Economic Layer](#10-economic-layer)
11. [Safety Plugins](#11-safety-plugins)
12. [CSML Behavioral Identity](#12-csml-behavioral-identity)
13. [SINT Operators Platform](#13-sint-operators-platform)
14. [Virtual CMO Content Engine](#14-virtual-cmo-content-engine)
15. [3D Avatar System](#15-3d-avatar-system)
16. [Outreach Automation](#16-outreach-automation)
17. [Open Agent Trust Registry](#17-open-agent-trust-registry)
18. [Physical AI Use Cases](#18-physical-ai-use-cases)
19. [Conformance & Testing](#19-conformance--testing)
20. [Compliance & Standards Mapping](#20-compliance--standards-mapping)
21. [Competitive Landscape](#21-competitive-landscape)
22. [Research Agenda (2026–2031)](#22-research-agenda-20262031)
23. [Deployment & Operations](#23-deployment--operations)
24. [Roadmap](#24-roadmap)
25. [References](#25-references)

---

## 1. The Problem

### 1.1 The Physical AI Gap

AI systems are transitioning from passive text generators to active controllers of physical systems. In 2024–2025, LLMs became robotic co-pilots. By 2026–2027, they are becoming primary controllers. The security model for this world does not yet exist.

**Empirical evidence of the gap:**

- **ROSClaw Study (arXiv:2603.26997):** Evaluated frontier LLMs controlling ROS 2 robots. Found **4.8× behavioral divergence** between models on identical tasks — the same robot performs radically differently depending on which foundation model drives it.
- **MCP Security Analysis (arXiv:2601.17549):** Identified 10 critical attack surfaces in the Model Context Protocol, including tool poisoning, rug pulls, and cross-server escalation. MCP has no built-in authorization framework.
- **Unitree BLE Vulnerability:** Consumer humanoid robots shipped with default BLE keys, enabling remote takeover. No runtime authorization layer between AI commands and physical actuators.

### 1.2 The Authorization Gap

Current AI safety research focuses on alignment — making models want the right things. But even a perfectly aligned model operating through tool-use interfaces (MCP, function calling, ROS 2 actions) has no standardized mechanism to enforce:

- **Who** is authorized to perform an action
- **What** physical constraints apply (velocity limits, force ceilings, geofences)
- **When** human approval is required versus when autonomous operation is safe
- **How** to produce a tamper-evident audit trail of every decision

Physical AI failures are not reversible with `Ctrl+Z`. A robot arm that exceeds force limits, a financial agent that transfers funds without authorization, or a code execution agent that runs destructive commands all produce real-world consequences.

### 1.3 Why Existing Protocols Don't Solve This

| Protocol | Focus | Physical Constraints | Graduated Auth | Audit Trail | Sequence Detection |
|----------|-------|:---:|:---:|:---:|:---:|
| MCP (Anthropic) | LLM ↔ Tool context | ❌ | ❌ | ❌ | ❌ |
| ACP (IBM/LF) | Agent-to-agent comms | ❌ | Partial | ❌ | ❌ |
| A2A (Google) | Agent interoperability | ❌ | ❌ | ❌ | ❌ |
| AgentProtocol | Framework-agnostic API | ❌ | ❌ | ❌ | ❌ |
| ANP | Agent networking | ❌ | ❌ | ❌ | ❌ |
| AG-UI | Agent UX streaming | ❌ | ❌ | ❌ | ❌ |
| **SINT** | **Physical AI security** | **✅** | **✅** | **✅** | **✅** |

SINT is not a competing agent protocol. It is a **security enforcement layer** that sits between any agent protocol and the physical world.

---

## 2. Design Principles

1. **Universal Interception** — One choke point for all agent-to-world actions, regardless of transport protocol.
2. **Graduated Authorization** — Four approval tiers (T0–T3) map action severity to authorization requirements.
3. **Physical Safety as First-Class** — Velocity, force, and geofence constraints enforced at the protocol level.
4. **Cryptographic Accountability** — Ed25519 capability tokens and SHA-256 hash-chained audit logs provide non-repudiable proof of every authorization decision.
5. **Attenuation-Only Delegation** — Delegated permissions can only narrow, never escalate.
6. **Emergency Stop Invariant** — E-stop signals are NEVER blocked by the gateway (Invariant I-G2).
7. **Consequence-Based Classification** — Tier assignment based on real-world consequence severity, not syntactic properties.
8. **Protocol Agnosticism** — Works with any transport through pluggable bridge adapters.

---

## 3. SINT Protocol Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AI Agent (LLM / Controller / Swarm)                │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Raw request (tool call, topic publish, etc.)
┌──────────────────────────▼──────────────────────────────────────────┐
│                       Bridge Adapter Layer                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐  │
│  │ bridge-  │ │ bridge-  │ │ bridge-  │ │bridge- │ │ bridge-   │  │
│  │   mcp    │ │  ros2    │ │ mavlink  │ │  a2a   │ │   grpc    │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ └───────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐  │
│  │ bridge-  │ │ bridge-  │ │ bridge-  │ │bridge- │ │ bridge-   │  │
│  │   iot    │ │  mqtt    │ │  opcua   │ │ swarm  │ │  open-rmf │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ └───────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Normalized SintRequest
┌──────────────────────────▼──────────────────────────────────────────┐
│                      Policy Gateway (THE choke point)               │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. Token Validation (Ed25519 signature + delegation chain) │   │
│  │  2. Tier Assignment (T0–T3 based on resource + context)     │   │
│  │  3. Physical Constraint Check (velocity, force, geofence)   │   │
│  │  4. Forbidden Combo Detection (sequence analysis, DFA)      │   │
│  │  5. Safety Plugins (GoalHijack, MemoryIntegrity, Supply)    │   │
│  │  6. CSML Auto-Escalation (behavioral drift detection)       │   │
│  │  7. CircuitBreaker (EU AI Act Art. 14(4)(e) stop button)    │   │
│  │  8. Rate Limiting (per-token, per-agent)                    │   │
│  │  9. Budget Enforcement (economic layer)                     │   │
│  │  10. Approval Flow (T2: review, T3: human-in-the-loop)     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │         Evidence Ledger (SHA-256 hash-chained)              │   │
│  │  In-Memory │ PostgreSQL │ Redis │ (pluggable backends)      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ PolicyDecision: allow | deny | escalate
                           ▼
              ┌────────────────────────────┐
              │   Operator Dashboard       │
              │   + WebSocket approvals    │
              │   + M-of-N quorum          │
              │   + CSML trend charts      │
              └────────────────────────────┘
```

### 3.2 Request Lifecycle (Deterministic Finite Automaton)

Every request follows a deterministic state machine:

```
RECEIVED → VALIDATING → TIER_ASSIGNED → CONSTRAINT_CHECK
    │           │              │                │
    │        DENIED         DENIED           DENIED
    │      (bad token)    (blocked tier)   (constraint violation)
    │
    └→ COMBO_CHECK → CSML_CHECK → PLUGIN_CHECK → BUDGET_CHECK
           │              │              │              │
        ESCALATED      ESCALATED      DENIED        DENIED
       (forbidden     (drift         (hijack/       (insufficient
        sequence)     detected)      tamper)         balance)
           │              │
           ▼              ▼
    PENDING_APPROVAL → APPROVED/DENIED → LEDGER_RECORDED → COMPLETE
                          │
                       TIMEOUT → fallbackAction (deny|allow)
```

### 3.3 Monorepo Structure

The sint-protocol repository is a pnpm/Turborepo monorepo with 24 packages and 5 applications:

**Core Packages (8 publishable under `@sint/` scope):**

| Package | Purpose | Lines (approx.) |
|---------|---------|:---:|
| `@sint/core` | Types, Zod schemas, DFA engine, tier constants | ~800 |
| `@sint/gate-capability-tokens` | Ed25519 tokens, delegation chains, revocation | ~1,200 |
| `@sint/gate-policy-gateway` | Single enforcement choke point, tier assignment, plugin system | ~1,500 |
| `@sint/gate-evidence-ledger` | SHA-256 hash-chained audit log, proof receipts | ~900 |
| `@sint/persistence` | Storage interfaces + in-memory/Redis adapters | ~400 |
| `@sint/persistence-postgres` | PostgreSQL adapter with migrations | ~520 |
| `@sint/bridge-mcp` | MCP tool call interception proxy | ~600 |
| `@sint/bridge-economy` | Metered billing, trust-tier pricing, route selection | ~700 |
| `@sint/client` | TypeScript SDK for Gateway HTTP API | ~300 |

**Bridge Adapter Packages (9):**

| Package | Protocol | Key Feature |
|---------|----------|-------------|
| `bridge-ros2` | ROS 2 topics, services, actions | Auto-extracts velocity/force from geometry_msgs |
| `bridge-mavlink` | MAVLink v2 (PX4/ArduPilot) | ARM/DISARM, TAKEOFF, MISSION_START mapping |
| `bridge-a2a` | Google Agent-to-Agent | Cross-org agent delegation |
| `bridge-iot` | Generic IoT | Sensor/actuator classification |
| `bridge-mqtt` | MQTT pub/sub | Topic → resource URI mapping |
| `bridge-opcua` | OPC-UA (IEC 62541) | Legacy PLC integration |
| `bridge-grpc` | gRPC services | Service mesh interception |
| `bridge-swarm` | Multi-agent coordination | Collective constraint enforcement |
| `bridge-open-rmf` | Open-RMF fleet management | Robot fleet resource mapping |

**Intelligence Engines (4):**

| Package | Function |
|---------|----------|
| `engine-system1` | Fast perception: sensor fusion, anomaly detection |
| `engine-system2` | Deliberative planning: path planning, task scheduling |
| `engine-hal` | Hardware abstraction layer |
| `engine-capsule-sandbox` | Sandboxed code execution environment |

**Applications (5):**

| App | Stack | Description |
|-----|-------|-------------|
| `gateway-server` | Hono HTTP | REST API + WebSocket approvals + SSE streaming |
| `dashboard` | React | Real-time approval UI + conformance dashboard |
| `sintctl` | CLI | Token management, approvals, ledger queries, policy management |
| `sint-mcp` | Node.js | MCP proxy bridge (drop-in for Claude Desktop, Cursor) |
| `sint-mcp-scanner` | Node.js | MCP server security scanner |

**SDKs (3):**

| SDK | Language | Lines | Features |
|-----|----------|:---:|----------|
| `sint-python` | Python 3.10+ | 1,962 | Client, scanner, token management, Pydantic models |
| `sint-go` | Go 1.21+ | ~200 | Client stub |
| `@sint/client` | TypeScript | ~300 | Full Gateway HTTP API client |

---

## 4. Core Primitives

### 4.1 SintRequest

Every agent action is normalized to this structure before gateway evaluation:

```typescript
interface SintRequest {
  requestId: UUIDv7;                    // Unique, sortable identifier
  agentId: Ed25519PublicKey;            // 32-byte hex public key
  tokenId: UUIDv7;                      // Capability token authorizing this request
  resource: string;                     // URI: "ros2:///cmd_vel", "mcp://filesystem/writeFile"
  action: string;                       // "publish", "call", "subscribe", "exec.run"
  params: Record<string, unknown>;      // Action-specific parameters
  physicalContext?: {
    humanDetected?: boolean;            // Triggers tier escalation
    currentVelocityMps?: number;
    currentForceNewtons?: number;
    position?: { lat: number; lon: number };
  };
  recentActions?: string[];             // Last N actions for combo detection
  timestamp: ISO8601;                   // Microsecond precision
}
```

### 4.2 PolicyDecision

The gateway's response to every request:

```typescript
interface PolicyDecision {
  action: "allow" | "deny" | "escalate" | "transform";
  requestId: UUIDv7;
  assignedTier: "T0_OBSERVE" | "T1_PREPARE" | "T2_ACT" | "T3_COMMIT";
  assignedRisk: "T0_READ" | "T1_WRITE_LOW" | "T2_STATEFUL" | "T3_IRREVERSIBLE";
  denial?: {
    reason: string;
    policyViolated: string;
    suggestedAlternative?: string;
  };
  escalation?: {
    requiredTier: ApprovalTier;
    reason: string;
    timeoutMs: number;                  // Max 300,000ms (5 min)
    fallbackAction: "deny" | "allow";
  };
  transformations?: {
    constraintOverrides?: Record<string, unknown>;
    additionalAuditFields?: Record<string, unknown>;
  };
  timestamp: ISO8601;
}
```

### 4.3 Resource URI Scheme

All resources are identified by URIs with protocol-specific schemes:

| Scheme | Format | Example |
|--------|--------|---------|
| `ros2://` | `ros2:///<topic_or_service>` | `ros2:///cmd_vel` |
| `mcp://` | `mcp://<server>/<tool>` | `mcp://filesystem/writeFile` |
| `mavlink://` | `mavlink://<systemId>/<command>` | `mavlink://1/arm` |
| `a2a://` | `a2a://<host>/<task>` | `a2a://wms.example.com/deliver` |
| `grpc://` | `grpc://<service>/<method>` | `grpc://robot.v1/Move` |
| `mqtt://` | `mqtt://<broker>/<topic>` | `mqtt://factory/robot/01/cmd_vel` |
| `opcua://` | `opcua://<server>/<nodeId>` | `opcua://plc1/ns=2;s=MotorSpeed` |
| `http://` | Standard HTTP | `http://api.example.com/v1/transfer` |

Glob patterns are supported: `mcp://*`, `ros2:///sensor/*`.

---

## 5. Approval Tier System

### 5.1 Tier Definitions

| Tier | Enum | Auto-Approved | Requires | Physical Example | Digital Example |
|------|------|:---:|-----------|-----------------|-----------------|
| **T0** | `T0_OBSERVE` | Yes (logged) | — | Read sensor data | Query database |
| **T1** | `T1_PREPARE` | Yes (audited) | — | Save waypoint, plan path | Write file, stage config |
| **T2** | `T2_ACT` | No | Review | Move robot, operate gripper | Modify database, deploy |
| **T3** | `T3_COMMIT` | No | Human | Emergency stop override, mode change | Execute code, transfer funds |

Shell and code-execution tool names (`bash`, `exec`, `eval`, `run_command`, etc.) are explicitly classified at T3_COMMIT to address OWASP ASI05.

### 5.2 Tier Escalation Triggers

Base tier is escalated (never de-escalated) by contextual signals:

| Trigger | Effect | Rationale |
|---------|--------|-----------|
| Human detected near robot | T2 → T3 | ISO 10218-1 §5.4 presence detection |
| New/untrusted agent | +1 tier | Unknown agents get tighter scrutiny |
| Forbidden combo detected | → T3 | Dangerous sequences require human approval |
| CSML threshold exceeded | +1 tier | Behavioral drift detected |
| Server `requireApproval: true` | Non-T0 → escalate | Operator-configured per-server policy |
| Velocity/force exceeds constraint | → deny | Hard physical safety limit |
| CircuitBreaker tripped | → deny all | Emergency kill switch (EU AI Act Art. 14(4)(e)) |
| GoalHijackPlugin alert | → deny | Prompt injection / role override detected |

### 5.3 Approval Flow

```
Request (T2/T3) → Pending Approval → Notification (SSE/WebSocket/Dashboard)
    → Operator approves/denies → PolicyDecision → Ledger Entry
    → Timeout (default 30s, max 5min) → fallbackAction: deny
```

M-of-N quorum approval is supported for T3 actions requiring multiple operator sign-off.

---

## 6. Capability Token Framework

### 6.1 Token Structure

```typescript
interface CapabilityToken {
  id: UUIDv7;
  issuer: Ed25519PublicKey;
  subject: Ed25519PublicKey;
  resource: string;                     // Glob-supported
  actions: string[];
  constraints: {
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    geofence?: GeoPolygon;
    timeWindow?: { start: ISO8601; end: ISO8601 };
    rateLimit?: { maxCalls: number; windowMs: number };
  };
  delegationChain: {
    parentTokenId: UUIDv7 | null;
    depth: number;                      // 0 = root, max 3
    attenuated: boolean;
  };
  issuedAt: ISO8601;
  expiresAt: ISO8601;
  revocable: boolean;
  signature: Ed25519Signature;          // 64-byte
}
```

### 6.2 Delegation Rules

1. **Maximum depth: 3.** Root (0) → 1 → 2 → 3. No further delegation.
2. **Attenuation only.** Each delegation MUST have equal or narrower scope, fewer actions, tighter constraints, earlier expiry.
3. **Chain verification.** Validators verify the entire chain — each hop's signature and attenuation.
4. **Revocation cascades.** Revoking a parent implicitly revokes all descendants.

### 6.3 Cryptographic Primitives

- **Signing:** Ed25519 via `@noble/ed25519` (audited, zero-dependency)
- **Hashing:** SHA-256 via `@noble/hashes`
- **Identity:** W3C DID (`did:key:z6Mk...`) for cross-organizational trust

---

## 7. Forbidden Combination Detection

The gateway maintains rules for action sequences that are individually permitted but dangerous in combination.

### 7.1 Default Forbidden Combos

| Sequence | Risk | Escalation |
|----------|------|-----------|
| `filesystem.write` → `exec.run` | Code injection | → T3 |
| `credential.read` → `http.request` | Credential exfiltration | → T3 |
| `database.write` → `database.execute` | SQL injection escalation | → T3 |
| `ARM` → `SET_MODE(OFFBOARD)` (within 2s) | Full autonomous takeover | → T3 |
| `FENCE_DISABLE` → navigation (within 30s) | Geofence bypass | → T3 |
| `safety.cell_unlock` → `torch.enable` (within 100ms) | Human safety risk | → T3 |

### 7.2 Detection Algorithm

1. Each request includes `recentActions[]` — last N actions (configurable, default 10).
2. Detector checks if current action completes any registered forbidden sequence.
3. Match found → tier escalated to T3, reason recorded in ledger.
4. Operators extend the default list with domain-specific forbidden combinations.

---

## 8. Evidence Ledger

### 8.1 Ledger Entry

```typescript
interface LedgerEvent {
  id: UUIDv7;
  sequenceNumber: number;              // Monotonically increasing
  previousHash: SHA256Hash;            // Genesis = "0".repeat(64)
  eventHash: SHA256Hash;               // SHA-256(previousHash + serialized data)
  eventType: "intercept" | "token_issued" | "token_revoked" | "approval_resolved";
  agentId: Ed25519PublicKey;
  requestId?: UUIDv7;
  decision?: PolicyDecision;
  metadata: Record<string, unknown>;
  timestamp: ISO8601;
}
```

### 8.2 Integrity Properties

- **Hash chain:** Each entry's hash includes the previous hash. Any modification breaks all subsequent entries.
- **Proof receipts:** Cryptographic proof sufficient to verify any entry independently.
- **Append-only:** Entries are never updated or deleted.
- **TEE attestation:** Planned support for Intel SGX, ARM TrustZone, AMD SEV for hardware-backed proof receipts.

### 8.3 Storage Backends

| Backend | Use Case | Implementation |
|---------|----------|---------------|
| In-memory | Testing, development | ✅ Shipped |
| PostgreSQL | Production single-node | ✅ Shipped (518 lines, full migrations, pool management, rate-limit + revocation stores) |
| Redis | High-throughput, pub/sub revocation bus | ✅ Shipped (cache + revocation bus) |

### 8.4 API

```bash
# Query by agent
GET /v1/ledger?agentId=<key>&limit=100

# Query by tier
GET /v1/ledger?tier=T3_COMMIT&since=2026-04-01

# Export for SIEM integration (Splunk, Datadog, ELK)
GET /v1/ledger?format=json-lines&since=2026-04-01
```

---

## 9. Bridge Adapters

### 9.1 MCP Bridge (Primary Adoption Vector)

SINT's MCP proxy sits between AI clients (Claude, Cursor, GPT) and downstream MCP servers:

```json
{
  "mcpServers": {
    "sint-proxy": {
      "command": "npx",
      "args": ["@pshkv/bridge-mcp", "--downstream", "filesystem,exec"]
    }
  }
}
```

The proxy intercepts every tool call, evaluates it against the policy gateway, and exposes introspection tools:
- `sint__status` — Current token scope and tier configuration
- `sint__audit` — Recent ledger entries for this session
- `sint__approve` — Trigger approval flow for pending requests

Integration guides available for:
- **Claude Desktop** — Drop-in MCP proxy configuration (11,472 lines of documentation)
- **Cursor IDE** — MCP proxy with SINT integration
- **Docker** — Production deployment with PostgreSQL + Redis
- **gRPC** — Service mesh bridge setup
- **WebSocket** — Real-time approval streaming

### 9.2 ROS 2 Bridge

Intercepts ROS 2 topic publishes, service calls, and action goals:
- Resource mapping: `ros2:///<topicOrServiceName>`
- Physics extraction: Automatically extracts velocity from `geometry_msgs/Twist` and force from `geometry_msgs/Wrench`
- Human presence: Subscribes to detection topics for automatic tier escalation

### 9.3 MAVLink Bridge

Translates MAVLink v2 commands (PX4, ArduPilot) to SINT requests:

| MAVLink Command | SINT Tier | Rationale |
|----------------|-----------|-----------|
| ARM/DISARM | T3 | Enables/disables propulsion |
| TAKEOFF/LAND | T2 | Physical approach |
| MISSION_START | T3 | Begins autonomous BVLOS |
| FENCE_DISABLE | T3 | Removes safety boundary |
| SET_MODE(OFFBOARD) | T3 | Full autonomous control |

### 9.4 Additional Bridges

| Bridge | Protocol | Standard | Key Feature |
|--------|----------|----------|-------------|
| `bridge-a2a` | Google A2A | — | Cross-org agent delegation with token forwarding |
| `bridge-grpc` | gRPC (176 lines) | — | Service mesh interception, proto reflection |
| `bridge-iot` | Generic IoT | — | Sensor/actuator auto-classification |
| `bridge-mqtt` | MQTT pub/sub | — | Topic → resource URI, wildcard matching |
| `bridge-opcua` | OPC-UA | IEC 62541 | Legacy PLC integration, NodeId mapping |
| `bridge-swarm` | Multi-agent | NATO STANAG 4586 | Collective constraint enforcement |
| `bridge-open-rmf` | Open-RMF | — | Robot fleet management, task allocation |

---

## 10. Economic Layer

### 10.1 Token Unit

SINT uses an integer token unit — no fractional amounts:

| Constant | Value | Source |
|----------|-------|--------|
| `TOKENS_PER_DOLLAR` | 250 | `pricing-calculator.ts` |
| `INITIAL_USER_BALANCE` | 250 tokens ($1.00) | Default for new users |
| Launch pricing | 1 token ≈ $0.001 | `1 / TOKENS_PER_DOLLAR` |

New users start with 250 tokens (~27 default MCP tool calls).

### 10.2 Billing Formula

```
cost = ceil(baseCost × costMultiplier × globalMarkupMultiplier)
```

| Parameter | Default | Notes |
|-----------|---------|-------|
| `baseCost` | 6 tokens | Standard MCP/tool call |
| `costMultiplier` | 1.0 | Per-resource or marketplace rate |
| `globalMarkupMultiplier` | 1.5 | `GLOBAL_MARKUP_MULTIPLIER` constant |
| **Default result** | **9 tokens** | `ceil(6 × 1.0 × 1.5)` |

### 10.3 Tier-Based Cost Table

| Tier | Action Type | Base Cost | Typical Result |
|------|------------|-----------|:---:|
| T0 — Observe | Read/query (sensor, subscribe) | 4–6 | ~6–9 |
| T1 — Prepare | Low-impact write (save waypoint) | 6 | 9 |
| T2 — Act | Physical state change (ROS 2 publish) | 8 | 12 |
| T3 — Commit | Capsule execution, irreversible action | 12 | 18 |

Physical-domain bridges carry higher multipliers:

| Bridge / Resource Prefix | Typical `costMultiplier` |
|---|---|
| MCP tool call (default) | 1.0 |
| ROS 2 publish (`ros2://`) | 1.0–2.0 |
| MAVLink command (`mavlink://`) | 2.0–5.0 |
| Capsule execution (`capsule://`) | 1.0–3.0 |

### 10.4 Budget Enforcement

Budget enforcement runs in `EconomyPlugin.preIntercept()`, called before `PolicyGateway` assigns tiers:

1. `checkBudget()` — per-agent budget cap
2. `getBalance()` — sufficient balance check
3. `evaluateTrust()` — not blocked/high-risk

Post-intercept (on allow): `withdraw(userId, tokens)`. Balance shortfall → deny (never escalate).

### 10.5 Revenue Split (Design)

| Recipient | Share |
|-----------|-------|
| Operator (MCP server / bridge host) | 70% |
| Protocol treasury | 20% |
| Safety reserve fund | 10% |

### 10.6 Cost-Aware Route Selection

`@sint/bridge-economy` includes route scoring for multi-bridge execution:
- `selectCostAwareRoute(input)` — scores by cost + latency + reliability
- `POST /v1/economy/route` — exposed through gateway API

---

## 11. Safety Plugins

The Policy Gateway supports a plugin architecture for extensible safety checks. These run after tier assignment but before approval flow.

### 11.1 GoalHijackPlugin (OWASP ASI01)

5-layer heuristic detection of prompt injection:
1. **Role override detection** — Pattern matching for "ignore previous instructions", system prompt injection
2. **Semantic escalation** — Requests that attempt to expand scope beyond token permissions
3. **Exfiltration probes** — Attempts to read credentials, env vars, or PII
4. **Cross-agent injection** — Messages crafted to manipulate downstream agents
5. **Prompt injection in tool parameters** — Embedded instructions in tool call arguments

### 11.2 MemoryIntegrityChecker (OWASP ASI06)

Detects manipulation of agent memory/context:
- Replay attack detection (duplicate request IDs)
- Privilege claim detection (forged approval records)
- History overflow anomalies (context window stuffing)

### 11.3 DefaultSupplyChainVerifier (OWASP ASI04)

Validates model and tool integrity:
- Model fingerprint hash verification against allowlist
- Model ID validation at runtime
- Tool manifest integrity checking (detects swapped/tampered tools)

### 11.4 CircuitBreakerPlugin (EU AI Act Art. 14(4)(e))

Emergency stop mechanism:
- Manual `trip()` by operator → instantly blocks all actions from target agent
- N consecutive denials → auto-open circuit
- CSML anomalous-persona detection → auto-trip
- HALF_OPEN probe recovery → self-healing after incident resolution

### 11.5 DynamicEnvelopePlugin

Environment-adaptive constraint tightening:
```
effective_max_velocity = min(token.maxVelocityMps, obstacle_distance × reaction_factor)
```

Real-time sensor state (obstacle distance, human proximity) is mapped to tighter effective limits, closing the gap between static token constraints and dynamic environment conditions.

### 11.6 SwarmCoordinator

Collective constraints for multi-agent deployments:
- Maximum concurrent actors in T2+ tier
- Total kinetic energy ceiling (Σ½mv²)
- Minimum inter-agent distance
- Maximum escalated fraction

These cannot be captured by per-agent token scoping alone.

---

## 12. CSML Behavioral Identity

### 12.1 Definition

CSML (Composite Safety-Model Latency) is a behavioral fingerprint metric that detects when an agent's behavior deviates from its established pattern. Computed per `foundation_model_id`:

```typescript
interface CSMLMetrics {
  approvalRate: number;     // approved / total requests
  completionRate: number;   // completed / started actions
  averageLatencyMs: number; // mean decision time
  tierDistribution: Record<ApprovalTier, number>;
}

// CSML score = weighted divergence from baseline
function computeCsml(current: CSMLMetrics, baseline: CSMLMetrics): number;
```

### 12.2 Auto-Escalation

When CSML exceeds a configurable threshold (θ), the agent's tier is automatically escalated. Thresholds vary by deployment context:

| Context | Default θ | Human-Present θ |
|---------|-----------|----------------|
| Warehouse AMR | 0.30 | 0.15 |
| Welding arm (ISO 10218) | 0.30 | 0.10 |
| Surgical robot (FDA Class III) | 0.10 | 0.10 |
| Drone BVLOS | 0.35 | 0.20 |
| Collaborative robot (ISO/TS 15066) | 0.15 | 0.15 |

### 12.3 ROSClaw Validation

The ROSClaw study (arXiv:2603.26997) empirically confirmed CSML's premise: frontier LLMs exhibit up to **4.8× differences** in out-of-policy action proposal rates on identical tasks. CSML makes this variance enforcement-visible rather than a post-incident finding.

---

## 13. SINT Operators Platform

**Repository:** [github.com/sint-ai/sint-agents](https://github.com/sint-ai/sint-agents)

The SINT Operators Platform is a full-stack React 19 web application for AI agent orchestration and management. It serves as the control plane for the entire SINT ecosystem.

### 13.1 Technical Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19, TypeScript 5.6, Vite 6.1 |
| State | Redux Toolkit 2.5 (30+ slices), Jotai |
| Routing | React Router DOM 7.1 (lazy-loaded pages) |
| Styling | styled-components 6.1 |
| Flow Editor | @xyflow/react (React Flow) |
| Charts | Recharts, lightweight-charts |
| 3D | Three.js, @react-three/fiber |
| Web3 | wagmi, viem, ethers, @solana/web3.js, @cosmjs |
| Auth | Keycloak (OIDC via react-oidc-context) |
| Validation | Zod schemas for all gateway events |
| Real-time | WebSocket (JSON-RPC 2.0) with Ed25519 device identity |
| Backend | Express + SQLite (Conductor API) |
| Testing | Vitest — **1,276+ tests** across 102+ test files |

### 13.2 Feature Modules (28 modules)

| Module | Description |
|--------|-------------|
| **Conductor** | Multi-agent orchestration with risk-tiered approval workflows (T0-T3), policy enforcement, MCP 2.0 evidence chains. API layer, components, hooks, store with reducers, type definitions, and utility functions |
| **Canvas** | Visual node-based workflow editor (React Flow) with topological execution engine, template gallery, flow toolbar, node config panels, n8n integration |
| **Agents** | Agent deployment and management from templates — hierarchy view, detail panel, deploy dialog, heartbeat monitor, soul config editor, Paperclip API integration |
| **Approval** | Risk-tiered approval gates — enhanced approval cards, notification system |
| **Audit** | Audit log viewer with evidence chain visualization |
| **Billing** | Balance overview, spending charts, transaction lists, usage breakdowns, CSV export |
| **Budget** | Per-agent and session budget tracking and enforcement |
| **Trust** | Trust policy engine for agent reputation management |
| **Anomaly** | Anomaly detection dashboard for behavioral outliers |
| **Intelligence** | Intelligence platform with API integration and dedicated hooks |
| **Memory** | Agent memory inspection and shared context management |
| **Sessions** | Session lifecycle management |
| **Tasks** | Kanban-style task management with Paperclip API integration |
| **Traces** | Distributed trace viewing for debugging agent flows |
| **Schedules** | Cron-style scheduling management |
| **Webhooks** | Webhook management for external integrations |
| **Trading** | Live price feeds (CoinGecko), watchlists, portfolio tracking, backtesting |
| **Web3** | Multi-chain wallet bridge (Ethereum, Solana, Cosmos, ZetaChain) |
| **Marketplace** | Agent and skill marketplace |
| **Templates** | Agent template management and export |
| **Metrics** | Analytics dashboard |
| **Handoffs** | Inter-agent handoff protocol |
| **Shared Context** | Shared context template management |
| **Run Events** | Run event streaming |
| **Notifications** | Notification center |
| **Cost** | Cost tracking components |
| **Settings** | Platform configuration |
| **Profile** | User profile management |
| **Command Bar** | Quick command palette |

### 13.3 Pages (26 routes)

| Page | Function |
|------|----------|
| Home | Landing/dashboard |
| Chat | Text and voice chat with AI agents (Deepgram STT/TTS) |
| Dashboard | Overview metrics |
| Canvas | Visual workflow editor |
| Intelligence | Intelligence platform |
| AgentManager | Agent deployment and monitoring |
| ConductorDashboard | Conductor overview |
| ConductorApprovals | Approval queue |
| ConductorEvidence | Evidence chain viewer |
| ConductorPolicy | Policy configuration |
| ConductorServers | Server management |
| MetricsDashboard | Analytics |
| ObservabilityPage | Observability tools |
| OperatorTasks | Task management |
| OperatorSessions | Session management |
| OperatorTraces | Trace viewing |
| OperatorMemory | Memory inspection |
| OperatorBilling | Billing dashboard |
| OperatorSettings | Settings |
| OperatorProfile | Profile |
| TradingDashboard | Trading terminal |
| Web3Dashboard | Web3 bridge |
| ZetaChain | ZetaChain integration |
| Marketplace | Marketplace |
| Leaderboard | User ranking |
| Billing | Billing management |

### 13.4 WebSocket Gateway

Real-time communication layer:
- **GatewayClient.ts** — WebSocket connection with auto-reconnect and auth
- **GatewayProvider.tsx** — React context for event routing
- **15+ event handlers** — Factory-pattern handler registration
- **gatewayIdentity.ts** — Ed25519 keypair generation for device auth
- **Zod validators** — Schema validation for all gateway events

---

## 14. Virtual CMO Content Engine

**Repository:** [github.com/sint-ai/sint-cmo-operator](https://github.com/sint-ai/sint-cmo-operator)

The Virtual CMO is an AI content engine that transforms one video into a week of multi-platform content. It represents SINT's approach to autonomous content operations.

### 14.1 Pipeline Architecture

```
Video Input → Download → Transcribe (AssemblyAI/Whisper)
    → Analyze (Claude 3-pass) → Face Track (MediaPipe)
    → Render (Remotion/FFmpeg) → Generate Text (Claude)
    → Quality Score → Approval Queue → Publish
```

### 14.2 Technical Stack

- **331 files** total in repository
- **API server:** Express.js with 40+ route modules
- **Core engine:** Pipeline engine with YAML-driven workflow definitions
- **Rendering:** Remotion for programmatic video (React-based compositions — BrandOverlay, CaptionRenderer, ClipComposition, FaceCrop)
- **Transcription:** AssemblyAI + local Whisper fallback
- **LLM routing:** Multi-provider router (Claude, OpenAI, etc.)
- **Auth:** API key service + OAuth manager + auth middleware
- **Scheduling:** CMO scheduler with cron-based automation

### 14.3 Skills (18 modular processors)

| Skill | Function |
|-------|----------|
| `asset-ingester` | Ingest and normalize input media |
| `brand-researcher` | Research brand voice and guidelines |
| `competitor-analyzer` | Competitive content analysis |
| `content-analyzer` | Deep content analysis (3-pass Claude) |
| `content-publisher` | Multi-platform publishing orchestrator |
| `content-repurpose` | Repurpose content across formats (6 sub-modules: angle extractor, hashtag researcher, input analyzer, media generator, platform generator, quality scorer) |
| `image-generator` | AI image generation for social posts |
| `linkedin-writer` | LinkedIn-optimized post generation |
| `newsletter` | Newsletter content generation |
| `notifier` | Telegram + general notification delivery |
| `output-packager` | Package deliverables for export |
| `platform-formatter` | Platform-specific format adaptation |
| `schema-generator` | Content schema generation |
| `seo-blog` | SEO-optimized blog post generation |
| `seo-optimizer` | SEO optimization pass |
| `serp-scraper` | SERP data collection for SEO |
| `social-calendar` | 7-day social media calendar generation |
| `video-clipper` | Intelligent clip extraction |
| `video-repurpose` | Full video repurpose pipeline (download → transcribe → face-track → analyze → render → generate text) |

### 14.4 Publishing Integrations

| Platform | Integration |
|----------|-------------|
| YouTube Shorts | OAuth + upload API |
| TikTok | OAuth + upload API |
| Instagram | Graph API |
| LinkedIn | OAuth + share API |
| Twitter/X | OAuth + tweet API |
| Telegram | Bot API |

### 14.5 Services

| Service | Function |
|---------|----------|
| CMO Autonomy | Autonomous decision-making engine |
| CMO Guardrails | Content compliance checking |
| CMO Quality | Content quality scoring |
| CMO Strategy | Content strategy generation |
| CMO Trends | Trend detection and analysis |
| CMO Timing | Optimal posting time calculation |
| CMO Competitors | Competitor monitoring |
| Evidence Ledger | Analytics and audit trail |
| Feedback Loop | Performance → improvement cycle |
| Approval Engine | Human-in-the-loop content approval |
| Brand Voice Engine | Brand consistency enforcement |
| Brandbook Processor | Brand guidelines extraction |

### 14.6 External Integrations

- **MCP Skill Server** — Exposes CMO capabilities as MCP tools
- **OpenClaw Connector** — Integration with OpenClaw agent platform
- **Telegram Bot** — Direct Telegram channel management
- **WhatsApp Bot** — WhatsApp Business integration
- **Zapier Routes** — Webhook/Zapier automation

### 14.7 Cost Analysis

| Platform | Cost per Video | Notes |
|----------|:---:|-------|
| Opus Clip | $15–30 | Cloud-based |
| Repurpose.io | $15–25 | Limited customization |
| **SINT CMO** | **~$1.50** | Self-hosted, full customization |

---

## 15. 3D Avatar System

**Repository:** [github.com/sint-ai/sint-avatars](https://github.com/sint-ai/sint-avatars)

The avatar system provides a 3D talking character interface for human-agent interaction.

### 15.1 Architecture

```
User Input → Server (OpenAI LLM for text + emotion tags)
    → ElevenLabs TTS (MP3 + character-level alignment timestamps)
    → Viseme Conversion (alignment → ARKit blendshape targets)
    → Client (MP3 base64 + lipsync data)
    → Three.js Renderer (morph target animation synchronized to audio)
```

### 15.2 Client (apps/client)

**Rendering Stack:** Three.js + React Three Fiber + drei

**3D Systems:**
- **Avatar module** — AvatarNew, AvatarOptimized, AvatarOriginal, AvatarScene, CharacterControls
- **Animation system** — External animation loading, idle animation, alive system (subtle breathing/movement)
- **Lipsync** — ElevenLabs character-level timestamps → viseme codes (A-X) → ARKit 52 blendshapes → morph target interpolation
- **Camera system** — CameraFollow, CameraRig with configurable defaults
- **Effects** — Post-processing pipeline
- **Scene management** — Multiple scene configurations with lighting constants

**Interaction Systems:**
- `useVoiceRecorder` — User voice input capture
- `useBargein` — Interrupt detection (user speaks while avatar is talking)
- `useAvatarBehavior` — Behavioral state machine
- `useAvatarAnticipation` — Pre-load animations based on conversation context
- `useBlink` — Realistic blink patterns
- `useGPUTier` — Adaptive quality based on device capability
- `useMorphTargets` — Blendshape target management

**Debug:** DebugHUD with live tuning of viseme mappings, expression weights, and animation parameters.

### 15.3 Server (apps/server)

**Stack:** Node.js/TypeScript

- **Character system** — Configurable character personalities
- **Conversation compiler** — Assembles conversation context
- **Conversation filter** — Content moderation
- **Streaming chat** — Streaming LLM responses with emotion tagging
- **OpenClaw backend** — Integration with OpenClaw agent platform
- **Static audio assets** — Pre-generated greetings, error messages for instant playback

### 15.4 Shared Package (packages/shared)

- ARKit 52 blendshape definitions and mappings
- Shared types between client and server
- Utility functions

### 15.5 Expression System

12 expressions with configurable LERP speeds, 21 skeletal animations, multiple characters (girl, boy, SINT).

---

## 16. Outreach Automation

**Repository:** [github.com/sint-ai/sint-outreach](https://github.com/sint-ai/sint-outreach)

B2B LinkedIn outreach automation platform, deployed as "BrightBeam" for the first client.

### 16.1 Architecture

**Backend:** FastAPI (Python)

| Module | Function |
|--------|----------|
| `agents/compliance.py` | FDA/FTC/LinkedIn ToS compliance checking |
| `agents/intent_detector.py` | Response intent classification |
| `agents/pipeline_mgr.py` | Pipeline stage management |
| `agents/prospector.py` | ICP-targeted prospect research |
| `agents/stage_classifier.py` | Conversation stage classification |
| `agents/triage.py` | Response triage and routing |
| `agents/writer.py` | AI reply generation |
| `state_machine.py` | Contact lifecycle state machine |
| `hitl/escalation.py` | Human-in-the-loop escalation |
| `hitl/feedback.py` | Feedback collection |
| `hitl/notifications.py` | Alert routing |

**Integrations:**

| Integration | Function |
|-------------|----------|
| Ulinc | LinkedIn automation (invitation-only platform) |
| GoHighLevel (GHL) | CRM pipeline management |
| Email (SMTP) | Email channel support |
| LinkedIn MCP | MCP-based LinkedIn tool access |
| NPPES | Healthcare provider lookup |
| Outscraper | Business data enrichment |
| WhatsApp | WhatsApp Business messaging |

**Database:** PostgreSQL with Alembic migrations (6 migration versions covering initial schema, campaign manager, contact lifecycle, conversation stage, A/B testing, email channel).

**Dashboard:** React (Vite) with 5 pages:
- Pipeline — Lead pipeline visualization
- Campaigns — Campaign management
- Analytics — Performance analytics
- Escalations — HITL escalation queue
- Agent Chat — Direct agent interaction

### 16.2 A/B Testing

Built-in experiment framework with:
- Multiple message variants per sequence step
- Statistical significance calculation
- Winner evaluation and auto-promotion

### 16.3 Compliance

BrightBeam targets the supplements/peptides/longevity vertical (David Steel / BrightBeam):
- FDA compliance for supplement claims
- FTC endorsement guidelines
- LinkedIn Terms of Service adherence
- CAN-SPAM compliance for email channel

---

## 17. Open Agent Trust Registry

**Repository:** [github.com/pshkv/open-agent-trust-registry](https://github.com/pshkv/open-agent-trust-registry)

A public, federated registry of trusted attestation issuers — the Certificate Authority trust store for the agent internet.

### 17.1 Problem Statement

When an AI agent presents an attestation ("I am authorized to act for this user"), the receiving service needs to verify the attestation issuer is legitimate. The registry is the master list of trustworthy badge issuers.

### 17.2 Architecture

**Registry Structure:**
```
registry/
├── issuers/                    # One JSON file per registered issuer
│   ├── agent-passport-system.json
│   ├── agentid.json
│   ├── agentinternetruntime.json
│   ├── agora.json
│   ├── arcede.json
│   ├── arkforge.json
│   ├── insumerapi.json
│   └── qntm.json
├── manifest.json               # Compiled, signed registry manifest
└── proofs/                     # Cryptographic proofs
```

**CLI (`@open-agent-trust/cli`):**

| Command | Function |
|---------|----------|
| `keygen` | Generate Ed25519 keypair for issuer identity |
| `register` | Create registration file with domain proof |
| `submit` | Submit registration to registry |
| `verify` | Verify an attestation against registry |
| `issue` | Issue an attestation for an agent |
| `prove` | Generate cryptographic proof |
| `compile` | Compile registry manifest |

### 17.3 Security Properties

1. **Permissionless registration** — Organizations register by cryptographically proving domain ownership. Automated CI pipeline adds them. No human gatekeepers.
2. **Threshold governance** — Master list secured by 3-of-5 multi-signature scheme. Keys distributed to independent ecosystem leaders.
3. **Zero-trust mirrors** — Registry manifest is cryptographically signed. Anyone can host a mirror; tampered manifests are rejected by SDK.
4. **Local verification** — Services download registry once and verify locally. No per-request central server calls.

### 17.4 CI/CD

- `manifest-compiler.yml` — Compiles registry on changes
- `verify-registration.yml` — Validates new registrations
- `release.yml` — npm publish for CLI

### 17.5 Research Paper

"Composable Agent Trust Stack" — available at [arcede.com/papers](https://arcede.com/papers), documenting the broader vision and architecture.

---

## 18. Physical AI Use Cases

### 18.1 Warehouse Delivery Robot (AMR)

**Standards:** ISO 3691-4, IEC 62443

| Action | SINT Tier | Constraint |
|--------|-----------|------------|
| LiDAR/camera subscribe | T0 | — |
| Receive task via A2A | T1 | — |
| Navigate (no humans) | T2 | maxVelocity: 1.5 m/s |
| Navigate (humans detected) | T3 | maxVelocity: 0.3 m/s |
| Gripper operation | T2 | maxForce: 30 N |
| Emergency stop | NEVER BLOCKED | Invariant I-G2 |

### 18.2 Industrial Welding Arm (ISO 10218)

| Action | SINT Tier | Constraint |
|--------|-----------|------------|
| Read joint angles | T0 | — |
| Plan weld path | T1 | — |
| Begin weld sequence | T2 | maxForce: 500 N, cell_locked: true |
| Move arm (human in cell) | T3 | maxVelocity: 0.1 m/s (ISO 10218-1 §5.4.3) |
| E-stop override | BLOCKED | I-G2 invariant |

### 18.3 Surgical Robot (FDA Class III)

**Standards:** IEC 62304, IEC 60601-1-8, FDA 21 CFR Part 820, ISO 14971

| Action | SINT Tier | Constraint |
|--------|-----------|------------|
| Instrument positioning | T2 | maxVelocity: 0.01 m/s (sub-mm precision) |
| Force application | T2 | maxForce: 5 N |
| Electrocautery | T3 | surgeon_confirmed: true (irreversible tissue damage) |
| Emergency retract | NEVER BLOCKED | Safety retract always forwarded |

### 18.4 UAV / Drone (MAVLink)

**Standards:** ASTM F3548-21, EU U-Space, FAA AC 107-2B

| Action | SINT Tier | Constraint |
|--------|-----------|------------|
| ARM/DISARM | T3 | Propulsion enable/disable |
| TAKEOFF | T2 | altitude ≤ 120m (FAA Part 107) |
| MISSION_START | T3 | Begins autonomous BVLOS |
| FENCE_DISABLE | T3 | Removes safety boundary |

### 18.5 Collaborative Robot (ISO/TS 15066)

Power-and-force limiting mode with continuous human presence:
- maxVelocity: 0.25 m/s, maxForce: 150 N (ISO/TS 15066 Table 1 transient contact)
- Per-body-region force limits: Head 130N, Chest 140N, Hand 140N, Thigh 220N

### 18.6 Underwater ROV (DNV-ST-0111)

| Action | SINT Tier | Constraint |
|--------|-----------|------------|
| Thruster control | T2 | maxVelocity: 1.0 m/s |
| Manipulator | T2 | maxForce: 200 N |
| Emergency surface | ALWAYS FORWARDED | Never blocked |

---

## 19. Conformance & Testing

### 19.1 Test Suite Summary

| Component | Repository | Tests |
|-----------|-----------|:---:|
| SINT Protocol (full stack) | sint-protocol | **1,363** |
| Operators Platform | sint-agents | **1,276+** |
| **Ecosystem total** | all repos | **2,639+** |

### 19.2 Protocol Test Coverage

| Category | Tests | Coverage |
|----------|:---:|----------|
| Core types & Zod schemas | ~80 | Validation, DFA states |
| Capability tokens | ~120 | Issuance, delegation, revocation, chain verification |
| Policy gateway | ~150 | Tier assignment, constraint checking, escalation, plugins |
| Evidence ledger | ~90 | Hash chain integrity, proof receipts, queries |
| Bridge adapters | ~200 | MCP, ROS 2, MAVLink, A2A, gRPC, IoT, MQTT, OPC-UA |
| OWASP Conformance | ~300 | All 10 ASI categories |
| Economic layer | ~70 | Billing, budget, route selection |
| Avatar/CSML | ~50 | Behavioral drift detection |
| Persistence | ~60 | PostgreSQL, Redis, in-memory |
| CLI (sintctl) | ~40 | Token management, approvals |
| Edge mode conformance | ~40 | Offline operation |
| Economy fixtures | ~20 | Pricing calculator validation |
| Integration tests | ~140 | End-to-end gateway flows |

### 19.3 OWASP Agentic Security Top 10 Coverage

| # | OWASP Category | SINT Enforcement |
|---|---|---|
| ASI01 | Goal Hijack / Prompt Injection | GoalHijackPlugin (5-layer detection) |
| ASI02 | Tool Misuse | Tier-based approval gates + forbidden combo detection |
| ASI03 | Identity Abuse | Ed25519 capability tokens + W3C DID |
| ASI04 | Supply Chain Compromise | DefaultSupplyChainVerifier (model hash + tool manifest) |
| ASI05 | Code Execution | T3_COMMIT classification for all exec tools |
| ASI06 | Memory Poisoning | MemoryIntegrityChecker (replay, privilege, overflow) |
| ASI07 | Inter-Agent Manipulation | Cross-agent injection detection in GoalHijackPlugin |
| ASI08 | Cascading Failure | CircuitBreakerPlugin + per-agent budget caps |
| ASI09 | Trust Exploitation | Attenuation-only delegation (max depth 3) |
| ASI10 | Rogue Agent | CSML auto-escalation + CircuitBreaker auto-trip |

### 19.4 MCP Attack Surface Conformance

Dedicated 10-test suite validates each OWASP ASI category against the gateway choke point using real MCP tool calls.

---

## 20. Compliance & Standards Mapping

| Standard | Scope | SINT Coverage |
|----------|-------|---------------|
| **OWASP Agentic Top 10** | AI agent security | 10/10 categories (ASI01–ASI10) |
| **EU AI Act** | High-risk AI systems | Art. 9 (risk management → CSML + tier system), Art. 11 (technical documentation → evidence ledger), Art. 13 (transparency → audit trail), Art. 14(4)(e) (stop button → CircuitBreakerPlugin) |
| **IEC 62443** | Industrial cybersecurity | Zone/conduit mapping via bridge adapters, SL-T alignment with tier system |
| **ISO 10218-1/2** | Industrial robot safety | Force/velocity constraints, collaborative space monitoring, protective stop forwarding |
| **ISO/TS 15066** | Collaborative robots | Power-and-force limiting mode, per-body-region contact force limits |
| **ISO 14971** | Medical device risk management | Risk classification → tier assignment, residual risk tracking via ledger |
| **IEC 62304** | Medical device software | Traceability via evidence ledger, software unit verification |
| **IEC 60601-1-8** | Medical electrical equipment alarms | Alarm priority mapping to tier escalation |
| **FDA 21 CFR Part 820** | Medical device QMS | Design controls, production records via audit trail |
| **NIST AI RMF 1.0** | AI risk management | MAP (resource classification), MEASURE (CSML), MANAGE (tier escalation), GOVERN (audit) |
| **NIST SP 800-82 Rev. 3** | OT security | Network segmentation (bridge isolation), access control (tokens), monitoring (ledger) |
| **NATO STANAG 4586** | UAS control | Command/control mapping via MAVLink bridge, IFF via capability tokens |
| **ASTM F3548-21** | UAS remote ID | Agent identity via Ed25519 keys, broadcast via capability token metadata |
| **FAA AC 107-2B** | sUAS operations | Altitude constraints, BVLOS approval mapping to T3 |
| **DNV-ST-0111** | Subsea systems | ROV action classification, emergency surface priority |

---

## 21. Competitive Landscape

### 21.1 Protocol Comparison Matrix

| Feature | SINT | MCP (Anthropic) | ACP (IBM/LF) | A2A (Google) | AgentProtocol | ANP | AG-UI |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Physical constraints | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Graduated authorization | ✅ (T0–T3) | ❌ | Partial | ❌ | ❌ | ❌ | ❌ |
| Capability tokens | ✅ (Ed25519) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hash-chain audit | ✅ (SHA-256) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Forbidden combo detection | ✅ (DFA) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Behavioral drift (CSML) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Circuit breaker | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Economic metering | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Plugin architecture | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Robot/drone bridges | ✅ (ROS2, MAVLink) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| IoT/OT bridges | ✅ (MQTT, OPC-UA) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| OWASP ASI coverage | 10/10 | 0/10 | ~3/10 | ~1/10 | 0/10 | 0/10 | 0/10 |
| EU AI Act compliance | ✅ | ❌ | Partial | ❌ | ❌ | ❌ | ❌ |
| Tests | 1,363 | N/A | N/A | N/A | N/A | N/A | N/A |

**Key insight:** SINT is not competing with these protocols. It is a **security enforcement layer** that wraps around them. MCP + SINT = secured MCP. A2A + SINT = secured A2A.

### 21.2 Market Context

- **Agentic AI market:** $10.86B (March 2026), 46% CAGR → $52.6B by 2030
- **Physical AI security:** No established market leader; SINT is first-to-market with a comprehensive protocol
- **ROSClaw (Cardenas et al., 2026):** First academic validation of the need for runtime authorization in ROS 2 agentic systems — cites SINT approach
- **OWASP Agentic Security:** Published March 2026; SINT achieved 10/10 coverage within 4 weeks

---

## 22. Research Agenda (2026–2031)

### Problem 1: Swarm Coordination Security (2026–2027)

**Threat:** A drone swarm of N agents shares a task. Each individual agent has a valid capability token. But the collective action — N drones converging on a target — is dangerous in ways no individual token expresses.

**Research directions:**
1. **Swarm capability token** — Group token encoding collective constraints: `maxSwarmDensity` (agents/m³), `minInterAgentDistance` (m), `maxCollectiveKineticEnergy` (Σ½mv² in joules), `synchronizationWindow` (ms)
2. **Collective CSML** — `computeCsml()` extended to agent cohorts with tighter threshold θ_swarm
3. **Byzantine-resilient coordination** — k-of-N threshold signature scheme for compromised swarm members

**Target standard:** NATO STANAG 4586 (UAS control), MIL-STD-1553B (bus security)

### Problem 2: Sub-Human-Reaction-Time Safety (2026–2028)

**Threat:** Physical AI operates at 1 kHz (ROS 2 control loops). Human approval has 200–500 ms latency. A robot executes 200–500 control cycles while waiting.

**Research directions:**
1. **Probabilistic constraint envelopes** — Replace binary checks with Gaussian confidence bounds
2. **Predictive tier assignment** — ML model predicting which upcoming actions will need T2/T3 approval, pre-fetching human attention
3. **Safety-bounded autonomy** — Pre-approved trajectory corridors with divergence thresholds for automatic invalidation

### Problem 3: Multi-Modal Sensor Fusion Trust (2027–2028)

**Threat:** CSML currently tracks action-level metrics. Physical AI decisions are based on sensor fusion (LiDAR + camera + IMU). A compromised sensor can cause correct-looking actions that are physically dangerous.

**Research directions:**
1. **Sensor attestation** — Each sensor produces signed readings; gateway verifies sensor integrity
2. **Fusion consistency scoring** — Cross-validate sensor modalities; flag inconsistencies
3. **Adversarial sensor detection** — Detect spoofed LiDAR, camera injection attacks

### Problem 4: Cross-Organizational Trust Federation (2027–2029)

**Threat:** Agent A (authorized by Company X) needs to interact with Agent B (authorized by Company Y). Neither trusts the other's token authority.

**Research directions:**
1. **Federated capability negotiation** — Mutual attestation protocol
2. **Trust registry integration** — Open Agent Trust Registry as the PKI root
3. **Cross-domain CSML** — Behavioral reputation that transfers across organizations

### Problem 5: Formal Verification of Safety Properties (2028–2031)

**Threat:** The gateway's safety invariants are currently tested empirically (1,363 tests). For FDA Class III and aerospace, formal proofs are required.

**Research directions:**
1. **TLA+ specification** — Model-check core gateway invariants
2. **Coq/Lean proofs** — Formally verify token delegation attenuation
3. **Isabelle/HOL** — Prove hash chain integrity properties

---

## 23. Deployment & Operations

### 23.1 Quick Start (MCP Proxy)

For immediate use with Claude Desktop or Cursor:

```bash
npm install -g @sint/bridge-mcp
sintctl token create --resource "mcp://*" --actions read,call --ttl 24h
```

Add to Claude Desktop MCP config:
```json
{
  "mcpServers": {
    "sint-proxy": {
      "command": "npx",
      "args": ["@pshkv/bridge-mcp", "--downstream", "filesystem,exec"]
    }
  }
}
```

### 23.2 Production Deployment (Docker)

```yaml
# docker-compose.yml
services:
  gateway:
    image: ghcr.io/sint-ai/sint-gateway:latest
    ports:
      - "3000:3000"
    environment:
      - SINT_PERSISTENCE=postgres
      - DATABASE_URL=postgresql://sint:pass@db:5432/sint
      - SINT_REDIS_URL=redis://redis:6379
    depends_on: [db, redis]

  dashboard:
    image: ghcr.io/sint-ai/sint-dashboard:latest
    ports:
      - "3001:80"
    environment:
      - VITE_GATEWAY_URL=http://gateway:3000

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: sint
      POSTGRES_USER: sint
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

### 23.3 CLI (`sintctl`)

```bash
# Token management
sintctl token create --resource "ros2:///cmd_vel" --actions publish --maxVelocity 1.5
sintctl token list
sintctl token revoke <tokenId>
sintctl token delegate --parent <tokenId> --maxVelocity 0.5  # Attenuated

# Approvals
sintctl approve list --pending
sintctl approve accept <requestId>
sintctl approve deny <requestId> --reason "Too fast"

# Audit
sintctl ledger query --agent <key> --since 2026-04-01 --tier T3
sintctl ledger verify --entry <entryId>  # Verify hash chain
sintctl ledger export --format jsonl > audit.jsonl

# Policy
sintctl policy list
sintctl policy add --resource "mcp://exec/*" --tier T3_COMMIT
sintctl policy test --resource "ros2:///cmd_vel" --action publish

# Scanning
sintctl scan --server filesystem  # Security scan MCP server
```

### 23.4 Python SDK

```python
from sint import SintClient, SintScanner

# Client usage
client = SintClient(gateway_url="http://localhost:3000")
token = client.create_token(
    resource="mcp://filesystem/*",
    actions=["read"],
    ttl_hours=24
)

# Security scanning
scanner = SintScanner(gateway_url="http://localhost:3000")
results = scanner.scan_server("filesystem")
for finding in results.findings:
    print(f"{finding.severity}: {finding.description}")
```

### 23.5 Go SDK

```go
import "github.com/sint-ai/sint-protocol/sdks/sint-go"

client := sint.NewClient("http://localhost:3000")
token, err := client.CreateToken(sint.TokenRequest{
    Resource: "ros2:///cmd_vel",
    Actions:  []string{"publish"},
    MaxVelocityMps: 1.5,
})
```

---

## 24. Roadmap

### Phase 1: Foundation (Completed — Q1 2026)
- ✅ Core protocol types and Zod schemas
- ✅ Policy Gateway with tier assignment and plugin system
- ✅ Ed25519 capability tokens with delegation chains
- ✅ SHA-256 hash-chained evidence ledger
- ✅ MCP bridge adapter (primary adoption vector)
- ✅ Economic layer with metered billing
- ✅ OWASP ASI 10/10 conformance
- ✅ 1,363 tests passing

### Phase 2: Bridges & SDKs (Q2 2026)
- ✅ ROS 2 bridge adapter
- ✅ MAVLink v2 bridge adapter
- ✅ Google A2A bridge adapter
- ✅ gRPC bridge adapter
- ✅ IoT/MQTT/OPC-UA/Open-RMF bridges
- ✅ Python SDK (1,962 lines)
- ✅ Go SDK (stub)
- ✅ TypeScript client SDK
- ✅ PostgreSQL persistence (518 lines)
- ✅ Redis persistence + revocation bus
- ⭕ npm publish 8 packages to `@sint/` scope (ready)
- ⭕ SPAI 2026 submission (deadline: May 7)

### Phase 3: Production Hardening (Q3 2026)
- TEE attestation (Intel SGX, ARM TrustZone, AMD SEV)
- Formal verification (TLA+ for gateway invariants)
- Kubernetes Operator for gateway deployment
- Prometheus/Grafana monitoring integration
- SIEM export connectors (Splunk, Datadog, ELK)
- Edge mode for bandwidth-constrained deployments
- SOC 2 Type II audit preparation

### Phase 4: Swarm & Federation (Q4 2026 – Q1 2027)
- Swarm capability tokens
- Collective CSML
- Cross-organizational trust federation
- Byzantine-resilient coordination
- Agent Trust Registry integration as federation root

### Phase 5: Formal Safety (2027–2031)
- Probabilistic constraint envelopes
- Predictive tier assignment
- Multi-modal sensor fusion trust
- Formal proofs (Coq/Lean/Isabelle)
- Medical device certification support (IEC 62304 + FDA)
- Aerospace certification support (DO-178C)

---

## 25. References

### Academic
1. Cardenas, I.S., Arnett, M.A., Yeo, N.C., Sah, L., Kim, J.-H. (2026). "ROSClaw: An OpenClaw ROS 2 Framework for Agentic Robot Control and Interaction." arXiv:2603.26997.
2. OWASP. (2026). "Agentic AI Security Initiative — Top 10 for Agentic AI." owasp.org.
3. Anthropic. (2024). "Model Context Protocol Specification." spec.modelcontextprotocol.io.
4. MCP Security Analysis. (2026). arXiv:2601.17549.
5. Google. (2025). "Agent-to-Agent (A2A) Protocol." github.com/google/A2A.

### Standards
6. IEC 62443-3-3:2013. Industrial communication networks — IT security for networks and systems.
7. ISO 10218-1:2011. Robots and robotic devices — Safety requirements for industrial robots.
8. ISO/TS 15066:2016. Robots and robotic devices — Collaborative robots.
9. ISO 14971:2019. Medical devices — Application of risk management.
10. IEC 62304:2015. Medical device software — Software life cycle processes.
11. IEC 60601-1-8:2020. Medical electrical equipment — Alarm systems.
12. FDA 21 CFR Part 820. Quality System Regulation.
13. NIST AI RMF 1.0 (2023). Artificial Intelligence Risk Management Framework.
14. NIST SP 800-82 Rev. 3 (2023). Guide to Operational Technology (OT) Security.
15. NATO STANAG 4586. Standard Interfaces of UAV Control System.
16. ASTM F3548-21. Standard Specification for UAS Remote ID.
17. EU AI Act (2024). Regulation (EU) 2024/1689 — Harmonised rules on artificial intelligence.
18. DNV-ST-0111. Assessment of station keeping capability of dynamic positioning vessels.

### SINT Ecosystem
19. SINT Protocol Repository. github.com/sint-ai/sint-protocol.
20. SINT Operators Platform. github.com/sint-ai/sint-agents.
21. SINT Virtual CMO. github.com/sint-ai/sint-cmo-operator.
22. SINT Avatars. github.com/sint-ai/sint-avatars.
23. SINT Outreach. github.com/sint-ai/sint-outreach.
24. Open Agent Trust Registry. github.com/pshkv/open-agent-trust-registry.
25. Autonomous Execution Engine. github.com/sint-ai/autonomous-execution-engine.

---

## Appendix A: Gateway Invariants

| ID | Invariant | Description |
|----|-----------|-------------|
| I-G1 | Single choke point | All actions pass through Policy Gateway |
| I-G2 | E-stop never blocked | Emergency stop signals are always forwarded |
| I-G3 | Tier monotonicity | Tiers can only escalate during request lifecycle |
| I-G4 | Token attenuation | Delegation can only narrow scope |
| I-G5 | Ledger append-only | Evidence ledger entries never modified or deleted |
| I-G6 | Hash chain integrity | Each entry hash includes previous entry hash |
| I-G7 | Budget fail-deny | Insufficient balance always denies (never escalates) |
| I-G8 | Timeout fail-deny | Approval timeout defaults to deny |

## Appendix B: Package Dependency Graph

```
@sint/core
  ├── @sint/gate-capability-tokens
  ├── @sint/gate-policy-gateway
  │     ├── @sint/gate-capability-tokens
  │     ├── @sint/gate-evidence-ledger
  │     └── @sint/bridge-economy
  ├── @sint/gate-evidence-ledger
  ├── @sint/persistence
  │     └── @sint/persistence-postgres
  ├── @sint/bridge-mcp
  │     └── @sint/gate-policy-gateway
  ├── @sint/bridge-economy
  └── @sint/client
```

## Appendix C: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SINT_PERSISTENCE` | `memory` | `memory` \| `postgres` \| `redis` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `SINT_REDIS_URL` | — | Redis connection string |
| `SINT_TOKEN_TTL` | `86400000` | Default token TTL (ms) |
| `SINT_MAX_DELEGATION_DEPTH` | `3` | Maximum delegation chain depth |
| `SINT_CSML_THRESHOLD` | `0.30` | Default CSML escalation threshold |
| `SINT_CIRCUIT_BREAKER_THRESHOLD` | `5` | Consecutive denials to auto-trip |
| `SINT_APPROVAL_TIMEOUT` | `30000` | Default approval timeout (ms) |
| `SINT_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

---

**License:** MIT

**Repository:** [github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)

**Contact:** i@pshkv.com | [sint.gg](https://sint.gg)

© 2026 SINT AI Lab / PSHKV Inc. All rights reserved.