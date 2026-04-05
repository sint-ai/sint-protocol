# Getting Started with SINT Protocol

This guide walks you through setting up SINT, issuing your first capability token, and integrating it into your application.

## Prerequisites

- **Node.js** 22+ ([download](https://nodejs.org))
- **pnpm** 9+ ([install](https://pnpm.io))
- **Git**

## 5-Minute Setup

### 1. Clone and Install

```bash
git clone https://github.com/sint-ai/sint-protocol
cd sint-protocol
pnpm install
pnpm run build
```

### 2. Start the Gateway

```bash
pnpm --filter @sint/gateway-server dev
```

You should see:
```
[19:32:00] @sint/gateway-server: Server running on http://localhost:3100
[19:32:00] @sint/gateway-server: Dashboard available on http://localhost:3201
```

### 3. Test Health

```bash
curl http://localhost:3100/v1/health
# {"status": "ok"}
```

✅ You're running SINT. Now let's use it.

---

## Issuing Your First Token

### Step 1: Generate a Keypair

```bash
curl -X POST http://localhost:3100/v1/keypair \
  -H "Content-Type: application/json" \
  -d '{"bits": 256}' \
| jq .

# Output:
# {
#   "publicKey": "z6Mkm7tgfcnYg...",
#   "privateKey": "...",
#   "did": "did:key:z6Mkm7tgfcnYg..."
# }
```

Save these for the next step. In production, store the private key in a secrets manager (1Password, Vault, etc.).

### Step 2: Issue a Token

```bash
curl -X POST http://localhost:3100/v1/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "issuerPublicKey": "z6Mkm7tgfcnYg...",
    "subjectDid": "did:key:z6Mki...",
    "resources": ["file:///workspace/**"],
    "actions": ["read", "write"],
    "maxTier": 1,
    "constraints": {
      "maxRepetitionsPerWindow": 100
    },
    "ttlSeconds": 3600
  }' \
| jq .

# Output:
# {
#   "id": "tok-19050000-...",
#   "token": "eyJhbGc...",
#   "expiresAt": 1712336400000
# }
```

### Step 3: Test the Token

Make a policy decision using the token:

```bash
curl -X POST http://localhost:3100/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "tok-19050000-...",
    "resource": "file:///workspace/output.txt",
    "action": "write"
  }' \
| jq .

# Output:
# {
#   "action": "allow",
#   "tier": 1,
#   "ttl": 3599,
#   "evidence": {
#     "sessionId": "...",
#     "timestamp": "2026-04-05T02:32:00Z"
#   }
# }
```

✅ Policy decision recorded. Check the approval dashboard at http://localhost:3201 to see the evidence log.

---

## Integrating with MCP

If you're using the Model Context Protocol (MCP) with Claude, GPT, or another LLM:

### 1. Start the MCP Bridge

```bash
pnpm --filter @sint/mcp dev
# MCP proxy listening on stdio
```

### 2. Configure Your MCP Client

In your `claude_desktop_config.json` (or MCP client config):

```json
{
  "mcpServers": {
    "sint-gateway": {
      "command": "node",
      "args": ["path/to/@sint/mcp/dist/index.js"],
      "env": {
        "SINT_GATEWAY": "http://localhost:3100",
        "SINT_API_KEY": "your-api-key"
      }
    }
  }
}
```

Now when your agent calls any MCP tool, it flows through the SINT Policy Gateway:

```
Agent: "Read /workspace/data.csv"
  ↓
SINT MCP Bridge: checks token + constraints
  ↓
PolicyGateway.intercept(): evaluates tier + approval
  ↓
MCP Tool: executes (if approved)
  ↓
EvidenceLedger: records decision + result
```

---

## Integrating with ROS 2

If you're controlling robots or drones with ROS 2:

### 1. Install the Bridge

```bash
pnpm add @sint/bridge-ros2
```

### 2. Intercept Topics

```typescript
import { ROSInterceptor } from "@sint/bridge-ros2";
import { SintClient } from "@sint/client";

const client = new SintClient({ baseUrl: "http://localhost:3100" });
const interceptor = new ROSInterceptor({ client });

// Intercept a publish to /cmd_vel
const decision = await interceptor.intercept({
  topic: "/cmd_vel",
  action: "publish",
  message: { linear: { x: 0.5 }, angular: { z: 0.1 } },
  tokenId: "tok-...",
});

if (decision.action === "allow") {
  // Safe to publish
  publisher.publish(message);
} else if (decision.action === "escalate") {
  // Wait for human approval via dashboard
  await waitForApproval(decision.requestId);
}
```

---

## Delegating Tokens

Delegation lets you issue a scoped token to a sub-agent, with strictly fewer permissions than your own token.

### Example: Granting Read-Only Access

You have a token with read+write access to `/workspace/**`. You want to delegate a read-only token to a subordinate agent.

```bash
curl -X POST http://localhost:3100/v1/tokens/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "parentTokenId": "tok-parent-...",
    "delegateeDid": "did:key:z6Mkdeputy...",
    "resources": ["file:///workspace/output/**"],
    "actions": ["read"],
    "maxTier": 0,
    "ttlSeconds": 600
  }' \
| jq .

# Output:
# {
#   "id": "tok-delegated-...",
#   "token": "eyJhbGc...",
#   "expiresAt": 1712336700000
# }
```

Key properties of delegation:
- ✅ **Attenuation only** — you cannot escalate permissions
- ✅ **Resource narrowing** — you can narrow the resource scope
- ✅ **Tier lowering** — you can lower the max tier
- ❌ **No escalation** — you cannot grant new resources or actions the parent doesn't have
- ❌ **Max 3 hops** — delegation chains cannot exceed depth 3 (child → grandchild → great-grandchild, then stop)

---

## Approval Workflows

Not all actions are auto-approved. Tier T2 (ACT) and T3 (COMMIT) require human review.

### Via Dashboard

Visit http://localhost:3201 to see pending approvals in real-time. Click **Approve** or **Deny** to respond.

### Via API

```bash
# List pending approvals
curl http://localhost:3100/v1/approvals/pending \
  -H "Authorization: Bearer $API_KEY" \
| jq .

# Approve a specific request
curl -X POST http://localhost:3100/v1/approvals/req-id-123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "approve",
    "reason": "Verified safe by operator"
  }'

# Deny a request
curl -X POST http://localhost:3100/v1/approvals/req-id-123/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "deny",
    "reason": "Not authorized for this workspace"
  }'
```

### SSE Streaming (Real-Time)

If your application needs to watch for approval decisions in real-time:

```typescript
const eventSource = new EventSource(
  "http://localhost:3100/v1/approvals/events?sessionId=agent-001"
);

eventSource.addEventListener("approval", (event) => {
  const decision = JSON.parse(event.data);
  console.log(`Approval resolved: ${decision.status}`);
});
```

---

## Querying the Audit Log

Every decision is recorded in the Evidence Ledger. Query it to understand what your agent has done.

### By Session

```bash
curl -X GET "http://localhost:3100/v1/ledger?sessionId=agent-001&limit=50" \
  -H "Authorization: Bearer $API_KEY" \
| jq .

# Output:
# {
#   "events": [
#     {
#       "timestamp": "2026-04-05T02:32:00Z",
#       "sessionId": "agent-001",
#       "action": "write_file",
#       "resource": "/workspace/output.txt",
#       "decision": "allow",
#       "tier": 1,
#       "tokenId": "tok-...",
#       "evidenceHash": "sha256:abc123..."
#     },
#     ...
#   ]
# }
```

### By Tier

```bash
curl -X GET "http://localhost:3100/v1/ledger?tier=2,3" \
  -H "Authorization: Bearer $API_KEY" \
| jq '.events | length'
# 47 (47 T2+ decisions made by this agent)
```

### Export for SIEM

```bash
curl -X POST http://localhost:3100/v1/ledger/export \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "format": "syslog",
    "filter": { "tier": 2, "decision": "deny" }
  }' \
  --output audit.syslog
```

---

## Emergency Stop (E-Stop)

If an agent is behaving dangerously, you can instantly revoke all its tokens:

```bash
curl -X POST http://localhost:3100/v1/circuit-breaker/trip \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "reason": "Unexpected behavior detected"
  }'

# All new actions from agent-001 immediately return:
# { "action": "deny", "reason": "Circuit breaker open" }
```

To resume:

```bash
curl -X POST http://localhost:3100/v1/circuit-breaker/reset \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "agent-001" }'

# The circuit enters HALF_OPEN state. The next request is allowed as a "probe".
# If it succeeds, the circuit closes. If it fails, the circuit reopens.
```

---

## Deployment Profiles

SINT ships with pre-configured profiles for different use cases.

### Research Lab

For development and experimentation:

```bash
export SINT_PROFILE=research
pnpm run dev
# No approval gate required for T1/T2; all decisions logged
# Good for fast iteration
```

### Warehouse Automation

For trusted environments:

```bash
export SINT_PROFILE=warehouse
pnpm run start
# T2 (ACT) approvals require single operator sign-off
# Rate limiting per agent
```

### Manufacturing (Controlled Environment)

For high-safety environments:

```bash
export SINT_PROFILE=manufacturing
pnpm run start
# T2+ approvals require M-of-N quorum (default: 2-of-3 operators)
# All decisions recorded for traceability
```

### Healthcare / Critical Infrastructure

For maximum safety:

```bash
export SINT_PROFILE=critical
pnpm run start
# T3 (COMMIT) approvals require 3-of-4 quorum
# Hardware E-stop integrated
# All ledger entries persisted to write-once storage
```

---

## Next Steps

1. **Explore the dashboard** — http://localhost:3201
2. **Read the spec** — [SINT Protocol v0.2 Specification](SINT_v0.2_SPEC.md)
3. **Browse examples** — [examples/](../examples/)
4. **Review the compliance matrix** — [Conformance Certification Matrix](CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
5. **Set up PostgreSQL persistence** — [Deployment Guide](deployment.md)

## Support

- **GitHub Issues** — https://github.com/sint-ai/sint-protocol/issues
- **Discussions** — https://github.com/sint-ai/sint-protocol/discussions
- **Discord** — [SINT Community](https://discord.gg/sint-protocol)

---

## Safety & Compliance

SINT is designed with reference to:
- **IEC 62443** — Industrial Cybersecurity
- **EU AI Act Article 13** — Transparency for AI Systems
- **NIST AI RMF** — AI Risk Management Framework
- **OWASP Agentic Top 10** — Agentic AI Security

For compliance details, see [Conformance Certification Matrix](CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md).

---

## License

Apache-2.0
