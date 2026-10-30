import { describe, expect, it } from "vitest";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { createDemonstrationAdmittedEvent, createLedgerEvidenceSink, createPromotionRequestedEvent, DemonstrationProvenanceOrchestrator, deriveDatasetDigest, validateCheckpointPromotion, validateTrainingEligibility, type DemonstrationManifest } from "../src/index.js";
const hash = "a".repeat(64);
const manifest: DemonstrationManifest = { manifestVersion: "1", demonstrationId: "demo-1", demonstratorPseudonym: "worker-opaque-1", consentReceiptDigest: hash, taskId: "sewing", approvedTaskIds: ["sewing"], capturedAt: "2026-09-21T00:00:00.000Z", captureStartedAt: "2026-09-21T00:00:00.000Z", captureEndedAt: "2026-09-21T00:01:00.000Z", calibrationDigest: hash, clockSyncDigest: hash, streams: ["emg", "video", "hand_pose"].map((modality) => ({ modality: modality as "emg" | "video" | "hand_pose", digest: hash, sampleRateHz: 100, sensorLayoutDigest: hash })), retargetingDigest: hash, targetActionSpaceDigest: hash, trainingEligible: true };
const policy = { requiredModalities: ["emg", "video", "hand_pose"] as const, targetActionSpaceDigest: hash };
describe("demonstration eligibility", () => {
  it("accepts a complete, scoped multimodal manifest", () => expect(validateTrainingEligibility(manifest, policy).ok).toBe(true));
  it("fails closed for missing consent, revoked eligibility, bad streams, and action-space substitution", () => {
    expect(validateTrainingEligibility({ ...manifest, consentReceiptDigest: "" }, policy).error?.code).toBe("CONSENT_MISSING");
    expect(validateTrainingEligibility({ ...manifest, trainingEligible: false }, policy).error?.code).toBe("NOT_TRAINING_ELIGIBLE");
    expect(validateTrainingEligibility({ ...manifest, streams: manifest.streams.slice(1) }, policy).error?.code).toBe("REQUIRED_MODALITY_MISSING");
    expect(validateTrainingEligibility({ ...manifest, targetActionSpaceDigest: "b".repeat(64) }, policy).error?.code).toBe("RETARGETING_MISSING");
  });
  it("requires eligible lineage, simulation, rollback, and approval for a checkpoint promotion", () => {
    const request = { datasetDigest: deriveDatasetDigest([hash]), members: [{ manifestDigest: hash, manifest }], trainingRecipeDigest: "b".repeat(64), baseCheckpointDigest: "c".repeat(64), candidateCheckpointDigest: "d".repeat(64), rollbackCheckpointDigest: "e".repeat(64), simulationReportDigest: "f".repeat(64), approvedBy: ["safety-owner"] };
    expect(validateCheckpointPromotion(request, policy).ok).toBe(true);
    expect(validateCheckpointPromotion({ ...request, approvedBy: [] }, policy).error?.code).toBe("APPROVAL_MISSING");
    expect(validateCheckpointPromotion({ ...request, rollbackCheckpointDigest: request.candidateCheckpointDigest }, policy).error?.code).toBe("ROLLBACK_INVALID");
    expect(createDemonstrationAdmittedEvent(hash, manifest).payload).not.toHaveProperty("demonstratorPseudonym");
    expect(createPromotionRequestedEvent(request).payload).toMatchObject({ datasetDigest: request.datasetDigest, candidateCheckpointDigest: request.candidateCheckpointDigest });
  });

  it("orchestrates validated capture and promotion evidence without raw biometric payloads", async () => {
    const events: unknown[] = [];
    const orchestrator = new DemonstrationProvenanceOrchestrator({ append: (event) => { events.push(event); return { ok: true, value: true } as const; } });
    expect((await orchestrator.admit(hash, manifest, policy)).ok).toBe(true);
    const dataset = await orchestrator.assembleDataset([{ manifestDigest: hash, manifest }], policy);
    expect(dataset.ok).toBe(true);
    if (!dataset.ok) return;
    const request = { datasetDigest: dataset.value.datasetDigest, members: dataset.value.members, trainingRecipeDigest: "b".repeat(64), baseCheckpointDigest: "c".repeat(64), candidateCheckpointDigest: "d".repeat(64), rollbackCheckpointDigest: "e".repeat(64), simulationReportDigest: "f".repeat(64), approvedBy: ["safety-owner"] };
    expect((await orchestrator.requestPromotion(request, policy)).ok).toBe(true);
    await orchestrator.revokeTrainingEligibility(hash, "consent_withdrawn");
    expect(events).toHaveLength(4);
    expect(events).not.toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ demonstratorPseudonym: manifest.demonstratorPseudonym }) }));
  });

  it("writes provenance through the hash-chained EvidenceLedger adapter", async () => {
    const ledger = new LedgerWriter();
    const orchestrator = new DemonstrationProvenanceOrchestrator(createLedgerEvidenceSink(ledger, "a".repeat(64)));
    expect((await orchestrator.admit(hash, manifest, policy)).ok).toBe(true);
    expect(ledger.getAll()[0]?.eventType).toBe("vla.demonstration.admitted");
    expect(ledger.verifyChain().ok).toBe(true);
  });
});
