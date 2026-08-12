import { describe, expect, it, vi } from "vitest";
import {
  ApprovalTier,
  RiskTier,
  ok,
  err,
  type PolicyDecision,
  type SimulationEvidenceReceipt,
  type SimulationWorldSnapshot,
  type SintRequest,
} from "@pshkv/core";
import {
  ExecutionBroker,
  InMemorySimulationReceiptNonceStore,
  computeExecutionEffectPlanDigest,
  computeExecutionRequestDigest,
} from "../src/index.js";

const now = Date.parse("2026-08-07T16:00:00.000Z");
const digest = (character: string): string => character.repeat(64);
const world: SimulationWorldSnapshot = {
  digest: digest("a"),
  observedAt: "2026-08-07T15:59:59.000Z",
  validUntil: "2026-08-07T16:00:05.000Z",
  stateEpoch: "epoch-1",
};

function request(): SintRequest {
  const base: SintRequest = {
    requestId: "019fdd12-cc01-70d4-8174-208d070bbacc",
    timestamp: "2026-08-07T15:59:59.000000Z",
    agentId: digest("b"),
    tokenId: "019fdd12-cc01-70d4-8174-208d070bbacd",
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: { velocityMps: 0.2 },
  };
  const receipt: SimulationEvidenceReceipt = {
    schemaVersion: "2.0.0",
    receiptId: "019fdd12-cc01-70d4-8174-208d070bbace",
    evidenceGrade: "deterministic",
    requestDigest: computeExecutionRequestDigest(base),
    effectPlanDigest: computeExecutionEffectPlanDigest(base),
    tokenDigest: digest("c"),
    resource: base.resource,
    action: base.action,
    worldSnapshot: world,
    simulator: { backend: "test", version: "1", modelDigest: digest("d") },
    scenarios: { scenarioSetDigest: digest("e"), runCount: 1 },
    result: { outcome: "pass", collisions: 0, safetyZoneViolations: 0 },
    generatedAt: "2026-08-07T15:59:59.000Z",
    expiresAt: "2026-08-07T16:00:05.000Z",
    nonce: "simulation:unique-nonce",
    artifactDigest: digest("f"),
    signerPublicKey: digest("1"),
    signature: "2".repeat(128),
  };
  return { ...base, executionContext: { simulationEvidence: receipt } };
}

function decision(requestId = request().requestId): PolicyDecision {
  return {
    requestId,
    timestamp: "2026-08-07T15:59:59.000000Z",
    action: "escalate",
    assignedTier: ApprovalTier.T2_ACT,
    assignedRisk: RiskTier.T2_STATEFUL,
  };
}

function approval(requestId = request().requestId) {
  return {
    status: "approved" as const,
    requestId,
    approvedAt: "2026-08-07T15:59:59.500Z",
    approvers: ["operator-1"],
  };
}

describe("ExecutionBroker", () => {
  it("dispatches a verified request once and rejects receipt replay", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const authorization = { decision: decision(), approval: approval() };

    const first = await broker.execute(input, authorization);
    const replay = await broker.execute(input, authorization);

    expect(first).toEqual({ ok: true, value: "sent" });
    expect(replay.ok ? undefined : replay.error.code).toBe("SIMULATION_RECEIPT_REPLAYED");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects request mutation even when a verifier incorrectly returns success", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
    });
    const original = request();
    const mutated = { ...original, params: { velocityMps: 2 } };

    const result = await broker.execute(mutated, { decision: decision(), approval: approval() });

    expect(result.ok ? undefined : result.error.code).toBe("SIMULATION_CONTEXT_MISMATCH");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("requires trusted verification and completed approval", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const rejectedVerifier = new ExecutionBroker({
      authorizationVerifier: { verify: async () => err({ message: "decision signature invalid" }) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
    });
    const verifiedBroker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
    });

    const untrusted = await rejectedVerifier.execute(request(), { decision: decision(), approval: approval() });
    const unapproved = await verifiedBroker.execute(request(), { decision: decision() });

    expect(untrusted.ok ? undefined : untrusted.error.code).toBe("AUTHORIZATION_VERIFICATION_FAILED");
    expect(unapproved.ok ? undefined : unapproved.error.code).toBe("APPROVAL_REQUIRED");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("checks world drift before consuming the nonce", async () => {
    let currentWorld = { ...world, stateEpoch: "epoch-2" };
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => currentWorld },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const authorization = { decision: decision(), approval: approval() };

    const drifted = await broker.execute(input, authorization);
    currentWorld = world;
    const retried = await broker.execute(input, authorization);

    expect(drifted.ok ? undefined : drifted.error.code).toBe("WORLD_STATE_DRIFTED");
    expect(retried).toEqual({ ok: true, value: "sent" });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("consumes the nonce before dispatch so failed hardware calls cannot replay", async () => {
    const dispatch = vi.fn(async () => err({ code: "OFFLINE", message: "controller offline", retryable: true }));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const authorization = { decision: decision(), approval: approval() };

    const failed = await broker.execute(input, authorization);
    const replay = await broker.execute(input, authorization);

    expect(failed.ok ? undefined : failed.error.code).toBe("EXECUTION_FAILED");
    expect(replay.ok ? undefined : replay.error.code).toBe("SIMULATION_RECEIPT_REPLAYED");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
