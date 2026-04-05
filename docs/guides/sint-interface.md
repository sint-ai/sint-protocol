# SINT Operator Interface — Setup & Usage Guide

The SINT Operator Interface is a voice-first, HUD-based control surface for SINT Protocol. Every voice command, memory write, and HUD update flows through the Policy Gateway — the same single choke point that governs all agent actions.

## Quick Start

```bash
# Start the full interface stack
pnpm run stack:interface
# Opens: http://localhost:3202
```

Or run directly (no Docker):
```bash
cd apps/sint-interface
pnpm run dev
# Requires gateway running on :3100
```

## Interface Modes

| Mode | Description | When to use |
|------|-------------|-------------|
| `hud` | Full-screen three-panel HUD | Primary operator control |
| `compact` | Small overlay for split-screen | Monitoring alongside other tools |
| `voice-only` | Voice feedback only, minimal UI | Eyes-free operation |
| `silent` | No TTS, text only | Quiet environments |

## Voice Commands

The SINT Operator Interface uses your browser's Web Speech API (Chrome, Edge, Safari). No external service required.

Example commands:
- **"show pending approvals"** — reads out count of pending T2/T3 requests
- **"status"** — reports gateway health and current circuit breaker state
- **"approve cmd_vel"** — approves pending approvals matching that resource
- **"deny all"** — denies all pending approvals
- Any other command is relayed to the AI agent via `sint__speak`

## HUD Panels

### Status Bar (top)
- Agent DID: the Ed25519 public key of the connected agent (truncated)
- Tier badge: highest active tier in the last 60 seconds
- Circuit Breaker: ○ CLOSED (normal) / ● OPEN (blocked) / ◑ HALF_OPEN (recovering)
- Live clock

### Approvals Panel (left)
Pending T2 (async review) and T3 (synchronous sign-off) requests awaiting your decision.
- Each card shows: resource, action, tier, agent, timeout countdown
- ✓ Approve sends `POST /v1/approvals/{id}/resolve { action: "approve" }`
- ✗ Deny sends `POST /v1/approvals/{id}/resolve { action: "deny" }`

### Action Stream (center)
Real-time feed from the PolicyGateway WebSocket (`/v1/approvals/ws`).
Color coding:
- Gray: T0 auto-allow (read-only)
- Blue: T1 auto-allow (audited write)
- Yellow: T2 escalated (pending human review)
- Orange: T3 escalated (requires sign-off)
- Red: Denied (policy violation)
- Orange pulse: APPROVAL_REQUIRED (active escalation)

### Context Panel (right)
- **Token scope**: tools and resources the current agent is authorized for
- **Recent memory**: last 3 items recalled from `@sint/memory`
- **Call rate**: tool calls per minute vs `maxCallsPerMinute` limit

### Voice Bar (bottom)
- Mic button: toggle listening (Web Speech API)
- Interim transcript: live speech-to-text preview
- Last command: most recently finalized command
- TTS status: shows "Speaking..." when gateway is responding via `sint__speak`

## Operator Interface Tools

The following MCP tools are available to AI agents connected via `apps/sint-mcp`. All route through the Policy Gateway:

| Tool | Tier | Description |
|------|------|-------------|
| `sint__interface_status` | T0 | Read current interface state |
| `sint__recall_memory` | T0 | Search operator memory |
| `sint__speak` | T1 | TTS output to operator |
| `sint__show_hud` | T1 | Update HUD panel content |
| `sint__store_memory` | T1 | Store to memory bank |
| `sint__notify` | T2 | Send proactive notification |
| `sint__interface_mode` | T2 | Change interface mode |

## Memory System

The SINT Operator Interface includes persistent memory backed by the Evidence Ledger:

```typescript
// Store (via MCP tool or direct SDK call)
await sint.mcp.call("sint__store_memory", {
  key: "velocity_preference",
  value: "Approve T2 commands under 0.5m/s automatically",
  persist: true  // writes to EvidenceLedger
});

// Recall
const results = await sint.mcp.call("sint__recall_memory", {
  query: "velocity"
});
```

Memory writes are EvidenceLedger events of type `operator.memory.stored` — tamper-evident, auditable, and retained per tier retention policy.

## Docker Deployment

```yaml
# docker-compose.yml
sint-interface:
  image: sint-interface:latest
  ports: ["3202:3202"]
  environment:
    VITE_GATEWAY_URL: http://gateway:3100
  depends_on: [gateway]
```

Environment variables:
- `VITE_GATEWAY_URL`: URL of the SINT Gateway server (default: proxy to localhost:3100)

## Security

- **No ambient authority**: interface tools require valid capability tokens
- **All actions audited**: every voice command that triggers a tool call produces a LedgerEvent
- **T2 for proactive push**: `sint__notify` is T2 (requires confirmation) to prevent rogue agents from spamming operators
- **API key**: stored in localStorage, never sent to non-gateway origins
