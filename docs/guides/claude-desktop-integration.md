# Claude Desktop + SINT: Adding Authorization to MCP Tool Calls

> **What this does in one sentence:** SINT acts as a proxy between Claude Desktop and any MCP server, adding capability tokens, T0–T3 tier enforcement, and tamper-evident audit logging to every tool call.

---

## The Problem

Claude Desktop connects to MCP servers directly:

```
Claude Desktop → MCP Server → tool executed
```

There is no check on what Claude is allowed to call. No record of what happened. No way to block `run_terminal_cmd` while allowing `read_file`. If a prompt injection redirects Claude toward a destructive tool, nothing stops it.

---

## The SINT Solution

SINT inserts a PolicyGateway between Claude Desktop and any MCP server:

```
Claude Desktop → SINT PolicyGateway → MCP Server → tool executed
                        ↓
                 EvidenceLedger (hash-chained audit log)
```

Every tool call is evaluated against:
1. A **signed capability token** (Ed25519, scoped to specific tools and servers)
2. **Approval tiers** (T0=observe, T1=prepare, T2=act, T3=commit)
3. **Rate limits** (per-token sliding window)
4. **OWASP ASI Top-10** threat mitigations

T0/T1 tools auto-approve and log. T2 tools require escalation. T3 tools (shell execution, eval) require a human approval in the SINT dashboard before Claude receives a response.

---

## Prerequisites

- **Claude Desktop** installed (macOS or Windows)
- **Node.js 18+** (`node --version`)
- Either:
  - The `sint-protocol` repo cloned: `git clone https://github.com/sint-ai/sint-protocol`
  - Or `npx` access to `@sint/mcp-scanner` (no install required for scanning)

---

## Step 1: Scan Your Current MCP Server Tools

Before adding SINT, scan your existing MCP server to see what tier each tool will be assigned.

```bash
npx sint-scan --server filesystem --tools '[
  {"name":"read_file","description":"reads a file"},
  {"name":"write_file","description":"writes a file"},
  {"name":"run_terminal_cmd","description":"runs shell commands"}
]'
```

Example output:

```
SINT Tool Scan — filesystem
────────────────────────────────────────────────
  read_file          T0_OBSERVE   LOW       ✓ auto-approve
  write_file         T1_PREPARE   MEDIUM    ✓ auto-approve
  run_terminal_cmd   T3_COMMIT    CRITICAL  ✗ human approval required
────────────────────────────────────────────────
Summary: 2 auto-approved, 0 escalated, 1 CRITICAL (requires human approval)

CRITICAL tools will be blocked until a human approves each call in the SINT
dashboard. HIGH tools trigger escalation and will time out if not approved
within the configured window.
```

**What the severity ratings mean:**

| Rating | Tier | What happens |
|--------|------|--------------|
| LOW | T0_OBSERVE | Auto-approved and logged |
| MEDIUM | T1_PREPARE | Auto-approved and logged |
| HIGH | T2_ACT | Escalation required — pauses until approved or times out |
| CRITICAL | T3_COMMIT | Human approval required in the SINT dashboard — hard block |

---

## Step 2: Add SINT Proxy to `claude_desktop_config.json`

Claude Desktop's MCP configuration lives at:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Before — no authorization layer

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"]
    }
  }
}
```

### After — SINT PolicyGateway as proxy

```json
{
  "mcpServers": {
    "sint-filesystem": {
      "command": "node",
      "args": ["/path/to/sint-protocol/apps/sint-mcp/dist/index.js"],
      "env": {
        "SINT_UPSTREAM_COMMAND": "npx",
        "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /path/to/files",
        "SINT_MAX_TIER": "T2_ACT",
        "SINT_REQUIRE_APPROVAL_TIER": "T3_COMMIT"
      }
    }
  }
}
```

Replace `/path/to/sint-protocol` with the absolute path to your cloned repo (e.g., `/Users/yourname/sint-protocol`). Replace `/path/to/files` with the directory you want Claude to access.

Build the proxy binary first if you have not already:

```bash
cd /path/to/sint-protocol
pnpm install
pnpm run build
```

Restart Claude Desktop after editing the config. The server name changes from `filesystem` to `sint-filesystem` — update any existing prompts or workflows that reference the old name.

---

## Step 3: Configure Policy

### Environment variables

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `SINT_MAX_TIER` | `T1_PREPARE` | The highest tier Claude can reach without escalation. Calls above this tier are escalated or blocked. |
| `SINT_REQUIRE_APPROVAL_TIER` | `T3_COMMIT` | Calls at or above this tier are hard-blocked until a human approves in the dashboard. |
| `SINT_TOKEN_TTL_HOURS` | `8` | How long the auto-issued session token is valid. |
| `SINT_RATE_LIMIT_MAX_CALLS` | `200` | Max tool calls per token per hour. |
| `SINT_DASHBOARD_URL` | `http://localhost:4000` | Where approval requests are sent. |

### Recommended configurations

**Read-only Claude** — Claude can read files, search, list directories. No writes.

```json
"env": {
  "SINT_UPSTREAM_COMMAND": "npx",
  "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /path/to/files",
  "SINT_MAX_TIER": "T0_OBSERVE",
  "SINT_REQUIRE_APPROVAL_TIER": "T1_PREPARE"
}
```

**Read-write Claude, no shell** — Claude can read and write files, but shell execution is blocked entirely.

```json
"env": {
  "SINT_UPSTREAM_COMMAND": "npx",
  "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /path/to/files",
  "SINT_MAX_TIER": "T2_ACT",
  "SINT_REQUIRE_APPROVAL_TIER": "T3_COMMIT"
}
```

