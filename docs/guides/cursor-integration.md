# Cursor + SINT MCP Proxy Guide

This guide shows how to place SINT in front of any Cursor MCP server so tool calls are tiered, approval-gated, and written to the evidence ledger.

## 1) Build SINT

```bash
cd /path/to/sint-protocol
pnpm install
pnpm run build
```

## 2) Scan MCP tools first (recommended)

```bash
npx @pshkv/mcp-scanner --server filesystem --tools '[
  {"name":"read_file","description":"reads files"},
  {"name":"write_file","description":"writes files"},
  {"name":"run_terminal_cmd","description":"runs shell commands"}
]'
```

Use the report to set strict `SINT_MAX_TIER` and `SINT_REQUIRE_APPROVAL_TIER` values.

## 3) Configure Cursor MCP with SINT proxy

In your Cursor MCP config (project-level or global), add an MCP server entry that points Cursor to `apps/sint-mcp/dist/index.js`, then configure the real upstream MCP server via env vars.

```json
{
  "mcpServers": {
    "sint-filesystem": {
      "command": "node",
      "args": ["/absolute/path/to/sint-protocol/apps/sint-mcp/dist/index.js"],
      "env": {
        "SINT_UPSTREAM_COMMAND": "npx",
        "SINT_UPSTREAM_ARGS": "-y @modelcontextprotocol/server-filesystem /absolute/path/to/workspace",
        "SINT_MAX_TIER": "T2_ACT",
        "SINT_REQUIRE_APPROVAL_TIER": "T3_COMMIT",
        "SINT_API_KEY": "replace-with-strong-key"
      }
    }
  }
}
```

## 4) Start gateway + dashboard

```bash
pnpm stack:dev
```

Endpoints:
- Gateway: `http://localhost:3100`
- Dashboard: `http://localhost:3201`

## 5) Verify approval + evidence flow

1. Trigger a low-risk tool call from Cursor and verify auto-approval.
2. Trigger a T3 command and confirm it appears in pending approvals.
3. Approve/deny in dashboard and verify ledger events.

You can also inspect the ledger directly:

```bash
curl http://localhost:3100/v1/ledger/query?limit=20
```

## Recommended Policy Profiles

- Read-only coding assistant:
  - `SINT_MAX_TIER=T0_OBSERVE`
  - `SINT_REQUIRE_APPROVAL_TIER=T1_PREPARE`
- Normal coding assistant (writes allowed, no shell):
  - `SINT_MAX_TIER=T2_ACT`
  - `SINT_REQUIRE_APPROVAL_TIER=T3_COMMIT`
- Full-access with human-in-the-loop:
  - `SINT_MAX_TIER=T3_COMMIT`
  - `SINT_REQUIRE_APPROVAL_TIER=T3_COMMIT`

## Related Guides

- `docs/guides/claude-desktop-integration.md`
- `docs/guides/websocket-approvals.md`
- `docs/guides/docker-deployment.md`
