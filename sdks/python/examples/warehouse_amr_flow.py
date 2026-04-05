import asyncio
from datetime import datetime, timezone

from sint import GatewayClient, GatewayConfig, SintRequest


async def main() -> None:
    config = GatewayConfig(
        base_url="http://localhost:3100",
        token="dev-local-key",
        timeout=10,
        max_retries=2,
        retry_backoff_ms=150,
    )

    async with GatewayClient(config) as client:
        health = await client.health()
        print("health:", health.get("status"))

        request = SintRequest(
            request_id="01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f701",
            timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "000Z",
            agent_id="warehouse-amr-agent",
            token_id="replace-with-valid-token-id",
            resource="ros2:///cmd_vel",
            action="publish",
            params={"linear": {"x": 0.2}, "angular": {"z": 0.0}},
        )

        decision = await client.intercept(request)
        print("decision:", decision.action, "tier=", decision.assigned_tier)


if __name__ == "__main__":
  asyncio.run(main())
