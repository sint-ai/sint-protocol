import {
  canonicalJsonStringify,
  type Ed25519PublicKey,
  type Ed25519Signature,
  type ISO8601,
  type SHA256,
  type UUIDv7,
} from "@pshkv/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

export interface PopwSensorEvidence {
  readonly sensorType: string;
  readonly sourceId: string;
  readonly capturedAt: ISO8601;
  readonly digest: SHA256;
  readonly sampleCount?: number;
}

export interface PopwMediaEvidence {
  readonly kind: "image" | "video" | "log" | "trace" | "other";
  readonly digest: SHA256;
  readonly uri?: string;
}

export interface PopwValidatorMetrics {
  readonly accuracyPct?: number;
  readonly speedPct?: number;
  readonly safetyPct: number;
  readonly optimalPathPct?: number;
  readonly energyEfficiencyPct?: number;
  readonly trajectoryStabilityPct?: number;
  readonly finalPct: number;
}

export interface PopwValidatorAttestation {
  readonly validatorId: string;
  readonly verdict: "success" | "failure" | "inconclusive";
  readonly metrics: PopwValidatorMetrics;
  readonly evidenceHash: SHA256;
  readonly signedAt: ISO8601;
}

export interface PopwEvidenceBundle {
  readonly bundleId: UUIDv7;
  readonly taskId: string;
  readonly actionRef: string;
  readonly subnet: string;
  readonly robotId: string;
  readonly deadline: ISO8601;
  readonly sensorEvidence: readonly PopwSensorEvidence[];
  readonly mediaEvidence: readonly PopwMediaEvidence[];
  readonly policyEvidenceHash: SHA256;
  readonly gateReceiptEventId?: UUIDv7;
  readonly validatorAttestations: readonly PopwValidatorAttestation[];
  readonly generatedAt: ISO8601;
  readonly previousBundleHash?: SHA256;
  readonly bundleHash: SHA256;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signature: Ed25519Signature;
}

export type PopwEvidenceBundleInput = Omit<
  PopwEvidenceBundle,
  "bundleHash" | "signerPublicKey" | "signature"
>;

export interface PopwCompletenessResult {
  readonly ok: boolean;
  readonly missing: readonly string[];
}

function hashJson(value: unknown): SHA256 {
  return bytesToHex(
    sha256(new TextEncoder().encode(canonicalJsonStringify(value))),
  );
}

export function computePopwBundleHash(
  bundle: PopwEvidenceBundleInput,
): SHA256 {
  return hashJson(bundle);
}

export function buildPopwEvidenceBundle(params: {
  readonly bundle: PopwEvidenceBundleInput;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signFn: (data: string) => string;
}): PopwEvidenceBundle {
  const bundleHash = computePopwBundleHash(params.bundle);
  const unsigned = {
    ...params.bundle,
    bundleHash,
    signerPublicKey: params.signerPublicKey,
  };
  return {
    ...unsigned,
    signature: params.signFn(canonicalJsonStringify(unsigned)),
  };
}

export function verifyPopwEvidenceBundle(
  bundle: PopwEvidenceBundle,
  verifySignatureFn: (
    publicKey: string,
    signature: string,
    data: string,
  ) => boolean,
): boolean {
  const {
    bundleHash,
    signature,
    signerPublicKey,
    ...bundleInput
  } = bundle;
  if (computePopwBundleHash(bundleInput) !== bundleHash) return false;

  return verifySignatureFn(
    signerPublicKey,
    signature,
    canonicalJsonStringify({
      ...bundleInput,
      bundleHash,
      signerPublicKey,
    }),
  );
}

export function validatePopwBundleCompleteness(params: {
  readonly bundle: Pick<
    PopwEvidenceBundle,
    | "taskId"
    | "actionRef"
    | "robotId"
    | "deadline"
    | "sensorEvidence"
    | "mediaEvidence"
    | "policyEvidenceHash"
  >;
  readonly expectedTaskId: string;
  readonly expectedRobotId: string;
  readonly expectedDeadline: ISO8601;
  readonly requiredSensorTypes: readonly string[];
}): PopwCompletenessResult {
  const missing: string[] = [];
  const { bundle } = params;

  if (bundle.taskId !== params.expectedTaskId) missing.push("taskId");
  if (!bundle.actionRef) missing.push("actionRef");
  if (bundle.robotId !== params.expectedRobotId) missing.push("robotId");
  if (bundle.deadline !== params.expectedDeadline) missing.push("deadline");
  if (!bundle.policyEvidenceHash) missing.push("policyEvidenceHash");
  if (bundle.mediaEvidence.length === 0) missing.push("mediaEvidence");

  const sensorTypes = new Set(
    bundle.sensorEvidence.map((evidence) => evidence.sensorType),
  );
  for (const sensorType of params.requiredSensorTypes) {
    if (!sensorTypes.has(sensorType)) {
      missing.push(`sensor:${sensorType}`);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
