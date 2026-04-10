# APS-SINT-MCP Cross-Protocol Handshake Specification

**Version:** v1.0.0-draft  
**Date:** 2026-04-10  
**Status:** Draft — open for external review  
**Tracked in:** sint-ai/sint-protocol issue #109

---

## 1. Purpose

This document defines the canonical three-layer handshake that governs how an agent identity established in **APS** (Agent Passport System) flows through **SINT** capability token enforcement and terminates in an **MCP** (Model Context Protocol) tool call with a verifiable evidence receipt.

The three systems address distinct questions:

| Layer | System | Question answered |
|-------|--------|------------------|
| 1 | APS | "What is this agent authorized to hold?" — delegation scope, monotonic narrowing, cascade revocation |
| 2 | SINT | "Does this specific invocation comply?" — capability token enforcement at skill boundary |
| 3 | MCP | "Where does the tool call actually run?" — transport layer, session binding, tool routing |

No layer may substitute for another. A valid APS passport does not authorize an MCP call unless SINT has issued and validated a capability token for that specific invocation.

---

## 2. Handshake Flow

```
Delegating Agent (APS holder)           SINT Gateway              MCP Server
        │                                    │                         │
  (1)   │── APS delegation assertion ───────►│                         │
        │   {subject, delegation_root,       │                         │
        │    scope_hash, chain_sig}          │                         │
        │                                    │                         │
  (2)   │◄── SINT capability token ─────────│                         │
        │    {tokenId, capability_token,     │                         │
        │     action_ref, resource,          │                         │
        │     expiresAt}                     │                         │
        │                                    │                         │
  (3)   │── SintRequest ────────────────────►│                         │
        │   {tokenId, agentId, resource,     │                         │
        │    action, params,                 │                         │
        │    executionContext}               │                         │
        │                                    │                         │
        │                       PolicyGateway.intercept()              │
        │                       ├─ validate token                      │
        │                       ├─ check delegation_root               │
        │                       ├─ check revocation                    │
        │                       ├─ assign tier                         │
        │                       └─ emit ledger event                   │
        │                                    │                         │
  (4)   │                    MCPInterceptor ─┼── MCP tool call ───────►│
        │                    (MUST be in     │   {callId, serverName,  │
        │                     call path)     │    toolName, arguments} │
        │                                    │                         │
        │                                    │◄── tool result ─────────│
        │                                    │                         │
  (5)   │◄── evidence receipt ──────────────│                         │
        │    {receipt_uri, action_ref,       │                         │
        │     ledger_hash, decision}         │                         │
        │                                    │                         │
```

### Step descriptions

| Step | Description |
|------|-------------|
| (1) APS delegation assertion | The delegating agent presents its APS passport. The passport encodes a delegation chain rooted at `delegation_root` (the APS chain root hash). All scope attenuation applied by intermediate delegates is encoded in `scope_hash`. |
| (2) SINT token derivation | SINT issues a `SintCapabilityToken` scoped to the resource and actions permitted by the APS assertion. The token embeds `action_ref` — a cross-system correlation ID that links this token to the originating APS event. |
| (3) SintRequest submission | The invoking agent submits a `SintRequest` with the token ID. `PolicyGateway.intercept()` validates token signature, expiry, revocation status, resource match, constraints, and assigns an approval tier. |
| (4) MCP tool call | If the decision is `allow` (or `escalate` with approval obtained), `MCPInterceptor` routes the call to the MCP server. The interceptor MUST be in the call path — see section 6. |
| (5) Evidence receipt | On completion, the evidence ledger emits a hash-chained event. `receipt_uri` points to the verifiable receipt record. |

---

## 3. Canonical Schema Fields

The following fields form the shared vocabulary of the APS-SINT handshake. They appear in fixture records, audit ledger events, and evidence receipts.

