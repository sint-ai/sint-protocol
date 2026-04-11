# SINT Protocol Python SDK

Python SDK for the [SINT Protocol](https://github.com/pshkv/sint-protocol) — the security enforcement layer for physical AI.

Every agent action — tool call, ROS 2 topic, actuator command — flows through the SINT Policy Gateway for authorization, constraint enforcement, and audit. This SDK provides:

- **Pydantic models** mirroring the TypeScript types (`SintRequest`, `PolicyDecision`, `LedgerEvent`, `ApprovalTier`)
- **`GatewayClient`** — async httpx-based client for the Policy Gateway REST API
- **`CapabilityToken` builder** — constructs token requests; gateway performs Ed25519 signing
- **`sint-scan` CLI** — Python port of the MCP scanner, classifies tool risk tiers

## Installation

```bash
pip install sint-protocol
```

Or from source:

```bash
cd sdks/python
pip install -e ".[dev]"
```

**Requirements**: Python 3.10+, `httpx>=0.27`, `pydantic>=2.0`, `cryptography>=42.0`

## Quickstart

### GatewayClient

```python
import asyncio
from sint import GatewayClient, GatewayConfig, SintRequest, ApprovalTier

async def main():
    config = GatewayConfig(
        base_url="http://localhost:3000",
        token="my-api-key",   # optional
        max_retries=2,
        retry_backoff_ms=150,
    )

    async with GatewayClient(config) as client:
        # Liveness check
        health = await client.health()
        print(health)

        # Evaluate a request
        request = SintRequest(
            request_id="01905f7c-0000-7000-8000-000000000001",
            timestamp="2026-04-04T12:00:00.000000Z",
            agent_id="a1b2c3" + "0" * 58,
            token_id="01905f7c-0000-7000-8000-000000000002",
            resource="mcp://filesystem/readFile",
            action="call",
            params={"path": "/tmp/data.json"},
        )
        decision = await client.intercept(request)
        if decision.allowed:
            print(f"Allowed — tier: {decision.assigned_tier}")
        elif decision.denied:
            print(f"Denied — {decision.denial.reason}")
        elif decision.needs_escalation:
            print(f"Escalated — awaiting approval at {decision.escalation.required_tier}")

        # Retrieve audit log
        events = await client.get_ledger_events(limit=10)
        for evt in events:
            print(f"{evt.event_type}  seq={evt.sequence_number}")

asyncio.run(main())
```

### Capability Token Request

```python
from sint.tokens import build_token_request, PhysicalConstraints

req = build_token_request(
    issuer="<root-ed25519-pubkey-hex>",
    subject="<agent-ed25519-pubkey-hex>",
    resource="ros2:///cmd_vel",
    actions=["publish"],
    expires_in_hours=8,
    constraints=PhysicalConstraints(max_velocity_mps=0.5, max_force_newtons=50),
)

# POST the request to the gateway — it signs with the root Ed25519 key
async with GatewayClient(config) as client:
    token = await client.issue_token(req.to_dict())
    print(token["tokenId"])
```

### OpenAI Agents SDK Governance Adapter

`OpenAIAgentsGovernanceAdapter` wraps tool calls with SINT runtime checks.

```python
from sint import (
    GatewayClient, GatewayConfig, OpenAIAgentsGovernanceAdapter,
    ApprovalResolution, SintRequest
)

async with GatewayClient(GatewayConfig(base_url="http://localhost:3100")) as client:
    adapter = OpenAIAgentsGovernanceAdapter(client)

    async def resolver(request: SintRequest, decision):
        # Hook this into your operator UI / pager workflow.
        return ApprovalResolution(status="approved", by="operator@example.com")

    decision = await adapter.authorize_tool_call(
        request=my_request,
        on_escalation=resolver,   # optional
        approval_timeout_s=30.0,  # fail-closed timeout
    )
```

Typed outcomes:
- `SintDeniedError`
- `SintApprovalRequiredError`
- `SintApprovalTimeoutError`
- `SintApprovalDeniedError`

### sint-scan CLI

Classify MCP tools into SINT approval tiers (mirrors `@sint/bridge-mcp` logic):

```bash
# Scan individual tools
sint-scan --server filesystem readFile writeFile deleteFile bash

# JSON output (useful in CI)
sint-scan --server myserver --json tool1 tool2

# Fail the pipeline if any HIGH-risk tool is found
sint-scan --server myserver --fail-on HIGH tool1 tool2

# Scan from a JSON file (array of {name, description?, annotations?})
sint-scan --file tools.json
```

**Exit codes**:
- `0` — No HIGH or CRITICAL tools
- `1` — At least one HIGH-risk tool found
- `2` — At least one CRITICAL-risk tool found

**Example output**:
```
SINT MCP Scanner — filesystem
  4 tool(s) scanned

  [LOW]      filesystem/readFile    T0_observe  — read-only keyword: 'read'
  [MEDIUM]   filesystem/writeFile   T1_prepare  — write keyword: 'write'
  [HIGH]     filesystem/deleteFile  T2_act      — high-risk keyword: 'delete'
  [CRITICAL] filesystem/bash        T3_commit   — shell/exec keyword in tool name: 'bash'

  Summary: 1 CRITICAL  1 HIGH  1 MEDIUM  1 LOW
```

### Programmatic scanner

```python
from sint.scanner import scan_tool, scan_server, MCPToolAnnotations
from sint.types import ApprovalTier

# Single tool
result = scan_tool("filesystem", "bash", "Run a bash command")
print(result.tier)        # ApprovalTier.T3_COMMIT
print(result.risk_label)  # CRITICAL

# With MCP annotations (spec §tool-annotations)
ann = MCPToolAnnotations(read_only_hint=True)
result = scan_tool("myserver", "bash", "", annotations=ann)
print(result.tier)        # ApprovalTier.T0_OBSERVE (annotation overrides keyword)

# Full server scan
report = scan_server("filesystem", [
    {"name": "readFile",   "description": "Read a file"},
    {"name": "deleteFile", "description": "Delete a file"},
    {"name": "bash",       "description": "Execute bash"},
])
print(report.by_risk)
# {'LOW': 1, 'MEDIUM': 0, 'HIGH': 1, 'CRITICAL': 1}
print(report.suggested_exit_code())  # 2
```

## Approval Tiers

| Tier | Value | Risk Label | Auto-approved? | When |
|------|-------|------------|----------------|------|
| `T0_OBSERVE` | `T0_observe` | LOW | Yes | Read-only (sensors, queries) |
| `T1_PREPARE` | `T1_prepare` | MEDIUM | Yes + audit | Low-impact writes |
| `T2_ACT` | `T2_act` | HIGH | No — escalate | Physical state change |
| `T3_COMMIT` | `T3_commit` | CRITICAL | No — human | Irreversible / exec |

## Architecture Notes

- **Ed25519 signing** is performed exclusively by the gateway. The SDK constructs token request payloads; never holds private keys.
- **`SintRequest.to_gateway_dict()`** serialises to camelCase matching the gateway REST schema.
- **`LedgerEvent.sequence_number`** is a `str` (not `int`) because JavaScript `BigInt` values arrive as JSON strings.
- The legacy `sint_client.py` (stdlib-only, no dependencies) remains available at `sdks/python/sint_client.py` for minimal environments.

## Running Tests

```bash
cd sdks/python
pip install -e ".[dev]"
pytest tests/ -v
```

## Examples

- Warehouse AMR flow: [`examples/warehouse_amr_flow.py`](examples/warehouse_amr_flow.py)
- OpenAI Agents governance flow: [`examples/openai_agents_governance_flow.py`](examples/openai_agents_governance_flow.py)
