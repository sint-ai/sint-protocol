/**
 * Factory Action Pack Sprint 2 demo conformance.
 *
 * Proves the core prompt-to-factory control loop as an executable fixture:
 * no simulation proof means deny; simulation proof means escalation; only
 * simulation plus explicit human approval can proceed to execution stubs.
 */

import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  executionContextSchema,
  type PolicyDecision,
} from "@pshkv/core";
import {
  FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
  extractPhysicalContext,
  factoryRobotActionToRos2ResourceUri,
  robotActionProfileToAbbRapidExportStub,
  robotActionProfileToFanucLsExportStub,
  robotActionProfileToIsaacSimSimulationReceiptStub,
  robotActionProfileToKukaKrlExportStub,
  robotActionProfileToKukaSimSimulationReceiptStub,
  robotActionProfileToRoboDkSimulationReceiptStub,
  robotActionProfileToRoboGuideSimulationReceiptStub,
  robotActionProfileToRobotStudioSimulationReceiptStub,
  robotActionProfileToSrciCommandProfile,
  robotActionProfileToUrScriptExportStub,
  robotActionProfileToRos2TopicMessage,
  robotActionProfileToUniversalRobotsRos2DemoPath,
} from "@pshkv/bridge-ros2";
import { loadFactoryActionDemoFixture } from "./fixture-loader.js";

const SHA256_REF = /^sha256:[a-f0-9]{64}$/;

type FactoryDemoInputs = {
  readonly simulationReceiptPresent: boolean;
  readonly humanApprovalPresent: boolean;
  readonly safetyZoneClear: boolean;
};

function evaluateFactoryAction(inputs: FactoryDemoInputs): PolicyDecision {
  if (!inputs.safetyZoneClear) {
    return {
      action: "deny",
      assignedTier: ApprovalTier.T3_COMMIT,
      denial: {
        reason: "SAFETY_ZONE_NOT_CLEAR",
        policyViolated: "sint.factory.robot.motion.v1",
      },
    };
  }

  if (!inputs.simulationReceiptPresent) {
    return {
      action: "deny",
      assignedTier: ApprovalTier.T3_COMMIT,
      denial: {
        reason: "SIMULATION_RECEIPT_MISSING",
        policyViolated: "sint.factory.robot.motion.v1",
      },
    };
  }

  if (!inputs.humanApprovalPresent) {
    return {
      action: "escalate",
      assignedTier: ApprovalTier.T3_COMMIT,
      escalation: {
        requiredTier: ApprovalTier.T3_COMMIT,
        timeoutMs: 300_000,
      },
    };
  }

  return {
    action: "allow",
    assignedTier: ApprovalTier.T3_COMMIT,
  };
}

