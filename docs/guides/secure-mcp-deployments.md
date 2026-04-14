# Securing MCP Deployments with SINT Protocol

> **The missing governance layer for production MCP.**
>
> Model Context Protocol (MCP) gives AI agents powerful tool access — but ships with no authorization model, no audit trail, and no rate limiting. SINT fills that gap in < 5ms p99.

---

## The Problem: MCP Has No Authorization Layer

MCP is a transport protocol. It defines how an LLM client discovers tools (via `tools/list`) and calls them (via `tools/call`). What it does not define is *who* is allowed to call *which* tool, at *what rate*, or under *what conditions*.

A bare MCP deployment:

```
LLM → MCP Client → MCP Server → tool executed
```

Any agent that has a TCP/stdio connection to your MCP server can call any tool in its list. There is no token, no scope check, no approval gate. An agent that discovers `shell/run_command` alongside `filesystem/readFile` can call either — the protocol has no mechanism to prevent it.

This creates concrete risks in production:

- **Confused deputy** — an agent authorized for read-only file access calls write tools because they appear in the same tool list
- **Rate exhaustion** — a runaway prompt loop burns thousands of tool calls before anyone notices
- **No audit trail** — you cannot determine after the fact which agent called what, when, or why
- **Prompt injection via tools** — a malicious tool description can influence what the LLM does next, with no interception point between the model and the tool
- **Delegation with no bounds** — a parent agent that got write access can pass its session to a child agent with no attenuation

These are not theoretical. The OWASP Agentic AI Security Top 10 (ASI01–ASI10) catalogs all ten attack classes that apply to MCP deployments. MCP alone addresses none of them.

---

## The OWASP Agentic AI Top 10 and MCP

| ASI | Threat | MCP Alone | SINT Covers |
|-----|--------|-----------|-------------|
| ASI01 | Goal hijacking / prompt injection into tool selection | No protection | GoalHijackPlugin (5-layer heuristics: prompt injection, role override, semantic escalation, exfiltration probes, cross-agent injection) |
| ASI02 | Tool misuse — tools called outside their intended scope | No protection | Tool Authorization Manifests (TAM) + capability token resource scoping |
| ASI03 | Identity abuse — forged or stolen agent identity | No protection | Ed25519-signed capability tokens; `did:key` identity; delegation chain verification |
| ASI04 | Supply chain — tampered tool schemas, swapped model versions | No protection | TAM operator-controlled manifests; DefaultSupplyChainVerifier checks model fingerprint hash at runtime |
| ASI05 | Arbitrary code execution via shell tool calls | No protection | Partial: forbidden-combo rules block write→exec sequences; capsule sandbox isolation |
| ASI06 | Memory poisoning — replayed or injected context history | No protection | Partial: DefaultMemoryIntegrityChecker (replay detection, privilege claim detection, UUIDv7 monotonicity) |
| ASI07 | Inter-agent trust abuse — spoofed A2A messages | No protection | A2A bridge validates `did:key` before processing any inter-agent message |
| ASI08 | Cascading failures — tool call storms, runaway agents | No protection | CircuitBreakerPlugin (auto-opens on N consecutive denials) + per-token sliding-window rate limits |
| ASI09 | Trust exploitation — dangerous multi-step action sequences | No protection | `checkForbiddenCombos()` blocks known patterns; T2/T3 human approval with M-of-N quorum |
| ASI10 | Rogue agent — agent that refuses to stop | No protection | `CircuitBreaker.trip()` — the EU AI Act Article 14(4)(e) stop button; CSML anomalous-persona auto-trip |

**Coverage summary (SINT + MCP):** Full coverage 8/10 ASI categories; Partial 2/10 (ASI05, ASI06).

---

## SINT as MCP Middleware

