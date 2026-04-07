"""
SINT Protocol — OpenAI Agents SDK governance adapter.

Provides a thin runtime governance layer for OpenAI Agents SDK tool calls:
- pre-tool authorization via SINT gateway intercept
- typed error mapping (deny / escalate / timeout)
- suspend/resume approval helpers
- request-scoped evidence lookup convenience
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol

from .client import GatewayClient
from .types import LedgerEvent, PolicyDecision, SintRequest


class SintGovernanceError(Exception):
    """Base exception for SINT OpenAI Agents governance adapter failures."""


class SintDeniedError(SintGovernanceError):
    """Raised when the gateway denies a request."""

    def __init__(self, decision: PolicyDecision) -> None:
        reason = decision.denial.reason if decision.denial else "Denied by policy"
        policy = decision.denial.policy_violated if decision.denial else "POLICY_DENY"
        super().__init__(f"SINT denied request: {policy} — {reason}")
        self.decision = decision
        self.reason = reason
        self.policy_violated = policy


class SintApprovalRequiredError(SintGovernanceError):
    """Raised when a request requires T2/T3 approval and no resolver is provided."""

    def __init__(self, decision: PolicyDecision, request: SintRequest) -> None:
        reason = decision.escalation.reason if decision.escalation else "Approval required"
        super().__init__(f"SINT escalation required: {reason}")
        self.decision = decision
        self.request = request
        self.reason = reason
        self.approval_request_id = decision.approval_request_id
        self.required_tier = decision.escalation.required_tier if decision.escalation else decision.assigned_tier
        self.timeout_ms = decision.escalation.timeout_ms if decision.escalation else None


class SintApprovalTimeoutError(SintGovernanceError):
    """Raised when an escalation is not resolved within configured timeout."""

    def __init__(self, approval_request_id: str | None, timeout_s: float) -> None:
        req = approval_request_id or "<unknown>"
        super().__init__(f"SINT approval timed out (request={req}, timeout_s={timeout_s})")
        self.approval_request_id = approval_request_id
        self.timeout_s = timeout_s


class SintApprovalDeniedError(SintGovernanceError):
    """Raised when an approval resolver explicitly denies the request."""

    def __init__(self, approval_request_id: str | None, reason: str | None = None) -> None:
        req = approval_request_id or "<unknown>"
        suffix = f": {reason}" if reason else ""
        super().__init__(f"SINT approval denied (request={req}){suffix}")
        self.approval_request_id = approval_request_id
        self.reason = reason


@dataclass(frozen=True)
class ApprovalResolution:
    """Resolution payload for a suspended approval."""

    status: str  # "approved" | "denied"
    by: str
    reason: str | None = None


class ApprovalResolver(Protocol):
    """Callback contract for escalation handling."""

    async def __call__(
        self,
        request: SintRequest,
        decision: PolicyDecision,
    ) -> ApprovalResolution | None:
        ...


class OpenAIAgentsGovernanceAdapter:
    """
    Runtime governance adapter for OpenAI Agents SDK tool calls.

    This class is transport-agnostic and can be used with any tool execution
    runtime that constructs a `SintRequest` per call.
    """

    def __init__(self, client: GatewayClient) -> None:
        self._client = client

    async def authorize_tool_call(
        self,
        request: SintRequest,
        *,
        on_escalation: ApprovalResolver | None = None,
        approval_timeout_s: float | None = None,
        fail_closed_reviewer: str = "openai-agents/fail-closed",
    ) -> PolicyDecision:
        """
        Authorize a tool call through SINT and resolve escalations when possible.

        Behavior:
        - allow/transform => returns PolicyDecision
        - deny => raises SintDeniedError
        - escalate:
          - with resolver => resolve approval and return decision on approved
          - without resolver => raise SintApprovalRequiredError
          - with timeout => fail-closed denial on timeout + raise SintApprovalTimeoutError
        """
        decision = await self._client.intercept(request)

        if decision.action in ("allow", "transform"):
            return decision
        if decision.action == "deny":
            raise SintDeniedError(decision)

        # decision.action == "escalate"
        if on_escalation is None:
            if approval_timeout_s is not None:
                await asyncio.sleep(max(0.0, approval_timeout_s))
                if decision.approval_request_id:
                    # Fail closed by explicitly denying stale pending approvals.
                    await self._client.resolve_approval(
                        request_id=decision.approval_request_id,
                        status="denied",
                        by=fail_closed_reviewer,
                        reason="Fail-closed timeout: approval not resolved in time",
                    )
                raise SintApprovalTimeoutError(decision.approval_request_id, approval_timeout_s)
            raise SintApprovalRequiredError(decision, request)

        resolution = await on_escalation(request, decision)
        if resolution is None:
            # Resolver intentionally suspended and did not provide a decision.
            timeout_s = approval_timeout_s if approval_timeout_s is not None else 0.0
            if approval_timeout_s is not None:
                await asyncio.sleep(max(0.0, approval_timeout_s))
                if decision.approval_request_id:
                    await self._client.resolve_approval(
                        request_id=decision.approval_request_id,
                        status="denied",
                        by=fail_closed_reviewer,
                        reason="Fail-closed timeout after unresolved escalation callback",
                    )
            raise SintApprovalTimeoutError(decision.approval_request_id, timeout_s)

        if not decision.approval_request_id:
            raise SintApprovalRequiredError(decision, request)

        if resolution.status not in ("approved", "denied"):
            raise ValueError("ApprovalResolution.status must be 'approved' or 'denied'")

        await self._client.resolve_approval(
            request_id=decision.approval_request_id,
            status=resolution.status,
            by=resolution.by,
            reason=resolution.reason,
        )
        if resolution.status != "approved":
            raise SintApprovalDeniedError(decision.approval_request_id, resolution.reason)

        return decision

    async def resume_approved(
        self,
        approval_request_id: str,
        *,
        by: str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Resume a suspended workflow by approving a known approval request ID."""
        return await self._client.resolve_approval(
            request_id=approval_request_id,
            status="approved",
            by=by,
            reason=reason,
        )

    async def resume_denied(
        self,
        approval_request_id: str,
        *,
        by: str,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """Resume a suspended workflow by denying a known approval request ID."""
        return await self._client.resolve_approval(
            request_id=approval_request_id,
            status="denied",
            by=by,
            reason=reason,
        )

    async def evidence_for_request(self, request_id: str, limit: int = 200) -> list[LedgerEvent]:
        """
        Retrieve ledger events related to a specific request ID.

        Since `/v1/ledger` is generic, this helper performs payload-level filtering.
        """
        events = await self._client.get_ledger_events(limit=limit)
        matches: list[LedgerEvent] = []
        for event in events:
            payload = event.payload
            if payload.get("requestId") == request_id:
                matches.append(event)
                continue
            resolution = payload.get("resolution")
            if isinstance(resolution, dict) and resolution.get("requestId") == request_id:
                matches.append(event)
        return matches

