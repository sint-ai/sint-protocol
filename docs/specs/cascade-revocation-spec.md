# SINT Protocol — Cascade Revocation Specification

**Version:** 0.1
**Status:** Draft
**Authors:** SINT Protocol Working Group
**Date:** 2026-04-04

---

## 1. Overview

Capability tokens in SINT form directed acyclic graphs (DAGs) via the `delegationChain.parentTokenId` field. When a token higher in the chain is revoked — for example, because a compromised operator key is rotated — all tokens derived from it must also be treated as revoked, even if those child tokens have not been explicitly listed.

**Cascade revocation** is the mechanism by which a single revocation event propagates automatically through the delegation graph, ensuring that no orphaned child token can be used after its ancestor is invalidated.

This spec defines:

- The extended `RevocationRecord` data structure
- The depth-first cascade algorithm
- The tombstone approach for preserving audit trails
- Cross-protocol interoperability with the Agent Passport System (APS)
- The `cascadeImmune` extension for safety-critical agents

---

## 2. Motivation

The base `RevocationStore` in `@sint/gate-capability-tokens` only tracks explicit single-token revocations. Without cascade semantics:

1. A root token can be revoked but delegated child tokens remain valid.
2. An attacker with a stolen child token can continue acting after the root is cut.
3. Incident response requires manually enumerating all children — error-prone at scale.

Cascade revocation closes this gap by making token graphs first-class objects in the revocation system.

---

## 3. Data Structures

### 3.1 Extended RevocationRecord

```typescript
/**
 * Extended revocation record supporting cascade chain semantics.
 */
interface RevocationRecord {
  /** The token being revoked. */
  readonly tokenId: string;           // UUIDv7

  /** When revocation was recorded (ISO 8601 UTC, microsecond precision). */
  readonly revokedAt: string;

  /** Human-readable revocation reason for audit purposes. */
  readonly reason: string;

  /** Identity of the revoking authority (Ed25519 public key or operator ID). */
  readonly revokedBy: string;

  /**
   * Parent token in the delegation chain. When set, this record was created
   * as part of a cascade from the parent's revocation.
   * Mirrors SintCapabilityToken.delegationChain.parentTokenId.
   */
  readonly parentTokenId?: string | null;

  /**
   * If true, cascade revocation will propagate to all children of this token.
   * If false, revocation is isolated to this token only.
   * Default: true (cascade by default — safer).
   */
  readonly cascadeToChildren: boolean;

  /**
   * If true, this token is immune to cascade propagation from parent revocations.
   * Set for safety-critical agents (e.g., emergency-stop controllers, watchdogs)
   * that must remain operational even when their issuing chain is compromised.
   * A cascadeImmune token can only be revoked by an explicit direct revocation.
   *
   * WARNING: Use sparingly. Immune tokens create revocation blind spots.
   * Requires additional justification in the audit trail (immunityClaim field).
   */
  readonly cascadeImmune?: boolean;

  /**
   * Required when cascadeImmune is true. Explains why this token should
   * survive parent revocation (e.g., "emergency-stop watchdog agent").
   */
  readonly immunityClaim?: string;

  /**
   * Tombstone flag. When true, this record is a preserved audit entry for a
   * token that was cascade-revoked but not explicitly revoked by an operator.
   * Tombstone records MUST NOT be deleted; they serve as the audit trail.
   */
  readonly tombstone?: boolean;

  /**
   * For tombstone records: the tokenId of the ancestor whose revocation
   * triggered this cascade entry.
   */
  readonly cascadeSourceTokenId?: string;

  /**
   * Depth at which this cascade record was created.
   * 0 = directly revoked token; 1 = immediate child; etc.
   */
  readonly cascadeDepth?: number;
}
```

### 3.2 Cascade Revocation Request

```typescript
interface CascadeRevocationRequest {
  /** Root token to revoke. */
  readonly tokenId: string;
  readonly reason: string;
  readonly revokedBy: string;

  /**
   * If false, only revoke the named token (no cascade).
   * Default: true.
   */
  readonly cascade?: boolean;

  /**
   * Maximum cascade depth. Tokens deeper than this are NOT revoked.
   * Default: unlimited (full graph traversal).
   * Set to 1 to revoke only direct children.
   */
  readonly maxCascadeDepth?: number;
}
```

### 3.3 Cascade Revocation Result

