import { describe, expect, it, vi } from "vitest";
import { ok, err, type SimulationEvidenceReceipt, type SintRequest } from "@pshkv/core";
import { OpenPiBridge, type OpenPiInferenceRequest } from "../src/index.js";

const now = Date.parse("2026-09-02T20:00:00.000Z");
const digest = (character: string): string => character.repeat(64);
const id = (value: number) => `01a063e0-0000-7000-8000-${String(value).padStart(12, "0")}` as SintRequest["requestId"];

function receipt(request: SintRequest): SimulationEvidenceReceipt {
  return {
    schemaVersion: "2.0.0", receiptId: id(90), evidenceGrade: "deterministic",
    requestDigest: digest("1"), effectPlanDigest: digest("2"), tokenDigest: digest("3"),
    resource: request.resource, action: request.action,
    worldSnapshot: { digest: digest("b"), observedAt: "2026-09-02T19:59:59.000Z", validUntil: "2026-09-02T20:00:05.000Z", stateEpoch: "epoch-1" },
    simulator: { backend: "test", version: "1", modelDigest: digest("4") },
    scenarios: { scenarioSetDigest: digest("5"), runCount: 1 },
    result: { outcome: "pass", collisions: 0, safetyZoneViolations: 0 },
    generatedAt: "2026-09-02T19:59:59.000Z", expiresAt: "2026-09-02T20:00:05.000Z",
    nonce: "simulation:openpi:unique", artifactDigest: digest("6"),
    signerPublicKey: digest("7"), signature: "8".repeat(128),
  };
}

function bridge(overrides: Record<string, unknown> = {}) {
  let nextId = 0;
  const gateway = { intercept: vi.fn(async (request: SintRequest) => ({
    requestId: request.requestId, timestamp: request.timestamp, action: "escalate" as const,
    assignedTier: "T2_act" as const, assignedRisk: "T2_stateful" as const,
  })) };
  const transport = { infer: vi.fn(async (request: OpenPiInferenceRequest) => ok({
    requestNonce: request.requestNonce, responseId: "response-1",
    issuedAt: "2026-09-02T19:59:59.900Z", serverIdentity: "did:key:openpi",
    observationDigest: digest("a"), actionSpaceDigest: digest("c"), embodimentId: "arm-1",
    checkpointDigest: digest("d"), actions: [[0.1, 0.2], [0.2, 0.3]],
    firstState: { positions: [0, 0], velocities: [0, 0] },
    lastState: { positions: [0.1, 0.1], velocities: [0, 0] }, signature: "signed",
  })) };
  const safeStop = vi.fn();
  const instance = new OpenPiBridge({
    agentId: digest("e"), tokenId: id(1), resource: "ros2:///joint_trajectory", action: "publish",
    streamId: "arm-stream", controlHz: 2, horizonMs: 1_000, maxResponseAgeMs: 500,
    expectedServerIdentity: "did:key:openpi",
    transport, responseVerifier: { verify: async () => ok(true as const) }, gateway,
    simulationProvider: { simulate: async (request) => ok(receipt(request)) },
    runtime: { checkpointDigest: digest("d"), actionSpaceDigest: digest("c"), embodimentId: "arm-1" },
    safeStop, now: () => now, createId: () => id(++nextId), createNonce: () => "request:nonce:unique",
    ...overrides,
  });
  return { instance, gateway, transport, safeStop };
}

const input = {
  sequence: 0,
  prompt: "pick up the red block",
  observation: { digest: digest("a"), worldSnapshotDigest: digest("b"), payload: { image: "ref" } },
  taskIntent: { intentDigest: digest("f"), instructionDigest: digest("1"), allowedOperations: ["pick"], expiresAt: "2026-09-02T21:00:00.000Z" },
};

describe("OpenPiBridge", () => {
  it("normalizes verified inference into a PolicyGateway request", async () => {
    const { instance, gateway } = bridge();
    const result = await instance.intercept(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(gateway.intercept).toHaveBeenCalledTimes(1);
    expect(result.value.request.executionContext?.bridgeId).toBe("openpi");
    expect(result.value.request.executionContext?.vlaActionChunk?.safeStopOnFailure).toBe(true);
    expect(result.value.request.executionContext?.simulationEvidence?.worldSnapshot.digest).toBe(digest("b"));
  });

  it("fails safe when remote inference is unavailable", async () => {
    const { instance, safeStop } = bridge({
      transport: { infer: async () => err({ code: "DISCONNECTED", message: "socket closed", retryable: true }) },
    });
    const result = await instance.intercept(input);
    expect(result).toEqual({ ok: false, error: { code: "INFERENCE_UNAVAILABLE", message: "socket closed", retryable: true } });
    expect(safeStop).toHaveBeenCalledWith("socket closed");
  });

  it("rejects replayed response IDs and triggers safe stop", async () => {
    const { instance, safeStop } = bridge();
    expect((await instance.intercept(input)).ok).toBe(true);
    const replay = await instance.intercept(input);
    expect(replay.ok ? undefined : replay.error.code).toBe("INFERENCE_REPLAYED");
    expect(safeStop).toHaveBeenCalledTimes(1);
  });

  it("rejects untrusted server responses before gateway interception", async () => {
    const { instance, gateway } = bridge({ responseVerifier: { verify: async () => err({ message: "bad signature" }) } });
    const result = await instance.intercept(input);
    expect(result.ok ? undefined : result.error.code).toBe("INFERENCE_UNTRUSTED");
    expect(gateway.intercept).not.toHaveBeenCalled();
  });
});
