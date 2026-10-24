import { describe, expect, it } from "vitest";
import { ok, type SintRequest } from "@pshkv/core";
import {
  ExecutionBroker,
  InMemorySimulationReceiptNonceStore,
  computeExecutionEffectPlanDigest,
  computeExecutionRequestDigest,
} from "@pshkv/execution-broker";

describe("Proof-carrying execution broker conformance", () => {
  it.each(["same-receipt", "distinct-receipts"])("dispatches a VLA sequence at most once under concurrent %s", async mode => {
    let dispatches = 0;
    const digest = "a".repeat(64);
    const requestId = "019fdd12-cc01-70d4-8174-208d070bbacc";
    const world = {
      digest,
      observedAt: "2026-08-07T15:59:59.000Z",
      validUntil: "2026-08-07T16:00:05.000Z",
      stateEpoch: "epoch-1",
    };
    const vlaActionChunk = {
      chunkId: "019fdd12-cc01-70d4-8174-208d070bbacf", streamId: "robot-1", sequence: 0,
      issuedAt: "2026-08-07T15:59:59.000Z", executeBy: "2026-08-07T16:00:04.000Z",
      horizonMs: 1000, controlHz: 50, actionCount: 50,
      actionSpaceDigest: digest, embodimentId: "robot-1", worldSnapshotDigest: digest, safeStopOnFailure: true as const,
    };
    const requestWithoutEvidence = {
      requestId,
      timestamp: "2026-08-07T15:59:59.000000Z",
      agentId: "b".repeat(64),
      tokenId: "019fdd12-cc01-70d4-8174-208d070bbacd",
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
      executionContext: { vlaActionChunk },
    } as never;
    const request = {
      ...(requestWithoutEvidence as object),
      executionContext: {
        vlaActionChunk,
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
    } as SintRequest;
    const secondRequest: SintRequest = mode === "same-receipt" ? request : {
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: {
        ...request.executionContext!.simulationEvidence!,
        receiptId: "019fdd12-cc01-70d4-8174-208d070bbaff", nonce: "distinct-nonce",
      } },
    };
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
      broker.execute(secondRequest, { decision, approval }),
      broker.execute(request, { decision, approval }),
    ]);

    expect(dispatches).toBe(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });
});
