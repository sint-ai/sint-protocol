/**
 * MoveIt manipulation policy receipt conformance.
 *
 * This keeps the collaboration question narrow: should manipulation execution
 * carry a policy receipt near the ROS 2 execution boundary, or does that belong
 * somewhere else in the stack?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { actionToResourceUri, topicToResourceUri } from "@pshkv/bridge-ros2";
import { loadMoveItManipulationPolicyReceiptsFixture } from "./fixture-loader.js";

describe("MoveIt manipulation policy receipts fixture v1", () => {
  const fixture = loadMoveItManipulationPolicyReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("moveit-manipulation-policy-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "ros2",
      projectContext: "moveit",
      boundary: "manipulation plan to physical execution",
      goal: "Test whether manipulation execution requests can carry auditable policy receipts without making SINT a required MoveIt runtime dependency.",
      nonGoal: "This fixture does not propose changes to MoveIt core APIs.",
    });
    expect(fixture.requirements).toEqual({
      plansArePrepareTier: true,
      executionRequiresReview: true,
      humanWorkspaceEscalates: true,
      negativeOutcomesCarryReceipt: true,
      receiptBindsPlanAndTrajectory: true,
    });
  });

  it("defines receipt fields that bind plan, trajectory, constraints, and decision", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.robotId).toBe(fixture.deployment.robotId);
    expect(sample.planningGroup).toBe(fixture.deployment.planningGroup);
    expect(sample.workspaceId).toBe(fixture.deployment.workspaceId);
    expect(sample.endEffectorId).toBe(fixture.deployment.endEffectorId);
    expect(sample.planRef).toBe(fixture.deployment.planRef);
    expect(sample.trajectoryRef).toBe(fixture.deployment.trajectoryRef);
    expect(sample.constraintsDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("derives expected ROS 2 resources from mapper helpers", () => {
    for (const item of fixture.cases) {
      if (item.resourceSource === "topic") {
        expect(item.topicName, item.id).toBeDefined();
        expect(topicToResourceUri(item.topicName ?? ""), item.id).toBe(item.expectedResource);
      }

      if (item.resourceSource === "action") {
        expect(item.actionName, item.id).toBeDefined();
        expect(actionToResourceUri(item.actionName ?? ""), item.id).toBe(item.expectedResource);
      }
    }
  });

  it("keeps planning below execution consequence", () => {
    const plan = fixture.cases.find((item) => item.id === "stage_manipulation_plan");
    const execute = fixture.cases.find(
      (item) => item.id === "execute_joint_trajectory_requires_review",
    );

    expect(plan?.expectedTier).toBe(ApprovalTier.T1_PREPARE);
    expect(plan?.expectedDecision).toBe("allow");
    expect(execute?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(execute?.expectedDecision).toBe("escalate");
    expect(execute?.constraints).toEqual({
      maxVelocityMps: 0.25,
      maxForceNewtons: 150,
    });
  });

  it("models human-workspace execution escalation", () => {
    const item = fixture.cases.find((caseItem) => caseItem.id === "human_in_workspace_escalates_execution");

    expect(item?.expectedResource).toBe("ros2:///joint_commands");
    expect(item?.expectedDecision).toBe("escalate");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 0.1,
      currentForceNewtons: 40,
    });
  });

  it("rejects execution evidence that lacks a plan receipt", () => {
    const item = fixture.cases.find(
      (caseItem) => caseItem.id === "execution_without_plan_receipt_rejected",
    );

    expect(item?.expectedResource).toBe("ros2:///joint_commands");
    expect(item?.expectedDecision).toBe("deny");
    expect(item?.policyViolated).toBe("MOVEIT_PLAN_RECEIPT_REQUIRED");
    expect(item?.planReceiptPresent).toBe(false);
    expect(item?.receiptRequired).toBe(true);
  });

  it("keeps all outcomes receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      planningIsPrepareTier: true,
      executionIsHighConsequence: true,
      humanWorkspaceEscalatesToCommit: true,
      missingPlanReceiptDenied: true,
      allOutcomesCarryReceipts: true,
    });

    for (const item of fixture.cases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });
});
