/**
 * Code-as-policy robot-agent skill guard conformance.
 *
 * This covers the Waddle-shaped pattern without binding SINT to a vendor API:
 * an agent writes robot code, promotes reusable skills, and executes physical
 * primitives only through gateway-backed receipts.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { topicToResourceUri } from "@pshkv/bridge-ros2";
import { loadCodeAsPolicySkillGuardFixture } from "./fixture-loader.js";

describe("Code-as-policy skill guard fixture v1", () => {
  const fixture = loadCodeAsPolicySkillGuardFixture();

  it("declares a vendor-neutral robot-agent scope", () => {
    expect(fixture.fixtureId).toBe("code-as-policy-skill-guard-v1");
    expect(fixture.scope).toEqual({
      bridge: "ros2",
      projectContext: "code-as-policy-robot-agent",
      boundary: "agent-generated robot program to physical actuation",
      goal: "Test whether a robot agent that writes and revises control programs can stage code, register reusable skills, and execute primitives only through SINT-governed receipts.",
      nonGoal: "This fixture does not depend on a specific vendor API, model family, robot embodiment, or training stack.",
    });
    expect(fixture.requirements).toEqual({
      generatedProgramsArePrepareTier: true,
      skillLibraryMutationRequiresContentBinding: true,
      primitiveExecutionRoutesThroughGateway: true,
      concurrentRobotCoordinationRequiresReceipts: true,
      postApprovalProgramMutationDenied: true,
      negativeOutcomesCarryReceipt: true,
    });
  });

  it("defines receipt fields that bind generated code, skills, primitives, and hardware", () => {
    const { sample } = fixture.receiptSchema;

    for (const field of fixture.receiptSchema.requiredFields) {
      expect(sample[field], field).toBeTruthy();
    }

    expect(sample.agentId).toBe(fixture.deployment.agentId);
    expect(sample.robotIds).toBe(fixture.deployment.robotIds.join(","));
    expect(sample.programRef).toBe(fixture.deployment.programRef);
    expect(sample.programDigest).toBe(fixture.deployment.programDigest);
    expect(sample.skillRef).toBe(fixture.deployment.skillRef);
    expect(sample.skillDigest).toBe(fixture.deployment.skillDigest);
    expect(sample.primitiveSetRef).toBe(fixture.deployment.primitiveSetRef);
    expect(sample.hardwareProfileRef).toBe(fixture.deployment.hardwareProfileRef);
    expect(sample.workspaceId).toBe(fixture.deployment.workspaceId);
    expect(sample.decisionDigest).toMatch(/^digest:sha256:[a-f0-9]{64}$/);
    expect(sample.eventHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sample.previousHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("derives expected resources from engine, capsule, and ROS 2 boundaries", () => {
    for (const item of fixture.mappingCases) {
      if (item.resourceSource === "engine" || item.resourceSource === "capsule") {
        expect(item.resource, item.id).toBe(item.expectedResource);
      }

      if (item.resourceSource === "topic") {
        expect(item.topicName, item.id).toBeDefined();
        expect(topicToResourceUri(item.topicName ?? ""), item.id).toBe(item.expectedResource);
      }
    }
  });

  it("keeps generated program and skill staging below live execution", () => {
    const program = fixture.policyCases.find(
      (item) => item.id === "program_generation_is_prepare_tier",
    );
    const skill = fixture.policyCases.find(
      (item) => item.id === "skill_registration_requires_matching_digest",
    );
    const execute = fixture.policyCases.find(
      (item) => item.id === "generated_program_execution_requires_review",
    );

    expect(program?.resource).toBe("engine://system2/plan");
    expect(program?.expectedDecision).toBe("allow");
    expect(program?.expectedTier).toBe(ApprovalTier.T1_PREPARE);

    expect(skill?.resource).toBe("engine://capsule/skill-library/register");
    expect(skill?.expectedDecision).toBe("allow");
    expect(skill?.expectedTier).toBe(ApprovalTier.T1_PREPARE);
    expect(skill?.programDigestMatches).toBe(true);
    expect(skill?.skillDigestMatches).toBe(true);

    expect(execute?.resource).toBe("engine://system2/execute");
    expect(execute?.expectedDecision).toBe("escalate");
    expect(execute?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(execute?.constraints).toEqual({
      maxVelocityMps: 0.2,
      maxForceNewtons: 80,
      allowedPrimitives: ["bounding_box", "detect_in_base", "preset", "approach_until", "reset_home"],
    });
  });

  it("models coordinated primitive actuation and human-workspace escalation", () => {
    const coordinated = fixture.policyCases.find(
      (item) => item.id === "concurrent_robot_primitive_execution_requires_receipts",
    );
    const human = fixture.policyCases.find(
      (item) => item.id === "human_workspace_escalates_generated_trajectory",
    );

    expect(coordinated?.resource).toBe("ros2:///joint_trajectory_controller/follow_joint_trajectory");
    expect(coordinated?.expectedDecision).toBe("escalate");
    expect(coordinated?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(coordinated?.constraints).toEqual({
      maxVelocityMps: 0.18,
      maxForceNewtons: 70,
    });

    expect(human?.resource).toBe("ros2:///joint_trajectory_controller/follow_joint_trajectory");
    expect(human?.expectedDecision).toBe("escalate");
    expect(human?.expectedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(human?.physicalContext).toEqual({
      humanDetected: true,
      currentVelocityMps: 0.06,
      currentForceNewtons: 22,
    });
  });

  it("rejects generated-code or skill mutations after approval", () => {
    const programMutation = fixture.policyCases.find(
      (item) => item.id === "program_mutation_without_reapproval_denied",
    );
    const primitiveMutation = fixture.policyCases.find(
      (item) => item.id === "new_primitive_after_approval_denied",
    );

    expect(programMutation?.expectedDecision).toBe("deny");
    expect(programMutation?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(programMutation?.programDigestMatches).toBe(false);
    expect(programMutation?.skillDigestMatches).toBe(true);
    expect(programMutation?.policyViolated).toBe("CONSTRAINT_VIOLATION");

    expect(primitiveMutation?.expectedDecision).toBe("deny");
    expect(primitiveMutation?.expectedTier).toBe(ApprovalTier.T2_ACT);
    expect(primitiveMutation?.skillDigestMatches).toBe(false);
    expect(primitiveMutation?.policyViolated).toBe("FORBIDDEN_COMBINATION");
  });

  it("keeps all outcomes receipt-backed", () => {
    expect(fixture.successCriteria).toEqual({
      generatedProgramStagingIsPrepareTier: true,
      generatedSkillRegistrationIsContentBound: true,
      physicalPrimitiveExecutionIsHighConsequence: true,
      concurrentRobotActuationCarriesReceipts: true,
      programMutationWithoutReapprovalDenied: true,
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
