# SINT Protocol Specification

**Version:** 0.1.0-draft
**Status:** Draft
**License:** Apache-2.0

## Abstract

SINT is an open protocol that enforces security, governance, and economic constraints on AI agent actions in the physical world. It defines a layered architecture where every agent request — whether an MCP tool call, a ROS 2 command, or an API invocation — flows through a single Policy Gateway that assigns approval tiers, enforces physical constraints, detects forbidden action sequences, and records tamper-evident audit trails.

This document specifies the protocol's core primitives, message formats, authorization model, and extension points.

---

## 1. Design Goals

1. **Universal interception** — One choke point for all agent-to-world actions, regardless of transport (MCP, ROS 2, HTTP, custom bridges).
2. **Graduated authorization** — Four approval tiers (T0–T3) map action severity to authorization requirements, from auto-approved sensor reads to human-approved irreversible commits.
3. **Physical safety as a first-class concern** — Velocity, force, and geofence constraints are enforced at the protocol level, not delegated to application code.
4. **Cryptographic accountability** — Ed25519 capability tokens and SHA-256 hash-chained audit logs provide non-repudiable proof of every authorization decision.
5. **Attenuation-only delegation** — Delegated permissions can only narrow, never escalate.

---

## 2. Terminology

| Term | Definition |
|------|-----------|
| **Agent** | An AI system (LLM, autonomous controller, multi-agent orchestrator) that issues requests to act on the physical or digital world. |
| **Operator** | A human or system with authority to approve, deny, or configure agent permissions. |
| **Policy Gateway** | The single enforcement point through which all agent requests flow. |
| **Capability Token** | An Ed25519-signed credential granting an agent scoped permissions over specific resources and actions. |
| **Evidence Ledger** | An append-only, SHA-256 hash-chained log recording every policy decision. |
| **Bridge** | A protocol adapter that translates domain-specific requests (MCP tool calls, ROS 2 messages) into SINT requests. |
| **Approval Tier** | One of four graduated authorization levels (T0–T3) assigned to each request based on consequence severity. |
| **Forbidden Combination** | A sequence of actions that, when executed together, creates a security risk greater than either action alone. |

---

## 3. Architecture

```
┌─────────────────────────────────────────┐
│            Agent (LLM / Controller)      │
└──────────────┬──────────────────────────┘
               │ SintRequest
┌──────────────▼──────────────────────────┐
│           Bridge Adapter                 │
│  (MCP Bridge, ROS 2 Bridge, Custom)     │
└──────────────┬──────────────────────────┘
               │ SintRequest (normalized)
┌──────────────▼──────────────────────────┐
│          Policy Gateway                  │
│  ┌──────────────────────────────────┐   │
│  │ 1. Token Validation              │   │
│  │ 2. Tier Assignment               │   │
│  │ 3. Constraint Checking           │   │
│  │ 4. Forbidden Combo Detection     │   │
│  │ 5. Approval Flow (T2/T3)         │   │
│  └──────────────────────────────────┘   │
│              │                           │
│   ┌──────────▼──────────┐               │
│   │   Evidence Ledger   │               │
│   │  (hash-chained log) │               │
│   └─────────────────────┘               │
└──────────────┬──────────────────────────┘
               │ PolicyDecision
               ▼
     allow | deny | escalate | transform
```

### 3.1 Request Flow

1. An agent invokes an action through a bridge adapter (e.g., MCP tool call, ROS 2 publish).
2. The bridge normalizes the request into a `SintRequest`.
3. The Policy Gateway validates the agent's capability token.
4. The tier assigner determines the approval tier (T0–T3) based on resource patterns, actions, and contextual escalation triggers.
5. The constraint checker verifies physical constraints (velocity, force, geofence) if applicable.
6. The forbidden combo detector checks if the action, combined with recent agent actions, forms a dangerous sequence.
7. If the tier requires approval (T2/T3), the request enters the approval queue. An operator approves or denies via dashboard or API.
8. The gateway emits a `PolicyDecision` and the evidence ledger records it.
9. The bridge adapter forwards, blocks, or transforms the original request based on the decision.

---

## 4. Core Primitives

### 4.1 SintRequest

Every agent action is normalized to this structure before entering the gateway.

