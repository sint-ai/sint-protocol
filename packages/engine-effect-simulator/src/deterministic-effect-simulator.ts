import {
  canonicalJsonStringify,
  err,
  ok,
  type EffectSimulationError,
  type EffectSimulator,
  type Result,
  type SimulationEvidenceGrade,
  type SimulationEvidenceReceipt,
  type SimulationPreflight,
  type SimulationSafetyResult,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import {
  generateUUIDv7,
  hashSha256,
  sign,
} from "@pshkv/gate-capability-tokens";
import type {
  DeterministicCheckRecord,
  DeterministicEffectSimulatorOptions,
} from "./types.js";

const GRADE_ORDER: Record<SimulationEvidenceGrade, number> = {
  deterministic: 0,
  physics: 1,
  "digital-twin": 2,
};

interface DeterministicArtifact {
  readonly schemaVersion: "1.0.0";
  readonly backend: string;
  readonly modelId?: string;
  readonly effectPlanDigest: string;
  readonly worldSnapshotDigest: string;
  readonly checks: readonly DeterministicCheckRecord[];
  readonly result: SimulationSafetyResult;
}

function signingPayload(receipt: SimulationEvidenceReceipt): string {
  const { signature: _signature, ...payload } = receipt;
  return canonicalJsonStringify(payload);
}

function error(
  code: EffectSimulationError["code"],
  message: string,
  retryable: boolean,
): Result<never, EffectSimulationError> {
  return err({ code, message, retryable });
}

/**
 * In-process millisecond-tier simulator. It issues evidence only; it has no
 * authorization or hardware-dispatch capability.
 */
export class DeterministicEffectSimulator implements EffectSimulator {
  readonly backend = "sint-deterministic";
  readonly supportedGrades = ["deterministic"] as const;

  private readonly receiptTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: DeterministicEffectSimulatorOptions) {
    this.receiptTtlMs = options.receiptTtlMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  async simulate(
    preflight: SimulationPreflight,
    worldSnapshot?: SimulationWorldSnapshot,
  ): Promise<Result<SimulationEvidenceReceipt, EffectSimulationError>> {
    if (preflight.kind !== "simulation-preflight" || preflight.authorizesExecution !== false) {
      return error("INVALID_PREFLIGHT", "Only non-authorizing SINT simulation preflights are accepted", false);
    }
    const requiredGrade = preflight.requirement?.minEvidenceGrade ?? "deterministic";
    if (GRADE_ORDER[requiredGrade]! > GRADE_ORDER.deterministic!) {
      return error(
        "UNSUPPORTED_EVIDENCE_GRADE",
        `Backend ${this.backend} cannot satisfy ${requiredGrade} evidence`,
        false,
      );
    }
    if (!worldSnapshot) {
      return error("WORLD_SNAPSHOT_REQUIRED", "A content-addressed world snapshot is required", true);
    }

    const now = this.now();
    const observedAt = Date.parse(worldSnapshot.observedAt);
    const validUntil = Date.parse(worldSnapshot.validUntil);
    if (!Number.isFinite(observedAt) || !Number.isFinite(validUntil) || observedAt > now || validUntil <= now) {
      return error("WORLD_SNAPSHOT_STALE", "World snapshot is invalid, future-dated, or expired", true);
    }

    const model = this.options.models.find((candidate) => candidate.supports(preflight.effectPlan));
    let modelId: string | undefined;
    let checks: readonly DeterministicCheckRecord[] = [];
    let result: SimulationSafetyResult;
    if (!model) {
      result = {
        outcome: "indeterminate",
        collisions: 0,
        safetyZoneViolations: 0,
        assumptions: ["No deterministic effect model matched this resource and action"],
        unsupportedPhenomena: [`unsupported effect ${preflight.effectPlan.action} ${preflight.effectPlan.resource}`],
      };
    } else {
      const evaluated = model.evaluate(preflight.effectPlan, worldSnapshot);
      if (!evaluated.ok) return evaluated;
      modelId = model.id;
      checks = evaluated.value.checks;
      result = evaluated.value.result;
    }

    const artifact: DeterministicArtifact = {
      schemaVersion: "1.0.0",
      backend: this.backend,
      ...(modelId !== undefined && { modelId }),
      effectPlanDigest: preflight.effectPlan.effectPlanDigest,
      worldSnapshotDigest: worldSnapshot.digest,
      checks,
      result,
    };
    const artifactContent = canonicalJsonStringify(artifact);
    const persistedArtifact = await this.options.artifactStore.put({
      mediaType: "application/vnd.sint.deterministic-trace+json;version=1",
      content: artifactContent,
    });
    if (!persistedArtifact.ok) {
      return error(
        "ARTIFACT_PERSISTENCE_FAILED",
        persistedArtifact.error.message,
        true,
      );
    }
    const expectedArtifactDigest = hashSha256(artifactContent);
    if (persistedArtifact.value.digest !== expectedArtifactDigest) {
      return error(
        "ARTIFACT_PERSISTENCE_FAILED",
        "Artifact store returned a digest that does not match the deterministic trace",
        false,
      );
    }
    const generatedAt = new Date(now).toISOString();
    const expiresAt = new Date(Math.min(now + this.receiptTtlMs, validUntil)).toISOString();
    const receiptId = generateUUIDv7();
    const unsigned: SimulationEvidenceReceipt = {
      schemaVersion: "2.0.0",
      receiptId,
      evidenceGrade: "deterministic",
      requestDigest: preflight.effectPlan.requestDigest,
      effectPlanDigest: preflight.effectPlan.effectPlanDigest,
      tokenDigest: preflight.effectPlan.tokenDigest,
      resource: preflight.effectPlan.resource,
      action: preflight.effectPlan.action,
      ...(this.options.bindings !== undefined && { bindings: this.options.bindings }),
      worldSnapshot,
      simulator: {
        backend: this.backend,
        version: this.options.version,
        modelDigest: this.options.modelDigest,
        ...(this.options.imageDigest !== undefined && { imageDigest: this.options.imageDigest }),
      },
      scenarios: {
        scenarioSetDigest: hashSha256(canonicalJsonStringify({ modelId, checks: checks.map((check) => check.check) })),
        runCount: 1,
        coverage: result.outcome === "indeterminate" ? 0 : 1,
        seeds: [],
      },
      result,
      generatedAt,
      expiresAt,
      nonce: `simulation:${receiptId}`,
      artifactDigest: persistedArtifact.value.digest,
      signerPublicKey: this.options.signerPublicKey,
      signature: "0".repeat(128),
    };

    const receipt: SimulationEvidenceReceipt = {
      ...unsigned,
      signature: sign(this.options.signerPrivateKey, signingPayload(unsigned)),
    };
    const recorded = await this.options.receiptRecorder.recordIssued(receipt);
    if (!recorded.ok) {
      return error("EVIDENCE_LEDGER_WRITE_FAILED", recorded.error.message, true);
    }
    return ok(receipt);
  }
}