```typescript
interface CascadeRevocationResult {
  /** How many tokens were revoked (including the root). */
  readonly revokedCount: number;
  /** IDs of all revoked tokens in DFS traversal order. */
  readonly revokedTokenIds: readonly string[];
  /** IDs of tokens skipped due to cascadeImmune=true. */
  readonly immuneTokenIds: readonly string[];
  /** Tombstone records created for this cascade event. */
  readonly tombstones: readonly RevocationRecord[];
}
```

---

## 4. Cascade Algorithm

The cascade algorithm performs a depth-first traversal of the token delegation graph starting from the revoked root.

### 4.1 Pseudocode

```
function cascadeRevoke(request: CascadeRevocationRequest) -> CascadeRevocationResult:

  revokedIds     = []
  immuneIds      = []
  tombstones     = []
  visited        = Set<tokenId>()   // cycle guard

  function dfs(tokenId, cascadeDepth):
    if tokenId in visited:
      return                              // cycle — skip

    visited.add(tokenId)
    record = revocationStore.get(tokenId) // existing record if already revoked

    // Check cascade immunity before revoking
    if record?.cascadeImmune == true AND cascadeDepth > 0:
      immuneIds.append(tokenId)
      return                              // do NOT propagate into immune subtree

    // Check depth limit
    if request.maxCascadeDepth != null AND cascadeDepth > request.maxCascadeDepth:
      return

    // Create revocation record (or tombstone for cascade-triggered revocations)
    newRecord = RevocationRecord {
      tokenId:              tokenId,
      revokedAt:            now(),
      reason:               cascadeDepth == 0 ? request.reason
                                              : "cascade from " + request.tokenId,
      revokedBy:            request.revokedBy,
      parentTokenId:        tokenGraph.getParent(tokenId),
      cascadeToChildren:    true,
      tombstone:            cascadeDepth > 0,
      cascadeSourceTokenId: cascadeDepth > 0 ? request.tokenId : null,
      cascadeDepth:         cascadeDepth,
    }
    revocationStore.put(tokenId, newRecord)

    if cascadeDepth > 0:
      tombstones.append(newRecord)

    revokedIds.append(tokenId)

    // Propagate to children (DFS)
    children = tokenGraph.getChildren(tokenId)
    for child in children:
      dfs(child, cascadeDepth + 1)

  dfs(request.tokenId, 0)

  return CascadeRevocationResult {
    revokedCount:    len(revokedIds),
    revokedTokenIds: revokedIds,
    immuneTokenIds:  immuneIds,
    tombstones:      tombstones,
  }
```

### 4.2 Complexity

| Metric | Bound |
|---|---|
| Time | O(V + E) — standard DFS over the token graph |
| Space | O(V) — visited set + recursion stack |
| Revocation propagation latency | < 1 second (inherited from base RevocationStore SLA) |

### 4.3 Cycle Detection

The token delegation graph is, by construction, a DAG (a token cannot delegate to its own ancestor). The `visited` set guards against any implementation defect that would create a cycle, preventing infinite loops during revocation traversal.

---

## 5. Tombstone Approach

Revocation records MUST NOT be deleted. The evidence ledger is append-only by design (see SINT Architecture Rule 4). For cascade-triggered revocations, tombstone records serve as the audit trail proving:

1. Which ancestor revocation triggered the cascade.
2. The exact time the cascade reached each child.
3. The cascade depth at which each child was revoked.

### 5.1 Tombstone Retention

- Tombstone records are permanent entries in the `RevocationStore` / evidence ledger.
- They are identified by `tombstone: true` and `cascadeSourceTokenId`.
- They satisfy the `< 1 second revocation propagation` SLA — a tombstoned token fails `checkRevocation` just like an explicitly revoked token.
- Operators may query tombstones to reconstruct the full cascade event for incident analysis.

### 5.2 Tombstone Query Interface

```typescript
interface RevocationStore {
  // ... existing methods ...

  /** Return all tombstone records created by a cascade from the given source token. */
  getCascadeTombstones(cascadeSourceTokenId: string): RevocationRecord[];

  /** Return the full cascade event summary for a given root revocation. */
  getCascadeEvent(rootTokenId: string): CascadeRevocationResult | undefined;
}
```

---

## 6. Integration with SintCapabilityToken

The `SintCapabilityToken` type carries the fields needed to populate and traverse the delegation graph:

| Token field | Role in cascade |
|---|---|
| `delegationChain.parentTokenId` | Edge in the delegation DAG (parent → child direction) |
| `delegationChain.depth` | SINT-internal depth; cross-check against `cascadeDepth` |
| `delegationDepth` | APS-facing depth counter; mirrors `delegationChain.depth` for APS-issued tokens |
| `tokenId` | Node identifier in the graph |

The `RevocationRecord.cascadeImmune` flag is stored in the revocation record rather than the token itself so it can be set post-issuance by authorised operators without requiring token re-issuance.

---

## 7. Cross-Protocol Interoperability — Agent Passport System

### 7.1 Background

The [Agent Passport System](https://github.com/aeoess/agent-passport-system) (APS) is an independent protocol that manages Ed25519-based agent passports with their own delegation and revocation semantics. SINT capability tokens may be issued against APS passports via the `passportId` field.

### 7.2 APS ↔ SINT Cascade Mapping

When a SINT token carries a `passportId`, cascade revocation must consider two graphs:

1. **SINT delegation graph** — traversed by the algorithm in §4.
2. **APS delegation graph** — maintained by the APS registry.

SINT implementations that bridge APS SHOULD:

1. Subscribe to APS revocation events for known `passportId` values.
2. On receipt of an APS passport revocation, trigger a SINT cascade revocation for all tokens whose `passportId` matches the revoked APS passport.
3. Record the APS event reference in `RevocationRecord.reason` for audit trail completeness.

### 7.3 APS Revocation Event Shape (Reference)

```json
{
  "event": "passport.revoked",
  "passportId": "aps-passport-abc123",
  "revokedAt": "2026-04-04T10:00:00.000000Z",
  "revokedBy": "aps-registry-authority",
  "reason": "key compromise"
}
```

On receipt, the SINT gateway should execute:

```typescript
cascadeRevoke({
  tokenId:   findRootTokenForPassport(event.passportId),
  reason:    `APS passport revoked: ${event.reason} (passportId=${event.passportId})`,
  revokedBy: event.revokedBy,
  cascade:   true,
});
```

---

## 8. The `cascadeImmune` Extension

### 8.1 Rationale

Some agents — emergency-stop (e-stop) watchdogs, safety monitoring services, hardware interlock controllers — must remain operational even during a security incident that invalidates their issuing chain. Silencing an e-stop controller because the operator's signing key was compromised could be catastrophic.

`cascadeImmune: true` on a `RevocationRecord` (set at the time of token registration) marks a token as exempt from cascade propagation. The token can only be invalidated by a direct, explicit revocation specifying the token's own `tokenId`.

### 8.2 Governance Requirements

Implementations MUST enforce:

1. `cascadeImmune: true` requires a non-empty `immunityClaim`.
2. Granting cascade immunity requires an explicit operator action, not a default.
3. Immune tokens are flagged in audit reports.
4. Immunity can be revoked by an authorised operator, after which the token becomes revocable normally.

### 8.3 Example

```typescript
// Register an e-stop watchdog as cascade-immune
revocationStore.registerImmunity({
  tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
  cascadeImmune: true,
  immunityClaim: "Emergency-stop watchdog for welding cell #3. Must remain active during key rotation incidents.",
  grantedBy: "safety-officer-pubkey",
  grantedAt: "2026-04-04T09:00:00.000000Z",
});
```

---

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| Cascade used as DoS | `maxCascadeDepth` parameter limits blast radius. Default unlimited is safe for expected tree sizes (< 1,000 tokens per root). |
| Race between cascade and token use | RevocationStore check is synchronous and in-memory — cascade completes atomically before any in-flight request can re-check. |
| Immune token abuse | Immunity requires `immunityClaim`; operators are audited; immunity can itself be revoked. |
| APS event spoofing | APS events must arrive via authenticated channel (mTLS or signed webhook). SINT implementations should verify APS event signatures before triggering cascade. |
| Tombstone storage growth | Tombstones are lightweight records. At 1,000 cascade events/day with average 10 children each, storage is < 10 MB/day. |

---

## 10. References

- SINT Protocol Architecture: `/ARCHITECTURE.md`
- SINT Capability Token types: `packages/core/src/types/capability-token.ts`
- SINT RevocationStore: `packages/capability-tokens/src/revocation.ts`
- Agent Passport System: https://github.com/aeoess/agent-passport-system
- Token Interoperability: `docs/specs/token-interop.md`
