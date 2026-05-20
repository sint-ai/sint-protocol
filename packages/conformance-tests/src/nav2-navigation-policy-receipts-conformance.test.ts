/**
 * Nav2 navigation policy receipt conformance.
 *
 * The fixture keeps the collaboration question small: where should navigation
 * intent, docking motion, and human-workspace escalation pick up auditable
 * policy receipts?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { actionToResourceUri, topicToResourceUri } from "@pshkv/bridge-ros2";
import { loadNav2NavigationPolicyReceiptsFixture } from "./fixture-loader.js";

describe("Nav2 navigation policy receipts fixture v1", () => {
  const fixture = loadNav2NavigationPolicyReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("nav2-navigation-policy-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "ros2",
      projectContext: "nav2",
      boundary: "navigation intent to physical motion",
      goal: "Test whether navigation goals and docking-related motion can carry auditable policy receipts without making SINT a required Nav2 runtime dependency.",
      nonGoal: "This fixture does not propose changes to Nav2 core APIs.",
    });
    expect(fixture.requirements).toEqual({
      routePlansArePrepareTier: true,
      navigationGoalsRouteThroughGateway: true,
      motionCommandsRequireReview: true,
      humanWorkspaceEscalates: true,
      negativeOutcomesCarryReceipt: true,
    });
  });

  it("defines receipt fields that bind route, zone access, docking target, and decision", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.robotId).toBe(fixture.deployment.robotId);
    expect(sample.routeRef).toBe(fixture.deployment.routeRef);
    expect(sample.zoneAccessRef).toBe(fixture.deployment.zoneAccessRef);
    expect(sample.workspaceId).toBe(fixture.deployment.workspaceId);
    expect(sample.dockingStationId).toBe(fixture.deployment.dockingStationId);
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("routes navigation goals through the canonical ROS 2 action boundary", () => {
    for (const item of fixture.mappingCases) {
      expect(actionToResourceUri(item.actionName), item.id).toBe(item.expectedResource);
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });

  it("keeps route staging below physical motion", () => {
    const plan = fixture.policyCases.find((item) => item.id === "stage_route_waypoints");
    const dock = fixture.policyCases.find((item) => item.id === "dock_motion_requires_review");

    expect(topicToResourceUri(plan?.topicName ?? ""), plan?.id).toBe(plan?.expectedResource);
    expect(plan?.expectedDecision).toBe("allow");
    expect(plan?.expectedTier).toBe(ApprovalTier.T1_PREPARE);

    expect(topicToResourceUri(dock?.topicName ?? ""), dock?.id).toBe(dock?.expectedResource);
    expect(dock?.expectedDecision).toBe("escalate");
    expect(dock?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(dock?.params).toEqual({
      command: "dock_to_station",
      destination: "Dock-3",
    });
  });

  it("models human-workspace escalation during navigation motion", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "human_in_workspace_escalates_navigation_motion",
    );

    expect(item?.expectedResource).toBe("ros2:///cmd_vel");
    expect(item?.expectedDecision).toBe("escalate");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 0.12,
    });
  });

  it("rejects docking motion without zone-access evidence", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "dock_motion_without_zone_receipt_rejected",
    );

    expect(item?.expectedResource).toBe("ros2:///cmd_vel");
    expect(item?.expectedDecision).toBe("deny");
    expect(item?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(item?.zoneAccessReceiptPresent).toBe(false);
    expect(item?.policyViolated).toBe("NAV2_ZONE_ACCESS_RECEIPT_REQUIRED");
    expect(item?.receiptRequired).toBe(true);
  });

  it("keeps all critical navigation paths receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      navigationGoalsCarryReceipts: true,
      routePlanningIsPrepareTier: true,
      dockingMotionIsHighConsequence: true,
      humanWorkspaceEscalatesToCommit: true,
      missingZoneReceiptDenied: true,
    });

    for (const item of fixture.mappingCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }

    for (const item of fixture.policyCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });
});
