# Hello World Agent

Build a minimal agent that registers with SINT, gets a capability token, makes a policy-gated request, and inspects the audit trail. By the end, you'll understand the core loop: **identity, authorization, interception, evidence**.

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- The SINT repo cloned and built:

```bash
git clone https://github.com/sint-ai/sint-protocol.git
cd sint-protocol
pnpm install
pnpm run build
```

## 1. Start the Gateway Server

The Gateway Server is the single choke point that every agent request flows through. Start it with in-memory storage (no database needed):

```bash
pnpm --filter @sint/gateway-server dev
```

You should see:

```
  SINT GATE — Policy Gateway
  Server:  http://localhost:3100
  Store:   memory
```

Verify it's running:

```bash
curl http://localhost:3100/v1/health
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "protocol": "SINT Gate",
  "tokens": 0,
  "ledgerEvents": 0,
  "revokedTokens": 0
}
```

## 2. Create an Agent Identity

SINT uses Ed25519 keypairs for identity. Every agent has a keypair. The public key is the agent's identity; the private key signs tokens and proves ownership.

Create a file called `hello-agent.ts`:

```typescript
import { SintClient } from "@sint/client";

const client = new SintClient({
  baseUrl: "http://localhost:3100",
});

async function main() {
  // Step 1: Generate keypairs for the issuer (authority) and the agent
  const issuer = await client.generateKeypair();
  const agent = await client.generateKeypair();

  console.log("Issuer (authority):", issuer.publicKey);
  console.log("Agent:             ", agent.publicKey);
}

main().catch(console.error);
```

In a real deployment, the issuer is the system administrator or orchestrator — the entity that grants permissions. The agent is the AI that needs to act in the world.

## 3. Issue a Capability Token

Capability tokens are the atomic unit of permission in SINT. They grant specific actions on specific resources for a specific duration. There is no ambient authority — an agent can only do what its tokens explicitly permit.

Extend `hello-agent.ts`:

```typescript
import { SintClient } from "@sint/client";

const client = new SintClient({
  baseUrl: "http://localhost:3100",
});

async function main() {
  // Step 1: Create identities
  const issuer = await client.generateKeypair();
  const agent = await client.generateKeypair();

  console.log("Issuer:", issuer.publicKey);
  console.log("Agent: ", agent.publicKey);

  // Step 2: Issue a capability token
  // This token allows the agent to call readFile on the filesystem MCP server
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const expiresAt = oneHourFromNow.toISOString().replace(/\.\d{3}Z$/, ".000000Z");

  const token = await client.issueToken(
    {
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    issuer.privateKey,
  );

  console.log("Token issued:", token.tokenId);
}

main().catch(console.error);
```

Key things to notice:
- The token is scoped to a specific resource (`mcp://filesystem/readFile`) and specific actions (`["call"]`).
- The `constraints` field can include physical safety limits (max force, max velocity, geofencing) — empty here since we're reading a file, not commanding a robot.
- The `delegationChain` starts at depth 0 (root token). Tokens can be delegated to sub-agents with reduced permissions (attenuation only — never escalation).
- The token expires in one hour. No permanent permissions.

## 4. Make an Intercept Request

Now the agent uses its token to request an action through the Policy Gateway. The gateway evaluates the request against policy rules and decides: **allow**, **deny**, or **escalate** (require human approval).

```typescript
import { SintClient } from "@sint/client";

const client = new SintClient({
  baseUrl: "http://localhost:3100",
});

// Helper: generate a UUID v7 (timestamp-ordered)
function uuidV7(): string {
  const now = BigInt(Date.now());
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Encode timestamp in first 48 bits
  const ts = now & 0xFFFF_FFFF_FFFFn;
  bytes[0] = Number((ts >> 40n) & 0xFFn);
  bytes[1] = Number((ts >> 32n) & 0xFFn);
  bytes[2] = Number((ts >> 24n) & 0xFFn);
  bytes[3] = Number((ts >> 16n) & 0xFFn);
  bytes[4] = Number((ts >> 8n) & 0xFFn);
  bytes[5] = Number(ts & 0xFFn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  // Step 1: Create identities
  const issuer = await client.generateKeypair();
  const agent = await client.generateKeypair();

  // Step 2: Issue a capability token
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const expiresAt = oneHourFromNow.toISOString().replace(/\.\d{3}Z$/, ".000000Z");

  const token = await client.issueToken(
    {
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    issuer.privateKey,
  );

  console.log("Token issued:", token.tokenId);

  // Step 3: Make an intercept request
  // This is the agent saying: "I want to do this. May I?"
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000Z");

  const decision = await client.intercept({
    requestId: uuidV7(),
    timestamp: now,
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "mcp://filesystem/readFile",
    action: "call",
    params: { path: "/tmp/hello.txt" },
  });

  console.log("Decision:", decision.action);        // "allow", "deny", or "escalate"
  console.log("Risk tier:", decision.assignedTier);  // e.g. "T0_observe"
}

main().catch(console.error);
```

The gateway classified `readFile` as `T0_observe` (lowest risk) and allowed it. If the agent had requested something dangerous — like commanding a robot arm or executing shell commands — the gateway would assign a higher tier and potentially escalate for human approval.

