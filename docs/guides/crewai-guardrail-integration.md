# CrewAI GuardrailProvider Integration

This guide shows how to plug SINT into CrewAI-style pre-tool guardrails.

## Scope

- map gateway outcomes to `allow | deny | escalate`
- add async escalation callback bridge
- enforce default-deny timeout for unresolved high-risk approvals
- handle stale approvals fail-closed

## Python adapter

Use `CrewAIGuardrailProviderCompat` from the SINT Python SDK.

```python
from sint import CrewAIGuardrailProviderCompat, GatewayClient, GatewayConfig

async with GatewayClient(GatewayConfig(base_url="http://localhost:3100")) as client:
    guardrail = CrewAIGuardrailProviderCompat(client)
```

Then run pre-tool checks:

```python
decision = await guardrail.pre_tool_call(
    request,
    on_escalation=resolver,    # optional callback
    approval_timeout_s=30.0,   # fail-closed timeout
)
```

Decision contract:

- `allow`: continue tool execution
- `deny`: block tool execution
- `escalate`: pause and await external reviewer

## Fail-closed policy template

Use `docs/profiles/crewai-fail-closed.policy.template.json` as a starter profile.

## Example flow

See `sdks/python/examples/crewai_guardrail_flow.py`.

## Operational notes

- For irreversible or physical-state-changing tools, always configure timeout + deny fallback.
- Treat `STALE_APPROVAL` as hard deny and require a new request.
- Keep resource/action mappings explicit to avoid scope creep.

## Troubleshooting

- `TOKEN_NOT_FOUND`: unknown token in gateway store.
- `TOKEN_SUBJECT_MISMATCH`: request agent identity does not match token subject.
- `INSUFFICIENT_PERMISSIONS`: token scope does not cover resource/action.
- `APPROVAL_TIMEOUT`: escalation unresolved within timeout.
- `STALE_APPROVAL`: approval request expired/revoked before resolution.
