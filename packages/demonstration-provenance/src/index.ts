type ISO8601 = string;
type SHA256 = string;
import { createHash } from "node:crypto";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type DemonstrationModality = "emg" | "video" | "hand_pose" | "force_torque";
export interface DemonstrationStream {
  readonly modality: DemonstrationModality;
  readonly digest: SHA256;
  readonly sampleRateHz: number;
  readonly sensorLayoutDigest: SHA256;
}
/** Contains only digests and opaque references: never raw biometric recordings or direct identifiers. */
export interface DemonstrationManifest {
  readonly manifestVersion: "1";
  readonly demonstrationId: string;
  readonly demonstratorPseudonym: string;
  readonly consentReceiptDigest: SHA256;
  readonly taskId: string;
  readonly approvedTaskIds: readonly string[];
  readonly capturedAt: ISO8601;
  readonly captureStartedAt: ISO8601;
  readonly captureEndedAt: ISO8601;
  readonly calibrationDigest: SHA256;
  readonly clockSyncDigest: SHA256;
  readonly streams: readonly DemonstrationStream[];
  readonly retargetingDigest: SHA256;
  readonly targetActionSpaceDigest: SHA256;
  readonly trainingEligible: boolean;
}
export type DemonstrationEligibilityErrorCode =
  | "CONSENT_MISSING" | "TASK_OUT_OF_SCOPE" | "CLOCK_SYNC_MISSING" | "CALIBRATION_MISSING"
  | "STREAM_INVALID" | "REQUIRED_MODALITY_MISSING" | "NOT_TRAINING_ELIGIBLE" | "RETARGETING_MISSING" | "EVIDENCE_APPEND_FAILED";
export interface DemonstrationEligibilityError { readonly code: DemonstrationEligibilityErrorCode; readonly message: string; }
export interface DemonstrationPolicy { readonly requiredModalities: readonly DemonstrationModality[]; readonly targetActionSpaceDigest: SHA256; }
export interface DatasetMember { readonly manifestDigest: SHA256; readonly manifest: DemonstrationManifest; }
/** Immutable input to a checkpoint-promotion approval; raw recordings remain outside SINT. */
export interface CheckpointPromotionRequest {
  readonly datasetDigest: SHA256;
  readonly members: readonly DatasetMember[];
  readonly trainingRecipeDigest: SHA256;
  readonly baseCheckpointDigest: SHA256;
  readonly candidateCheckpointDigest: SHA256;
  readonly rollbackCheckpointDigest: SHA256;
  readonly simulationReportDigest: SHA256;
  readonly approvedBy: readonly string[];
}
export type PromotionErrorCode = "DATASET_EMPTY" | "DATASET_MEMBER_INVALID" | "DATASET_MEMBER_DUPLICATE" | "PROMOTION_DIGEST_INVALID" | "ROLLBACK_INVALID" | "SIMULATION_MISSING" | "APPROVAL_MISSING" | "EVIDENCE_APPEND_FAILED";
export interface PromotionError { readonly code: PromotionErrorCode; readonly message: string; }
export type DemonstrationProvenanceEvent = {
  readonly eventType: "vla.demonstration.admitted" | "vla.dataset.assembled" | "vla.checkpoint.promotion.requested" | "vla.checkpoint.promoted" | "vla.checkpoint.rollback.requested" | "vla.demonstration.training_eligibility.revoked";
  readonly payload: Readonly<Record<string, unknown>>;
};
export interface DemonstrationEvidenceSink {
  append(event: DemonstrationProvenanceEvent): Promise<Result<true, { readonly message: string }>> | Result<true, { readonly message: string }>;
}

/** Adapts the built-in hash-chained ledger to the provenance orchestration sink. */
export function createLedgerEvidenceSink(
  ledger: LedgerWriter,
  agentId: string,
  tokenId?: string,
): DemonstrationEvidenceSink {
  return {
    append(event) {
      ledger.append({ eventType: event.eventType, agentId, ...(tokenId !== undefined && { tokenId }), payload: { ...event.payload } });
      return ok(true);
    },
  };
}
const digest = /^[a-f0-9]{64}$/i;
const present = (value: string) => value.length > 0;

/** Deterministic dataset lineage digest; order cannot change the claimed dataset. */
export function deriveDatasetDigest(manifestDigests: readonly SHA256[]): SHA256 {
  return createHash("sha256").update(JSON.stringify([...manifestDigests].sort())).digest("hex");
}