**Full access with human-in-the-loop for destructive calls** — All tiers reachable, but T3 calls pause for approval.

```json
"env": {
  "SINT_UPSTREAM_COMMAND": "npx",
  "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /path/to/files",
  "SINT_MAX_TIER": "T3_COMMIT",
  "SINT_REQUIRE_APPROVAL_TIER": "T3_COMMIT"
}
```

---

## What Happens at Runtime

When Claude calls a tool through the SINT proxy:

1. **SINT receives the call** and maps it to a resource URI (e.g., `mcp://filesystem/read_file`).
2. **Tier is assigned** based on the resource URI and tool name — not the tool description, which prevents prompt injection from inflating the tier.
3. **Token is validated** — scope, expiry, and rate limit are checked.
4. **Decision is made:**
   - `T0_OBSERVE` / `T1_PREPARE` → forwarded to the upstream MCP server immediately, logged.
   - `T2_ACT` → escalated. If no approval arrives within the timeout, falls back to deny.
   - `T3_COMMIT` → hard block. Claude receives an error response until a human approves in the dashboard.
5. **Every call is appended to the EvidenceLedger** — SHA-256 hash-chained, append-only, tamper-evident.

Claude does not know whether SINT approved, escalated, or blocked a call until it gets a response. From Claude's perspective, `T3_COMMIT` tools simply return an error until a human grants approval.

---

## Viewing the Audit Log

Every tool call — approved, denied, or escalated — is recorded in the SINT EvidenceLedger and viewable in the dashboard.

```bash
# Start the dashboard (runs at http://localhost:4000)
pnpm --filter @sint/dashboard dev
```

The dashboard shows:
- Live feed of tool calls with tier, outcome, and arguments
- Pending approval queue for T3_COMMIT calls
- Per-session audit trail with hash chain verification
- Rate limit usage per token

Alternatively, query the ledger directly from the gateway server:

```bash
# Gateway server exposes a REST API at port 3000
pnpm --filter @sint/gateway-server dev

# Fetch recent events
curl http://localhost:3000/api/ledger/events?limit=50
```

---

## Tier Reference for Common Claude Desktop MCP Tools

| Tool | Server | Tier | Why |
|------|--------|------|-----|
| `read_file` | filesystem | T0_OBSERVE LOW | Read-only, no side effects |
| `list_directory` | filesystem | T0_OBSERVE LOW | Read-only, no side effects |
| `get_file_info` | filesystem | T0_OBSERVE LOW | Metadata read only |
| `write_file` | filesystem | T1_PREPARE MEDIUM | Idempotent write, reversible |
| `create_directory` | filesystem | T1_PREPARE MEDIUM | Idempotent write, reversible |
| `delete_file` | filesystem | T2_ACT HIGH | Destructive, hard to reverse |
| `move_file` | filesystem | T2_ACT HIGH | Destructive, alters filesystem state |
| `run_terminal_cmd` | desktop-commander | T3_COMMIT CRITICAL | Arbitrary shell execution |
| `bash` | various | T3_COMMIT CRITICAL | Arbitrary shell execution |
| `web_search` | brave / exa | T0_OBSERVE LOW | Read-only external request |
| `fetch` / `http_request` | various | T1_PREPARE MEDIUM | Outbound network write |
| `execute_code` | various | T3_COMMIT CRITICAL | Code execution |

These tier assignments are enforced by resource URI pattern, not by the tool description text. A tool named `safe_helper` that maps to `mcp://exec/*` will still receive T3_COMMIT.

---

## Multiple MCP Servers

You can wrap multiple MCP servers at once — each gets its own SINT proxy entry with its own tier policy:

```json
{
  "mcpServers": {
    "sint-filesystem": {
      "command": "node",
      "args": ["/path/to/sint-protocol/apps/sint-mcp/dist/index.js"],
      "env": {
        "SINT_UPSTREAM_COMMAND": "npx",
        "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /path/to/files",
        "SINT_MAX_TIER": "T2_ACT",
        "SINT_REQUIRE_APPROVAL_TIER": "T3_COMMIT"
      }
    },
    "sint-brave-search": {
      "command": "node",
      "args": ["/path/to/sint-protocol/apps/sint-mcp/dist/index.js"],
      "env": {
        "SINT_UPSTREAM_COMMAND": "npx",
        "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-brave-search",
        "SINT_MAX_TIER": "T0_OBSERVE",
        "SINT_REQUIRE_APPROVAL_TIER": "T1_PREPARE",
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Each upstream server is isolated — a capability token issued for `mcp://filesystem/*` cannot be used to call `mcp://brave-search/*`. This prevents cross-server scope confusion (OWASP ASI04).

---

## Scanning Other MCP Servers

Use `sint-scan` on any MCP server's tool manifest before deploying:

```bash
# Scan from a JSON file
npx sint-scan --server desktop-commander --tools-file ./tools.json

# Scan from a running MCP server (reads the tools/list endpoint)
npx sint-scan --server-url http://localhost:3001 --format table

# Output as JSON for CI integration
npx sint-scan --server filesystem --tools '[...]' --format json | jq '.critical'
```

If any tool comes back as T3_COMMIT CRITICAL and you are not expecting it, investigate before deploying. Common surprises: MCP servers that expose a generic `execute` or `eval` tool alongside safe read tools.

---

## Resources

- GitHub: [sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)
- [Full SINT v0.2 spec](../SINT_v0.2_SPEC.md)
- [Secure MCP Deployments guide](./secure-mcp-deployments.md) — programmatic integration (non-Claude Desktop)
- [Conformance certification matrix](../CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
- `npx sint-scan --help` — scan any MCP server for tier assignments
