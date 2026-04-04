import { describe, it, expect } from "vitest";
import {
  applyX402Quotes,
  selectCostAwareRoute,
  type CostAwareRoutingInput,
  type IX402Port,
  type RouteCandidate,
} from "../src/index.js";

function makeInput(overrides: Partial<CostAwareRoutingInput> = {}): CostAwareRoutingInput {
  return {
    request: {
      requestId: "req-route-001",
      resource: "mcp://planner/dispatch",
      action: "call",
      params: {},
    },
    candidates: [
      {
        routeId: "rmf-primary",
        action: "call",
        resource: "open-rmf://fleet-a/dispatch",
        costMultiplier: 1.3,
        latencyMs: 20,
        reliability: 0.95,
      },
      {
        routeId: "sparkplug-edge",
        action: "publish",
        resource: "mqtt-sparkplug://broker/ns/group/node/cmd",
        costMultiplier: 0.9,
        latencyMs: 10,
        reliability: 0.9,
      },
    ],
    ...overrides,
  };
}

describe("cost-aware routing", () => {
  it("selects the best-scoring candidate", () => {
    const decision = selectCostAwareRoute(makeInput());
    expect(decision).toBeDefined();
    expect(decision?.routeId).toBe("sparkplug-edge");
    expect(decision?.totalCostTokens).toBeGreaterThan(0);
  });

  it("filters candidates that exceed remaining budget", () => {
    const decision = selectCostAwareRoute(
      makeInput({
        budgetRemainingTokens: 8,
      }),
    );
    expect(decision).toBeUndefined();
  });

  it("filters candidates above max latency threshold", () => {
    const decision = selectCostAwareRoute(
      makeInput({
        maxLatencyMs: 8,
      }),
    );
    expect(decision).toBeUndefined();
  });

  it("applies x402 quotes when port is configured", async () => {
    const x402Port: IX402Port = {
      async getQuote(candidate: RouteCandidate) {
        return {
          ok: true,
          value: {
            routeId: candidate.routeId,
            endpoint: candidate.x402?.endpoint ?? "https://commerce.example/x402",
            priceUsd: 0.03,
            currency: "USD",
          },
        };
      },
    };

    const quoted = await applyX402Quotes(
      [
        {
          routeId: "x402-route",
          action: "call",
          resource: "mcp://premium/tool",
          x402: { enabled: true, endpoint: "https://commerce.example/x402" },
        },
      ],
      x402Port,
    );

    expect(quoted[0]?.x402?.quotedUsd).toBe(0.03);
    const decision = selectCostAwareRoute({
      request: {
        requestId: "req-route-002",
        resource: "mcp://premium/tool",
        action: "call",
        params: {},
      },
      candidates: quoted,
    });

    expect(decision?.routeId).toBe("x402-route");
    expect(decision?.viaX402).toBe(true);
  });
});