/** Fails closed before a demonstration may enter a training dataset. */
export function validateTrainingEligibility(manifest: DemonstrationManifest, policy: DemonstrationPolicy): Result<DemonstrationManifest, DemonstrationEligibilityError> {
  if (!manifest.trainingEligible) return err({ code: "NOT_TRAINING_ELIGIBLE", message: "Demonstration is not eligible for new training" });
  if (!digest.test(manifest.consentReceiptDigest)) return err({ code: "CONSENT_MISSING", message: "A valid consent receipt digest is required" });
  if (!manifest.approvedTaskIds.includes(manifest.taskId)) return err({ code: "TASK_OUT_OF_SCOPE", message: "Task is outside the approved capture scope" });
  if (!digest.test(manifest.clockSyncDigest)) return err({ code: "CLOCK_SYNC_MISSING", message: "Clock synchronization evidence is required" });
  if (!digest.test(manifest.calibrationDigest)) return err({ code: "CALIBRATION_MISSING", message: "Calibration evidence is required" });
  if (!digest.test(manifest.retargetingDigest) || manifest.targetActionSpaceDigest !== policy.targetActionSpaceDigest) return err({ code: "RETARGETING_MISSING", message: "Retargeting is missing or bound to another action space" });
  const modalities = new Set(manifest.streams.map((stream) => stream.modality));
  if (policy.requiredModalities.some((modality) => !modalities.has(modality))) return err({ code: "REQUIRED_MODALITY_MISSING", message: "A required recording modality is absent" });
  if (manifest.streams.some((stream) => !digest.test(stream.digest) || !digest.test(stream.sensorLayoutDigest) || !Number.isFinite(stream.sampleRateHz) || stream.sampleRateHz <= 0)) return err({ code: "STREAM_INVALID", message: "A stream lacks a valid digest, sensor layout, or sampling rate" });
  if (![manifest.demonstrationId, manifest.demonstratorPseudonym, manifest.capturedAt, manifest.captureStartedAt, manifest.captureEndedAt].every(present)) return err({ code: "STREAM_INVALID", message: "Manifest identity or capture timing is incomplete" });
  return ok(manifest);
}

/** Validates promotion inputs before a checkpoint can be offered execution authority. */
export function validateCheckpointPromotion(request: CheckpointPromotionRequest, policy: DemonstrationPolicy): Result<CheckpointPromotionRequest, PromotionError> {
  if (!request.members.length) return err({ code: "DATASET_EMPTY", message: "A promoted checkpoint requires at least one eligible demonstration" });
  const members = new Set<string>();
  for (const member of request.members) {
    if (!digest.test(member.manifestDigest)) return err({ code: "DATASET_MEMBER_INVALID", message: "Dataset member lacks an immutable manifest digest" });
    if (members.has(member.manifestDigest)) return err({ code: "DATASET_MEMBER_DUPLICATE", message: "Dataset manifest digests must be unique" });
    members.add(member.manifestDigest);
    if (!validateTrainingEligibility(member.manifest, policy).ok) return err({ code: "DATASET_MEMBER_INVALID", message: "Dataset contains an ineligible demonstration" });
  }
  if (request.datasetDigest !== deriveDatasetDigest([...members])) return err({ code: "PROMOTION_DIGEST_INVALID", message: "Dataset digest is not bound to its selected manifests" });
  if (![request.datasetDigest, request.trainingRecipeDigest, request.baseCheckpointDigest, request.candidateCheckpointDigest].every((value) => digest.test(value))) return err({ code: "PROMOTION_DIGEST_INVALID", message: "Promotion requires valid dataset, recipe, base, and candidate digests" });
  if (!digest.test(request.rollbackCheckpointDigest) || request.rollbackCheckpointDigest === request.candidateCheckpointDigest) return err({ code: "ROLLBACK_INVALID", message: "A distinct, valid rollback checkpoint is required" });
  if (!digest.test(request.simulationReportDigest)) return err({ code: "SIMULATION_MISSING", message: "A valid simulation report digest is required" });
  if (!request.approvedBy.length || request.approvedBy.some((approver) => !present(approver))) return err({ code: "APPROVAL_MISSING", message: "Promotion requires at least one designated approver" });
  return ok(request);
}

/** Digest-only event payloads intended for the append-only EvidenceLedger. */
export function createDemonstrationAdmittedEvent(manifestDigest: SHA256, manifest: DemonstrationManifest): DemonstrationProvenanceEvent {
  return { eventType: "vla.demonstration.admitted", payload: {
    manifestDigest, demonstrationId: manifest.demonstrationId, taskId: manifest.taskId,
    consentReceiptDigest: manifest.consentReceiptDigest, calibrationDigest: manifest.calibrationDigest,
    clockSyncDigest: manifest.clockSyncDigest, streamDigests: manifest.streams.map((stream) => stream.digest),
  } };
}

