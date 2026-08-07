import { describe, expect, it } from "vitest";
import { ApprovalTier, type SimulationPreflight } from "@pshkv/core";
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

function client(fetchImpl: typeof globalThis.fetch, timeoutMs = 100) {
  return new HttpEffectSimulator({
    baseUrl: "http://worker/",
    backend: "remote-test",
    supportedGrades: ["deterministic"],
    trustedSignerKeys: [],
    timeoutMs,
    fetch: fetchImpl,
  });
}

describe("HttpEffectSimulator failures", () => {
  it("requires a world snapshot before network I/O", async () => {
    let called = false;
    const simulated = await client(async () => {
      called = true;
      return new Response();
    }).simulate(preflight);

    expect(called).toBe(false);
    expect(simulated.ok ? undefined : simulated.error.code).toBe("WORLD_SNAPSHOT_REQUIRED");
  });

  it("returns a retryable Result for network failure", async () => {
    const simulated = await client(async () => {
      throw new Error("connection refused");
    }).simulate(preflight, {
      digest: digest("a"),
      observedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 1_000).toISOString(),
    });

    expect(simulated.ok).toBe(false);
    if (simulated.ok) return;
    expect(simulated.error).toMatchObject({ code: "SIMULATION_FAILED", retryable: true });
    expect(simulated.error.message).toContain("connection refused");
  });

  it("enforces a bounded worker deadline", async () => {
    const hangingFetch: typeof globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const simulated = await client(hangingFetch, 5).simulate(preflight, {
      digest: digest("a"),
      observedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 1_000).toISOString(),
    });

    expect(simulated.ok ? undefined : simulated.error.message).toBe(
      "Simulation worker timed out after 5ms",
    );
  });
});