```typescript
interface APSSINTHandshakeRecord {
  /** DID of the invoking agent, derived from its Ed25519 public key.
   *  Format: did:key:z<base58-encoded-public-key>
   *  Maps to: SintRequest.agentId (raw public key) via keyToDid() */
  subject: string;              // "did:key:z6Mk..."

  /** SHA-256 hash of the APS delegation chain root credential.
   *  Used to verify that the invoking agent's authority traces back
   *  to a known root without re-transmitting the full chain. */
  delegation_root: string;      // hex-encoded 64-char SHA-256

  /** SINT capability token in compact form.
   *  Compact form: "<tokenId>.<base64url(payload)>.<base64url(signature)>"
   *  The full token is stored in SINT's token store; only the compact
   *  form travels in the handshake header. */
  capability_token: string;     // "<uuid>.<b64payload>.<b64sig>"

  /** Cross-system correlation ID.
   *  UUIDv7 generated at SINT token issuance time.
   *  Present in: SintRequest, MCPToolCall.callId prefix, ledger events.
   *  Enables end-to-end tracing from APS assertion to MCP receipt. */
  action_ref: string;           // UUIDv7

  /** URI of the verifiable evidence receipt.
   *  Format: "sint://ledger/<ledger-hash>"
   *  The ledger hash is the SHA-256 of the hash-chained ledger entry. */
  receipt_uri: string;          // "sint://ledger/<hex>"
}
```

---

## 4. Conformance Scenarios

### 4.1 Scenario A — Authorized Call (Happy Path)

**Preconditions:**
- APS delegation chain is valid and not revoked
- SINT token is issued for `mcp://filesystem/readFile`, actions `["call"]`
- Token is within expiry; delegation depth = 1 (within max of 3)
- MCPInterceptor is in the call path

**Flow:**
1. Agent presents APS assertion with `delegation_root` = hash of root credential
2. SINT issues token scoped to `mcp://filesystem/readFile`
3. Agent submits `SintRequest` with matching `resource` and `action`
4. `PolicyGateway.intercept()` assigns `T1_PREPARE`, decision = `allow`
5. `MCPInterceptor` forwards to MCP filesystem server
6. Ledger emits `policy.evaluated` event; `receipt_uri` returned to caller

**Expected gateway decision:**
```json
{ "action": "allow", "assignedTier": "T1_PREPARE" }
```

---

### 4.2 Scenario B — Scope-Exceeded Denial

**Preconditions:**
- SINT token is issued for `mcp://filesystem/*`
- Agent attempts to call `mcp://exec/run`

**Flow:**
1. Agent submits `SintRequest` with `resource = "mcp://exec/run"`
2. `PolicyGateway.intercept()` matches token resource pattern `mcp://filesystem/*` against `mcp://exec/run` — patterns do not match
3. Decision = `deny`, `policyViolated = "RESOURCE_MISMATCH"`
4. MCPInterceptor is NOT reached; call is stopped at the SINT boundary
5. Denial is recorded in evidence ledger

**Expected gateway decision:**
```json
{ "action": "deny", "denial": { "policyViolated": "RESOURCE_MISMATCH" } }
```

---

### 4.3 Scenario C — Cascade Revocation Mid-Session

**Preconditions:**
- Root token R0 is issued to a delegating agent
- R0 is delegated to a child token C1 for the invoking agent
- Mid-session: the operator revokes R0 via `revocationStore.revoke(R0.tokenId, reason, revokedBy)`
- C1 has NOT yet been independently revoked (cascade must be explicit)

**Flow:**
1. Agent holds C1 (child of R0)
2. R0 is revoked
3. Agent submits new `SintRequest` with C1's `tokenId`
4. `PolicyGateway.intercept()` checks C1's revocation status — C1 itself is not yet in the revocation store
5. **Gap**: unless C1 is also revoked separately, the gateway will allow C1-scoped calls to proceed
6. **Mitigation**: operators MUST revoke the full delegation chain on compromise. SINT's `RevocationStore` tracks individual tokens; cascade revocation requires explicit revocation of each child token in the chain.
7. After C1 is also revoked: decision = `deny`, `policyViolated = "TOKEN_REVOKED"`

**Expected gateway decision (C1 revoked):**
```json
{ "action": "deny", "denial": { "policyViolated": "TOKEN_REVOKED" } }
```

**Implementation note:** SINT does not automatically walk the delegation chain to check parent revocation. Operators using APS delegation MUST implement a revocation propagation mechanism (e.g., an APS revocation webhook that calls `revocationStore.revoke()` for all child tokens when a parent is revoked).

---

