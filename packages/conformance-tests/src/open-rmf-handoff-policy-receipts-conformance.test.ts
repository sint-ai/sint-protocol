/**
 * Open-RMF handoff policy receipt conformance.
 *
 * This fixture keeps the collaboration question small: can a fleet handoff or
 * facility action carry a verifiable policy receipt without requiring changes
 * to Open-RMF core APIs?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import {
  defaultTierForRmfOperation,
  rmfDispatchResourceUri,
  rmfFacilityResourceUri,
  rmfOperationToAction,
  rmfRobotResourceUri,
} from "@pshkv/bridge-open-rmf";
import { loadOpenRmfHandoffPolicyReceiptsFixture } from "./fixture-loader.js";

describe("Open-RMF handoff policy receipts fixture v1", () => {
  const fixture = loadOpenRmfHandoffPolicyReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("open-rmf-handoff-policy-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "open-rmf",
      boundary: "fleet handoff and facility workflow",
      goal: "Test whether handoff and facility-control actions can carry auditable policy receipts without making SINT a required Open-RMF runtime dependency.",
      nonGoal: "This fixture does not propose changes to Open-RMF core APIs.",
    });
    expect(fixture.requirements).toEqual({
      handoffRequiresReceipt: true,
      negativeOutcomesCarryReceipt: true,
      facilityCommandsRequireReview: true,
      emergencyOverridesRemainAuditable: true,
    });
  });

  it("defines the minimal receipt fields needed to audit a cross-fleet handoff", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.payloadRef).toBe(fixture.deployment.payloadRef);
    expect(sample.sourceFleet).toBe(fixture.deployment.sourceFleet);
    expect(sample.targetFleet).toBe(fixture.deployment.targetFleet);
    expect(sample.sourceRobotId).toBe(fixture.deployment.sourceRobotId);
    expect(sample.targetRobotId).toBe(fixture.deployment.targetRobotId);
    expect(sample.workspaceId).toBe(fixture.deployment.workspaceId);
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps fixture operations to existing Open-RMF bridge action and tier semantics", () => {
    for (const item of fixture.cases) {
      expect(rmfOperationToAction(item.operation), item.id).toBe(item.expectedAction);
      expect(defaultTierForRmfOperation(item.operation), item.id).toBe(item.expectedTier);
    }
  });

  it("derives expected Open-RMF resources from canonical mapper helpers", () => {
    for (const item of fixture.cases) {
      if (item.fleetName && item.operation === "task.dispatch") {
        expect(rmfDispatchResourceUri(item.fleetName), item.id).toBe(item.expectedResource);
      }

      if (item.fleetName && item.robotName) {
        expect(rmfRobotResourceUri(item.fleetName, item.robotName), item.id).toBe(
          item.expectedResource,
        );
      }

      if (item.resourceKind && item.resourceId) {
        expect(
          rmfFacilityResourceUri(fixture.deployment.siteId, item.resourceKind, item.resourceId),
          item.id,
        ).toBe(item.expectedResource);
      }
    }
  });

  it("captures the collaboration-critical policy outcomes", () => {
    const dispatch = fixture.cases.find((item) => item.id === "dispatch_handoff_requires_review");
    expect(dispatch?.expectedDecision).toBe("escalate");
    expect(dispatch?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(dispatch?.receiptRequired).toBe(true);

    const missingReceipt = fixture.cases.find(
      (item) => item.id === "handoff_without_receipt_rejected",
    );
    expect(missingReceipt?.expectedDecision).toBe("deny");
    expect(missingReceipt?.policyViolated).toBe("HANDOFF_RECEIPT_REQUIRED");
    expect(missingReceipt?.receiptPresent).toBe(false);

    const door = fixture.cases.find((item) => item.id === "door_command_requires_review");
    expect(door?.expectedTier).toBe(ApprovalTier.T2_ACT);

    const estop = fixture.cases.find((item) => item.id === "emergency_stop_override_audited");
    expect(estop?.expectedAction).toBe("override");
    expect(estop?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(estop?.evidenceEventType).toBe("rmf.emergency.stop");
  });

  it("keeps every allow, deny, escalation, and emergency path receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      allCasesHaveReceipts: true,
      dispatchHandoffEscalates: true,
      handoffWithoutReceiptDenied: true,
      facilityCommandIsHighConsequence: true,
      emergencyStopHasEvidence: true,
    });

    for (const item of fixture.cases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });
});
