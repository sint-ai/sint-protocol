import { describe, expect, it } from "vitest";
import {
  buildPopwEvidenceBundle,
  validatePopwBundleCompleteness,
  verifyPopwEvidenceBundle,
  type PopwEvidenceBundleInput,
} from "../src/index.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const KEY = "a".repeat(64);
const SIGNATURE = "b".repeat(128);
const HASH = "c".repeat(64);
const HASH_2 = "d".repeat(64);

function bundleInput(): PopwEvidenceBundleInput {
  return {
    bundleId: UUID_A,
    taskId: "job-011",
    actionRef: "act-job-011",
    subnet: "subnet://warehouse-amr",
    robotId: "robot://amr-17",
    deadline: "2026-06-21T12:30:00.000Z",
    sensorEvidence: [
      {
        sensorType: "gps",
        sourceId: "gps-1",
        capturedAt: "2026-06-21T12:10:00.000Z",
        digest: HASH,
      },
      {
        sensorType: "imu",
        sourceId: "imu-1",
        capturedAt: "2026-06-21T12:10:00.000Z",
        digest: HASH,
      },
      {
        sensorType: "video",
        sourceId: "front-camera",
        capturedAt: "2026-06-21T12:10:00.000Z",
        digest: HASH_2,
      },
    ],
    mediaEvidence: [
      {
        kind: "video",
        digest: HASH_2,
        uri: "evidence://job-011/front-camera",
      },
    ],
    policyEvidenceHash: HASH,
    gateReceiptEventId: UUID_A,
    validatorAttestations: [
      {
        validatorId: "validator://alpha",
        verdict: "success",
        metrics: {
          safetyPct: 91,
          finalPct: 92,
          trajectoryStabilityPct: 90,
        },
        evidenceHash: HASH,
        signedAt: "2026-06-21T12:12:00.000Z",
      },
    ],
    generatedAt: "2026-06-21T12:12:01.000Z",
  };
}

describe("PopwEvidenceBundle", () => {
  it("detects mutation of a signed physical-work evidence bundle", () => {
    const bundle = buildPopwEvidenceBundle({
      bundle: bundleInput(),
      signerPublicKey: KEY,
      signFn: () => SIGNATURE,
    });

    expect(verifyPopwEvidenceBundle(
      bundle,
      (_key, signature) => signature === SIGNATURE,
    )).toBe(true);
    expect(verifyPopwEvidenceBundle(
      { ...bundle, robotId: "robot://mutated" },
      () => true,
    )).toBe(false);
  });

  it("reports missing required sensor evidence before settlement", () => {
    const bundle = buildPopwEvidenceBundle({
      bundle: {
        ...bundleInput(),
        sensorEvidence: bundleInput().sensorEvidence.filter(
          (evidence) => evidence.sensorType !== "video",
        ),
      },
      signerPublicKey: KEY,
      signFn: () => SIGNATURE,
    });

    const result = validatePopwBundleCompleteness({
      bundle,
      expectedTaskId: "job-011",
      expectedRobotId: "robot://amr-17",
      expectedDeadline: "2026-06-21T12:30:00.000Z",
      requiredSensorTypes: ["gps", "imu", "video"],
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toContain("sensor:video");
  });
});