SINT operates as a policy proxy between any MCP client and any MCP server. It does not replace the MCP server — it wraps it:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SINT Policy Layer                            │
│                                                                     │
│  LLM / MCP Client                                                   │
│       │                                                             │
│       ▼                                                             │
│  MCPInterceptor  ──────────►  PolicyGateway.intercept()            │
│       │                              │                              │
│       │                    ┌─────────▼──────────┐                  │
│       │                    │  1. Token auth      │                  │
│       │                    │  2. TAM check       │                  │
│       │                    │  3. Tier assignment │                  │
│       │                    │  4. Rate limits     │                  │
│       │                    │  5. Forbidden combos│                  │
│       │                    │  6. Escalation check│                  │
│       │                    └─────────┬──────────┘                  │
│       │                              │                              │
│       │                    ┌─────────▼──────────┐                  │
│       │                    │   EvidenceLedger    │                  │
│       │                    │  (SHA-256 chained)  │                  │
│       │                    └────────────────────┘                  │
│       │                                                             │
│       ▼ (if action = "forward")                                     │
│  Downstream MCP Server(s)                                           │
│   (filesystem, github, shell, database, ...)                        │
└─────────────────────────────────────────────────────────────────────┘
```

Every tool call enters `MCPInterceptor.interceptToolCall()`, exits with one of three decisions:

- `"forward"` — call is allowed; send to the downstream MCP server
- `"deny"` — call is blocked; return error to the LLM
- `"escalate"` — call requires human approval before proceeding

---

## 5-Minute Setup

### Install

```bash
npm install @sint/bridge-mcp @sint/gate-policy-gateway @sint/gate-capability-tokens
```

### Configure and run

```typescript
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { MCPInterceptor } from "@pshkv/bridge-mcp";
import {
  generateKeypair,
  issueCapabilityToken,
  InMemoryRevocationStore,
} from "@pshkv/gate-capability-tokens";
import { InMemoryEvidenceLedger } from "@pshkv/gate-evidence-ledger";

// ── 1. Root key (kept offline in production) ──────────────────────────────────
const rootKeypair = generateKeypair();

// ── 2. Agent key (generated per-agent, per-session) ───────────────────────────
const agentKeypair = generateKeypair();

// ── 3. Issue a scoped capability token ────────────────────────────────────────
const tokenResult = issueCapabilityToken(
  {
    issuer: rootKeypair.publicKey,
    subject: agentKeypair.publicKey,
    resource: "mcp://filesystem/read_file",   // read_file ONLY on filesystem server
    actions: ["call"],
    constraints: {
      rateLimit: { maxCalls: 120, windowMs: 60_000 }, // 120 calls/minute
    },
    expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(), // 8 hours
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    revocable: true,
  },
  rootKeypair.privateKey,
);

if (!tokenResult.ok) throw new Error(tokenResult.error.message);
const token = tokenResult.value;

// ── 4. Wire up the gateway ────────────────────────────────────────────────────
const revocationStore = new InMemoryRevocationStore();
const ledger = new InMemoryEvidenceLedger();

const gateway = new PolicyGateway({
  resolveToken: (id) => (id === token.tokenId ? token : undefined),
  revocationStore,
  ledger,
});

// ── 5. Create the interceptor ─────────────────────────────────────────────────
const interceptor = new MCPInterceptor({ gateway });

// ── 6. Create a session for this agent + server ───────────────────────────────
const sessionId = interceptor.createSession({
  agentId: agentKeypair.publicKey,
  tokenId: token.tokenId,
  serverName: "filesystem",
});

// ── 7. Intercept every tool call ──────────────────────────────────────────────
const result = await interceptor.interceptToolCall(sessionId, {
  callId: "call-001",
  serverName: "filesystem",
  toolName: "read_file",
  arguments: { path: "/tmp/report.csv" },
  timestamp: new Date().toISOString(),
});

