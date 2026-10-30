import { describe, expect, it } from "vitest";
import { ok, vlaActionChunkEnvelopeSchema, vlaMemoryEvidenceRefSchema } from "@pshkv/core";
import { generateKeypair, issueCapabilityToken, validateCapabilityToken } from "@pshkv/gate-capability-tokens";
import { parseOpenPiInferenceResponse } from "@pshkv/bridge-openpi";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { ExecutionBroker, InMemorySimulationReceiptNonceStore } from "@pshkv/execution-broker";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { createLedgerEvidenceSink, DemonstrationProvenanceOrchestrator } from "@pshkv/demonstration-provenance";

const digest = (character: string): string => character.repeat(64);
const future = new Date(Date.now() + 3_600_000).toISOString();

describe("VLA governance conformance", () => {
  it("I-VLA1 rejects action chunks without an unconditional safe-stop contract", () => {
    expect(vlaActionChunkEnvelopeSchema.safeParse({
      chunkId: "019fdd12-cc01-70d4-8174-208d070bbacc",
      streamId: "robot-1", sequence: 0,
      issuedAt: "2026-08-07T15:59:59.000Z", executeBy: future,
      horizonMs: 1_000, controlHz: 50, actionCount: 50,
      actionSpaceDigest: digest("a"), embodimentId: "robot-1",
      worldSnapshotDigest: digest("b"), safeStopOnFailure: false,
    }).success).toBe(false);
  });

  it("I-VLA2 rejects model/runtime artifact substitution", () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey, subject: subject.publicKey,
      resource: "ros2:///cmd_vel", actions: ["publish"], constraints: {},
      modelConstraints: { normalizationDigest: digest("a"), embodimentId: "robot-1" },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: future, revocable: true,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(validateCapabilityToken(issued.value, {
      resource: "ros2:///cmd_vel", action: "publish",
      modelContext: { normalizationDigest: digest("b"), embodimentId: "robot-1" },
    })).toEqual({ ok: false, error: "CONSTRAINT_VIOLATION" });
  });

  it("I-VLA7 rejects substitution of token-bound training lineage", () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey, subject: subject.publicKey,
      resource: "ros2:///cmd_vel", actions: ["publish"], constraints: {},
      modelConstraints: {
        datasetDigest: digest("a"), trainingRecipeDigest: digest("b"),
        promotionEvidenceDigest: digest("c"), rollbackCheckpointDigest: digest("d"),
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: future, revocable: true,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(validateCapabilityToken(issued.value, {
      resource: "ros2:///cmd_vel", action: "publish",
      modelContext: {
        datasetDigest: digest("e"), trainingRecipeDigest: digest("b"),
        promotionEvidenceDigest: digest("c"), rollbackCheckpointDigest: digest("d"),
      },
    })).toEqual({ ok: false, error: "CONSTRAINT_VIOLATION" });
  });

  it("I-VLA8 blocks substituted lineage before the execution adapter can dispatch", async () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey, subject: subject.publicKey,
      resource: "ros2:///cmd_vel", actions: ["publish"], constraints: {},
      modelConstraints: { datasetDigest: digest("a") },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: future, revocable: true,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const request = {
      requestId: "019fdd12-cc01-70d4-8174-208d070bbacc", timestamp: new Date().toISOString(),
      agentId: subject.publicKey, tokenId: issued.value.tokenId, resource: "ros2:///cmd_vel", action: "publish", params: {},
      executionContext: { model: { datasetDigest: digest("b") } },
    } as never;
    const gateway = new PolicyGateway({ resolveToken: (tokenId) => tokenId === issued.value.tokenId ? issued.value : undefined });
    const decision = await gateway.intercept(request);
    expect(decision.action).toBe("deny");
    let dispatches = 0;
    const broker = new ExecutionBroker({
      authorizationVerifier: { verify: async () => ok(true as const) }, nonceStore: new InMemorySimulationReceiptNonceStore(),
      worldStateProvider: { readCurrent: async () => { throw new Error("must not read world state after denial"); } },
      adapter: { dispatch: async () => { dispatches += 1; return ok("sent"); } },
    });
    const result = await broker.execute(request, { decision });
    expect(result.ok).toBe(false);
    expect(dispatches).toBe(0);
  });

  it("I-VLA9 preserves an eligible demonstration-to-token evidence chain", async () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    const ledger = new LedgerWriter();
    const policy = { requiredModalities: ["emg", "video", "hand_pose"] as const, targetActionSpaceDigest: digest("a") };
    const manifest = {
      manifestVersion: "1" as const, demonstrationId: "demo-1", demonstratorPseudonym: "opaque-worker-1",
      consentReceiptDigest: digest("b"), taskId: "delicate-insertion", approvedTaskIds: ["delicate-insertion"],
      capturedAt: future, captureStartedAt: future, captureEndedAt: future,
      calibrationDigest: digest("c"), clockSyncDigest: digest("d"),
      streams: [
        { modality: "emg" as const, digest: digest("e"), sampleRateHz: 100, sensorLayoutDigest: digest("e") },
        { modality: "video" as const, digest: digest("c"), sampleRateHz: 100, sensorLayoutDigest: digest("e") },
        { modality: "hand_pose" as const, digest: digest("d"), sampleRateHz: 100, sensorLayoutDigest: digest("e") },
      ],
      retargetingDigest: digest("f"), targetActionSpaceDigest: digest("a"), trainingEligible: true,
    };
    const orchestrator = new DemonstrationProvenanceOrchestrator(createLedgerEvidenceSink(ledger, subject.publicKey));
    const admission = await orchestrator.admit(digest("1"), manifest, policy);
    expect(admission.ok).toBe(true);
    const dataset = await orchestrator.assembleDataset([{ manifestDigest: digest("1"), manifest }], policy);
    expect(dataset.ok).toBe(true);
    if (!dataset.ok) return;
    const promotion = {
      datasetDigest: dataset.value.datasetDigest, members: dataset.value.members,
      trainingRecipeDigest: digest("2"), baseCheckpointDigest: digest("3"), candidateCheckpointDigest: digest("4"),
      rollbackCheckpointDigest: digest("5"), simulationReportDigest: digest("6"), approvedBy: ["safety-owner"],
    };
    expect((await orchestrator.requestPromotion(promotion, policy)).ok).toBe(true);
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey, subject: subject.publicKey, resource: "ros2:///cmd_vel", actions: ["publish"], constraints: {},
      modelConstraints: { datasetDigest: promotion.datasetDigest, trainingRecipeDigest: promotion.trainingRecipeDigest, checkpointDigest: promotion.candidateCheckpointDigest, rollbackCheckpointDigest: promotion.rollbackCheckpointDigest },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: future, revocable: true,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const gateway = new PolicyGateway({ resolveToken: () => issued.value });
    const decision = await gateway.intercept({
      requestId: "019fdd12-cc01-70d4-8174-208d070bbacd", timestamp: new Date().toISOString(), agentId: subject.publicKey,
      tokenId: issued.value.tokenId, resource: "ros2:///cmd_vel", action: "publish", params: {},
      executionContext: { model: { datasetDigest: promotion.datasetDigest, trainingRecipeDigest: promotion.trainingRecipeDigest, checkpointDigest: promotion.candidateCheckpointDigest, rollbackCheckpointDigest: promotion.rollbackCheckpointDigest } },
    });
    expect(decision.action).toBe("escalate");
    expect(ledger.verifyChain().ok).toBe(true);
    expect(ledger.getAll().map((event) => event.eventType)).toEqual([
      "vla.demonstration.admitted", "vla.dataset.assembled", "vla.checkpoint.promotion.requested",
    ]);
  });

  it("I-VLA3 rejects ungrounded textual embodied memory", () => {
    expect(vlaMemoryEvidenceRefSchema.safeParse({
      evidenceDigest: digest("a"), modality: "text-summary",
      sourceId: "memory", writerId: "policy", observedFrom: "2026-08-07T15:00:00.000Z",
      observedUntil: "2026-08-07T15:01:00.000Z", worldStateEpoch: "epoch-1", expiresAt: future,
    }).success).toBe(false);
  });

  it("I-VLA6 rejects malformed remote-policy output at the wire boundary", () => {
    const parsed = parseOpenPiInferenceResponse({
      requestNonce: "nonce", responseId: "response", issuedAt: future,
      serverIdentity: "did:key:openpi", observationDigest: digest("a"),
      actionSpaceDigest: digest("b"), embodimentId: "robot-1", checkpointDigest: digest("c"),
      actions: [[Number.NaN]], signature: "signature",
    });
    expect(parsed.ok).toBe(false);
  });
});