export function createDatasetAssembledEvent(datasetDigest: SHA256, members: readonly DatasetMember[]): DemonstrationProvenanceEvent {
  return { eventType: "vla.dataset.assembled", payload: { datasetDigest, manifestDigests: members.map((member) => member.manifestDigest).sort() } };
}

export function createPromotionRequestedEvent(request: CheckpointPromotionRequest): DemonstrationProvenanceEvent {
  return { eventType: "vla.checkpoint.promotion.requested", payload: {
    datasetDigest: request.datasetDigest, trainingRecipeDigest: request.trainingRecipeDigest,
    baseCheckpointDigest: request.baseCheckpointDigest, candidateCheckpointDigest: request.candidateCheckpointDigest,
    rollbackCheckpointDigest: request.rollbackCheckpointDigest, simulationReportDigest: request.simulationReportDigest,
    approvers: request.approvedBy,
  } };
}

export function createCheckpointPromotedEvent(request: CheckpointPromotionRequest): DemonstrationProvenanceEvent {
  return { eventType: "vla.checkpoint.promoted", payload: {
    datasetDigest: request.datasetDigest, candidateCheckpointDigest: request.candidateCheckpointDigest,
    rollbackCheckpointDigest: request.rollbackCheckpointDigest, approvers: request.approvedBy,
  } };
}

export function createCheckpointRollbackRequestedEvent(candidateCheckpointDigest: SHA256, rollbackCheckpointDigest: SHA256, reasonCode: string): DemonstrationProvenanceEvent {
  return { eventType: "vla.checkpoint.rollback.requested", payload: { candidateCheckpointDigest, rollbackCheckpointDigest, reasonCode } };
}

export function createTrainingEligibilityRevokedEvent(manifestDigest: SHA256, reasonCode: string): DemonstrationProvenanceEvent {
  return { eventType: "vla.demonstration.training_eligibility.revoked", payload: { manifestDigest, reasonCode } };
}

/**
 * Capture/training control plane. It validates first, then appends only
 * digest-only provenance facts to the configured append-only evidence sink.
 */
export class DemonstrationProvenanceOrchestrator {
  constructor(private readonly evidence: DemonstrationEvidenceSink) {}

  async admit(
    manifestDigest: SHA256,
    manifest: DemonstrationManifest,
    policy: DemonstrationPolicy,
  ): Promise<Result<DemonstrationManifest, DemonstrationEligibilityError>> {
    const admitted = validateTrainingEligibility(manifest, policy);
    if (!admitted.ok) return admitted;
    const appended = await this.evidence.append(createDemonstrationAdmittedEvent(manifestDigest, manifest));
    if (!appended.ok) return err({ code: "EVIDENCE_APPEND_FAILED", message: appended.error.message });
    return admitted;
  }

  async assembleDataset(
    members: readonly DatasetMember[],
    policy: DemonstrationPolicy,
  ): Promise<Result<{ readonly datasetDigest: SHA256; readonly members: readonly DatasetMember[] }, PromotionError>> {
    if (!members.length) return err({ code: "DATASET_EMPTY", message: "A dataset requires at least one eligible demonstration" });
    const seen = new Set<string>();
    for (const member of members) {
      if (seen.has(member.manifestDigest)) return err({ code: "DATASET_MEMBER_DUPLICATE", message: "Dataset manifest digests must be unique" });
      seen.add(member.manifestDigest);
      if (!validateTrainingEligibility(member.manifest, policy).ok) return err({ code: "DATASET_MEMBER_INVALID", message: "Dataset contains an ineligible demonstration" });
    }
    const datasetDigest = deriveDatasetDigest([...seen]);
    const appended = await this.evidence.append(createDatasetAssembledEvent(datasetDigest, members));
    if (!appended.ok) return err({ code: "EVIDENCE_APPEND_FAILED", message: appended.error.message });
    return ok({ datasetDigest, members });
  }

  async requestPromotion(
    request: CheckpointPromotionRequest,
    policy: DemonstrationPolicy,
  ): Promise<Result<CheckpointPromotionRequest, PromotionError>> {
    const promotion = validateCheckpointPromotion(request, policy);
    if (!promotion.ok) return promotion;
    const appended = await this.evidence.append(createPromotionRequestedEvent(request));
    if (!appended.ok) return err({ code: "EVIDENCE_APPEND_FAILED", message: appended.error.message });
    return promotion;
  }

  async revokeTrainingEligibility(manifestDigest: SHA256, reasonCode: string): Promise<Result<true, { readonly message: string }>> {
    return this.evidence.append(createTrainingEligibilityRevokedEvent(manifestDigest, reasonCode));
  }
}