if (result.action === "forward") {
  // Forward to your actual MCP filesystem server
  console.log("Allowed:", result.toolCall);
} else if (result.action === "deny") {
  console.error("Denied:", result.denyReason);
} else if (result.action === "escalate") {
  console.log("Needs approval at tier:", result.requiredTier);
}
```

---

## Token Scoping for MCP Tools

The key principle: **a token can only authorize what its resource pattern matches**.

### Read-only filesystem token

```typescript
const readOnlyToken = issueCapabilityToken(
  {
    issuer: rootKeypair.publicKey,
    subject: agentKeypair.publicKey,
    resource: "mcp://filesystem/read_file",   // exact tool match
    actions: ["call"],
    constraints: {},
    expiresAt: "2026-12-31T23:59:59.000000Z",
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    revocable: true,
  },
  rootKeypair.privateKey,
);
// This token CANNOT call write_file, create_directory, or any other tool.
// Resource pattern mismatch → deny.
```

### Wildcard token for a whole server

```typescript
const filesystemToken = issueCapabilityToken(
  {
    issuer: rootKeypair.publicKey,
    subject: agentKeypair.publicKey,
    resource: "mcp://filesystem/*",           // all filesystem tools
    actions: ["call"],
    constraints: {
      rateLimit: { maxCalls: 60, windowMs: 60_000 },
    },
    expiresAt: "2026-12-31T23:59:59.000000Z",
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    revocable: true,
  },
  rootKeypair.privateKey,
);
// Covers: read_file, write_file, create_directory, list_directory, etc.
// Does NOT cover: mcp://shell/*, mcp://github/*, etc.
```

### Delegated token (attenuated)

An agent can delegate a subset of its permissions to a sub-agent. Attenuation only — the delegated token can only be narrower than the parent:

```typescript
const parentToken = filesystemToken; // mcp://filesystem/* with rate limit 60/min

const delegatedToken = issueCapabilityToken(
  {
    issuer: agentKeypair.publicKey,    // agent is now the issuer
    subject: subAgentKeypair.publicKey,
    resource: "mcp://filesystem/read_file",  // narrower scope than parent
    actions: ["call"],
    constraints: {
      rateLimit: { maxCalls: 10, windowMs: 60_000 }, // tighter rate limit
    },
    expiresAt: "2026-06-30T23:59:59.000000Z", // shorter validity
    delegationChain: {
      parentTokenId: parentToken.tokenId,
      depth: 1,                        // depth increments per hop
      attenuated: true,
    },
    revocable: true,
  },
  agentKeypair.privateKey,
);
// Maximum delegation depth: 3 hops. Attempting depth > 3 → deny.
// Attempting to widen scope beyond parent → deny.
```

---

## Tier Assignment for MCP Tools

SINT assigns every tool call to an approval tier based on its resource URI pattern and the Tool Authorization Manifest (TAM). The tier determines what happens next:

| Tier | Constant | Auto-approved? | Use for |
|------|----------|----------------|---------|
| T0 | `T0_OBSERVE` | Yes, logged | Read-only queries: `read_file`, `list_directory`, `search_files` |
| T1 | `T1_PREPARE` | Yes, audited | Low-impact writes: `write_file`, `create_directory`, `save_draft` |
| T2 | `T2_ACT` | No — escalate | State-changing: `push_files`, `send_message`, `update_record` |
| T3 | `T3_COMMIT` | No — human required | Irreversible: `run_command`, `execute_script`, `delete_file` |

### Registering Tool Authorization Manifests

TAM entries are operator-controlled — the tool cannot self-declare elevated permissions:

```typescript
import { TamRegistry, ApprovalTier } from "@pshkv/bridge-mcp";

const tamRegistry = new TamRegistry();

// Read tools → T0
tamRegistry.register({
  toolName: "read_file",
  serverName: "filesystem",
  minApprovalTier: ApprovalTier.T0_OBSERVE,
  requiresCapabilityToken: true,
  resourcePattern: "mcp://filesystem/*",
  requiredActions: ["call"],
  rationale: "Read-only file access — observe tier, logged.",
});

// Write tools → T1
tamRegistry.register({
  toolName: "write_file",
  serverName: "filesystem",
  minApprovalTier: ApprovalTier.T1_PREPARE,
  requiresCapabilityToken: true,
  resourcePattern: "mcp://filesystem/*",
  requiredActions: ["call"],
  rationale: "File write — prepare tier, audited.",
});

