# Minimal MCP Server with SINT Protection

Build a simple notes MCP server and run it behind the SINT proxy. You'll see how SINT automatically classifies tool calls into approval tiers based on their risk level and enforces policy on every request.

## What you'll learn

- How to write a basic MCP server with tools
- How the SINT MCP proxy intercepts and classifies tool calls
- How per-server policy (maxTier) restricts dangerous operations
- How to inspect the audit trail via built-in SINT tools

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

## 1. The Notes Server

Look at `examples/notes-server/server.ts`. It's a standard MCP server with five tools that map to different risk levels:

| Tool | What it does | Expected tier |
|------|-------------|---------------|
| `listNotes` | List all notes | T0 (observe) |
| `getNote` | Read a single note | T0 (observe) |
| `createNote` | Create a new note | T1 (prepare) |
| `updateNote` | Modify an existing note | T1 (prepare) |
| `deleteAllNotes` | Wipe all notes | T1 (prepare) |

Without SINT, all five tools are equally accessible. Any agent can call `deleteAllNotes` as easily as `listNotes`. SINT adds the security layer that distinguishes between reading data and destroying it.

## 2. The SINT Config

The config at `examples/notes-server/sint-mcp.config.json` tells the SINT proxy where to find the notes server and what policy to apply:

```json
{
  "servers": {
    "notes": {
      "command": "npx",
      "args": ["tsx", "./examples/notes-server/server.ts"],
      "policy": {
        "maxTier": "T2_act"
      }
    }
  },
  "defaultPolicy": "cautious",
  "approvalTimeoutMs": 60000
}
```

Key settings:

- **`maxTier: "T2_act"`** — This server's tools are capped at T2. If SINT classifies any tool call as T3 (commit), it will be denied outright. This is a safety ceiling.
- **`defaultPolicy: "cautious"`** — SINT errs on the side of caution when classifying unknown tools.

## 3. Start the Gateway

The gateway server evaluates policy decisions. Start it first:

```bash
pnpm --filter @sint/gateway-server dev
```

Verify it's running:

```bash
curl -s http://localhost:3100/v1/health | jq .
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

## 4. Start the SINT MCP Proxy

In a second terminal, start the SINT proxy with SSE transport so we can interact via curl:

```bash
SINT_MCP_CONFIG=./examples/notes-server/sint-mcp.config.json \
  pnpm --filter @sint/mcp dev -- --sse --port 3200
```

You should see:

```
  SINT MCP -- Security Proxy
  Transport: sse
  Servers:   1 configured
  Policy:    cautious
  Connected: 1/1 servers
  Tools:     5 aggregated + 8 SINT built-in
```

The proxy discovered all 5 tools from the notes server and added its own built-in tools (status, audit, approve, etc.).

## 5. Try It Out

### List tools

The proxy namespaces tools as `serverName__toolName`:

```bash
# Using the MCP JSON-RPC protocol
curl -s -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq '.result.tools[] | .name'
```

You'll see both the notes server tools (prefixed `notes__`) and the built-in SINT tools (prefixed `sint__`):

```
"notes__listNotes"
"notes__getNote"
"notes__createNote"
"notes__updateNote"
"notes__deleteAllNotes"
"sint__status"
"sint__servers"
"sint__whoami"
...
```

### Read a note (T0 - auto-approved)

```bash
curl -s -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "notes__getNote",
      "arguments": { "id": "1" }
    }
  }' | jq '.result.content[0].text' -r | jq .
```

This flows through automatically. SINT classifies read operations as T0 (observe) and logs them without blocking.

### Create a note (T1 - audited)

```bash
curl -s -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "notes__createNote",
      "arguments": {
        "title": "SINT test",
        "content": "Created through the SINT proxy"
      }
    }
  }' | jq '.result.content[0].text' -r | jq .
```

Write operations are classified as T1 (prepare). In cautious mode, they're allowed but fully audited in the evidence ledger.

### Check the audit trail

Use the built-in `sint__audit` tool to see what happened:

```bash
curl -s -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "sint__audit",
      "arguments": { "limit": 5 }
    }
  }' | jq '.result.content[0].text' -r | jq .
```

Every tool call — allowed or denied — is recorded in a SHA-256 hash-chained evidence ledger. Each entry links to the previous one, making the audit trail tamper-evident.

## 6. Policy Enforcement in Action

The notes server config has `maxTier: "T2_act"`. If SINT classifies a tool call above that tier, the call is denied before it reaches the server. To see this in strict mode, you could change the config to `maxTier: "T1_prepare"` and restart — then `updateNote` would be denied while `listNotes` and `createNote` still work.

You can also add `"requireApproval": true` to the policy block. This forces human approval for all non-observe operations:

```json
{
  "servers": {
    "notes": {
      "command": "npx",
      "args": ["tsx", "./examples/notes-server/server.ts"],
      "policy": {
        "maxTier": "T2_act",
        "requireApproval": true
      }
    }
  }
}
```

With this config, `createNote` and `updateNote` will be held in the approval queue until someone explicitly approves them via `sint__approve`.

## 7. What's Happening Under the Hood

```
Client (curl)
  |
  v
SINT MCP Proxy (port 3200)
  |-- receives "notes__createNote"
  |-- parses namespace: server="notes", tool="createNote"
  |-- builds SintRequest with resource URI: mcp://notes/createNote
  |-- PolicyGateway.intercept() → classifies tier, checks constraints
  |-- checks per-server policy (maxTier, requireApproval)
  |-- if allowed: forwards to notes-server via stdio
  |-- records decision in evidence ledger (hash-chained)
  |-- returns result to client
  v
Notes Server (stdio child process)
```

Every tool call follows this path. There's no way to bypass the gateway — the client talks to the proxy, and only the proxy talks to the downstream server. That's the single-choke-point guarantee.

## Next Steps

- **Add the dashboard**: Run `pnpm --filter @sint/dashboard dev` to get a real-time web UI for managing approvals
- **Try forbidden combos**: Add a tool that reads credentials and another that makes HTTP requests — SINT will detect the dangerous sequence
- **Add capability tokens**: Issue scoped tokens that restrict which tools an agent can call (see the [Hello World tutorial](./hello-world-agent.md))
- **Try strict mode**: Set `defaultPolicy: "strict"` to see how SINT behaves when it defaults to deny
