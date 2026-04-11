# OpenAI Agents SDK Governance Integration

This guide shows how to connect OpenAI Agents SDK tool execution to SINT runtime governance.

## What this adds

- pre-tool-call authorization via `POST /v1/intercept`
- typed runtime outcomes for agents code:
  - `SintDeniedError`
  - `SintApprovalRequiredError`
  - `SintApprovalTimeoutError`
  - `SintApprovalDeniedError`
- suspend/resume approval handling for T2/T3 actions
- request-scoped evidence retrieval for audits

## Install

```bash
cd sdks/python
pip install -e ".[dev]"
```

## Minimal adapter usage

```python
from sint import (
    GatewayClient,
    GatewayConfig,
    OpenAIAgentsGovernanceAdapter,
    SintRequest,
    ApprovalResolution,
)

client = GatewayClient(GatewayConfig(base_url="http://localhost:3100", token="dev-local-key"))
adapter = OpenAIAgentsGovernanceAdapter(client)
```

Use the adapter in your tool wrapper:

```python
decision = await adapter.authorize_tool_call(
    request,
    on_escalation=resolver,      # optional async callback for human approval
    approval_timeout_s=30.0,     # fail-closed timeout path
)
```

## Fail-closed default policy template

Use `docs/profiles/openai-agents-fail-closed.policy.template.json` as a starting profile.

Key guardrails:

- irreversible tools -> `T3_commit` + explicit human approval
- physical-state changes -> `T2_act` + escalation
- timeouts resolve to deny (never fail-open)
- token subject bound to runtime agent identity

## End-to-end example

See `sdks/python/examples/openai_agents_governance_flow.py`.

Flow:

1. create `SintRequest`
2. intercept with `OpenAIAgentsGovernanceAdapter`
3. resolve escalation via callback or external operator
4. execute tool only after permit
5. query evidence events for request ID

## Migration notes

- Existing OpenAI Agents tool functions can adopt SINT by wrapping execution with `authorize_tool_call`.
- Do not mutate existing tool signatures first; add a central wrapper and migrate tool-by-tool.
- Keep fallback behavior deny-by-default until each tool has explicit tier/resource mapping.
- Rollback path: disable wrapper for a single tool while leaving SINT enabled for others.

## Troubleshooting

- `TOKEN_NOT_FOUND`: token ID is unknown to gateway token store.
- `TOKEN_SUBJECT_MISMATCH`: token subject differs from request `agentId`.
- `INSUFFICIENT_PERMISSIONS`: resource/action mismatch with token scope.
- `Stale approval request` on resolve: token revoked/expired or approval request timed out.
