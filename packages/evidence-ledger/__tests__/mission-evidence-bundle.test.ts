import { describe, expect, it } from "vitest";
import type { AuthorityDecision } from "@pshkv/core";
import {
  buildMissionEvidenceBundle,
  verifyMissionEvidenceBundle,
} from "../src/index.js";

const UUID_A = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const UUID_B = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8";
const KEY = "a".repeat(64);
const SIGNATURE = "b".repeat(128);
const HASH = "c".repeat(64);

describe("MissionEvidenceBundle", () => {
  it("detects mutation of the signed evidence package", () => {
    const decision: AuthorityDecision = {
      actionRef: "action-1",
      manifestId: UUID_A,
      action: "allow",
      evaluatedAt: "2026-06-06T10:30:00.000000Z",
    };
    const bundle = buildMissionEvidenceBundle({
      bundle: {
        bundleId: UUID_B,
        manifestId: UUID_A,
        actionRef: "action-1",
        platformId: "px4-air-01",
        authorityDecision: decision,
        operatorAuthorizations: [],
        sensorProvenance: [{
          sourceId: "ekf-1",
          observedAt: "2026-06-06T10:29:59.000000Z",
          digest: HASH,
        }],
        softwareVersion: "0.3.0",
        manifestVersion: 1,
        gateReceiptEventId: UUID_A,
        outcome: "not_executed",
        generatedAt: "2026-06-06T10:30:00.000000Z",
      },
      signerPublicKey: KEY,
      signFn: () => SIGNATURE,
    });

    expect(verifyMissionEvidenceBundle(
      bundle,
      (_key, signature) => signature === SIGNATURE,
    )).toBe(true);
    expect(verifyMissionEvidenceBundle(
      { ...bundle, platformId: "mutated-platform" },
      () => true,
    )).toBe(false);
  });
});