```typescript
interface SintRequest {
  requestId: UUIDv7;                    // Unique, sortable request identifier
  agentId: Ed25519PublicKey;            // 32-byte hex-encoded public key
  tokenId: UUIDv7;                      // Capability token authorizing this request
  resource: string;                     // URI: "ros2:///cmd_vel", "mcp://filesystem/writeFile"
  action: string;                       // "publish", "call", "subscribe", "exec.run"
  params: Record<string, unknown>;      // Action-specific parameters
  physicalContext?: {
    humanDetected?: boolean;            // Triggers tier escalation
    currentVelocityMps?: number;        // Current robot velocity
    currentForceNewtons?: number;       // Current applied force
    position?: { lat: number; lon: number; };
  };
  recentActions?: string[];             // Last N actions for combo detection
  timestamp: ISO8601;                   // Microsecond precision
}
```

### 4.2 PolicyDecision

The gateway's response to every request.

```typescript
interface PolicyDecision {
  action: "allow" | "deny" | "escalate" | "transform";
  requestId: UUIDv7;
  assignedTier: ApprovalTier;           // T0_OBSERVE | T1_PREPARE | T2_ACT | T3_COMMIT
  assignedRisk: RiskTier;              // T0_READ | T1_WRITE_LOW | T2_STATEFUL | T3_IRREVERSIBLE
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

### 4.3 Resource URIs

Resources are identified by URIs with the following schemes:

| Scheme | Format | Example |
|--------|--------|---------|
| `ros2://` | `ros2:///<topic_or_service>` | `ros2:///cmd_vel`, `ros2:///camera/rgb` |
| `mcp://` | `mcp://<server>/<tool>` | `mcp://filesystem/writeFile`, `mcp://exec/run` |
| `http://` | Standard HTTP URI | `http://api.example.com/v1/transfer` |

Glob patterns are supported in tier rules: `mcp://*`, `ros2:///sensor/*`, `mcp://*/trade.*`.

---

## 5. Approval Tiers

Requests are classified into four tiers based on consequence severity. Tier assignment is deterministic: the same request with the same context always receives the same tier.

| Tier | Enum | Auto-approved | Requires | Physical Example | Digital Example |
|------|------|:---:|-----------|-----------------|-----------------|
| **T0** | `T0_OBSERVE` | Yes (logged) | — | Read sensor data | Query database, read file |
| **T1** | `T1_PREPARE` | Yes (audited) | — | Save waypoint, plan path | Write file, stage config |
| **T2** | `T2_ACT` | No | Review | Move robot, operate gripper | Modify database, deploy |
| **T3** | `T3_COMMIT` | No | Human | Mode change, emergency stop | Execute code, transfer funds |

### 5.1 Tier Escalation Triggers

The base tier can be escalated (never de-escalated) by contextual signals:

| Trigger | Effect | Rationale |
|---------|--------|-----------|
| Human detected near robot | T2 → T3 | Human safety overrides operational convenience |
| New/untrusted agent | +1 tier | Unknown agents get tighter scrutiny |
| Forbidden combo detected | → T3 | Dangerous sequences require human approval |
| Server `requireApproval: true` | Non-T0 → escalate | Operator-configured per-server policy |
| Velocity/force exceeds constraint | → deny | Hard physical safety limit, not negotiable |

### 5.2 Per-Server Policy

Each downstream server (MCP or ROS 2 bridge target) can declare:

- `maxTier` — Ceiling on allowed tiers. Requests that would require a higher tier are denied.
- `requireApproval` — Forces operator approval for all non-T0 requests.

---

## 6. Capability Tokens

Agents authenticate using Ed25519-signed capability tokens that scope their permissions.

### 6.1 Token Structure

```typescript
interface CapabilityToken {
  id: UUIDv7;
  issuer: Ed25519PublicKey;             // Who issued this token
  subject: Ed25519PublicKey;            // Which agent holds it
  resource: string;                     // Scoped resource pattern (glob-supported)
  actions: string[];                    // Allowed actions
  constraints: {
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    geofence?: GeoPolygon;              // Array of {lat, lon} points
  };
  delegationChain: {
    parentTokenId: UUIDv7 | null;       // null = root token
    depth: number;                       // 0 = root, max 3
    attenuated: boolean;
  };
  issuedAt: ISO8601;
  expiresAt: ISO8601;
  revocable: boolean;
  signature: Ed25519Signature;          // 64-byte signature over all fields
}
```

