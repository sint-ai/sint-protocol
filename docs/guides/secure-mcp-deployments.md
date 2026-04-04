# Secure MCP Deployments with SINT Protocol

> **The missing governance layer for production MCP.**

Model Context Protocol (MCP) gives AI agents powerful tool access — but ships with no authorization model, no audit trail, and no rate limiting. SINT fills that gap in < 5ms p99.

---

## The Problem

A bare MCP setup:

```
Agent → MCP Server → tool call executed
```

No check on *which* agent can call *which* tool. No record of what happened. No way to block a compromised agent.

---

## The SINT Solution

```
Agent → SINT PolicyGateway → MCP Server → tool call executed
                ↓
         EvidenceLedger (hash-chained audit)
```

Every tool call is evaluated against:
1. A **signed capability token** (Ed25519, scoped to specific tools/servers)
2. **Approval tiers** (T0=observe, T1=prepare, T2=act, T3=commit)
3. **Rate limits** (per-token sliding window)
4. **OWASP ASI Top-10** threat mitigations (ASI01–ASI10)

---

## Quick Start (5 minutes)

```typescript
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { MCPInterceptor } from "@sint/bridge-mcp";
import { generateKeypair, issueCapabilityToken } from "@sint/gate-capability-tokens";

const root = generateKeypair();
const agent = generateKeypair();

// Issue a scoped token (valid 8 hours, read-only filesystem)
const token = issueCapabilityToken({
  issuer: root.publicKey,
  subject: agent.publicKey,
  resource: "mcp://filesystem/readFile",
  actions: ["call"],
  constraints: { rateLimit: { maxCalls: 100, windowMs: 3_600_000 } },
  expiresAt: new Date(Date.now() + 8 * 3600000).toISOString(),
  delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
  revocable: true,
}, root.privateKey);

// Wrap your MCP server
const gateway = new PolicyGateway({
  resolveToken: (id) => tokenStore.get(id),
});
const interceptor = new MCPInterceptor({ gateway });

// Intercept every tool call
const session = interceptor.createSession({
  agentId: agent.publicKey,
  tokenId: token.value.tokenId,
  serverName: "filesystem",
});

const result = await interceptor.interceptToolCall(session, {
  callId: "call-1",
  serverName: "filesystem",
  toolName: "readFile",
  arguments: { path: "/tmp/report.csv" },
  timestamp: new Date().toISOString(),
});

// result.action === "forward" | "deny" | "escalate"
```

---

## What SINT Mitigates (OWASP ASI Top-10)

| Attack | Without SINT | With SINT |
|--------|-------------|-----------|
| ASI01 Tool name spoofing | Undetected | Token resource scope blocks cross-server access |
| ASI02 Description injection | Tier influenced by prompt | Tier assigned from resource URI only |
| ASI03 Shell escalation | `exec` treated same as `readFile` | `mcp://exec/*` → T3_COMMIT, human required |
| ASI04 Cross-server scope confusion | `filesystem` token works on `exec` | Resource pattern mismatch → deny |
| ASI05 Rate limit exhaustion | No limit | Configurable per-token window |
| ASI06 Delegation depth escalation | Unbounded delegation | Max depth 3, monotonic attenuation |
| ASI07 Expired token replay | Tokens valid forever | Expiry checked on every request |
| ASI08 Revoked token replay | No revocation | RevocationStore checked before dispatch |
| ASI09 Forbidden op sequence | write→exec silently allowed | `checkForbiddenCombos()` → T3_COMMIT |
| ASI10 Supply chain model mismatch | Any model can act | `modelFingerprintHash` enforced per-token |

---

## Integration with existing MCP servers

SINT is a **middleware layer** — it doesn't replace your MCP server. Drop it in front of any existing server:

- `@sint/bridge-mcp` — wraps any MCP server
- `@sint/bridge-ros2` — wraps ROS 2 topic/service/action calls
- `@sint/bridge-iot` — wraps MQTT/CoAP gateways
- `@sint/bridge-a2a` — wraps Google A2A protocol calls

---

## Performance

| Metric | Value |
|--------|-------|
| T0 (observe) p50 | ~1.5ms |
| T0 (observe) p99 | ~3ms |
| T2 (act) p50 | ~2ms |
| T2 (act) p99 | ~5ms |

Benchmarked on MacBook Pro M2. RPi5 results in `docs/reports/`.

---

## Resources

- [Full spec](../SINT_v0.2_SPEC.md)
- [Conformance matrix](../CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
- [AGENTS.md](../../AGENTS.md) — collaboration guide for AI agents
- GitHub: [sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)
