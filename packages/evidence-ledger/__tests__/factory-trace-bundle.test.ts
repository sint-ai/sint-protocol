import { describe, expect, it } from "vitest";
import { generateKeypair, sign, verify } from "@pshkv/gate-capability-tokens";
import {
  buildPartTraceBundle,
  redactPartTraceBundle,
  verifyPartTraceBundle,
  type PartTraceBundleInput,
} from "../src/index.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const UUID_B = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8";
const HASH = "c".repeat(64);

function bundleInput(): PartTraceBundleInput {
  return {
    bundleId: UUID_B,
    traceKind: "factory-part",
    generatedAt: "2026-08-01T10:30:00.000000Z",
    evidenceArtifacts: [
      {
        evidenceType: "inspection",
        evidenceRef: "inspection://part-42",
        proofHash: HASH,
      },
    ],
    partNumber: "PN-42",
    revision: "B",
    materialLotId: "lot-9",
    routeId: "route-1",
    routeSteps: [
      {
        stepId: "step-1",
        operation: "mill",
        machineId: "cnc-7",
        cellId: "cell-a",
        programDigest: HASH,
        completedAt: "2026-08-01T10:29:59.000000Z",
      },
    ],
    authorityTokenRefs: ["token://factory/authority/001"],
    inspectionReceiptRefs: ["inspection://part-42"],
    approvalRefs: ["approval://part-42/quality"],
    nonconformanceRefs: [],
    reworkRefs: [],
    shipmentDisposition: "release",
  };
}

describe("PartTraceBundle", () => {
  it("verifies the signed part trace bundle and detects mutation", () => {
    const keypair = generateKeypair();
    const bundle = buildPartTraceBundle({
      bundle: bundleInput(),
      signerPublicKey: keypair.publicKey,
      signFn: (data) => sign(keypair.privateKey, data),
    });

    expect(verifyPartTraceBundle(
      bundle,
      verify,
    )).toBe(true);
    expect(verifyPartTraceBundle(
      { ...bundle, partNumber: "mutated" },
      verify,
    )).toBe(false);
  });

  it("redacts customer-facing fields when requested", () => {
    const redacted = redactPartTraceBundle(bundleInput(), "redacted");
    expect(redacted.customerSafe).toBe(true);
    expect(redacted.authorityTokenRefs).toHaveLength(0);
    expect(redacted.approvalRefs).toHaveLength(0);
    expect(redacted.nonconformanceRefs).toHaveLength(0);
    expect(redacted.reworkRefs).toHaveLength(0);
    expect(redacted.redactionProfile?.mode).toBe("redacted");
  });
});
