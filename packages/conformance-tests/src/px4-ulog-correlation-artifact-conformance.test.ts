/**
 * PX4 ULog correlation artifact conformance.
 *
 * Ensures the encrypted-log correlation artifact has the minimum
 * fields/operators need for incident replay across SINT + PX4 timelines.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { loadPx4UlogCorrelationArtifactFixture } from "./fixture-loader.js";

describe("PX4 ULog correlation artifact fixture v1", () => {
  const fixture = loadPx4UlogCorrelationArtifactFixture();

  it("declares canonical artifact metadata", () => {
    expect(fixture.fixtureId).toBe("px4-ulog-correlation-artifact-v1");
    expect(fixture.sample.artifactType).toBe("px4-ulog-correlation");
    expect(fixture.sample.px4LogEvidence.logFormat).toBe("ulge");
  });

  it("contains all required top-level fields", () => {
    for (const field of fixture.requiredFields) {
      expect(fixture.sample[field as keyof typeof fixture.sample], field).toBeTruthy();
    }
  });

  it("binds policy decision and telemetry evidence with verifiable digests", () => {
    const sample = fixture.sample;

    expect(sample.policyDecision.action).toBe("escalate");
    expect(sample.policyDecision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(sample.policyDecision.decisionEventType).toBe("policy.evaluated");
    expect(sample.policyDecision.decisionEventHash).toMatch(/^[a-f0-9]{64}$/);

    expect(sample.px4LogEvidence.encryptedLogDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sample.px4LogEvidence.decryptedLogDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sample.px4LogEvidence.keyRef).toMatch(/^kms:\/\//);
  });

  it("declares a bounded correlation window and timing threshold", () => {
    const sample = fixture.sample;

    expect(sample.correlation.correlationStatus).toBe("matched");
    expect(sample.correlation.maxAllowedDeltaMs).toBeGreaterThan(0);
    expect(sample.correlation.matchedEvents.length).toBeGreaterThan(0);

    const first = sample.correlation.matchedEvents[0];
    expect(first.deltaMs).toBeLessThanOrEqual(sample.correlation.maxAllowedDeltaMs);
  });
});
