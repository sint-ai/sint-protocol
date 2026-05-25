"""
SINT Protocol — OpenAI Agents runtime wrapper helpers.

Small execution helpers that compose:
- SINT authorization (`OpenAIAgentsGovernanceAdapter`)
- tool execution callback
- typed error behavior from the adapter
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, TypeVar

from .openai_agents import ApprovalResolver, OpenAIAgentsGovernanceAdapter
from .types import PolicyDecision, SintRequest

T = TypeVar("T")


ToolExecutor = Callable[[PolicyDecision], Awaitable[T]]


async def governed_tool_call(
    adapter: OpenAIAgentsGovernanceAdapter,
    request: SintRequest,
    execute: ToolExecutor[T],
    *,
    on_escalation: ApprovalResolver | None = None,
    approval_timeout_s: float | None = None,
    fail_closed_reviewer: str = "openai-agents/fail-closed",
) -> T:
    """
    Authorize a tool call and execute only after permission is granted.

    The wrapper intentionally relies on typed exceptions raised by the adapter
    (`SintDeniedError`, `SintApprovalRequiredError`, etc.) for fail-closed control.
    """
    decision = await adapter.authorize_tool_call(
        request,
        on_escalation=on_escalation,
        approval_timeout_s=approval_timeout_s,
        fail_closed_reviewer=fail_closed_reviewer,
    )
    return await execute(decision)

