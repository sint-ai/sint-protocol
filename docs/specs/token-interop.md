# SINT ↔ Agent Passport System Token Interoperability

**Version:** 0.1
**Status:** Draft
**Authors:** SINT Protocol Working Group
**Date:** 2026-04-04

---

## 1. Overview

This document describes how a SINT capability token can embed an attestation reference from the [Agent Passport System](https://github.com/aeoess/agent-passport-system) (APS), and how the two protocols cooperate for cross-protocol identity verification, delegation chain tracking, and cascade revocation.

**SINT** is a security enforcement layer for physical AI — it gates every tool call, robot command, or actuator request behind cryptographically signed capability tokens.

**Agent Passport System (APS)** is an independent Ed25519-based agent identity protocol. An APS passport is a long-lived identity document for an AI agent, carrying public key material, capability attestations, and a chain of delegation records.

The integration point is minimal and non-breaking: SINT tokens carry an optional `passportId` reference to an APS passport. No APS-specific cryptographic material is embedded in the SINT token itself — the reference is a stable identifier that allows cross-protocol lookups and event correlation.

---

## 2. Motivation

### 2.1 The Identity Gap

SINT capability tokens are scoped to specific resources and actions — they answer "can agent X call tool Y with constraints Z?". They do NOT answer "who is this agent globally?" or "what is this agent's overall capability attestation level across all systems?".

APS passports fill this gap: they provide a persistent, portable agent identity that survives key rotation and can carry cross-system capability attestations.

### 2.2 Use Cases

| Use case | Benefit of integration |
|---|---|
| Multi-system agent deployment | One APS passport → many SINT tokens across different gateways |
| Incident response | Revoke APS passport → cascade-revoke all SINT tokens for that agent |
| Delegation chain auditing | APS delegation depth mirrored in SINT `delegationDepth` |
| Cross-operator trust | Operator A trusts operator B's APS attestations; accepts SINT tokens referencing B-signed passports |

---

## 3. New Fields in SintCapabilityToken

Two fields were added to `SintCapabilityToken` to support APS interoperability:

### `passportId?: string`

The APS passport identifier for the agent that holds this token. This is the stable string identifier assigned by the APS registry to the agent's passport document.

- **Format:** Opaque string, max 256 characters. APS implementations typically use a UUIDv4 or a DID-like string (e.g., `did:aps:agent-abc123`).
- **Usage:** Cross-protocol identity lookup, cascade revocation trigger, audit correlation.
- **Not a credential:** The `passportId` is a reference identifier only. SINT does not verify the APS passport inline; verification is an out-of-band step during token issuance.

### `delegationDepth?: number`

The depth of this token in the APS delegation chain. `0` means the token was issued directly against the agent's root APS passport. Each delegation hop increments the counter.

- **Relationship to `delegationChain.depth`:** `delegationChain.depth` is the SINT-internal hop count from the SINT root token. `delegationDepth` is the APS-facing depth, which may differ if the APS passport itself was delegated before SINT token issuance.
- **Usage:** Cascade revocation ordering, policy rules that restrict deeply delegated tokens to lower tiers.

---

## 4. Token Issuance with APS Attestation

When issuing a SINT token for an agent whose identity is managed by APS:

1. The issuer fetches the APS passport for the agent (via APS registry API).
2. The issuer verifies the APS passport signature and checks it is not revoked.
3. The issuer records the `passportId` and the current APS `delegationDepth` in the SINT token request.
4. The SINT token is signed as normal — the APS data is metadata, not part of the SINT signing payload (to avoid cross-protocol signature coupling).

```typescript
const tokenRequest: SintCapabilityTokenRequest = {
  issuer:    rootKeypair.publicKey,
  subject:   agentKeypair.publicKey,
  resource:  "mcp://filesystem/writeFile",
  actions:   ["call"],
  constraints: { maxRepetitions: 100 },
  delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
  expiresAt: "2026-12-31T23:59:59.000000Z",
  revocable: true,

  // APS interop fields
  passportId:      "did:aps:agent-abc123",
  delegationDepth: 0,   // directly against root APS passport
};
```

---

## 5. JSON Token Example

The following is a fully-formed SINT capability token with APS interop fields. Signature and key values are illustrative.

```json
{
  "tokenId": "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
  "issuer": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "subject": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  "resource": "mcp://filesystem/writeFile",
  "actions": ["call"],
  "constraints": {
    "maxRepetitions": 100,
    "rateLimit": { "maxCalls": 20, "windowMs": 60000 }
  },
  "behavioralConstraints": {
    "maxCallsPerMinute": 20,
    "allowedPatterns": ["^\\/safe\\/.*", "^\\/tmp\\/.*"],
    "deniedPatterns": ["\\.\\.[\\/\\\\]", "\\/etc\\/", "\\/root\\/"],
    "maxPayloadBytes": 65536
  },
  "delegationChain": {
    "parentTokenId": null,
    "depth": 0,
    "attenuated": false
  },
  "passportId": "did:aps:agent-abc123",
  "delegationDepth": 0,
  "issuedAt": "2026-04-04T10:00:00.000000Z",
  "expiresAt": "2026-12-31T23:59:59.000000Z",
  "revocable": true,
  "revocationEndpoint": "https://sint-gateway.example.com/revoke",
  "signature": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"
}
```

### Field annotations

| Field | Notes |
|---|---|
| `passportId` | References an APS passport document. Issuers should verify passport validity before issuance. |
| `delegationDepth` | `0` = root passport; `1` = first delegation; etc. |
| `behavioralConstraints.allowedPatterns` | Restricts writes to `/safe/` and `/tmp/` subtrees only. |
| `behavioralConstraints.deniedPatterns` | Blocks path traversal, `/etc/`, and `/root/` access regardless of allowed patterns. |
| `behavioralConstraints.maxPayloadBytes` | Caps write payload at 64 KiB. |

---

## 6. Delegated Token Example

When an agent delegates authority to a sub-agent, the child token increments both `delegationChain.depth` and `delegationDepth`:

```json
{
  "tokenId": "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8",
  "issuer": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  "subject": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
  "resource": "mcp://filesystem/writeFile",
  "actions": ["call"],
  "constraints": {
    "maxRepetitions": 10,
    "rateLimit": { "maxCalls": 5, "windowMs": 60000 }
  },
  "behavioralConstraints": {
    "maxCallsPerMinute": 5,
    "allowedPatterns": ["^\\/safe\\/subagent\\/.*"],
    "deniedPatterns": ["\\.\\.[\\/\\\\]", "\\/etc\\/", "\\/root\\/"],
    "maxPayloadBytes": 8192
  },
  "delegationChain": {
    "parentTokenId": "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    "depth": 1,
    "attenuated": true
  },
  "passportId": "did:aps:agent-abc123",
  "delegationDepth": 1,
  "issuedAt": "2026-04-04T11:00:00.000000Z",
  "expiresAt": "2026-12-31T23:59:59.000000Z",
  "revocable": true,
  "signature": "..."
}
```

Note the attenuation: the child token has a narrower resource path, lower rate limits, smaller payload cap, and reduced `maxRepetitions` compared to the parent.

---

## 7. APS Passport Verification at Issuance

SINT token issuers integrating with APS SHOULD perform the following checks before including `passportId` in a token:

1. **Fetch** the APS passport document for the given `passportId`.
2. **Verify** the passport's Ed25519 signature using the APS registry's public key.
3. **Check** that the passport is not listed in the APS revocation list.
4. **Verify** that the passport's `agentPublicKey` matches the SINT token's `subject` (or is a parent in its delegation chain).
5. **Record** the verification timestamp and APS passport version in the token issuance audit log.

If any check fails, token issuance MUST be refused with a clear error indicating that APS verification failed.

---

## 8. Cascade Revocation Integration

When an APS passport is revoked, SINT gateways subscribed to APS revocation events should trigger cascade revocation for all SINT tokens bearing the affected `passportId`. See `docs/specs/cascade-revocation-spec.md` for the full cascade algorithm.

The subscription pattern:

```
APS registry → (revocation event) → SINT gateway event handler
                                         ↓
                            cascadeRevoke(rootTokenForPassport, ...)
```

SINT gateways can maintain an index of `passportId → [tokenId, ...]` to make this lookup O(1).

---

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| Stale APS attestation | Verify passport at issuance time; re-verify on token refresh |
| passportId spoofing | passportId is metadata only — SINT signing is independent; a forged passportId does not affect SINT cryptographic validity |
| APS key compromise | APS revocation event triggers SINT cascade revocation |
| Privacy | passportId is visible in the token; operators should treat token contents as sensitive |
| Cross-protocol version drift | Include APS spec version in issuance audit log; re-validate tokens against current APS spec on each use if required |

---

## 10. References

- SINT Capability Token types: `packages/core/src/types/capability-token.ts`
- SINT Zod schemas: `packages/core/src/schemas/capability-token.schema.ts`
- Cascade Revocation Spec: `docs/specs/cascade-revocation-spec.md`
- Agent Passport System: https://github.com/aeoess/agent-passport-system
- SINT ARCHITECTURE: `/ARCHITECTURE.md`
