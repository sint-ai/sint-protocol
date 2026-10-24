import { describe, expect, it } from "vitest";
import {
  buildTraceBundle,
  verifyTraceBundle,
  type TraceBundleInput,
} from "../src/index.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const UUID_B = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8";
const KEY = "a".repeat(64);
const SIGNATURE = "b".repeat(128);
const HASH = "c".repeat(64);

function bundleInput(): TraceBundleInput {
  return {
    bundleId: UUID_B,
    traceKind: "roadway",
    generatedAt: "2026-08-01T10:30:00.000000Z",
    evidenceArtifacts: [
      {
        evidenceType: "frame",
        evidenceRef: "evidence://incident/frame-001",
        proofHash: HASH,
        verifierRef: "validator://roadway-alpha",
        observedAt: "2026-08-01T10:29:59.000000Z",
      },
    ],
    redactionProfile: {
      mode: "partial",
      policyRef: "policy://public-release",
      redactedFields: ["faces", "plates"],
    },
    correctionEvents: [
      {
        eventId: UUID_A,
        correctionType: "supplement",
        correctedAt: "2026-08-01T10:30:01.000000Z",
        reason: "operator annotation added",
      },
    ],
    previousBundleHash: HASH,
  };
}

describe("TraceBundleBase", () => {
  it("detects mutation of a signed trace bundle", () => {
    const bundle = buildTraceBundle({
      bundle: bundleInput(),
      signerPublicKey: KEY,
      signFn: () => SIGNATURE,
    });

    expect(verifyTraceBundle(
      bundle,
      (_key, signature) => signature === SIGNATURE,
    )).toBe(true);
    expect(verifyTraceBundle(
      { ...bundle, traceKind: "mutated" },
      () => true,
    )).toBe(false);
  });
});
