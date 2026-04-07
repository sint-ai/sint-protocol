"""
SINT Protocol — CrewAI GuardrailProvider compatibility adapter.

Maps SINT gateway decisions to a simple pre-tool-call contract:
  allow | deny | escalate

Supports optional async approval callback resolution and fail-closed timeout
handling for high-consequence actions.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from .client import GatewayClient, GatewayError
from .types import ApprovalTier, PolicyDecision, SintRequest


@dataclass(frozen=True)
class GuardrailDecision:
    """CrewAI-friendly guardrail decision contract."""

    action: str  # "allow" | "deny" | "escalate"
    reason: str | None = None
    policy_violated: str | None = None
    assigned_tier: ApprovalTier | None = None
    approval_request_id: str | None = None


@dataclass(frozen=True)
class ApprovalResolution:
    """Resolution payload for an escalated approval."""

    status: str  # "approved" | "denied"
    by: str
    reason: str | None = None


class ApprovalResolver(Protocol):
    """Async callback contract for resolving escalations."""

    async def __call__(
        self,
        request: SintRequest,
        decision: PolicyDecision,
    ) -> ApprovalResolution | None:
        ...


class CrewAIGuardrailProviderCompat:
    """
    CrewAI GuardrailProvider compatibility adapter.

    Designed for pre-tool-call interception in CrewAI pipelines without forcing
    downstream changes to tool implementations.
    """

    def __init__(self, client: GatewayClient) -> None:
        self._client = client

    async def pre_tool_call(
        self,
        request: SintRequest,
        *,
        on_escalation: ApprovalResolver | None = None,
        approval_timeout_s: float | None = None,
        fail_closed_reviewer: str = "crewai/fail-closed",
    ) -> GuardrailDecision:
        """
        Evaluate a request through SINT and return allow/deny/escalate.

        Behavior:
        - allow/transform => allow
        - deny => deny
        - escalate + no resolver => escalate (or deny on timeout if configured)
        - escalate + resolver => approve/deny based on callback resolution
        """
        decision = await self._client.intercept(request)

        if decision.action in ("allow", "transform"):
            return GuardrailDecision(
                action="allow",
                assigned_tier=decision.assigned_tier,
            )
        if decision.action == "deny":
            return GuardrailDecision(
                action="deny",
                reason=decision.denial.reason if decision.denial else "Denied by SINT policy",
                policy_violated=decision.denial.policy_violated if decision.denial else "POLICY_DENY",
                assigned_tier=decision.assigned_tier,
            )

        # decision.action == "escalate"
        if on_escalation is None:
            if approval_timeout_s is None:
                return GuardrailDecision(
                    action="escalate",
                    reason=decision.escalation.reason if decision.escalation else "Approval required",
                    assigned_tier=decision.assigned_tier,
                    approval_request_id=decision.approval_request_id,
                )
            return await self._fail_closed_timeout(
                decision=decision,
                timeout_s=approval_timeout_s,
                reviewer=fail_closed_reviewer,
                timeout_reason="Fail-closed timeout: approval not resolved in time",
            )

        resolution = await on_escalation(request, decision)
        if resolution is None:
            timeout_s = 0.0 if approval_timeout_s is None else approval_timeout_s
            return await self._fail_closed_timeout(
                decision=decision,
                timeout_s=timeout_s,
                reviewer=fail_closed_reviewer,
                timeout_reason="Fail-closed timeout after unresolved escalation callback",
            )

        if resolution.status not in ("approved", "denied"):
            raise ValueError("ApprovalResolution.status must be 'approved' or 'denied'")

        if not decision.approval_request_id:
            return GuardrailDecision(
                action="escalate",
                reason="Escalated decision missing approval request identifier",
                policy_violated="APPROVAL_REQUEST_MISSING",
                assigned_tier=decision.assigned_tier,
            )

        try:
            await self._client.resolve_approval(
                request_id=decision.approval_request_id,
                status=resolution.status,
                by=resolution.by,
                reason=resolution.reason,
            )
        except GatewayError as err:
            if err.status_code == 409:
                return GuardrailDecision(
                    action="deny",
                    reason=f"Stale approval rejected by gateway: {err.detail}",
                    policy_violated="STALE_APPROVAL",
                    assigned_tier=decision.assigned_tier,
                    approval_request_id=decision.approval_request_id,
                )
            raise

        if resolution.status == "approved":
            return GuardrailDecision(
                action="allow",
                reason=resolution.reason,
                assigned_tier=decision.assigned_tier,
                approval_request_id=decision.approval_request_id,
            )

        return GuardrailDecision(
            action="deny",
            reason=resolution.reason or "Denied by approver",
            policy_violated="APPROVAL_DENIED",
            assigned_tier=decision.assigned_tier,
            approval_request_id=decision.approval_request_id,
        )

    async def _fail_closed_timeout(
        self,
        *,
        decision: PolicyDecision,
        timeout_s: float,
        reviewer: str,
        timeout_reason: str,
    ) -> GuardrailDecision:
        await asyncio.sleep(max(0.0, timeout_s))
        if decision.approval_request_id:
            try:
                await self._client.resolve_approval(
                    request_id=decision.approval_request_id,
                    status="denied",
                    by=reviewer,
                    reason=timeout_reason,
                )
            except GatewayError as err:
                if err.status_code != 409:
                    raise
        return GuardrailDecision(
            action="deny",
            reason="Approval timed out",
            policy_violated="APPROVAL_TIMEOUT",
            assigned_tier=decision.assigned_tier,
            approval_request_id=decision.approval_request_id,
        )

