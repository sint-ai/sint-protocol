/**
 * Solar field operations policy receipt conformance.
 *
 * This keeps the collaboration question small: where should inspection,
 * cleaning, and installation support robots pick up auditable policy receipts?
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { topicToResourceUri } from "@pshkv/bridge-ros2";
import { loadSolarFieldOperationsPolicyReceiptsFixture } from "./fixture-loader.js";

describe("Solar field operations policy receipts fixture v1", () => {
  const fixture = loadSolarFieldOperationsPolicyReceiptsFixture();

  it("declares a project-neutral collaboration scope", () => {
    expect(fixture.fixtureId).toBe("solar-field-operations-policy-receipts-v1");
    expect(fixture.scope).toEqual({
      bridge: "ros2",
      projectContext: "solar-field-operations",
      boundary: "inspection, cleaning, and installation actuation",
      goal: "Test whether solar field inspection, cleaning, and installation actions can carry auditable policy receipts without making SINT a required runtime dependency for field robots.",
      nonGoal: "This fixture does not propose changes to any vendor-specific robot controller.",
    });
    expect(fixture.requirements).toEqual({
      inspectionInferenceStaysObserveTier: true,
      routePlansArePrepareTier: true,
      motionAndToolActuationRequireReview: true,
      weatherPermitRequired: true,
      humanAisleEscalates: true,
      lotoRequiredForInstallation: true,
      negativeOutcomesCarryReceipt: true,
    });
  });

  it("defines receipt fields that bind site, row, mission, and permit evidence", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.siteId).toBe(fixture.deployment.siteId);
    expect(sample.rowId).toBe(fixture.deployment.rowId);
    expect(sample.weatherPermitRef).toBe(fixture.deployment.weatherPermitRef);
    expect(sample.lotoPermitRef).toBe(fixture.deployment.lotoPermitRef);
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

  it("keeps inspection and planning below physical actuation", () => {
    const inspect = fixture.policyCases.find(
      (item) => item.id === "inspection_inference_is_observe_tier",
    );
    const plan = fixture.policyCases.find((item) => item.id === "route_planning_is_prepare_tier");
    const move = fixture.policyCases.find((item) => item.id === "cleaning_motion_requires_review");

    expect(inspect?.resource).toBe("engine://system1/panel_inspection");
    expect(inspect?.expectedDecision).toBe("allow");
    expect(inspect?.expectedTier).toBe(ApprovalTier.T0_OBSERVE);

    expect(plan?.resource).toBe("engine://system2/plan");
    expect(plan?.expectedDecision).toBe("allow");
    expect(plan?.expectedTier).toBe(ApprovalTier.T1_PREPARE);

    expect(move?.resource).toBe("ros2:///cmd_vel");
    expect(move?.expectedDecision).toBe("escalate");
    expect(move?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(move?.constraints).toEqual({
      maxVelocityMps: 0.35,
    });
  });

  it("models human-presence escalation in the service aisle", () => {
    const item = fixture.policyCases.find(
      (caseItem) => caseItem.id === "human_in_aisle_escalates_cleaning_motion",
    );

    expect(item?.resource).toBe("ros2:///cmd_vel");
    expect(item?.expectedDecision).toBe("escalate");
    expect(item?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(item?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 0.1,
    });
  });

  it("requires weather and lockout evidence for high-consequence field actions", () => {
    const weather = fixture.policyCases.find(
      (caseItem) => caseItem.id === "cleaning_motion_without_weather_permit_rejected",
    );
    const loto = fixture.policyCases.find(
      (caseItem) => caseItem.id === "installation_tool_without_loto_rejected",
    );

    expect(weather?.resource).toBe("ros2:///cmd_vel");
    expect(weather?.expectedDecision).toBe("deny");
    expect(weather?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(weather?.weatherPermitPresent).toBe(false);
    expect(weather?.policyViolated).toBe("SOLAR_WEATHER_PERMIT_REQUIRED");

    expect(loto?.resource).toBe("ros2:///joint_commands");
    expect(loto?.expectedDecision).toBe("deny");
    expect(loto?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(loto?.lotoPermitPresent).toBe(false);
    expect(loto?.policyViolated).toBe("SOLAR_LOTO_REQUIRED");
  });

  it("keeps all outcomes receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      inspectionIsObserveTier: true,
      planningIsPrepareTier: true,
      cleaningMotionIsHighConsequence: true,
      humanAisleEscalatesToCommit: true,
      weatherPermitRequiredForMotion: true,
      lotoRequiredForInstallation: true,
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