describe("Factory Action Pack demo fixture v1", () => {
  const fixture = loadFactoryActionDemoFixture();

  it("keeps the demo scoped to simulation and control semantics", () => {
    expect(fixture.fixtureId).toBe("factory-action-demo-v1");
    expect(fixture.scopeNote).toContain("does not claim live robot");
    expect(fixture.successCriteria.claimsRemainSimulationOnly).toBe(true);
  });

  it("compiles prompt intent into a cell graph and robot action profile", () => {
    expect(fixture.prompt).toContain("inspection and palletizing");
    expect(fixture.factoryIntent.intent_id).toMatch(/^fi_/);
    expect(fixture.factoryIntent.constraints.human_collaboration).toBe(true);
    expect(fixture.factoryIntent.constraints.safety_standard_targets).toEqual(
      expect.arrayContaining(["ISO_10218", "ISO_TS_15066", "IEC_62443"]),
    );

    expect(fixture.cellGraph.cell_id).toBe(fixture.simulationReceipt.cell_id);
    expect(fixture.cellGraph.simulation_required).toBe(true);
    expect(fixture.cellGraph.approval_tier).toBe(ApprovalTier.T3_COMMIT);
    expect(fixture.cellGraph.assets.some((asset) => asset.type === "plc")).toBe(true);
    expect(fixture.cellGraph.assets.filter((asset) => asset.type === "robot_arm").length).toBeGreaterThanOrEqual(2);

    expect(fixture.robotAction.action_type).toBe("robot.motion.pick_and_place");
    expect(fixture.robotAction.requires).toEqual({
      simulation_receipt: true,
      human_approval: true,
      safety_zone_clear: true,
    });
  });

  it("requires valid simulation proof before any execution path can proceed", () => {
    expect(fixture.simulationReceipt.vendor_program_hash).toMatch(SHA256_REF);
    expect(fixture.simulationReceipt.collision_free).toBe(true);
    expect(fixture.simulationReceipt.safety_zone_violations).toBe(0);
    expect(fixture.simulationReceipt.approved_for_execution).toBe(true);
    expect(fixture.simulationReceipt.max_force_newtons).toBeLessThanOrEqual(
      fixture.robotAction.motion.max_force_newtons,
    );
  });

  it("proves deny -> escalate -> allow control semantics", () => {
    expect(fixture.decisionPath.map((step) => step.id)).toEqual([
      "deny-without-simulation",
      "escalate-after-simulation",
      "allow-after-human-approval",
    ]);

    for (const step of fixture.decisionPath) {
      expect(evaluateFactoryAction(step.inputs)).toEqual(step.expectedDecision);
    }

    const allowStep = fixture.decisionPath.find(
      (step) => step.id === "allow-after-human-approval",
    );
    expect(allowStep?.inputs.simulationReceiptPresent).toBe(true);
    expect(allowStep?.inputs.humanApprovalPresent).toBe(true);
    expect(fixture.successCriteria.allowOnlyAfterHumanApproval).toBe(true);
  });

  it("fans the same action profile into four vendor adapter stubs", () => {
    const vendors = new Set(fixture.adapterStubs.map((stub) => stub.vendor));
    expect(vendors).toEqual(new Set(["ABB", "FANUC", "KUKA", "Universal Robots"]));
    expect(fixture.successCriteria.atLeastTwoVendorStubs).toBe(true);
    expect(fixture.successCriteria.atLeastFourVendorStubs).toBe(true);

    for (const stub of fixture.adapterStubs) {
      expect(stub.adapterId).toMatch(/^sint-adapter-/);
      expect(stub.generatedProgramHash).toMatch(SHA256_REF);
      expect(stub.mapsActionFields).toEqual(
        expect.arrayContaining([
          "target_robot",
          "motion.source_pose",
          "motion.target_pose",
          "motion.max_velocity_mps",
          "motion.max_force_newtons",
        ]),
      );
    }
  });

  it("maps the factory action profile into the ROS2 bridge command surface", () => {
    const message = robotActionProfileToRos2TopicMessage(fixture.robotAction, {
      timestamp: "2026-05-26T20:00:00.000Z",
      cellId: fixture.cellGraph.cell_id,
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });

    expect(factoryRobotActionToRos2ResourceUri()).toBe("ros2:///joint_commands");
    expect(message.topicName).toBe("/joint_commands");
    expect(message.messageType).toBe(FACTORY_ROBOT_ACTION_MESSAGE_TYPE);
    expect(message.data["target_robot"]).toBe(fixture.robotAction.target_robot);

    expect(extractPhysicalContext(message)).toEqual({
      currentVelocityMps: fixture.robotAction.motion.max_velocity_mps,
      currentForceNewtons: fixture.robotAction.motion.max_force_newtons,
    });
  });

  it("derives UR ROS2 and SRCI adapter profiles from the same gated action", () => {
    const urDemoPath = robotActionProfileToUniversalRobotsRos2DemoPath(
      fixture.robotAction,
      {
        timestamp: "2026-05-26T20:00:00.000Z",
        cellId: fixture.cellGraph.cell_id,
        simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
        approvalId: fixture.approval.approvalId,
        robotModel: "ur10e",
        driverNamespace: "/ur10e",
      },
    );
    const srciProfile = robotActionProfileToSrciCommandProfile(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      controllerAssetId: "plc_siemens_1500_01",
    });

    expect(urDemoPath.execution_mode).toBe("simulation_or_test_only");
    expect(urDemoPath.policy_resource).toBe("ros2:///joint_commands");
    expect(urDemoPath.guarded_message.data["simulation_receipt_id"]).toBe(
      fixture.simulationReceipt.simulation_receipt_id,
    );
    expect(urDemoPath.command_surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "/ur10e/script_command" }),
        expect.objectContaining({
          name: "/ur10e/scaled_joint_trajectory_controller/follow_joint_trajectory",
        }),
      ]),
    );

    expect(srciProfile.standard).toBe("SRCI");
    expect(srciProfile.command).toBe("PickPlace");
    expect(srciProfile.gated_policy_resource).toBe("ros2:///joint_commands");
    expect(srciProfile.requires).toEqual(fixture.robotAction.requires);
  });

  it("generates robot-program export stubs from fixture adapter targets", () => {
    const abbStub = fixture.adapterStubs.find((stub) => stub.vendor === "ABB");
    const fanucStub = fixture.adapterStubs.find((stub) => stub.vendor === "FANUC");
    const kukaStub = fixture.adapterStubs.find((stub) => stub.vendor === "KUKA");
    const urStub = fixture.adapterStubs.find(
      (stub) => stub.vendor === "Universal Robots",
    );
    expect(abbStub).toBeDefined();
    expect(fanucStub).toBeDefined();
    expect(kukaStub).toBeDefined();
    expect(urStub).toBeDefined();

    const abb = robotActionProfileToAbbRapidExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_abb_irb_1200_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const fanuc = robotActionProfileToFanucLsExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_fanuc_lr_mate_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const kuka = robotActionProfileToKukaKrlExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_kuka_kr6_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const ur = robotActionProfileToUrScriptExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_ur10e_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });

    expect(abb.target_language).toBe(abbStub?.targetLanguage);
    expect(abb.execution_resource).toContain("robotstudio://");
    expect(abb.program_text).toContain(fixture.robotAction.motion.source_pose);
    expect(abb.program_text).toContain(fixture.simulationReceipt.simulation_receipt_id);
    expect(abb.generated_program_hash).toMatch(SHA256_REF);

    expect(fanuc.target_language).toBe(fanucStub?.targetLanguage);
    expect(fanuc.execution_resource).toContain("roboguide://");
    expect(fanuc.program_text).toContain(fixture.robotAction.motion.target_pose);
    expect(fanuc.program_text).toContain(fixture.approval.approvalId);
    expect(fanuc.generated_program_hash).toMatch(SHA256_REF);

    expect(kuka.target_language).toBe(kukaStub?.targetLanguage);
    expect(kuka.execution_resource).toContain("kuka-sim://");
    expect(kuka.program_text).toContain(fixture.robotAction.motion.source_pose);
    expect(kuka.program_text).toContain(fixture.simulationReceipt.simulation_receipt_id);
    expect(kuka.generated_program_hash).toMatch(SHA256_REF);

    expect(ur.target_language).toBe(urStub?.targetLanguage);
    expect(ur.execution_resource).toContain("polyscope://");
    expect(ur.program_text).toContain(fixture.robotAction.motion.target_pose);
    expect(ur.program_text).toContain(fixture.approval.approvalId);
    expect(ur.generated_program_hash).toMatch(SHA256_REF);

    expect(new Set([abb.vendor, fanuc.vendor, kuka.vendor, ur.vendor])).toEqual(
      new Set(["ABB", "FANUC", "KUKA", "Universal Robots"]),
    );
    expect([
      abb.gated_policy_resource,
      fanuc.gated_policy_resource,
      kuka.gated_policy_resource,
      ur.gated_policy_resource,
    ]).toEqual([
      "ros2:///joint_commands",
      "ros2:///joint_commands",
      "ros2:///joint_commands",
      "ros2:///joint_commands",
    ]);
  });

  it("creates simulator receipt stubs for generated vendor programs", () => {
    const abb = robotActionProfileToAbbRapidExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_abb_irb_1200_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const fanuc = robotActionProfileToFanucLsExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_fanuc_lr_mate_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const kuka = robotActionProfileToKukaKrlExportStub(fixture.robotAction, {
      cellId: fixture.cellGraph.cell_id,
      robotAssetId: "robot_kuka_kr6_01",
      simulationReceiptId: fixture.simulationReceipt.simulation_receipt_id,
      approvalId: fixture.approval.approvalId,
    });
    const isaacReceipt = robotActionProfileToIsaacSimSimulationReceiptStub(
      fixture.robotAction,
      {
        cellId: fixture.cellGraph.cell_id,
        robotAssetId: "robot_abb_irb_1200_01",
        vendorProgramHash: abb.generated_program_hash,
        measuredMaxForceNewtons: fixture.simulationReceipt.max_force_newtons,
        cycleTimeSeconds: fixture.simulationReceipt.cycle_time_seconds,
      },
    );
    const roboDkReceipt = robotActionProfileToRoboDkSimulationReceiptStub(
      fixture.robotAction,
      {
        cellId: fixture.cellGraph.cell_id,
        robotAssetId: "robot_fanuc_lr_mate_01",
        vendorProgramHash: fanuc.generated_program_hash,
        measuredMaxForceNewtons: fixture.simulationReceipt.max_force_newtons,
        cycleTimeSeconds: fixture.simulationReceipt.cycle_time_seconds,
      },
    );
    const robotStudioReceipt =
      robotActionProfileToRobotStudioSimulationReceiptStub(fixture.robotAction, {
        cellId: fixture.cellGraph.cell_id,
        robotAssetId: "robot_abb_irb_1200_01",
        vendorProgramHash: abb.generated_program_hash,
        measuredMaxForceNewtons: fixture.simulationReceipt.max_force_newtons,
        cycleTimeSeconds: fixture.simulationReceipt.cycle_time_seconds,
      });
    const roboGuideReceipt = robotActionProfileToRoboGuideSimulationReceiptStub(
      fixture.robotAction,
      {
        cellId: fixture.cellGraph.cell_id,
        robotAssetId: "robot_fanuc_lr_mate_01",
        vendorProgramHash: fanuc.generated_program_hash,
        measuredMaxForceNewtons: fixture.simulationReceipt.max_force_newtons,
        cycleTimeSeconds: fixture.simulationReceipt.cycle_time_seconds,
      },
    );
    const kukaSimReceipt = robotActionProfileToKukaSimSimulationReceiptStub(
      fixture.robotAction,
      {
        cellId: fixture.cellGraph.cell_id,
        robotAssetId: "robot_kuka_kr6_01",
        vendorProgramHash: kuka.generated_program_hash,
        measuredMaxForceNewtons: fixture.simulationReceipt.max_force_newtons,
        cycleTimeSeconds: fixture.simulationReceipt.cycle_time_seconds,
      },
    );

    expect(isaacReceipt.simulator).toBe("Isaac_Sim");
    expect(isaacReceipt.stage_uri).toContain(fixture.cellGraph.cell_id);
    expect(isaacReceipt.gated_policy_resource).toBe("ros2:///joint_commands");
    expect(isaacReceipt.simulation_receipt.vendor_program_hash).toBe(
      abb.generated_program_hash,
    );
    expect(roboDkReceipt.simulator).toBe("RoboDK");
    expect(roboDkReceipt.simulation_artifact_uri).toContain("robodk://station");
    expect(roboDkReceipt.simulation_receipt.vendor_program_hash).toBe(
      fanuc.generated_program_hash,
    );
    expect(robotStudioReceipt.simulator).toBe("RobotStudio");
    expect(robotStudioReceipt.simulation_artifact_uri).toContain(
      "robotstudio://station",
    );
    expect(robotStudioReceipt.simulation_receipt.vendor_program_hash).toBe(
      abb.generated_program_hash,
    );
    expect(roboGuideReceipt.simulator).toBe("ROBOGUIDE");
    expect(roboGuideReceipt.simulation_artifact_uri).toContain("roboguide://cell");
    expect(roboGuideReceipt.simulation_receipt.vendor_program_hash).toBe(
      fanuc.generated_program_hash,
    );
    expect(kukaSimReceipt.simulator).toBe("KUKA.Sim");
    expect(kukaSimReceipt.simulation_artifact_uri).toContain("kuka-sim://cell");
    expect(kukaSimReceipt.simulation_receipt.vendor_program_hash).toBe(
      kuka.generated_program_hash,
    );

    for (const receipt of [
      isaacReceipt,
      roboDkReceipt,
      robotStudioReceipt,
      roboGuideReceipt,
      kukaSimReceipt,
    ]) {
      expect(receipt.simulation_receipt.approved_for_execution).toBe(true);
      expect(receipt.simulation_receipt.safety_zone_violations).toBe(0);
      expect(receipt.simulation_receipt.metadata.decision_digest).toMatch(SHA256_REF);
      expect(receipt.simulation_receipt.metadata.source_action_type).toBe(
        fixture.robotAction.action_type,
      );
      expect(receipt.simulation_receipt.metadata.simulator_profile_id).toBe(
        receipt.profile_id,
      );
    }
  });

  it("records an append-only receipt chain across plan, simulation, approval, and execution", () => {
    expect(fixture.receiptChain.map((entry) => entry.eventType)).toEqual([
      "factory.intent.compiled",
      "factory.cell_graph.planned",
      "factory.simulation.verified",
      "factory.approval.granted",
      "factory.execution.receipt",
    ]);

    fixture.receiptChain.forEach((entry, index) => {
      expect(entry.digest).toMatch(SHA256_REF);
      if (index === 0) {
        expect(entry.previousDigest).toBeNull();
      } else {
        expect(entry.previousDigest).toBe(fixture.receiptChain[index - 1]?.digest);
      }
    });

    expect(fixture.approval.requiredTier).toBe(ApprovalTier.T3_COMMIT);
    expect(fixture.approval.quorum.required).toBeGreaterThanOrEqual(1);
    expect(fixture.approval.evidenceEvent).toBe("factory.approval.granted");
    expect(fixture.successCriteria.receiptChainIsAppendOnly).toBe(true);
  });

  it("carries the receipt chain as schema-valid operator approval context", () => {
    const executionContext = executionContextSchema.parse({
      bridgeProtocol: "ros2",
      siteId: fixture.cellGraph.cell_id,
      factoryReceiptChain: fixture.receiptChain,
    });

    expect(executionContext.factoryReceiptChain).toHaveLength(5);
    expect(executionContext.factoryReceiptChain?.[0]?.eventType).toBe(
      "factory.intent.compiled",
    );
    expect(executionContext.factoryReceiptChain?.[4]?.eventType).toBe(
      "factory.execution.receipt",
    );
    expect(executionContext.factoryReceiptChain?.[4]?.previousDigest).toBe(
      executionContext.factoryReceiptChain?.[3]?.digest,
    );
  });
});