### 6.2 Delegation Rules

1. **Maximum depth: 3.** A root token (depth 0) can delegate to depth 1, which can delegate to depth 2, which can delegate to depth 3. No further delegation.
2. **Attenuation only.** A delegated token MUST have:
   - Equal or narrower `resource` scope
   - Equal or fewer `actions`
   - Equal or tighter `constraints` (lower max velocity, smaller geofence, etc.)
   - Equal or earlier `expiresAt`
3. **Chain verification.** Validators MUST verify the entire delegation chain, confirming each hop's signature and attenuation.
4. **Revocation cascades.** Revoking a parent token implicitly revokes all descendants.

### 6.3 Cryptography

- **Signing:** Ed25519 via `@noble/ed25519` (audited, zero-dependency)
- **Hashing:** SHA-256 via `@noble/hashes`
- **Key format:** 32-byte hex-encoded public keys, 64-byte hex-encoded private keys
- **Signature format:** 64-byte hex-encoded Ed25519 signatures

---

## 7. Forbidden Combinations

The gateway maintains a list of action sequences that are individually permitted but dangerous in combination. When a request would complete a forbidden sequence (checking `recentActions`), the tier is escalated to T3.

### 7.1 Default Forbidden Combos

| Sequence | Risk |
|----------|------|
| `filesystem.write` → `exec.run` | Code injection — write malicious file, then execute it |
| `credential.read` → `http.request` | Credential exfiltration — read secret, then send it out |
| `database.write` → `database.execute` | SQL injection escalation — modify schema, then run queries |

### 7.2 Detection Algorithm

1. Each `SintRequest` includes `recentActions[]` — the agent's last N actions (configurable, default 10).
2. The forbidden combo detector checks if the current action would complete any registered sequence.
3. If a match is found, the tier is escalated to T3 and the reason is recorded.

Implementations MAY extend the default list with domain-specific forbidden combinations.

---

## 8. Evidence Ledger

Every `PolicyDecision` is recorded in a tamper-evident, append-only log.

### 8.1 Ledger Entry

```typescript
interface LedgerEvent {
  id: UUIDv7;
  sequenceNumber: number;              // Monotonically increasing
  previousHash: SHA256Hash;            // Hash of the previous entry (genesis = "0".repeat(64))
  eventHash: SHA256Hash;               // SHA-256(previousHash + serialized event data)
  eventType: "intercept" | "token_issued" | "token_revoked" | "approval_resolved";
  agentId: Ed25519PublicKey;
  requestId?: UUIDv7;
  decision?: PolicyDecision;
  metadata: Record<string, unknown>;
  timestamp: ISO8601;
}
```

### 8.2 Integrity Properties

- **Hash chain:** Each entry's `eventHash` includes the `previousHash`, creating a chain. Any modification to a historical entry breaks all subsequent hashes.
- **Proof receipts:** Given an entry's `id`, the ledger can produce a cryptographic proof (the entry itself plus its hash chain neighbors) sufficient to verify the entry has not been tampered with.
- **Append-only:** Entries are never updated or deleted. The ledger interface exposes only `append()` and `query()` operations.

### 8.3 Storage Backends

The protocol defines a storage interface; implementations choose their backend:

| Backend | Characteristics | Use Case |
|---------|----------------|----------|
| In-memory | Fast, ephemeral | Testing, development |
| PostgreSQL | Durable, queryable | Production single-node |
| Redis | Fast writes, pub/sub | High-throughput, caching layer |

---

## 9. Bridge Adapters

Bridges translate domain-specific protocols into SINT requests. Two bridges are specified in v0.1:

### 9.1 MCP Bridge

Intercepts MCP tool calls between an AI client (Claude, Cursor) and downstream MCP servers.

- **Resource mapping:** `mcp://<serverName>/<toolName>`
- **Action:** Always `"call"` for tool calls
- **Session management:** Each agent-server pair has a session with its own token scope
- **Built-in tools:** The SINT MCP proxy exposes `sint__*` tools for runtime introspection (`sint__status`, `sint__audit`, `sint__approve`, etc.)

