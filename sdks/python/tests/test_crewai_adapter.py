"""Tests for sint.crewai guardrail adapter."""

from __future__ import annotations

import pytest

from sint.client import GatewayError
from sint.crewai import (
    ApprovalResolution,
    CrewAIGuardrailProviderCompat,
)
from sint.types import PolicyDecision, SintRequest


class _FakeGatewayClient:
    def __init__(
        self,
        decision: PolicyDecision,
        *,
        stale_on_resolve: bool = False,
    ) -> None:
        self._decision = decision
        self._stale_on_resolve = stale_on_resolve
        self.resolve_calls: list[dict[str, str | None]] = []

    async def intercept(self, request: SintRequest) -> PolicyDecision:  # noqa: ARG002
        return self._decision

    async def resolve_approval(
        self,
        request_id: str,
        status: str,
        by: str,
        reason: str | None = None,
    ) -> dict[str, str | None]:
        if self._stale_on_resolve:
            raise GatewayError(409, "stale approval request")
        call = {
            "request_id": request_id,
            "status": status,
            "by": by,
            "reason": reason,
        }
        self.resolve_calls.append(call)
        return call


def _request() -> SintRequest:
    return SintRequest.model_validate({
        "requestId": "01905f7c-0000-7000-8000-000000000021",
        "timestamp": "2026-04-06T12:00:00.000000Z",
        "agentId": "a" * 64,
        "tokenId": "01905f7c-0000-7000-8000-000000000022",
        "resource": "mcp://filesystem/readFile",
        "action": "call",
        "params": {"path": "/tmp/demo.txt"},
    })


def _decision(action: str, *, with_approval_id: bool = False) -> PolicyDecision:
    payload = {
        "requestId": "01905f7c-0000-7000-8000-000000000021",
        "timestamp": "2026-04-06T12:00:00.000000Z",
        "action": action,
        "assignedTier": "T2_act" if action == "escalate" else "T1_prepare",
        "assignedRisk": "T2_stateful" if action == "escalate" else "T1_write_low",
    }
    if action == "deny":
        payload["denial"] = {
            "reason": "Policy denied",
            "policyViolated": "INSUFFICIENT_PERMISSIONS",
        }
    if action == "escalate":
        payload["escalation"] = {
            "requiredTier": "T2_act",
            "reason": "Human approval required",
            "timeoutMs": 1000,
            "fallbackAction": "deny",
        }
        if with_approval_id:
            payload["approvalRequestId"] = "req-approve-crew-001"
    return PolicyDecision.model_validate(payload)


@pytest.mark.asyncio
async def test_allow_maps_to_allow_contract() -> None:
    client = _FakeGatewayClient(_decision("allow"))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]
    decision = await adapter.pre_tool_call(_request())
    assert decision.action == "allow"


@pytest.mark.asyncio
async def test_deny_maps_to_deny_contract() -> None:
    client = _FakeGatewayClient(_decision("deny"))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]
    decision = await adapter.pre_tool_call(_request())
    assert decision.action == "deny"
    assert decision.policy_violated == "INSUFFICIENT_PERMISSIONS"


@pytest.mark.asyncio
async def test_escalate_without_resolver_returns_escalate() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]
    decision = await adapter.pre_tool_call(_request())
    assert decision.action == "escalate"
    assert decision.approval_request_id == "req-approve-crew-001"


@pytest.mark.asyncio
async def test_timeout_fail_closed_returns_deny_and_resolves() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]
    decision = await adapter.pre_tool_call(_request(), approval_timeout_s=0.0)
    assert decision.action == "deny"
    assert decision.policy_violated == "APPROVAL_TIMEOUT"
    assert client.resolve_calls[0]["status"] == "denied"


@pytest.mark.asyncio
async def test_resolver_approved_maps_to_allow() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]

    async def resolver(_req: SintRequest, _decision: PolicyDecision) -> ApprovalResolution:
        return ApprovalResolution(status="approved", by="operator@example.com")

    decision = await adapter.pre_tool_call(_request(), on_escalation=resolver)
    assert decision.action == "allow"
    assert client.resolve_calls[0]["status"] == "approved"


@pytest.mark.asyncio
async def test_resolver_denied_maps_to_deny() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]

    async def resolver(_req: SintRequest, _decision: PolicyDecision) -> ApprovalResolution:
        return ApprovalResolution(status="denied", by="operator@example.com", reason="unsafe")

    decision = await adapter.pre_tool_call(_request(), on_escalation=resolver)
    assert decision.action == "deny"
    assert decision.policy_violated == "APPROVAL_DENIED"


@pytest.mark.asyncio
async def test_stale_approval_maps_to_deny_stale() -> None:
    client = _FakeGatewayClient(
        _decision("escalate", with_approval_id=True),
        stale_on_resolve=True,
    )
    adapter = CrewAIGuardrailProviderCompat(client)  # type: ignore[arg-type]

    async def resolver(_req: SintRequest, _decision: PolicyDecision) -> ApprovalResolution:
        return ApprovalResolution(status="approved", by="operator@example.com")

    decision = await adapter.pre_tool_call(_request(), on_escalation=resolver)
    assert decision.action == "deny"
    assert decision.policy_violated == "STALE_APPROVAL"