// Destructive tools → T3
tamRegistry.register({
  toolName: "run_command",
  serverName: "shell",
  minApprovalTier: ApprovalTier.T3_COMMIT,
  requiresCapabilityToken: true,
  resourcePattern: "mcp://shell/*",
  requiredActions: ["call"],
  rationale: "Shell execution — commit tier, requires human sign-off.",
});
```

SINT ships with `DEFAULT_MANIFESTS` covering the official MCP server set (filesystem, github, shell) as a starting point.

---

## Audit Trail

Every policy decision — allow, deny, or escalate — is recorded in the `EvidenceLedger`. Entries are SHA-256 hash-chained: each entry includes the hash of the previous entry, forming a tamper-evident chain.

### What a ledger event looks like

```json
{
  "eventId": "01926a3f-4b7e-7000-8a12-3c4d5e6f7a8b",
  "sequenceNumber": 1042,
  "timestamp": "2026-04-05T14:22:31.441821Z",
  "previousHash": "sha256:a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
  "eventHash":    "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
  "agentId": "did:key:z6MkpT...",
  "tokenId": "01926a3f-0000-7000-0000-000000000001",
  "resource": "mcp://filesystem/read_file",
  "action": "call",
  "decision": "allow",
  "assignedTier": "T0_observe",
  "params": { "path": "/tmp/report.csv" }
}
```

### Querying the ledger

```typescript
// Get all events for a specific agent
const events = await ledger.query({
  agentId: agentKeypair.publicKey,
  since: new Date(Date.now() - 3_600_000).toISOString(), // last hour
});

// Verify chain integrity
const isValid = await ledger.verifyChain();
console.log("Chain intact:", isValid); // false if any entry was tampered

// Get proof receipt for a specific event (for compliance attestation)
const receipt = await ledger.getProofReceipt(eventId);
```

### SIEM export

The `siem-exporter` in `packages/bridge-mcp/` streams ledger events to any SIEM:

```typescript
import { SiemExporter } from "@pshkv/bridge-mcp/siem-exporter";

const exporter = new SiemExporter({
  endpoint: "https://your-siem.example.com/ingest",
  apiKey: process.env.SIEM_API_KEY,
  batchSize: 100,
  flushIntervalMs: 5_000,
});

ledger.onEvent((event) => exporter.enqueue(event));
```

---

## Rate Limiting

Per-token sliding-window rate limits prevent runaway tool-call storms (OWASP ASI08).

### Configure at token issuance

```typescript
const token = issueCapabilityToken(
  {
    // ...
    constraints: {
      rateLimit: {
        maxCalls: 30,           // maximum 30 calls
        windowMs: 60_000,       // per 60-second window
      },
    },
    // ...
  },
  rootKeypair.privateKey,
);
```

When the limit is exceeded, the gateway returns a deny decision:

```json
{
  "action": "deny",
  "assignedTier": "T0_observe",
  "denial": {
    "reason": "Rate limit exceeded: 30 calls in 60000ms window",
    "policyViolated": "RATE_LIMIT_EXCEEDED"
  }
}
```

### Per-server rate ceilings

You can also set a rate ceiling at the server level via `SintDeploymentProfile`, independent of the token's own limits:

```typescript
const gateway = new PolicyGateway({
  resolveToken: tokenStore.get,
  deploymentProfile: {
    serverPolicies: {
      "shell": {
        maxTier: "T3_commit",
        requireApproval: true,
        rateLimit: { maxCalls: 5, windowMs: 60_000 }, // shell: max 5/min
      },
      "filesystem": {
        maxTier: "T1_prepare",
        requireApproval: false,
        rateLimit: { maxCalls: 200, windowMs: 60_000 },
      },
    },
  },
});
```

---

## Human-in-the-Loop for Dangerous Tools

T2 and T3 tool calls require human approval before the call is forwarded to the downstream MCP server.

### T3 approval flow

When `interceptToolCall()` returns `action: "escalate"`, you hold the call and wait for human sign-off:

```typescript
const result = await interceptor.interceptToolCall(sessionId, {
  callId: "call-007",
  serverName: "shell",
  toolName: "run_command",
  arguments: { command: "rm -rf /tmp/staging" },
  timestamp: new Date().toISOString(),
});