## 5. Delegation Semantics

### 5.1 Monotonic Narrowing

SINT enforces attenuation-only delegation. A child token can only reduce the scope of its parent:
- Resource pattern can be narrowed (e.g., `mcp://filesystem/*` → `mcp://filesystem/readFile`)
- Actions can be reduced (e.g., `["call", "subscribe"]` → `["call"]`)
- Constraints can be tightened (e.g., lower rate limit, shorter expiry)
- No field may be broadened

Attempts to issue a child token with a broader scope fail at `delegateCapabilityToken()`.

### 5.2 Maximum Delegation Depth

SINT enforces a maximum delegation depth of **3**. A token at depth 3 cannot be further delegated. Any attempt to delegate beyond depth 3 returns `{ ok: false, error: "DELEGATION_DEPTH_EXCEEDED" }`.

### 5.3 Cascade Revocation Responsibility

When an APS root credential is revoked:
1. The APS system SHOULD enumerate all child tokens issued under that root
2. For each child token, call `revocationStore.revoke(childTokenId, reason, revokedBy)`
3. SINT will then deny all requests bearing those child tokens

SINT does not automatically infer revocation from parent tokens. This is a deliberate design: it keeps `PolicyGateway.intercept()` O(1) per request without requiring chain traversal.

---

## 6. The Enforcement Gap: A2A Bypass via Direct MCP

### 6.1 The Gap

An A2A agent that holds an MCP session can call MCP tools directly — bypassing the SINT gateway — if `MCPInterceptor` is not in the call path.

```
A2A Agent
   │
   ├──► MCPInterceptor ──► PolicyGateway ──► MCP Server  ← CORRECT
   │
   └──► MCP Server (direct)                              ← BYPASS (NO AUTH)
```

In the bypass path:
- No capability token is validated
- No tier is assigned
- No evidence ledger event is emitted
- The APS delegation assertion is never checked against the SINT token

This was identified in A2A discussion #1716.

### 6.2 Mitigation

**`MCPInterceptor` MUST be in the call path for every MCP tool call made by a SINT-governed agent.**

Implementation requirements:
1. The MCP client library used by the A2A agent MUST be configured to route all tool calls through `MCPInterceptor.interceptToolCall(sessionId, toolCall)`
2. The MCP server MUST NOT accept unauthenticated sessions. Each session MUST be bound to a `(agentId, tokenId)` pair via `MCPInterceptor.createSession()`
3. Network-level enforcement: the MCP server endpoint SHOULD only be reachable via the SINT gateway host (firewall/service mesh rule)
4. Audit: any MCP tool call that does not appear in the SINT evidence ledger within a configurable window SHOULD trigger an alert

### 6.3 Session Binding

`MCPInterceptor.createSession({ agentId, tokenId, serverName })` returns a `sessionId`. Every subsequent `interceptToolCall(sessionId, toolCall)` validates:
- The session exists and has not expired
- `toolCall.serverName` matches the session's `serverName`
- The capability token bound to the session covers the requested tool

A tool call on a session whose `serverName` does not match is denied with a server-mismatch error, preventing cross-server token reuse (ASI01 mitigation).

---

## 7. Error Codes Reference

| Code | Layer | Meaning |
|------|-------|---------|
| `RESOURCE_MISMATCH` | SINT | Token resource pattern does not match request resource |
| `TOKEN_EXPIRED` | SINT | Token `expiresAt` is in the past |
| `TOKEN_REVOKED` | SINT | Token is in the revocation store |
| `DELEGATION_DEPTH_EXCEEDED` | SINT | Delegation would exceed depth 3 |
| `RATE_LIMIT_EXCEEDED` | SINT | Request count exceeds token rate limit constraint |
| `CONSTRAINT_VIOLATION` | SINT | A token constraint was violated (e.g., model fingerprint mismatch) |
| `APS_CHAIN_INVALID` | APS→SINT | The APS delegation chain signature is invalid or tampered |
| `APS_ROOT_REVOKED` | APS→SINT | The APS root credential has been revoked |

---

## 8. Version History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| v1.0.0-draft | 2026-04-10 | sint-ai/sint-protocol | Initial draft addressing issue #109 and A2A discussion #1716 |
