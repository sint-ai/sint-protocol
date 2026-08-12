import { describe, expect, it } from "vitest";
import { ok } from "@pshkv/core";
import {
  ExecutionBroker,
  InMemorySimulationReceiptNonceStore,
  computeExecutionEffectPlanDigest,
  computeExecutionRequestDigest,
} from "@pshkv/execution-broker";

describe("Proof-carrying execution broker conformance", () => {
  it("dispatches at most once under concurrent receipt replay", async () => {
    let dispatches = 0;
    const digest = "a".repeat(64);
    const requestId = "019fdd12-cc01-70d4-8174-208d070bbacc";
    const world = {
      digest,
      observedAt: "2026-08-07T15:59:59.000Z",
      validUntil: "2026-08-07T16:00:05.000Z",
      stateEpoch: "epoch-1",
    };
    const requestWithoutEvidence = {
      requestId,
      timestamp: "2026-08-07T15:59:59.000000Z",
      agentId: "b".repeat(64),
      tokenId: "019fdd12-cc01-70d4-8174-208d070bbacd",
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    } as never;
    const request = {
      ...(requestWithoutEvidence as object),
      executionContext: {
        simulationEvidence: {
          schemaVersion: "2.0.0",
          receiptId: "019fdd12-cc01-70d4-8174-208d070bbace",
          evidenceGrade: "deterministic",
          requestDigest: computeExecutionRequestDigest(requestWithoutEvidence),
          effectPlanDigest: computeExecutionEffectPlanDigest(requestWithoutEvidence),
          tokenDigest: digest,
          resource: "ros2:///cmd_vel",
          action: "publish",
          worldSnapshot: world,
          simulator: { backend: "test", version: "1", modelDigest: digest },
          scenarios: { scenarioSetDigest: digest, runCount: 1 },
          result: { outcome: "pass", collisions: 0, safetyZoneViolations: 0 },
          generatedAt: "2026-08-07T15:59:59.000Z",
          expiresAt: "2026-08-07T16:00:05.000Z",
          nonce: "unique-nonce",
          artifactDigest: digest,
          signerPublicKey: "c".repeat(64),
          signature: "d".repeat(128),
        },
      },
    } as never;
    const decision = {
      requestId,
      timestamp: "2026-08-07T15:59:59.000000Z",
      action: "escalate",
      assignedTier: "T2_act",
      assignedRisk: "T2_stateful",
    } as never;
    const approval = {
      status: "approved" as const,
      requestId,
      approvedAt: "2026-08-07T15:59:59.500Z" as never,
      approvers: ["operator-1"],
    };
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world as never },
      adapter: {
        dispatch: async () => {
          dispatches += 1;
          return ok("sent");
        },
      },
      now: () => Date.parse("2026-08-07T16:00:00.000Z"),
    });

    const results = await Promise.all([
      broker.execute(request, { decision, approval }),
      broker.execute(request, { decision, approval }),
    ]);

    expect(dispatches).toBe(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
