import { describe, expect, it } from "vitest";
import { ApprovalTier, type SimulationPreflight, type SimulationWorldSnapshot } from "@pshkv/core";
import { HttpEffectSimulator } from "../src/index.js";

const digest = (character: string): string => character.repeat(64);

const preflight: SimulationPreflight = {
  kind: "simulation-preflight",
  authorizesExecution: false,
  assignedTier: ApprovalTier.T2_ACT,
  effectPlan: {
    requestDigest: digest("1"),
    effectPlanDigest: digest("2"),
    tokenDigest: digest("3"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
  },
};

const world: SimulationWorldSnapshot = {
  digest: digest("a"),
  observedAt: "2026-11-14T00:00:00.000Z",
  validUntil: "2026-11-14T00:10:00.000Z",
};

describe("regional simulation workers", () => {
  it("calls only the worker for the configured region", async () => {
    const called: string[] = [];
    const simulator = new HttpEffectSimulator({
      baseUrl: "http://unused/",
      backend: "remote-test",
      supportedGrades: ["deterministic"],
      trustedSignerKeys: [],
      region: "eu",
      regions: [
        { region: "us", baseUrl: "http://us/" },
        { region: "eu", baseUrl: "http://eu/" },
      ],
      fetch: async (input) => {
        called.push(String(input));
        return new Response(JSON.stringify({ error: "down" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await simulator.simulate(preflight, world);

    expect(called).toEqual(["http://eu/v1/simulate"]);
  });
});
