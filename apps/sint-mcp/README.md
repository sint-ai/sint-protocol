# sint-mcp

**Security-first MCP proxy server.** Connects to any number of downstream MCP servers and enforces SINT capability-token policy on every tool call before it reaches the real tool. Provides human-in-the-loop approval for high-consequence actions, a hash-chained audit ledger, and operator interface controls — all through the MCP protocol.

## How it works

```
AI Agent (Claude, AutoGen, etc.)
       │  MCP protocol
  ┌────▼──────────────────────────────────┐
  │  sint-mcp                             │
  │  ─ capability token validation        │
  │  ─ tier assignment (T0→T3)            │
  │  ─ forbidden combo detection          │
  │  ─ human approval queue (T2/T3)       │
  │  ─ hash-chained evidence ledger       │
  └────┬──────────────────────────────────┘
       │  forwards allowed calls
  ┌────▼──────┐  ┌────────────┐  ┌───────────┐
  │ filesystem│  │   github   │  │ your-tool │
  └───────────┘  └────────────┘  └───────────┘
```

Every downstream tool is exposed to the agent as `serverName__toolName` (e.g. `filesystem__readFile`, `github__create_issue`). The agent sees one flat tool list; every call is policy-enforced before reaching any real tool.

## Quick start

```bash
# stdio (Claude Desktop, Claude Code, etc.)
npx @sint/mcp

# Streamable HTTP
npx @sint/mcp --http --port 3200
```

Configure with a `sint-mcp.config.json` in your working directory:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "policy": { "maxTier": "T1_prepare" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "policy": { "maxTier": "T2_act" }
    }
  },
  "defaultPolicy": "cautious",
  "approvalTimeoutMs": 120000
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "sint": {
      "command": "npx",
      "args": ["-y", "@pshkv/mcp", "--config", "/path/to/sint-mcp.config.json"]
    }
  }
}
```

## Configuration

All options can be set via config file, environment variable, or CLI flag. Priority: CLI > env > file > defaults.

| Option | CLI | Env | Default | Description |
|---|---|---|---|---|
| `servers` | — | — | `{}` | Downstream server configs (see below) |
| `defaultPolicy` | `--policy` | `SINT_MCP_POLICY` | `cautious` | `permissive` \| `cautious` \| `strict` |
| `approvalTimeoutMs` | `--timeout` | `SINT_MCP_APPROVAL_TIMEOUT` | `120000` | How long to wait for human approval |
| `transport` | `--stdio` / `--http` | `SINT_MCP_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `port` | `--port` | `SINT_MCP_PORT` | `3200` | HTTP port (http transport only) |
| `agentPrivateKey` | — | `SINT_AGENT_PRIVATE_KEY` | auto-generated | Agent Ed25519 private key (hex) |

### Per-server policy

Each entry in `servers` accepts:

```json
{
  "command": "npx",
  "args": ["-y", "some-mcp-server"],
  "env": { "API_KEY": "..." },
  "policy": {
    "maxTier": "T1_prepare",
    "requireApproval": false
  }
}
```

| Field | Description |
|---|---|
| `command` | Executable to spawn (stdio transport) |
| `args` | Arguments for the command |
| `url` | SSE URL (alternative to `command`) |
| `env` | Environment variables for the spawned process |
| `policy.maxTier` | Ceiling tier for this server's tools: `T0_observe` \| `T1_prepare` \| `T2_act` \| `T3_commit` |
| `policy.requireApproval` | Force human approval for all non-observe calls on this server |

## Approval tiers

| Tier | Auto-approved | When triggered |
|---|---|---|
| T0 (observe) | Yes | Read-only queries, sensors |
| T1 (prepare) | Yes | Low-impact writes (save file, set waypoint) |
| T2 (act) | No — operator | Physical state change, create/modify resources |
| T3 (commit) | No — human | Irreversible actions (exec code, transfer funds) |

When a call is escalated, the agent receives a `sint__approve` instruction. Use `sint__approve <requestId>` to unblock it or `sint__deny <requestId>` to reject it.

## Built-in tools

All built-in tools are prefixed with `sint__` and bypass downstream policy (they are operator-facing).

### System

