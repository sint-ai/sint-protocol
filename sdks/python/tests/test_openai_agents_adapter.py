"""Tests for sint.openai_agents governance adapter."""

from __future__ import annotations

import pytest

from sint.openai_agents import (
    ApprovalResolution,
    OpenAIAgentsGovernanceAdapter,
    SintApprovalDeniedError,
    SintApprovalRequiredError,
    SintApprovalTimeoutError,
    SintDeniedError,
)
from sint.types import LedgerEvent, PolicyDecision, SintRequest


class _FakeGatewayClient:
    def __init__(
        self,
        decision: PolicyDecision,
        ledger_events: list[LedgerEvent] | None = None,
    ) -> None:
        self._decision = decision
        self._ledger_events = ledger_events or []
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
        call = {
            "request_id": request_id,
            "status": status,
            "by": by,
            "reason": reason,
        }
        self.resolve_calls.append(call)
        return call

    async def get_ledger_events(self, limit: int = 200) -> list[LedgerEvent]:  # noqa: ARG002
        return self._ledger_events


def _request() -> SintRequest:
    return SintRequest.model_validate({
        "requestId": "01905f7c-0000-7000-8000-000000000011",
        "timestamp": "2026-04-06T12:00:00.000000Z",
        "agentId": "a" * 64,
        "tokenId": "01905f7c-0000-7000-8000-000000000012",
        "resource": "mcp://filesystem/readFile",
        "action": "call",
        "params": {"path": "/tmp/demo.txt"},
    })


def _decision(action: str, *, with_approval_id: bool = False) -> PolicyDecision:
    payload = {
        "requestId": "01905f7c-0000-7000-8000-000000000011",
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
            payload["approvalRequestId"] = "req-approve-001"
    return PolicyDecision.model_validate(payload)


@pytest.mark.asyncio
async def test_authorize_allow_returns_decision() -> None:
    client = _FakeGatewayClient(_decision("allow"))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]
    result = await adapter.authorize_tool_call(_request())
    assert result.action == "allow"


@pytest.mark.asyncio
async def test_authorize_deny_raises_typed_error() -> None:
    client = _FakeGatewayClient(_decision("deny"))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]
    with pytest.raises(SintDeniedError) as exc:
        await adapter.authorize_tool_call(_request())
    assert exc.value.policy_violated == "INSUFFICIENT_PERMISSIONS"


@pytest.mark.asyncio
async def test_escalation_without_resolver_raises_required() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]
    with pytest.raises(SintApprovalRequiredError) as exc:
        await adapter.authorize_tool_call(_request())
    assert exc.value.approval_request_id == "req-approve-001"


@pytest.mark.asyncio
async def test_escalation_timeout_fail_closed_denies_queue() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]
    with pytest.raises(SintApprovalTimeoutError):
        await adapter.authorize_tool_call(_request(), approval_timeout_s=0.0)

    assert client.resolve_calls[0]["request_id"] == "req-approve-001"
    assert client.resolve_calls[0]["status"] == "denied"


@pytest.mark.asyncio
async def test_escalation_with_approved_resolution_returns_decision() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]

    async def resolver(_req: SintRequest, _decision: PolicyDecision) -> ApprovalResolution:
        return ApprovalResolution(status="approved", by="operator@example.com", reason="approved for demo")

    decision = await adapter.authorize_tool_call(_request(), on_escalation=resolver)
    assert decision.action == "escalate"
    assert client.resolve_calls[0]["status"] == "approved"


@pytest.mark.asyncio
async def test_escalation_with_denied_resolution_raises_typed_error() -> None:
    client = _FakeGatewayClient(_decision("escalate", with_approval_id=True))
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]

    async def resolver(_req: SintRequest, _decision: PolicyDecision) -> ApprovalResolution:
        return ApprovalResolution(status="denied", by="operator@example.com", reason="unsafe")

    with pytest.raises(SintApprovalDeniedError):
        await adapter.authorize_tool_call(_request(), on_escalation=resolver)
    assert client.resolve_calls[0]["status"] == "denied"


@pytest.mark.asyncio
async def test_evidence_for_request_filters_by_payload_request_id() -> None:
    events = [
        LedgerEvent.model_validate({
            "eventId": "e1",
            "sequenceNumber": "1",
            "timestamp": "2026-04-06T12:00:00.000000Z",
            "eventType": "policy.evaluated",
            "agentId": "a" * 64,
            "payload": {"requestId": "target-1"},
            "previousHash": "0" * 64,
            "hash": "1" * 64,
        }),
        LedgerEvent.model_validate({
            "eventId": "e2",
            "sequenceNumber": "2",
            "timestamp": "2026-04-06T12:00:01.000000Z",
            "eventType": "approval.granted",
            "agentId": "a" * 64,
            "payload": {"resolution": {"requestId": "target-1", "status": "approved"}},
            "previousHash": "1" * 64,
            "hash": "2" * 64,
        }),
        LedgerEvent.model_validate({
            "eventId": "e3",
            "sequenceNumber": "3",
            "timestamp": "2026-04-06T12:00:02.000000Z",
            "eventType": "policy.evaluated",
            "agentId": "a" * 64,
            "payload": {"requestId": "other"},
            "previousHash": "2" * 64,
            "hash": "3" * 64,
        }),
    ]
    client = _FakeGatewayClient(_decision("allow"), ledger_events=events)
    adapter = OpenAIAgentsGovernanceAdapter(client)  # type: ignore[arg-type]
    matched = await adapter.evidence_for_request("target-1")
    assert [e.event_id for e in matched] == ["e1", "e2"]