// result.action === "escalate"
// result.requiredTier === "T3_commit"

if (result.action === "escalate") {
  // POST to your approval dashboard / SSE stream
  const approval = await approvalService.requestApproval({
    callId: result.callId,
    agentId: sessionAgentId,
    tool: `${result.toolCall.serverName}/${result.toolCall.toolName}`,
    args: result.toolCall.arguments,
    requiredTier: result.requiredTier,
    timeoutMs: 30_000,        // 30 second timeout
    fallbackAction: "deny",   // deny if no response
  });

  if (approval.approved) {
    // Forward to MCP server
    await mcpClient.callTool(result.toolCall);
  }
}
```

### M-of-N quorum for commit actions

For highest-stakes operations, require multiple approvers:

```typescript
const gateway = new PolicyGateway({
  resolveToken: tokenStore.get,
  approvalPolicy: {
    T3_commit: {
      quorum: { required: 2, of: 3 }, // 2-of-3 approvers
      approverRoles: ["security-lead", "ops-lead"],
      timeoutMs: 120_000,
    },
  },
});
```

---

## Forbidden Action Sequences

SINT tracks each agent's recent tool calls within a session and blocks dangerous multi-step patterns before they complete (OWASP ASI09).

Built-in forbidden combinations:

| Sequence | Risk | Result |
|----------|------|--------|
| `filesystem.write_file` → `shell.run_command` | Code injection: write script, then execute it | Escalate to T3_COMMIT |
| `credential.read` → `http.request` | Credential exfiltration | Deny |
| `database.write` → `database.execute` | SQL injection escalation | Escalate to T3_COMMIT |

These checks run automatically inside `PolicyGateway.intercept()` via `checkForbiddenCombos()` using the `recentActions` list tracked per session in `MCPSessionManager`.

---

## OWASP ASI Coverage with SINT + MCP

Detailed mapping — component-level evidence:

| ASI | Title | SINT Component | Implementation |
|-----|-------|----------------|----------------|
| ASI01 | Goal Hijacking | `GoalHijackPlugin` | 5 heuristic layers: literal prompt injection, role override (`you are now`), semantic escalation (tool scope widening), exfiltration probes (credential reads followed by network calls), cross-agent injection (unverified A2A sender) |
| ASI02 | Tool Misuse | `TamRegistry` + capability token resource scope | `validateAgainstTam()` checks tier, resource pattern, and required actions before any tool call is forwarded |
| ASI03 | Identity Abuse | `@sint/gate-capability-tokens` | Ed25519 signatures; `did:key` identity; delegation chain verified at each hop; `InMemoryRevocationStore.isRevoked()` called on every intercept |
| ASI04 | Supply Chain | `DefaultSupplyChainVerifier` | Checks `modelFingerprintHash` against token-bound value; validates `modelId` against allowlist; verifies bridge protocol consistency |
| ASI05 | Code Execution | Forbidden combos + capsule sandbox | `filesystem.write→shell.exec` combo blocked; capsule sandbox isolates agent execution process |
| ASI06 | Memory Poisoning | `DefaultMemoryIntegrityChecker` | Detects replay (suspicious repetition in `recentActions`), privilege claims (`ADMIN`, `OVERRIDE` keywords), UUIDv7 timestamp rollback, history overflow |
| ASI07 | Inter-Agent Trust | `@sint/bridge-a2a` | Every A2A message sender's `did:key` must have a valid, unexpired, non-revoked capability token before the message is processed |
| ASI08 | Cascading Failures | `CircuitBreakerPlugin` + rate limits | Circuit opens on N consecutive denials; all subsequent requests auto-deny; per-token sliding-window rate limits cap call volume |
| ASI09 | Trust Exploitation | `checkForbiddenCombos()` + T2/T3 approval | Multi-step patterns checked against known-bad sequences; T3 requires human sign-off with configurable M-of-N quorum |
| ASI10 | Rogue Agent | `CircuitBreaker.trip()` + CSML drift | Manual trip halts all T2/T3 actions instantly; CSML anomalous-persona detection auto-trips circuit on safety events |

---

## Benchmarks

Benchmarked on MacBook Pro M2 (policy evaluation only, not including downstream MCP server latency):

| Tier | p50 | p99 |
|------|-----|-----|
| T0_OBSERVE (read tools) | ~1.5 ms | ~3 ms |
| T1_PREPARE (write tools) | ~1.8 ms | ~4 ms |
| T2_ACT (act — escalate path) | ~2.0 ms | ~5 ms |
| T3_COMMIT (commit — escalate path) | ~2.0 ms | ~5 ms |

The p99 target of < 5 ms holds for all tiers. Full benchmark results in `docs/reports/`. Raspberry Pi 5 results also available for edge deployments.

> **How to run:** `pnpm --filter @sint/gate-policy-gateway bench`

---

## Integration Checklist

Use this checklist before deploying an MCP server to production with SINT:

```
Production MCP Deployment — SINT Security Checklist
─────────────────────────────────────────────────────