| Tool | Description |
|---|---|
| `sint__status` | System health: servers, tools, pending approvals, ledger size |
| `sint__servers` | List downstream servers with connection status and tool counts |
| `sint__whoami` | Current agent identity: public key, token ID, role |

### Approvals

| Tool | Description |
|---|---|
| `sint__pending` | List all pending approval requests |
| `sint__approve` | Approve a pending request by ID |
| `sint__deny` | Deny a pending request with optional reason |

### Audit

| Tool | Description |
|---|---|
| `sint__audit` | Query the evidence ledger (last N events) |

### Token management

| Tool | Description |
|---|---|
| `sint__issue_token` | Issue an attenuated capability token with restricted scope |
| `sint__revoke_token` | Revoke an active token by ID |

### Multi-agent delegation

| Tool | Description |
|---|---|
| `sint__delegate_to_agent` | Issue an attenuated token to a sub-agent (max depth 3) |
| `sint__list_delegations` | Show the full delegation tree from the current operator token |
| `sint__revoke_delegation_tree` | Cascade-revoke an entire delegation subtree |

### Operator interface

| Tool | Description |
|---|---|
| `sint__interface_status` | Current interface state: mode, HUD panels, session ID |
| `sint__speak` | Schedule TTS voice output with priority (low / normal / urgent) |
| `sint__show_hud` | Update a HUD panel (approvals / audit / context / memory) |
| `sint__notify` | Send a proactive notification with an optional action button |
| `sint__store_memory` | Store an entry in the operator memory bank |
| `sint__recall_memory` | Search the memory bank by query string |
| `sint__interface_mode` | Switch display mode: hud / compact / voice-only / silent |

### Server management

| Tool | Description |
|---|---|
| `sint__add_server` | Add a downstream server at runtime |
| `sint__remove_server` | Remove a downstream server by name |

## MCP Resources

sint-mcp exposes read-only resources for browsing protocol state:

| URI | Description |
|---|---|
| `sint://ledger/recent` | Last 50 evidence ledger events |
| `sint://tokens/active` | All active capability tokens |
| `sint://approvals/pending` | Currently pending approval requests |
| `sint://servers/list` | Connected downstream servers |
| `sint://policy/decisions` | Recent policy decisions |
| `sint://ledger/event/{eventId}` | Single event detail |
| `sint://tokens/{tokenId}` | Single token detail |

## Trajectory recording

Every tool call, policy decision, escalation, and result is recorded to a structured JSON file in `.sint/trajectories/`. Set `SINT_TRAJECTORY_DIR` to change the output directory. Trajectories are flushed on clean shutdown (SIGINT/SIGTERM) and can be replayed for audit or debugging.

## Security model

- **Capability tokens** — Ed25519-signed, scope-limited tokens gate every call. Delegation can only narrow scope (attenuation invariant).
- **Hash-chained ledger** — Every event is SHA-256 chained. The chain is verified by the CSML metric. Tampering is detectable.
- **Tier enforcement** — T2/T3 actions require explicit operator or human approval. Timeouts fail closed (deny, not allow).
- **Forbidden combo detection** — Sequences of calls matching dangerous patterns (e.g. file-read → exec) are blocked at the policy layer.
- **Per-server ceilings** — `maxTier` hard-caps what any tool on a given server can reach, independent of the agent's token scope.

## Environment variables

| Variable | Description |
|---|---|
| `SINT_MCP_CONFIG` | Path to config file |
| `SINT_MCP_POLICY` | Default policy (`permissive` / `cautious` / `strict`) |
| `SINT_MCP_TRANSPORT` | Transport mode (`stdio` / `http`) |
| `SINT_MCP_PORT` | HTTP port |
| `SINT_MCP_APPROVAL_TIMEOUT` | Approval timeout in ms |
| `SINT_AGENT_PRIVATE_KEY` | Agent Ed25519 private key (hex) — auto-generated if unset |
| `SINT_SESSION_ID` | Session ID for the interface state manager |
| `SINT_TRAJECTORY_DIR` | Directory for trajectory files (default: `.sint/trajectories`) |
| `PAPERCLIP_RUN_ID` | Run ID for trajectory records |
| `PAPERCLIP_AGENT_ID` | Agent ID for trajectory records |
| `PAPERCLIP_TASK_ID` | Task ID for trajectory records |
