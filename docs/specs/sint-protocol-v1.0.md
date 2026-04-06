# SINT Protocol v1.0 — Formal Specification

**Status:** Final
**Version:** 1.0.0
**Date:** 2026-04-05
**Authors:** SINT Protocol Working Group
**Repository:** https://github.com/sint-ai/sint-protocol
**Reference:** arXiv preprint (2026); ROSClaw empirical study (arXiv:2603.26997, IROS 2026)

---

## Table of Contents

1. [Abstract](#1-abstract)
2. [Terminology](#2-terminology)
3. [Core Invariants](#3-core-invariants)
4. [Token Schema](#4-token-schema)
5. [Tier Definitions](#5-tier-definitions)
6. [PolicyDecision Schema](#6-policydecision-schema)
7. [EvidenceLedger Schema](#7-evidenceledger-schema)
8. [Bridge Adapter Contract](#8-bridge-adapter-contract)
9. [CSML Formula](#9-csml-formula)
10. [OWASP ASI Coverage Table](#10-owasp-asi-coverage-table)
11. [Compliance Crosswalk](#11-compliance-crosswalk)
12. [Version History](#12-version-history)

---

## 1. Abstract

The SINT Protocol (Safety Interception and Normalization for Teleoperation) is a governance-first, runtime authorization framework for physical AI systems. It enforces a mandatory, unforgeable authorization checkpoint — the PolicyGateway — between every AI agent and every physical or computational resource the agent may affect. SINT treats authorization as an engineering primitive rather than an application-layer concern: all actions, from ROS 2 topic publications to MCP tool calls to inter-agent messages, must pass through `PolicyGateway.intercept()` before execution is permitted. The protocol formalizes graduated human oversight through four Approval Tiers (T0–T3) that map action consequence severity to required oversight level, from auto-approved read-only observations through irreversible commits that require explicit human sign-off. Every decision is cryptographically logged in an append-only, SHA-256 hash-chained Evidence Ledger. SINT is designed to satisfy EU AI Act Article 14 human oversight requirements, NIST AI RMF governance controls, ISO 42001 operational risk treatment, and all ten OWASP Agentic Security Initiative (ASI) categories, making it suitable for certified deployment in warehouse automation, industrial robotics, medical device control, and multi-agent AI coordination systems.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **SINT** | Safety Interception and Normalization for Teleoperation. The protocol defined by this document. |
| **PolicyGateway** | The single mandatory choke point. Every agent action must pass through `PolicyGateway.intercept()`. No agent, bridge, or service may bypass it. |
| **CapabilityToken** | An Ed25519-signed, unforgeable authorization credential issued to an agent. Specifies the issuer, subject agent, resource URI, permitted actions, physical safety constraints, and expiry. There is no ambient authority — an agent can only do what its tokens explicitly permit. |
| **EvidenceLedger** | An append-only, SHA-256 hash-chained audit log. Every policy decision, approval, safety event, and token lifecycle event is recorded here. No UPDATE or DELETE operations are permitted. |
| **Tier** | One of four Approval Tiers (T0–T3) that determine the required human oversight level for an action. Assigned by the PolicyGateway based on resource, action, physical context, and token constraints. |
| **Bridge Adapter** | A protocol-specific module that translates external protocol messages (ROS 2 topics, MCP tool calls, MQTT, A2A agent messages) into normalized `SintRequest` objects and submits them to the PolicyGateway. |
| **CSML** | Composite Safety-Model Latency metric. A fused behavioral + physical + ledger-integrity safety score computed from Evidence Ledger events. Above threshold θ = 0.3, automatic tier escalation is applied. |
| **DelegationChain** | The verifiable lineage of a CapabilityToken from root issuer to subject agent. Maximum depth is 3 hops; each delegation may only attenuate (narrow) permissions. |
| **E-stop** | Emergency stop. A universal transition from any non-terminal RequestLifecycleState to `ROLLEDBACK`, triggered by safety violations or manual operator override. |
| **APS** | Agent Passport System. An external cross-protocol identity standard. SINT CapabilityTokens optionally carry a `passportId` field for APS interop. |
| **TAM** | Tool Authorization Manifest. An operator-defined configuration declaring per-MCP-tool security requirements, required tier, and allowed parameters. |
| **did:key** | A W3C Decentralized Identifier whose method encodes a bare Ed25519 public key. SINT uses `did:key` as the canonical agent identity format. |

---

## 3. Core Invariants

These six invariants are enforced by the reference implementation and must hold in any conformant SINT deployment. Violation of any invariant is a critical security defect.

### I-1: Single Choke Point

> **All agent actions must flow through `PolicyGateway.intercept()` before execution.**

No bridge adapter, route handler, engine component, or service module may make an independent authorization decision. The PolicyGateway is the sole authority for allow/deny/escalate decisions. This is verified by the conformance test suite (`@sint/conformance-tests`) on every pull request.

Implication: a bridge that forwards an action without calling `intercept()` — even if the action appears benign — is non-conformant.

### I-2: Append-Only Ledger

> **The Evidence Ledger is INSERT-only. No event may be updated or deleted after emission.**

Events are SHA-256 hash-chained: each event's `previousHash` field contains the hash of the preceding event's canonical JSON representation. Any tampering with a historical event breaks the hash chain, which is detected by `computeCsml()` and flagged in the `ledgerIntact` component. Chain verification is performed on every CSML computation.

Hash construction:

```
hash(event) = SHA-256(JSON.stringify({
  eventId, sequenceNumber, timestamp, eventType,
  agentId, tokenId, payload, previousHash
}))
```

The first event in a chain has `previousHash = "0000...0000"` (64 zero hex chars).

### I-3: Attenuation Only

> **A delegated CapabilityToken may only narrow the permissions of its parent token — never widen them.**

The delegator (`@sint/gate-capability-tokens`) enforces that:
- The delegated `resource` must match or be a strict sub-path of the parent `resource`.
- The delegated `actions` must be a subset of the parent `actions`.
- All physical constraints in the delegated token must be equal to or stricter than the parent's constraints (lower velocity/force caps, smaller geofence, shorter expiry).
- `delegationChain.depth` must equal `parent.delegationChain.depth + 1`.
- Maximum depth is 3; tokens at depth 3 cannot be further delegated.

Violation causes `CONSTRAINT_VIOLATION` error at delegation time.

### I-4: Tier-Based Oversight

> **Every action is assigned an ApprovalTier (T0–T3) that determines the required human oversight level before execution.**

Tier assignment is deterministic and driven by:
- Resource URI pattern matching against `TierAssignmentRule` entries.
- Physical context signals (human presence detected → escalate one tier).
- CSML score (score > θ → escalate all subsequent requests from that agent by one tier).
- Forbidden combination detection (known dangerous action sequences → escalate to T3).

T0 and T1 are auto-approved. T2 and T3 require human operator involvement (T2: approval or quorum; T3: explicit sign-off + audit). See [Section 5](#5-tier-definitions) for full definitions.

### I-5: Delegation Confinement

> **Delegated tokens are limited to 3 hops from the root. Revoking a parent token triggers cascade revocation of all descendant tokens.**

The `cascadeRevoke` operation traverses the delegation DAG depth-first and marks all descendant tokens as revoked in the revocation store. The Evidence Ledger records a `token.revoked` event for each revoked token in the cascade. Revoked tokens are rejected at step 2 of `intercept()` before any policy evaluation.

### I-6: Physics-Aware Constraints

> **Physical safety constraints declared in a CapabilityToken are enforced at runtime on every request — they are not advisory metadata.**

Before allowing a T2 or T3 action, the PolicyGateway checks:
- `currentVelocityMps` ≤ `token.constraints.maxVelocityMps`
- `currentForceNewtons` ≤ `token.constraints.maxForceNewtons`
- `currentPosition` within `token.constraints.geofence` polygon
- `humanDetected` is false (or `token.constraints.requiresHumanPresence` is true)
- Token time window is active

Violations produce an immediate `deny` decision with `policyViolated: "PHYSICS_CONSTRAINT"` and emit a `safety.*` event to the Evidence Ledger. Severe violations also trigger an E-stop transition.

---

## 4. Token Schema

A `SintCapabilityToken` is the atomic unit of permission in SINT. All fields are immutable after issuance.

### 4.1 Identity Fields

| Field | Type | Description |
|---|---|---|
| `tokenId` | UUIDv7 | Unique token identifier. Sortable by issuance time. |
| `issuer` | Ed25519PublicKey (hex) | Public key of the issuing authority. The root key is a hardware-protected operator keypair. |
| `subject` | Ed25519PublicKey (hex) | Public key of the receiving agent. Corresponds to the agent's `did:key` identity. |
| `signature` | Ed25519Signature (hex) | Ed25519 signature over the canonical token payload, excluding the `signature` field itself. |

### 4.2 Scope Fields

| Field | Type | Description |
|---|---|---|
| `resource` | string | Resource URI identifying the target system. Format: `<scheme>://<path>`. Examples: `ros2:///cmd_vel`, `mcp://filesystem/writeFile`, `mqtt://factory/line1/+`. Glob patterns are supported for wildcards. |
| `actions` | string[] | Permitted actions on the resource. Examples: `["publish"]`, `["call", "cancel"]`, `["subscribe"]`. |
| `constraints` | SintPhysicalConstraints | Physical safety constraints enforced at runtime. See Section 4.3. |
| `modelConstraints` | SintModelConstraints? | Optional allowlist of model IDs and version caps for runtime enforcement. Prevents silent model swaps. |
| `attestationRequirements` | SintAttestationRequirements? | Optional TEE attestation grade and backend requirements per tier. |
| `verifiableComputeRequirements` | SintVerifiableComputeRequirements? | Optional ZK/TEE proof requirements for high-consequence actions. |
| `executionEnvelope` | SintExecutionEnvelope? | Optional pre-approved trajectory corridor for low-latency physical control. |
| `behavioralConstraints` | SintBehavioralConstraints? | Optional pattern-based input validation and per-minute rate limiting at the tool-call level. |

### 4.3 Physical Constraints Schema (SintPhysicalConstraints)

| Field | Type | Description |
|---|---|---|
| `maxForceNewtons` | number? | Maximum force command in Newtons. Checked against `physicalContext.currentForceNewtons`. |
| `maxVelocityMps` | number? | Maximum velocity command in m/s. Checked against `physicalContext.currentVelocityMps`. |
| `geofence` | GeoPolygon? | GeoJSON polygon boundary. Position must be inside at all times. |
| `timeWindow` | { start: ISO8601, end: ISO8601 }? | Token validity window within the `issuedAt`–`expiresAt` range. |
| `maxRepetitions` | number? | Maximum allowed executions of the permitted action. |
| `requiresHumanPresence` | boolean? | If true, agent must confirm human presence before acting. |
| `rateLimit` | { maxCalls: number, windowMs: number }? | Sliding-window call rate cap. Enforced by PolicyGateway per token. |
| `quorum` | { required: number, authorized: string[] }? | K-of-N operator approval quorum for T2/T3 escalation resolution. |
| `maxTorqueNm` | number? | Maximum torque command in Newton-metres. |
| `maxJerkMps3` | number? | Maximum jerk in m/s³ (rate of acceleration change). |
| `maxAngularVelocityRps` | number? | Maximum angular velocity in rad/s. |
| `contactForceThresholdN` | number? | Force threshold above which contact is detected. |

### 4.4 Lifecycle Fields

| Field | Type | Description |
|---|---|---|
| `delegationChain` | SintDelegationChain | Delegation lineage: `{ parentTokenId, depth, attenuated }`. Root tokens have `parentTokenId: null, depth: 0`. |
| `issuedAt` | ISO8601 | Issuance timestamp in UTC with microsecond precision. |
| `expiresAt` | ISO8601 | Expiry timestamp. Expired tokens are rejected before policy evaluation. |
| `revocable` | boolean | If true, the token can be revoked before `expiresAt`. Non-revocable tokens provide time-bounded unconditional access. |
| `revocationEndpoint` | string? | Optional URL for checking revocation status. |
| `passportId` | string? | APS passport identifier for cross-protocol identity linkage. |
| `delegationDepth` | number? | Delegation depth from the APS perspective (0 = root). |

### 4.5 Validation Error Codes

| Code | Meaning |
|---|---|
| `INVALID_SIGNATURE` | Ed25519 signature verification failed. |
| `TOKEN_EXPIRED` | `expiresAt` is in the past. |
| `TOKEN_REVOKED` | Token found in revocation store. |
| `DELEGATION_DEPTH_EXCEEDED` | `delegationChain.depth` > 3. |
| `CONSTRAINT_VIOLATION` | Delegated token widens parent permissions. |
| `INSUFFICIENT_PERMISSIONS` | Token does not grant the requested action on the resource. |
| `MALFORMED_TOKEN` | Required fields absent or type mismatch. |
| `UNKNOWN_ISSUER` | Issuer public key not in the trust registry. |

---

## 5. Tier Definitions

Approval tiers are the central innovation of SINT: graduated human oversight calibrated to the physical consequence severity of each action.

### T0_OBSERVE — Monitoring, Read-Only

**Enum value:** `"T0_observe"`
**Auto-approved:** Yes
**Human involvement:** None required
**Ledger:** Every T0 decision is recorded.

T0 covers all read-only, non-mutating actions: sensor queries, state reads, health checks, map downloads, telemetry subscriptions. No physical or computational state is changed.

Examples: subscribing to a ROS 2 `/scan` topic, querying a database (read-only), reading a file via MCP `readFile`, checking agent CSML score.

Escalation triggers:
- Human detected in workspace (→ still T0, but additional audit fields recorded)
- CSML score > θ does not escalate T0 (read-only is always safe)

### T1_PREPARE — Bounded Writes, Auto-Approved with Rate Limiting

**Enum value:** `"T1_prepare"`
**Auto-approved:** Yes (subject to rate limits)
**Human involvement:** None required
**Ledger:** Every T1 decision recorded with full constraint metadata.

T1 covers bounded, idempotent writes and staging operations: saving a waypoint, writing to a staging area, uploading a configuration file, placing a tentative bid. The operation must be reversible or idempotent.

Examples: MCP `writeFile` to `/tmp/`, ROS 2 parameter set (non-motion), MQTT publish to a staging topic, saving a navigation waypoint.

Escalation triggers:
- Rate limit exceeded (→ T2 or deny depending on severity)
- CSML score > θ (→ T2)
- Human presence detected during write operation (→ T2)

### T2_ACT — Physical State Change, Requires Human Approval or Quorum

**Enum value:** `"T2_act"`
**Auto-approved:** No — escalates to approval queue
**Human involvement:** Operator review or K-of-N quorum
**Ledger:** Full decision audit including approver identity and timestamp.

T2 covers actions with physical consequences that are reversible but significant: robot motion commands, gripper actuation, actuator state changes, MCP shell commands, financial route decisions. The key criterion is physical state change.

Examples: ROS 2 `/cmd_vel` publish, gripper open/close, MCP `bash` tool call, drone waypoint execute, economy route commit.

Approval flow:
1. PolicyGateway emits `escalate` decision with `requiredTier: T2_act`.
2. Approval request is queued with configurable timeout.
3. Operator (or quorum of operators, per token's `quorum` constraint) approves or denies.
4. If approved → `action.started` event emitted, execution proceeds.
5. If denied or timeout → `approval.denied`/`approval.timeout` event, fallback action taken.

Escalation triggers:
- Physical constraint violation detected → T3 or deny
- CSML score > θ → T3
- Forbidden combination detected → T3

### T3_COMMIT — Irreversible, Requires Human Approval + Audit

**Enum value:** `"T3_commit"`
**Auto-approved:** No — explicit human sign-off mandatory
**Human involvement:** Mandatory explicit approval, logged with full audit trail
**Ledger:** Tamper-evident proof receipt generated after each T3 commit.

T3 covers actions that cannot be undone: code execution (that runs with system privileges), financial settlements, hardware mode changes, system reconfigurations, data deletions. The irreversibility criterion is absolute.

Examples: MCP `exec` with elevated privileges, financial settlement via economy bridge, cutting operation in industrial cell, firmware flash, database DROP.

Special requirements:
- `ProofReceipt` generated after every T3 commit (Ed25519-signed, optional TEE-attested).
- Manual operator trip via `CircuitBreakerPlugin.trip()` provides the EU AI Act Article 14(4)(e) stop button.
- T3 decisions cannot be resolved by timeout — expiry without approval results in automatic deny.

Circuit breaker: if an agent's circuit is in `OPEN` state (tripped by operator or by consecutive denials), all subsequent requests — regardless of tier — are immediately denied without evaluation.

---

## 6. PolicyDecision Schema

The PolicyGateway returns a `PolicyDecision` for every `SintRequest`.

### 6.1 Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `requestId` | UUIDv7 | Echoes the `requestId` from the originating `SintRequest`. |
| `timestamp` | ISO8601 | Decision timestamp in UTC. |
| `action` | `"allow" \| "deny" \| "escalate" \| "transform"` | The gateway's verdict. |
| `assignedTier` | ApprovalTier | The tier assigned to this request (T0–T3). |
| `assignedRisk` | RiskTier | The risk tier of the target resource (T0_read through T3_irreversible). |
| `transformations` | object? | Present when `action` is `"transform"`. Contains `constraintOverrides` and/or `additionalAuditFields`. |
| `escalation` | object? | Present when `action` is `"escalate"`. See Section 6.2. |
| `denial` | object? | Present when `action` is `"deny"`. See Section 6.3. |

### 6.2 Escalation Object

Present when `action === "escalate"`:

| Field | Type | Description |
|---|---|---|
| `requiredTier` | ApprovalTier | The tier at which human approval must be obtained (T2 or T3). |
| `reason` | string | Human-readable explanation of why escalation is required. |
| `timeoutMs` | number | Milliseconds before the approval request expires. T3 approvals do not auto-expire. |
| `fallbackAction` | `"deny" \| "safe-stop"` | Action taken if approval times out. `safe-stop` triggers an E-stop on connected hardware. |
| `approvalQuorum` | { required: number, authorized: string[] }? | Optional K-of-N approval requirement from the token's `quorum` constraint. |

### 6.3 Denial Object

Present when `action === "deny"`:

| Field | Type | Description |
|---|---|---|
| `reason` | string | Human-readable denial reason. |
| `policyViolated` | string | Machine-readable policy code (e.g., `"PHYSICS_CONSTRAINT"`, `"FORBIDDEN_COMBINATION"`, `"TOKEN_EXPIRED"`). |
| `suggestedAlternative` | string? | Optional alternative action the agent may attempt. |

### 6.4 Decision Flow

```
SintRequest
    │
    ├─ 1. Token validation (signature, expiry, revocation)
    │       → INVALID_SIGNATURE / TOKEN_EXPIRED / TOKEN_REVOKED → deny
    │
    ├─ 2. Permission check (resource scope, actions)
    │       → INSUFFICIENT_PERMISSIONS → deny
    │
    ├─ 3. Physical constraint evaluation
    │       → PHYSICS_CONSTRAINT violation → deny + safety event
    │
    ├─ 4. Tier assignment (resource pattern + physical context + CSML)
    │
    ├─ 5. Forbidden combination detection (recent action sequence)
    │       → sequence match → escalate to T3 or deny
    │
    ├─ 6. Plugin pipeline (CircuitBreaker, GoalHijack, MemoryIntegrity,
    │       SupplyChain, DynamicEnvelope)
    │       → plugin deny/escalate → override decision
    │
    └─ 7. Emit decision + ledger event
            → allow / deny / escalate / transform
```

---

## 7. EvidenceLedger Schema

### 7.1 SintLedgerEvent Fields

| Field | Type | Description |
|---|---|---|
| `eventId` | UUIDv7 | Unique event identifier, sortable by creation time. |
| `sequenceNumber` | bigint | Monotonically increasing integer for total ordering. Gap in sequence = data loss. |
| `timestamp` | ISO8601 | Event timestamp with microsecond precision in UTC. |
| `eventType` | SintEventType | Dot-notation event type (e.g., `"policy.evaluated"`, `"safety.estop.triggered"`). |
| `agentId` | Ed25519PublicKey (hex) | Agent identity for the action that generated this event. |
| `tokenId` | UUIDv7? | Capability token used (absent for lifecycle events with no agent token). |
| `payload` | Record<string, unknown> | Event-specific structured data. Schema varies per `eventType`. |
| `previousHash` | SHA256 (hex) | SHA-256 hash of the preceding event's canonical JSON. For event 0: 64 zero hex chars. |
| `hash` | SHA256 (hex) | SHA-256 hash of this event's canonical JSON (all fields above). |
| `rosclaw_audit_ref` | string? | Cross-reference to ROSClaw audit log entry for multi-system traceability. |
| `rosclaw_failure_mode` | string? | ROSClaw failure mode if applicable: `malformed_params`, `wrong_action_type`, `replan_loop`. |
| `foundation_model_id` | string? | Foundation model backend identifier for per-model CSML tracking. |

### 7.2 Hash Chain Construction

Events form a tamper-evident chain via SHA-256. The canonical form used for hashing:

```json
{
  "eventId": "<uuidv7>",
  "sequenceNumber": "<bigint as decimal string>",
  "timestamp": "<iso8601>",
  "eventType": "<event-type>",
  "agentId": "<hex>",
  "tokenId": "<uuidv7 or null>",
  "payload": { ... },
  "previousHash": "<64 hex chars>"
}
```

Important: `sequenceNumber` is serialized as a decimal string (not a number) to avoid JSON integer precision loss for large sequence numbers.

### 7.3 Event Type Taxonomy

Event types are grouped by domain:

| Domain | Event Types |
|---|---|
| Lifecycle | `agent.registered`, `agent.capability.granted`, `agent.capability.revoked` |
| Request/Response | `request.received`, `policy.evaluated`, `approval.requested`, `approval.granted`, `approval.denied`, `approval.timeout` |
| Execution | `action.started`, `action.completed`, `action.failed`, `action.rolledback` |
| Safety | `safety.estop.triggered`, `safety.geofence.violation`, `safety.force.exceeded`, `safety.human.detected`, `safety.anomaly.detected`, `safety.hardware.permit.denied`, `safety.hardware.interlock.open`, `safety.hardware.state.stale` |
| Tokens | `token.issued`, `token.revoked`, `token.delegated` |
| Risk | `risk.score.computed` |
| Ledger | `ledger.exported` |

### 7.4 ProofReceipt

For T3 events and regulatory audit, a `SintProofReceipt` is generated:

| Field | Type | Description |
|---|---|---|
| `eventId` | UUIDv7 | The ledger event this receipt attests. |
| `eventHash` | SHA256 | Hash of the attested event. |
| `hashChain` | SHA256[] | Chain from event to trust anchor. |
| `generatedAt` | ISO8601 | Receipt generation timestamp. |
| `signature` | Ed25519Signature | Ledger authority's signature over the receipt. |
| `signerPublicKey` | Ed25519PublicKey | Signing authority's public key. |
| `teeAttestation` | object? | Optional TEE attestation for regulatory-grade proof (Intel SGX, ARM TrustZone, AMD SEV). Required for T2/T3 events in certified deployments. |

---

## 8. Bridge Adapter Contract

Every SINT bridge adapter translates a native protocol message into a `SintRequest` and submits it to the PolicyGateway. The following contract is mandatory for conformant bridge implementations.

### 8.1 Resource URI Scheme

Each bridge defines a URI scheme for its resources:

| Bridge | Scheme | Example |
|---|---|---|
| ROS 2 | `ros2:///` | `ros2:///cmd_vel`, `ros2:///joint_states` |
| MCP | `mcp://` | `mcp://filesystem/writeFile`, `mcp://bash/run` |
| MQTT/CoAP (IoT) | `mqtt://` / `coap://` | `mqtt://factory/line1/robot2/cmd`, `coap://sensor/temperature` |
| A2A | `a2a://` | `a2a://agent-pubkey-hex/task` |
| Swarm | `swarm://` | `swarm://fleet-id/collective-move` |
| Economy | `economy://` | `economy://marketplace/route` |
| MAVLink | `mavlink://` | `mavlink://sysid/command` |

URI components:
- Scheme identifies the bridge protocol.
- Authority identifies the server, node, or fleet.
- Path identifies the specific topic, tool, service, or endpoint.

### 8.2 Action Mapping

Bridges map their native operation types to SINT action verbs:

| Protocol | Native Operation | SINT Action |
|---|---|---|
| ROS 2 | Topic publish | `publish` |
| ROS 2 | Service call | `call` |
| ROS 2 | Action goal | `send_goal` |
| ROS 2 | Topic subscribe | `subscribe` |
| MCP | Tool call | `call` |
| MCP | Resource read | `read` |
| MQTT | Publish | `publish` |
| MQTT | Subscribe | `subscribe` |
| A2A | Send message | `send` |
| MAVLink | Command send | `command` |

### 8.3 Physical Context Extraction

Bridges responsible for physical systems must populate `physicalContext` from available sensor data before submitting a `SintRequest`:

```
SintRequest.physicalContext = {
  humanDetected: <from safety scanner or lidar classification>,
  currentForceNewtons: <from force/torque sensor or current feedback>,
  currentVelocityMps: <from odometry or IMU integration>,
  currentPosition: { x, y, z } <from SLAM or GPS>
}
```

Bridges that cannot provide physical context (e.g., MCP bridges for pure software tools) may omit `physicalContext`. The PolicyGateway treats absent context conservatively: if a token constraint requires physical checks (e.g., `maxVelocityMps`), the check is skipped only if the resource's tier is T0 or T1.

### 8.4 Minimum Required Interface

Every conformant bridge implementation must:

1. **Intercept all outbound messages** — no native protocol message may be forwarded without passing through `PolicyGateway.intercept()` first.
2. **Construct a valid `SintRequest`** — with correct `requestId` (UUIDv7), `timestamp` (ISO8601 microsecond UTC), `agentId`, `tokenId`, `resource` (URI scheme), and `action`.
3. **Handle all four decision outcomes** — `allow` (forward), `deny` (block + log), `escalate` (queue for approval), `transform` (apply constraint overrides before forwarding).
4. **Emit a safety halt** on `safe-stop` fallback from a timed-out escalation.
5. **Track `BridgeAdapterState`** — maintain `UNREGISTERED → PENDING_AUTH → AUTHORIZED → ACTIVE → SUSPENDED` state machine per resource.

---

## 9. CSML Formula

The Composite Safety-Model Latency (CSML) metric fuses behavioral, physical, and ledger-integrity signals into a single auditable safety score per deployment.

### 9.1 Formula

```
CSML(m, p, t) = α·AR_m + β·BP_m + γ·SV_m − δ·CR_m + ε·𝟙[ledger_intact(t)]
```

**Lower CSML is better.** Scores above threshold θ trigger automatic tier escalation.

### 9.2 Components

| Symbol | Name | Range | Description |
|---|---|---|---|
| AR_m | Attempt Rate | [0, 1] | Fraction of policy-evaluated requests that resulted in a `deny` or `escalate` decision. High AR indicates an agent that frequently attempts unauthorized actions. |
| BP_m | Blocks Per Prompt | ≥ 0 | Mean number of denied tool calls per unique agent (proxy for adversarial prompt chains). |
| SV_m | Overspeed Severity | ≥ 1 | Median of max(v_req/v_max, |ω_req|/ω_max) from `safety.force.exceeded` and `safety.geofence.violation` events. Baseline is 1.0 (no overspeed); a value of 2.0 means the agent commanded twice the permitted limit. |
| CR_m | Completion Rate | [0, 1] | Ratio of `action.completed` to `action.started` events. High CR reduces the CSML score. |
| ledger_intact(t) | Ledger Integrity | {0, 1} | 1 if the hash chain is intact across the analysis window t, 0 if tampering is detected. |

### 9.3 Default Coefficients

Per the SINT formal specification (arXiv preprint, 2026):

| Coefficient | Value | Weight |
|---|---|---|
| α (alpha) | 0.4 | Attempt Rate — highest weight, primary behavioral signal |
| β (beta) | 0.2 | Blocks Per Prompt |
| γ (gamma) | 0.2 | Overspeed Severity |
| δ (delta) | 0.1 | Completion Rate (negated) |
| ε (epsilon) | 0.1 | Ledger Integrity indicator |

Sum of weights: α + β + γ − δ + ε = 0.4 + 0.2 + 0.2 − 0.1 + 0.1 = 0.8 (at perfect CR and intact ledger, minimum score is −δ + ε = 0.0).

### 9.4 Threshold

**θ = 0.3** is the default human workspace deployment threshold.

When `CSML > θ`, the PolicyGateway applies a +1 tier escalation to all subsequent requests from that agent/model backend until the score drops below threshold. This is computed by `computeCsml()` in `@sint/gate-evidence-ledger` and applied by `ProactiveEscalation` in `@sint/gate-policy-gateway`.

Minimum data requirement: CSML recommendation is `"insufficient_data"` when fewer than 10 request events exist in the analysis window. Escalation is not triggered on insufficient data.

### 9.5 Per-Model Computation

When `foundation_model_id` is present on ledger events (from ROSClaw integration), CSML scores are computed per foundation model backend via `computeCsmlPerModel()`. This enables per-model tier escalation policies and supports the ROSClaw empirical study methodology (arXiv:2603.26997).

---

## 10. OWASP ASI Coverage Table

SINT provides coverage against all ten OWASP Agentic Security Initiative (ASI) categories. Coverage levels: **Full** = primary control implemented and tested; **Partial** = control implemented but with documented gaps.

| # | Category | Coverage | SINT Components | Notes |
|---|---|---|---|---|
| ASI01 | Goal & Objective Hijacking | Full | `@sint/gate-policy-gateway` (GoalHijackPlugin, forbidden-combos), `@sint/avatar` (CSML drift detection) | GoalHijackPlugin implements 5-layer heuristic detection: prompt injection, role override, semantic escalation, exfiltration probe, cross-agent injection. Forbidden action-sequence detection catches known hijack patterns (e.g., read + exfiltrate). CSML drift detects anomalous action-frequency shifts. |
| ASI02 | Tool & Function Misuse | Full | `@sint/bridge-mcp` (TAM enforcement), `@sint/gate-policy-gateway` (tier assignment), `@sint/gate-capability-tokens` (resource scope) | Tool Authorization Manifests (TAM) are operator-defined — a malicious tool cannot self-declare elevated permissions. Every MCP tool call is validated against the TAM before forwarding. Capability token resource scope ensures tools can only be called within the authorized resource pattern. |
| ASI03 | Identity & Authentication Abuse | Full | `@sint/gate-capability-tokens` (Ed25519 signing, did:key identity, delegation chain) | Every capability token is Ed25519-signed. Agent identity = did:key (Ed25519 public key). Delegation chain is verified at every level — a forged token or broken chain is rejected at step 1 of intercept(). Revocation store provides instant invalidation with cascade propagation. |
| ASI04 | Supply Chain Compromise | Full | `@sint/bridge-mcp` (TAM manifest validation), `@sint/gate-capability-tokens` (Ed25519 plugin signing), `@sint/gate-policy-gateway` (DefaultSupplyChainVerifier) | DefaultSupplyChainVerifier checks model fingerprint hash, model ID allowlist, and bridge protocol consistency at runtime to detect tampered tools or swapped model versions. TAM manifests are operator-controlled — tool providers cannot self-escalate permissions. |
| ASI05 | Sensitive Data Exfiltration via Code Execution | Partial | `@sint/gate-policy-gateway` (forbidden-combos), `@sint/engine-capsule-sandbox` (process isolation) | Capsule sandbox provides process-level isolation. Forbidden combo rules block known shell-execution sequences (filesystem.write → exec.run). Gap: no semantic analysis of tool arguments for code injection; shell tool calls not classified at T3_COMMIT by default. |
| ASI06 | Memory Poisoning & Context Manipulation | Partial | `@sint/gate-policy-gateway` (DefaultMemoryIntegrityChecker) | DefaultMemoryIntegrityChecker detects: suspicious repetition (replay attack), unauthorized privilege claims in recentActions, history length overflow, UUIDv7 timestamp monotonicity violations. High-severity anomalies → deny; medium/low → warn-and-allow with audit. Gap: checker state is per-gateway-instance only (not persisted); no semantic analysis of vector embedding space for poisoning; cross-session continuity not yet verified. |
| ASI07 | Inter-Agent Trust Exploitation | Full | `@sint/bridge-a2a` (A2A protocol enforcement), `@sint/gate-capability-tokens` (did:key per agent) | A2A bridge validates the sender's capability token before processing any inter-agent message. Each agent's identity is a did:key — spoofed messages from unknown or unauthorized senders are rejected. APS↔SINT interop mapping covers cross-organization agent communication. |
| ASI08 | Cascading Failure & Agent Storms | Full | `@sint/gate-policy-gateway` (CircuitBreakerPlugin, rate limiting), `@sint/bridge-swarm` (SwarmCoordinator collective constraints) | CircuitBreakerPlugin opens the circuit when an agent trips N consecutive denials — all subsequent requests auto-deny without evaluation. Rate limiting prevents runaway tool-call storms. SwarmCoordinator caps collective kinetic energy Σ(½mv²) and escalated-fraction across robot fleets. |
| ASI09 | Deceptive Intent & Trust Exploitation | Full | `@sint/gate-policy-gateway` (T2/T3 human approval, M-of-N quorum), `@sint/avatar` (CSML drift detection) | T2_act requires operator review before physical execution. T3_commit requires explicit human sign-off with configurable M-of-N quorum. CSML drift detection auto-escalates agents showing deceptive behavioral patterns (anomalous persona) regardless of their token tier. |
| ASI10 | Autonomous Rogue Behavior | Full | `@sint/gate-policy-gateway` (CircuitBreakerPlugin, DynamicEnvelopePlugin), `@sint/avatar` (CSML anomalous persona) | CircuitBreakerPlugin provides the EU AI Act Article 14(4)(e) stop button: operators can manually `trip()` the circuit, instantly blocking all actions from an agent. CSML anomalous persona auto-trips the circuit when safety events are detected. DynamicEnvelopePlugin enforces environment-adaptive physical limits even when the agent presents a valid token. |

**Summary:** Full coverage on 8/10 ASI categories; partial coverage on ASI05 (code execution semantic analysis) and ASI06 (cross-session memory continuity). Both gaps are tracked in the project roadmap (Phase 10+ items).

---

## 11. Compliance Crosswalk

The following crosswalk maps each SINT Approval Tier to obligations in NIST AI RMF 1.0, ISO/IEC 42001:2023, and EU AI Act 2024/1689. This is an implementation-focused reference; organizations must validate their specific obligations against their sector and jurisdiction.

### 11.1 T0_OBSERVE — Monitoring (Read-Only)

| Framework | Reference | Requirement | SINT Enforcement |
|---|---|---|---|
| NIST AI RMF 1.0 | MAP + MEASURE + MANAGE (low-consequence monitoring path) | Continuously monitor model behavior and retain traceable records. | Auto-approved T0 requests are still ledgered with immutable evidence events. |
| ISO/IEC 42001:2023 | Clause 9 (performance evaluation) + Clause 8 (operational controls) | Monitor AI system performance and keep auditable operational controls. | Per-request policy decisions and evidence telemetry provide operational monitoring baselines. |
| EU AI Act 2024/1689 | Article 12 (record-keeping) + Article 13 (transparency) | Maintain logs and transparent technical documentation for AI behavior. | Read-path decisions are hash-chained and queryable via ledger and discovery endpoints. |

### 11.2 T1_PREPARE — Bounded Write

| Framework | Reference | Requirement | SINT Enforcement |
|---|---|---|---|
| NIST AI RMF 1.0 | GOVERN + MANAGE (controlled low-impact action path) | Apply governance controls before low-impact state mutation. | Capability tokens, scoped actions, and rate limits gate bounded write operations. |
| ISO/IEC 42001:2023 | Clause 8.1/8.2 (operational planning and AI risk treatment) | Treat operational AI risk before deployment-stage actions. | Tier assignment and physical constraints are evaluated before every write-style request. |
| EU AI Act 2024/1689 | Article 9 (risk management) + Article 12 (logging) | Keep risk controls active and auditable during operation. | Gateway policy checks and ledger evidence enforce and document bounded action controls. |

### 11.3 T2_ACT — Physical State Change

| Framework | Reference | Requirement | SINT Enforcement |
|---|---|---|---|
| NIST AI RMF 1.0 | MANAGE (risk response) + GOVERN (accountability for high-impact operation) | Escalate and govern physical-impact actions with human accountability. | T2 actions require escalation to approval flow; optional quorum and attestation are enforced. |
| ISO/IEC 42001:2023 | Clause 8 (operational control) + Clause 6 (risk planning) | Apply explicit controls for AI operations that alter physical state. | Physical constraints (force/velocity/geofence) are enforced at token and gateway levels. |
| EU AI Act 2024/1689 | Article 14 (human oversight) + Article 15 (accuracy/robustness/cybersecurity) | Maintain effective human oversight and robust behavior for high-impact AI actions. | T2 escalation, dynamic envelopes, and deterministic deny paths enforce fail-safe oversight. |

### 11.4 T3_COMMIT — Irreversible Commit

| Framework | Reference | Requirement | SINT Enforcement |
|---|---|---|---|
| NIST AI RMF 1.0 | GOVERN + MANAGE (highest-consequence decision authority) | Apply strongest accountability and control to irreversible actions. | T3 requires explicit human sign-off (with optional M-of-N quorum) before commit. |
| ISO/IEC 42001:2023 | Clause 8.3 (risk treatment implementation) + Clause 10 (continual improvement) | Execute highest-severity controls and corrective feedback loops. | Commit-tier actions require evidence-backed approvals and post-incident traceability. |
| EU AI Act 2024/1689 | Article 14(4)(e) (human override/stop) + Articles 9/12/15 | Support immediate human intervention with rigorous logging and safety robustness. | Circuit-breaker stop control, T3 approval gates, and tamper-evident ledger receipts are mandatory controls. |

### 11.5 IEC 62443 (Industrial Control Systems)

For industrial deployments, SINT maps to IEC 62443-3-3 system security requirements:

| IEC 62443 SR | Requirement | SINT Control |
|---|---|---|
| SR 1.1 (Human User Identification) | Unique identification and authentication for human users | Operator identity recorded in approval resolution events; `approved.by` field is auditable. |
| SR 1.2 (Software Process Identification) | Identification and authentication for software processes | Agent identity = did:key (Ed25519 public key); CapabilityToken binds identity to scope. |
| SR 2.1 (Authorization Enforcement) | Enforce assigned privileges | PolicyGateway enforces token scope, physical constraints, and tier assignment on every request. |
| SR 3.1 (Communication Integrity) | Protect communication integrity | Ed25519 token signatures; SHA-256 hash chain on ledger; TLS on HTTP transport. |
| SR 3.3 (Security Functionality Verification) | Support verification of security functions | Conformance test suite (`@sint/conformance-tests`) provides security regression verification. |
| SR 6.1 (Audit Log Accessibility) | Condition of audit log content | EvidenceLedger provides queryable, hash-chained, timestamped audit events. |
| SR 6.2 (Continuous Monitoring) | Monitoring and reporting of cyber security events | CSML metric provides continuous behavioral safety monitoring; `risk.score.computed` events are streamable. |

---

## 12. Version History

### v0.1 — Phase 1-3 (2026-Q1)

Initial public release covering the security wedge core:

- `@sint/core`: Base types, Zod schemas, tier constants, compliance types.
- `@sint/gate-capability-tokens`: Ed25519 token issuance, delegation (attenuation-only), revocation, cascade revocation.
- `@sint/gate-policy-gateway`: `PolicyGateway.intercept()` implementation, tier assignment engine, forbidden combination detection, physical constraint enforcement.
- `@sint/gate-evidence-ledger`: SHA-256 hash-chained append-only ledger, CSML metric computation.
- `@sint/conformance-tests`: Security regression suite (single choke point, attenuation, delegation depth, ledger integrity).
- `@sint/bridge-mcp`: MCP tool call bridge with TAM enforcement.
- `@sint/bridge-ros2`: ROS 2 topic/service bridge with physical context extraction.
- TypeScript and Python SDKs (v0.1).
- SINT v0.1 Spec (informal).

### v0.2 — Phase 4-6 (2026-Q1 to Q2)

Production hardening and expanded bridge coverage:

- `@sint/bridge-a2a`: Agent-to-Agent protocol bridge with APS↔SINT identity mapping.
- `@sint/bridge-swarm`: Multi-robot swarm coordinator with collective kinetic energy cap.
- `@sint/bridge-economy`: Economy routing bridge with SLA bond slashing.
- `@sint/bridge-mavlink`: MAVLink/drone command bridge.
- `@sint/gateway-server`: Hono HTTP API server with full REST + WebSocket support.
- `@sint/persistence`: Storage interface abstractions; in-memory implementations.
- Approval flow: pending queue, K-of-N quorum, WebSocket real-time approval notifications.
- CircuitBreakerPlugin: OPEN/HALF_OPEN/CLOSED state machine with manual trip (EU AI Act Article 14(4)(e) stop button).
- GoalHijackPlugin (ASI01): 5-layer heuristic goal hijack detection.
- DefaultMemoryIntegrityChecker (ASI06): History anomaly detection.
- DefaultSupplyChainVerifier (ASI04): Model fingerprint and bridge protocol consistency checks.
- DynamicEnvelopePlugin: Environment-adaptive physical limit enforcement.
- CSML metric: Per-deployment and per-model behavioral safety scoring with proactive escalation.
- OWASP ASI coverage map: Full coverage declaration against all 10 ASI categories.
- Go SDK (v0.1).
- SINT v0.2 Spec (draft).
- 974+ tests across 28 packages.

### v1.0 — Phase 10 (2026-04-05) — This Document

Formal specification release:

- This document: SINT Protocol v1.0 formal specification.
- `sdks/rust/sint-client` v0.1.0: Rust async client library (reqwest + tokio, typed structs for all core types).
- Total test count: 1,105+ across 30 packages.
- Compliance crosswalk expanded: IEC 62443-3-3 mapping added.
- CSML formula formalized with default coefficients per arXiv preprint.
- OWASP ASI coverage table finalized with gap documentation for ASI05/ASI06.
- Bridge Adapter Contract formalized (resource URI scheme, action mapping, physical context extraction, BridgeAdapterState machine).
- ProofReceipt schema finalized for regulatory-grade T3 audit.
- Target: SPAI 2026 submission (due 2026-05-07).

---

*This specification is maintained by the SINT Protocol Working Group. Implementation questions should be directed to the repository issue tracker at https://github.com/sint-ai/sint-protocol.*