[ ] 1. Root keypair generated and stored offline (HSM or vault)
        Root key MUST NOT be used at runtime — only for token issuance

[ ] 2. Per-agent capability tokens issued with minimal resource scope
        Use exact tool name ("mcp://filesystem/read_file") not wildcard
        unless multiple tools are genuinely needed

[ ] 3. Token expiry set to ≤ 24 hours for interactive agents
        Shorter for higher-risk agents (T2/T3 tools)

[ ] 4. Rate limits configured per token AND per server policy
        Start conservative (30 calls/min) and tune up with data

[ ] 5. TAM entries registered for every tool in every server
        Use DEFAULT_MANIFESTS as baseline, override for your tools

[ ] 6. T3 tools identified and approval workflow configured
        Any tool with `destructiveHint: true` or shell access → T3_COMMIT

[ ] 7. Forbidden combos reviewed and extended for your tool set
        Add combos specific to your domain (e.g., database.read → http.post)

[ ] 8. EvidenceLedger connected to your SIEM
        Verify chain integrity on startup; alert on integrity failures

[ ] 9. CircuitBreaker thresholds tuned per agent/deployment
        Default: trip after 5 consecutive denials; tune per risk profile

[x] 10. RevocationStore reachable with < 10ms latency
         Stale revocation = active security hole. Use Redis for production.
```

---

## What SINT Does Not Cover

Be honest with your threat model:

- **Compromised host OS** — if the process running the gateway is compromised, all bets are off. Use container isolation and network segmentation.
- **Malicious operator** — SINT assumes the operator configuring the gateway is trusted. External attestation (e.g., TPM) is required if the operator is not trusted.
- **Semantic correctness of tool arguments** — SINT enforces *which* tools can be called and *by whom*, not whether the arguments are logically correct.
- **Side-channel attacks on policy evaluation** — timing attacks on the intercept path are not mitigated.

---

## Resources

- **SINT Protocol spec:** [`docs/SINT_v0.2_SPEC.md`](../SINT_v0.2_SPEC.md)
- **Conformance matrix:** [`docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md`](../CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
- **NIST AI RMF crosswalk:** [`docs/specs/nist-ai-rmf-crosswalk.md`](../specs/nist-ai-rmf-crosswalk.md)
- **OWASP ASI coverage source:** [`packages/core/src/constants/compliance.ts`](../../packages/core/src/constants/compliance.ts)
- **TAM implementation:** [`packages/bridge-mcp/src/tam.ts`](../../packages/bridge-mcp/src/tam.ts)
- **MCP interceptor:** [`packages/bridge-mcp/src/mcp-interceptor.ts`](../../packages/bridge-mcp/src/mcp-interceptor.ts)
- **GitHub:** [github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)
- **MCP community:** [modelcontextprotocol.io](https://modelcontextprotocol.io)