## 5. Check the Evidence Ledger

Every decision the gateway makes is recorded in a tamper-evident, hash-chained ledger. This is the audit trail — cryptographic proof of what happened, when, and why.

Add this to the end of `main()`:

```typescript
  // Step 4: Query the evidence ledger
  const ledger = await client.queryLedger({ agentId: agent.publicKey });

  console.log("\n--- Evidence Ledger ---");
  console.log("Chain integrity:", ledger.chainIntegrity);
  console.log("Events:");
  for (const event of ledger.events) {
    console.log(`  [${event.eventType}] ${event.payload?.resource ?? ""} → ${event.payload?.decision ?? "granted"}`);
  }
```

You'll see something like:

```
--- Evidence Ledger ---
Chain integrity: true
Events:
  [agent.capability.granted] mcp://filesystem/readFile → granted
  [policy.evaluated] mcp://filesystem/readFile → allow
  [request.received] mcp://filesystem/readFile → allow
```

Three events, hash-chained together. The `chainIntegrity: true` means no event has been tampered with — each event's hash includes the previous event's hash, forming an append-only chain.

## 6. Run It

Save the complete script as `hello-agent.ts` in the repo root, then run it:

```bash
npx tsx hello-agent.ts
```

> **Note:** The script imports `@sint/client`, a workspace package. Make sure you've run `pnpm install && pnpm run build` first so the package is built and resolvable.

Expected output:

```
Token issued: 019d0ec9-28ec-776e-9b3a-cb4eb38b3f33
Decision: allow
Risk tier: T0_observe

--- Evidence Ledger ---
Chain integrity: true
Events:
  [agent.capability.granted] mcp://filesystem/readFile → granted
  [policy.evaluated] mcp://filesystem/readFile → allow
  [request.received] mcp://filesystem/readFile → allow
```

## The Complete Script

<details>
<summary>hello-agent.ts — full working example</summary>

```typescript
import { SintClient } from "@sint/client";

const client = new SintClient({
  baseUrl: "http://localhost:3100",
});

function uuidV7(): string {
  const now = BigInt(Date.now());
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = now & 0xFFFF_FFFF_FFFFn;
  bytes[0] = Number((ts >> 40n) & 0xFFn);
  bytes[1] = Number((ts >> 32n) & 0xFFn);
  bytes[2] = Number((ts >> 24n) & 0xFFn);
  bytes[3] = Number((ts >> 16n) & 0xFFn);
  bytes[4] = Number((ts >> 8n) & 0xFFn);
  bytes[5] = Number(ts & 0xFFn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  // 1. Create identities
  const issuer = await client.generateKeypair();
  const agent = await client.generateKeypair();

  console.log("Issuer:", issuer.publicKey);
  console.log("Agent: ", agent.publicKey);

  // 2. Issue a capability token
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const expiresAt = oneHourFromNow.toISOString().replace(/\.\d{3}Z$/, ".000000Z");

  const token = await client.issueToken(
    {
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    issuer.privateKey,
  );

  console.log("Token issued:", token.tokenId);

  // 3. Intercept — ask the Policy Gateway for permission
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, ".000000Z");

  const decision = await client.intercept({
    requestId: uuidV7(),
    timestamp: now,
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "mcp://filesystem/readFile",
    action: "call",
    params: { path: "/tmp/hello.txt" },
  });

  console.log("Decision:", decision.action);
  console.log("Risk tier:", decision.assignedTier);

  // 4. Query the evidence ledger
  const ledger = await client.queryLedger({ agentId: agent.publicKey });

  console.log("\n--- Evidence Ledger ---");
  console.log("Chain integrity:", ledger.chainIntegrity);
  console.log("Events:");
  for (const event of ledger.events) {
    const e = event as Record<string, any>;
    console.log(
      `  [${e.eventType}] ${e.payload?.resource ?? ""} → ${e.payload?.decision ?? "granted"}`,
    );
  }
}

main().catch(console.error);
```

</details>

## What Just Happened

In four API calls, you:

1. **Created an identity** — an Ed25519 keypair that cryptographically identifies the agent.
2. **Issued a capability token** — a scoped, time-limited, revocable permission signed by an authority.
3. **Made a policy-gated request** — the gateway evaluated the request against its rules and decided to allow it.
4. **Verified the audit trail** — every action was recorded in a hash-chained evidence ledger that cannot be tampered with.

This is the SINT core loop. Every agent action — whether it's reading a file, commanding a robot arm, or executing a shell command — flows through this same pipeline: **identity, authorization, interception, evidence**.

## Next Steps

- **Try a dangerous action**: Change the resource to `shell://execute` and the action to `run`. Watch the gateway assign a higher risk tier or escalate for approval.
- **Delegate a token**: Use `client.delegateToken()` to create a sub-token with reduced permissions — delegation can only attenuate, never escalate.
- **Revoke a token**: Call `client.revokeToken()` and see the revocation recorded in the ledger.
- **Start the dashboard**: Run `pnpm --filter @sint/dashboard dev` to see the real-time approval UI at `http://localhost:3201`.
- **Read the whitepaper**: See [WHITEPAPER.md](../../WHITEPAPER.md) for the full protocol specification.
