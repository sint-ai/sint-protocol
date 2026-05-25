/**
 * PX4 offboard policy receipt conformance.
 *
 * This keeps the collaboration question small: should MAVLink arming,
 * offboard-mode changes, and continuous setpoints pick up policy receipts at
 * the router or companion boundary, or somewhere else in the stack?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import type { MavCommandLong, MavSetPositionTargetLocalNed, MavlinkIntercept } from "@pshkv/bridge-mavlink";
import { mapMavlinkToSint } from "@pshkv/bridge-mavlink";
import { loadPx4OffboardPolicyReceiptsFixture } from "./fixture-loader.js";

function toIntercept(
  item: ReturnType<typeof loadPx4OffboardPolicyReceiptsFixture>["mappingCases"][number],
): MavlinkIntercept {
  return {
    messageType: item.intercept.messageType,
    command: "command" in item.intercept.payload ? item.intercept.payload.command : undefined,
    payload: item.intercept.payload as MavCommandLong | MavSetPositionTargetLocalNed,
    timestamp: "2026-06-02T17:00:00.000Z",
    systemId: item.intercept.systemId,
    componentId: item.intercept.componentId,
  };
}

describe("PX4 offboard policy receipts fixture v1", () => {
  const fixture = loadPx4OffboardPolicyReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("px4-offboard-policy-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "mavlink",
      projectContext: "px4",
      boundary: "arming, offboard mode, and continuous setpoints",
      goal: "Test whether MAVLink arming, offboard-mode, fence-change, and velocity-setpoint actions can carry auditable policy receipts without making SINT a required PX4 runtime dependency.",
      nonGoal: "This fixture does not propose changes to PX4 flight-control internals.",
    });
    expect(fixture.requirements).toEqual({
      armAndModeChangesRequireCommitReview: true,
      velocitySetpointsRequireReview: true,
      humanTakeoffZoneEscalates: true,
      fenceChangesRequireEvidence: true,
      negativeOutcomesCarryReceipt: true,
      px4EncryptedLogCorrelationRequired: true,
    });

    expect(fixture.deployment.px4LogFormat).toBe("ulge");
    expect(fixture.deployment.px4LogEvidenceRef).toMatch(/^sint:\/\/evidence\/px4\//);
  });

  it("defines receipt fields that bind vehicle, mission corridor, mode, and decision", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.vehicleId).toBe(fixture.deployment.vehicleId);
    expect(sample.systemId).toBe(fixture.deployment.systemId);
    expect(sample.missionRef).toBe(fixture.deployment.missionRef);
    expect(sample.corridorRef).toBe(fixture.deployment.corridorRef);
    expect(sample.takeoffZoneId).toBe(fixture.deployment.takeoffZoneId);
    expect(sample.flightMode).toBe("OFFBOARD");
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("routes MAVLink intercepts through the canonical bridge mapper", () => {
    for (const item of fixture.mappingCases) {
      const mapped = mapMavlinkToSint(toIntercept(item));

      expect(mapped.resource, item.id).toBe(item.expectedResource);
      expect(mapped.action, item.id).toBe(item.expectedAction);
      expect(mapped.baseTier, item.id).toBe(item.expectedTier);

      if (item.expectedPhysicalContext?.currentVelocityMps !== undefined) {
        expect(mapped.physicalContext?.currentVelocityMps, item.id).toBeCloseTo(
          item.expectedPhysicalContext.currentVelocityMps,
          5,
        );
      }
    }
  });

  it("keeps arming and OFFBOARD transitions at the commit boundary", () => {
    const arm = fixture.policyCases.find((item) => item.id === "arm_vehicle_requires_commit_review");
    const offboard = fixture.policyCases.find((item) => item.id === "offboard_mode_requires_commit_review");

    expect(arm?.expectedResource).toBe("mavlink://11/cmd/arm");
    expect(arm?.expectedDecision).toBe("escalate");
    expect(arm?.expectedTier).toBe(ApprovalTier.T3_COMMIT);

    expect(offboard?.expectedResource).toBe("mavlink://11/cmd/mode");
    expect(offboard?.expectedDecision).toBe("escalate");
    expect(offboard?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(offboard?.targetMode).toBe("OFFBOARD");
  });

  it("keeps continuous setpoints below commit unless the takeoff zone is human occupied", () => {
    const setpoint = fixture.policyCases.find((item) => item.id === "velocity_setpoint_requires_review");
    const human = fixture.policyCases.find(
      (item) => item.id === "human_in_takeoff_zone_escalates_velocity_setpoint",
    );

    expect(setpoint?.expectedResource).toBe("mavlink://11/cmd_vel");
    expect(setpoint?.expectedDecision).toBe("escalate");
    expect(setpoint?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(setpoint?.constraints).toEqual({
      maxVelocityMps: 15,
      corridorRef: fixture.deployment.corridorRef,
    });

    expect(human?.expectedResource).toBe("mavlink://11/cmd_vel");
    expect(human?.expectedDecision).toBe("escalate");
    expect(human?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(human?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 1.8,
    });
  });

  it("rejects fence disable evidence when corridor authorization is missing", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "fence_disable_without_corridor_receipt_rejected",
    );

    expect(item?.expectedResource).toBe("mavlink://11/cmd/fence");
    expect(item?.expectedDecision).toBe("deny");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.corridorReceiptPresent).toBe(false);
    expect(item?.policyViolated).toBe("PX4_CORRIDOR_RECEIPT_REQUIRED");
    expect(item?.receiptRequired).toBe(true);
  });

  it("rejects OFFBOARD transitions when encrypted-log correlation evidence is missing", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "offboard_without_ulog_correlation_rejected",
    );

    expect(item?.expectedResource).toBe("mavlink://11/cmd/mode");
    expect(item?.expectedDecision).toBe("deny");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.policyViolated).toBe("PX4_ULOG_CORRELATION_REQUIRED");
    expect(item?.receiptRequired).toBe(true);
  });

  it("keeps all outcomes receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      armAndModeStayCommitTier: true,
      velocitySetpointsAreHighConsequence: true,
      humanPresenceEscalatesToCommit: true,
      missingCorridorReceiptDenied: true,
      allOutcomesCarryReceipts: true,
      missingUlogCorrelationDenied: true,
    });

    for (const item of fixture.mappingCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }

    for (const item of fixture.policyCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });
});
