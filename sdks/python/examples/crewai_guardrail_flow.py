"""
CrewAI GuardrailProvider-compatible flow with SINT.

Demonstrates mapping pre-tool-call checks to allow/deny/escalate contract.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sint import (
    CrewAIApprovalResolution,
    CrewAIGuardrailProviderCompat,
    GatewayClient,
    GatewayConfig,
    SintRequest,
)


async def main() -> None:
    config = GatewayConfig(
        base_url="http://localhost:3100",
        token="dev-local-key",
        timeout=10,
        max_retries=2,
        retry_backoff_ms=150,
    )

    async with GatewayClient(config) as client:
        guardrail = CrewAIGuardrailProviderCompat(client)
        request = SintRequest(
            request_id="01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f7b1",
            timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "000Z",
            agent_id="crewai-agent-worker",
            token_id="replace-with-valid-token-id",
            resource="mcp://warehouse/moveRobot",
            action="call",
            params={"robotId": "amr-17", "destination": "B-08"},
            execution_context={"deploymentProfile": "warehouse-amr"},
        )

        async def escalation_resolver(_req: SintRequest, _decision) -> CrewAIApprovalResolution:
            # Replace with your CrewAI reviewer workflow integration.
            return CrewAIApprovalResolution(
                status="approved",
                by="operator@warehouse-west",
                reason="approved for dispatch",
            )

        decision = await guardrail.pre_tool_call(
            request,
            on_escalation=escalation_resolver,
            approval_timeout_s=30.0,
        )

        print("guardrail action:", decision.action)
        print("tier:", decision.assigned_tier.value if decision.assigned_tier else None)
        if decision.action == "deny":
            print("deny policy:", decision.policy_violated, "reason:", decision.reason)


if __name__ == "__main__":
    asyncio.run(main())