### 9.2 ROS 2 Bridge

Intercepts ROS 2 topic publishes, service calls, and action goals.

- **Resource mapping:** `ros2:///<topicOrServiceName>`
- **Physics extraction:** Automatically extracts velocity and force from known message types (`geometry_msgs/Twist`, `geometry_msgs/Wrench`)
- **Human presence:** Integrates with detection topics to trigger tier escalation

---

## 10. Approval Flow

When a request is assigned T2 or T3, it enters the approval queue.

### 10.1 Lifecycle

```
Request arrives → Tier assigned (T2/T3)
    → Approval request created (status: pending)
    → Notification sent (SSE stream, dashboard)
    → Operator approves or denies
    → PolicyDecision emitted (allow/deny)
    → Ledger entry recorded
```

### 10.2 Timeout Behavior

- Default timeout: 30 seconds
- Maximum timeout: 5 minutes (300,000ms)
- On timeout: the `fallbackAction` from the escalation config applies (typically `"deny"`)

### 10.3 API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/approvals/pending` | List pending approval requests |
| `POST` | `/v1/approvals/:id/resolve` | Approve or deny with operator identity |
| `GET` | `/v1/approvals/events` | SSE stream for real-time updates |

---

## 11. Gateway HTTP API

The gateway server exposes a REST API for programmatic integration.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/intercept` | Evaluate a single `SintRequest` |
| `POST` | `/v1/intercept/batch` | Evaluate multiple requests (207 Multi-Status) |
| `POST` | `/v1/tokens` | Issue a new capability token |
| `POST` | `/v1/tokens/delegate` | Delegate (attenuate) an existing token |
| `POST` | `/v1/tokens/revoke` | Revoke a token (cascading) |
| `GET` | `/v1/ledger` | Query audit ledger with filters |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/v1/keypair` | Generate Ed25519 keypair (dev only) |

---

## 12. Extension Points

The protocol is designed for extension:

1. **Custom bridges** — Implement the bridge interface to intercept any protocol (gRPC, MQTT, CAN bus, etc.).
2. **Custom tier rules** — Add resource patterns and tier assignments for domain-specific tools.
3. **Custom forbidden combos** — Register domain-specific dangerous action sequences.
4. **Custom storage backends** — Implement the persistence interface for your infrastructure.
5. **Custom constraints** — Add physical or logical constraints beyond velocity/force/geofence.

---

## 13. Security Considerations

1. **Token theft** — Capability tokens should be stored securely and rotated regularly. Short expiration times limit exposure.
2. **Replay attacks** — `requestId` (UUIDv7) provides uniqueness. Implementations SHOULD reject duplicate request IDs within a configurable window.
3. **Bridge bypass** — The architecture assumes all agent-to-world communication flows through a bridge. Implementations MUST ensure there is no path from agent to actuator that bypasses the gateway.
4. **Ledger integrity** — The hash chain detects tampering but does not prevent it. Production deployments SHOULD replicate the ledger and periodically verify chain integrity.
5. **Approval fatigue** — Operators approving high volumes of T2/T3 requests may rubber-stamp. Implementations SHOULD track approval patterns and flag anomalies.

---

## 14. Conformance

An implementation is SINT-conformant if it:

1. Routes all agent requests through a Policy Gateway that implements sections 4–7.
2. Assigns approval tiers deterministically per section 5.
3. Enforces attenuation-only delegation per section 6.2.
4. Detects and escalates forbidden combinations per section 7.
5. Maintains a hash-chained evidence ledger per section 8.
6. Passes the `@sint/conformance-tests` regression suite (29 tests).

---

## Appendix A: Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0-draft | 2026-03-20 | Initial draft specification |

## Appendix B: References

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Anthropic's protocol for AI-tool integration
- [ROS 2](https://docs.ros.org/en/rolling/) — Robot Operating System
- [Ed25519](https://ed25519.cr.yp.to/) — High-speed high-security signatures
- [@noble/ed25519](https://github.com/paulmillr/noble-ed25519) — Audited TypeScript Ed25519 implementation
- [Capability-based security](https://en.wikipedia.org/wiki/Capability-based_security) — The authorization model SINT builds upon
