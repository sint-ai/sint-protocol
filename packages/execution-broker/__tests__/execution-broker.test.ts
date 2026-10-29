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

function vlaRequest(
  sequence: number,
  firstPosition: number,
  lastPosition: number,
): SintRequest {
  const base = request();
  const { simulationEvidence: _receipt, ...context } = base.executionContext ?? {};
  const withoutReceipt: SintRequest = {
    ...base,
    requestId: `019fdd12-cc01-70d4-8174-${String(100 + sequence).padStart(12, "0")}` as SintRequest["requestId"],
    executionContext: {
      ...context,
      model: { actionSpaceDigest: digest("7"), embodimentId: "arm-1" },
      vlaActionChunk: {
        chunkId: `019fdd12-cc01-70d4-8174-${String(200 + sequence).padStart(12, "0")}` as SintRequest["requestId"],
        streamId: "stream-1",
        sequence,
        issuedAt: "2026-08-07T15:59:59.000Z",
        executeBy: "2026-08-07T16:00:04.000Z",
        horizonMs: 1_000,
        controlHz: 50,
        actionCount: 50,
        actionSpaceDigest: digest("7"),
        embodimentId: "arm-1",
        worldSnapshotDigest: world.digest,
        firstState: { positions: [firstPosition], velocities: [0] },
        lastState: { positions: [lastPosition], velocities: [0] },
        safeStopOnFailure: true,
      },
    },
  };
  const originalReceipt = base.executionContext!.simulationEvidence!;
  return {
    ...withoutReceipt,
    executionContext: {
      ...withoutReceipt.executionContext,
      simulationEvidence: {
        ...originalReceipt,
        receiptId: `019fdd12-cc01-70d4-8174-${String(300 + sequence).padStart(12, "0")}` as typeof originalReceipt.receiptId,
        nonce: `vla:${sequence}`,
        requestDigest: computeExecutionRequestDigest(withoutReceipt),
        effectPlanDigest: computeExecutionEffectPlanDigest(withoutReceipt),
      },
    },
  };
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

  it("rejects a scene contract digest mismatch before dispatch", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: {
        readCurrent: async () => ({ ...world, sceneContractDigest: digest("8") }),
      },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const receipt = input.executionContext!.simulationEvidence!;
    const bound: SintRequest = {
      ...input,
      executionContext: {
        simulationEvidence: {
          ...receipt,
          worldSnapshot: { ...world, sceneContractDigest: digest("9") },
        },
      },
    };

    const drifted = await broker.execute(bound, { decision: decision(), approval: approval() });

    expect(drifted.ok ? undefined : drifted.error.code).toBe("WORLD_STATE_DRIFTED");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects a scene contract change during nonce consumption", async () => {
    const contracted = { ...world, sceneContractDigest: digest("9") };
    let currentWorld = contracted;
    const dispatch = vi.fn(async () => ok("sent"));
    const nonceStore = new InMemorySimulationReceiptNonceStore();
    const consume = vi.fn(async (receiptId: string, nonce: string) => {
      currentWorld = { ...contracted, sceneContractDigest: digest("8") };
      return nonceStore.consume(receiptId, nonce);
    });
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: { consume },
      worldStateProvider: { readCurrent: async () => currentWorld },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const receipt = input.executionContext!.simulationEvidence!;
    const bound: SintRequest = {
      ...input,
      executionContext: {
        simulationEvidence: {
          ...receipt,
          worldSnapshot: contracted,
        },
      },
    };

    const drifted = await broker.execute(bound, { decision: decision(), approval: approval() });

    expect(drifted.ok ? undefined : drifted.error.code).toBe("WORLD_STATE_DRIFTED");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("rejects world drift that occurs during nonce consumption", async () => {
    let currentWorld = world;
    const dispatch = vi.fn(async () => ok("sent"));
    const nonceStore = new InMemorySimulationReceiptNonceStore();
    const consume = vi.fn(async (receiptId: string, nonce: string) => {
      currentWorld = { ...world, stateEpoch: "epoch-after-consume" };
      return nonceStore.consume(receiptId, nonce);
    });
    const readCurrent = vi.fn(async () => currentWorld);
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: { consume },
      worldStateProvider: { readCurrent },
      adapter: { dispatch },
      now: () => now,
    });
    const input = request();
    const authorization = { decision: decision(), approval: approval() };

    const drifted = await broker.execute(input, authorization);
    expect(drifted.ok ? undefined : drifted.error.code).toBe("WORLD_STATE_DRIFTED");
    expect(readCurrent).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    currentWorld = world;
    const replay = await broker.execute(input, authorization);
    expect(replay.ok ? undefined : replay.error.code).toBe("SIMULATION_RECEIPT_REPLAYED");
  });

  it("returns a typed denial if the dispatch-time world read fails", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    let reads = 0;
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => {
        reads += 1;
        if (reads === 2) throw new Error("sensor disconnected");
        return world;
      } },
      adapter: { dispatch },
      now: () => now,
    });
    const rejected = await broker.execute(request(), { decision: decision(), approval: approval() });
    expect(rejected.ok ? undefined : rejected.error.code).toBe("WORLD_STATE_UNAVAILABLE");
    expect(dispatch).not.toHaveBeenCalled();
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

  it("dispatches continuous VLA chunks only in sequence and within continuity limits", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const safeStop = vi.fn();
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
      vlaContinuity: { maxPositionDelta: 0.1, maxVelocityDelta: 0.1, safeStop },
    });
    const first = vlaRequest(0, 0, 0.2);
    const discontinuous = vlaRequest(1, 0.8, 1);

    expect((await broker.execute(first, { decision: decision(first.requestId), approval: approval(first.requestId) })).ok).toBe(true);
    const rejected = await broker.execute(discontinuous, {
      decision: decision(discontinuous.requestId),
      approval: approval(discontinuous.requestId),
    });

    expect(rejected.ok ? undefined : rejected.error.code).toBe("VLA_CHUNK_DISCONTINUITY");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(safeStop).toHaveBeenCalledTimes(1);
  });

  it("rejects skipped VLA sequences before consuming their simulation receipt", async () => {
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch },
      now: () => now,
      vlaContinuity: { maxPositionDelta: 0.1, maxVelocityDelta: 0.1 },
    });
    const first = vlaRequest(0, 0, 0.2);
    const skipped = vlaRequest(2, 0.2, 0.3);

    await broker.execute(first, { decision: decision(first.requestId), approval: approval(first.requestId) });
    const rejected = await broker.execute(skipped, {
      decision: decision(skipped.requestId), approval: approval(skipped.requestId),
    });
    expect(rejected.ok ? undefined : rejected.error.code).toBe("VLA_CHUNK_SEQUENCE_INVALID");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent same-stream chunks with distinct receipts before sequence validation", async () => {
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const dispatchStarted = new Promise<void>(resolve => { started = resolve; });
    const dispatch = vi.fn(async () => { started(); await pending; return ok("sent"); });
    const nonceStore = new InMemorySimulationReceiptNonceStore();
    const consume = vi.fn(nonceStore.consume.bind(nonceStore));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: { consume },
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch }, now: () => now,
    });
    const input = vlaRequest(0, 0, 0.2);
    const duplicate = { ...input, executionContext: { ...input.executionContext,
      simulationEvidence: { ...input.executionContext!.simulationEvidence!, receiptId: "019fdd12-cc01-70d4-8174-208d070bbaff", nonce: "distinct-receipt" },
    } };
    const authorization = { decision: decision(input.requestId), approval: approval(input.requestId) };
    const first = broker.execute(input, authorization);
    await dispatchStarted;
    const second = broker.execute(duplicate, authorization);
    await new Promise<void>(resolve => setImmediate(resolve));
    release();
    const results = await Promise.all([first, second]);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok ? undefined : results[1]!.error.code).toBe("VLA_CHUNK_SEQUENCE_INVALID");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("rechecks a queued chunk deadline after the preceding dispatch finishes", async () => {
    let clock = now;
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const dispatchStarted = new Promise<void>(resolve => { started = resolve; });
    const dispatch = vi.fn(async () => { started(); await pending; return ok("sent"); });
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch }, now: () => clock,
    });
    const first = vlaRequest(0, 0, 0.2);
    const next = vlaRequest(1, 0.2, 0.3);
    const active = broker.execute(first, { decision: decision(first.requestId), approval: approval(first.requestId) });
    await dispatchStarted;
    const queued = broker.execute(next, { decision: decision(next.requestId), approval: approval(next.requestId) });
    clock += 4_001;
    release();
    await active;
    const rejected = await queued;
    expect(rejected.ok ? undefined : rejected.error.code).toBe("VLA_CHUNK_STALE");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects chunks that expire during nonce consumption", async () => {
    let clock = now;
    const dispatch = vi.fn(async () => ok("sent"));
    const safeStop = vi.fn();
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: { consume: async () => { clock += 4_001; return true; } },
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch }, now: () => clock,
      vlaContinuity: { maxPositionDelta: 0.1, maxVelocityDelta: 0.1, safeStop },
    });
    const input = vlaRequest(0, 0, 0.2);
    const rejected = await broker.execute(input, { decision: decision(input.requestId), approval: approval(input.requestId) });
    expect(rejected.ok ? undefined : rejected.error.code).toBe("VLA_CHUNK_STALE");
    expect(dispatch).not.toHaveBeenCalled();
    expect(safeStop).toHaveBeenCalledTimes(1);
  });

  it("rejects receipt and world-state expiry during asynchronous nonce consumption", async () => {
    let clock = now;
    const dispatch = vi.fn(async () => ok("sent"));
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) },
      nonceStore: { consume: async () => { clock += 5_001; return true; } },
      worldStateProvider: { readCurrent: async () => world },
      adapter: { dispatch }, now: () => clock,
    });
    const rejected = await broker.execute(request(), { decision: decision(), approval: approval() });
    expect(rejected.ok ? undefined : rejected.error.code).toBe("WORLD_STATE_EXPIRED");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
