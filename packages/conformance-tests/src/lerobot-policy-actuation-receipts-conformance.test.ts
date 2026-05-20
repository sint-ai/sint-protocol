/**
 * LeRobot policy actuation receipt conformance.
 *
 * This keeps the collaboration question small: where should a learned policy
 * checkpoint and rollout become auditable execution on a real robot?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { topicToResourceUri } from "@pshkv/bridge-ros2";
import { loadLeRobotPolicyActuationReceiptsFixture } from "./fixture-loader.js";

describe("LeRobot policy actuation receipts fixture v1", () => {
  const fixture = loadLeRobotPolicyActuationReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("lerobot-policy-actuation-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "ros2",
      projectContext: "lerobot",
      boundary: "learned policy rollout to hardware actuation",
      goal: "Test whether learned-policy execution can carry auditable policy receipts without making SINT a required LeRobot runtime dependency.",
      nonGoal: "This fixture does not propose changes to LeRobot training pipelines or model architectures.",
    });
    expect(fixture.requirements).toEqual({
      rolloutPlansArePrepareTier: true,
      learnedExecutionRequiresReview: true,
      actuationReceiptsBindCheckpointAndHardwareProfile: true,
      humanWorkspaceEscalates: true,
      checkpointMismatchDenied: true,
      negativeOutcomesCarryReceipt: true,
    });
  });

  it("defines receipt fields that bind checkpoint, dataset lineage, and hardware profile", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.robotId).toBe(fixture.deployment.robotId);
    expect(sample.checkpointRef).toBe(fixture.deployment.checkpointRef);
    expect(sample.datasetRef).toBe(fixture.deployment.datasetRef);
    expect(sample.rolloutRef).toBe(fixture.deployment.rolloutRef);
    expect(sample.hardwareProfileRef).toBe(fixture.deployment.hardwareProfileRef);
    expect(sample.workspaceId).toBe(fixture.deployment.workspaceId);
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("derives expected resources from engine and ROS 2 boundaries", () => {
    for (const item of fixture.mappingCases) {
      if (item.resourceSource === "engine") {
        expect(item.resource, item.id).toBe(item.expectedResource);
      }

      if (item.resourceSource === "topic") {
        expect(item.topicName, item.id).toBeDefined();
        expect(topicToResourceUri(item.topicName ?? ""), item.id).toBe(item.expectedResource);
      }
    }
  });

  it("keeps rollout staging below live execution", () => {
    const plan = fixture.policyCases.find((item) => item.id === "rollout_plan_is_prepare_tier");
    const execute = fixture.policyCases.find((item) => item.id === "learned_execution_requires_review");

    expect(plan?.resource).toBe("engine://system2/plan");
    expect(plan?.expectedDecision).toBe("allow");
    expect(plan?.expectedTier).toBe(ApprovalTier.T1_PREPARE);

    expect(execute?.resource).toBe("engine://system2/execute");
    expect(execute?.expectedDecision).toBe("escalate");
    expect(execute?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(execute?.constraints).toEqual({
      maxVelocityMps: 0.2,
      maxForceNewtons: 80,
    });
  });

  it("models human-workspace escalation for learned actuation", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "human_in_workspace_escalates_joint_actuation",
    );

    expect(item?.resource).toBe("ros2:///joint_commands");
    expect(item?.expectedDecision).toBe("escalate");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 0.08,
      currentForceNewtons: 35,
    });
  });

  it("rejects silent checkpoint swaps after rollout approval", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "checkpoint_swap_without_reapproval_rejected",
    );

    expect(item?.resource).toBe("engine://system2/execute");
    expect(item?.expectedDecision).toBe("deny");
    expect(item?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(item?.checkpointFingerprintMatches).toBe(false);
    expect(item?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(item?.receiptRequired).toBe(true);
  });

  it("keeps all outcomes receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      rolloutPlanningIsPrepareTier: true,
      learnedExecutionIsHighConsequence: true,
      actuationBindsCheckpointAndHardwareProfile: true,
      humanWorkspaceEscalatesToCommit: true,
      checkpointMismatchDenied: true,
      allOutcomesCarryReceipts: true,
    });

    for (const item of fixture.mappingCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }

    for (const item of fixture.policyCases) {
      expect(item.receiptRequired, item.id).toBe(true);
    }
  });
});
