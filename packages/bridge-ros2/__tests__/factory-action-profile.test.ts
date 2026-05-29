/**
 * Factory Action Profile mapping tests.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier, type SintCapabilityToken, type SintCapabilityTokenRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
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
  robotActionProfileToRos2Data,
  robotActionProfileToRos2TopicMessage,
  robotActionProfileToUniversalRobotsRos2DemoPath,
  ROS2Interceptor,
  type RobotActionProfile,
} from "../src/index.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const robotAction: RobotActionProfile = {
  action_type: "robot.motion.pick_and_place",
  target_robot: "robot_abb_irb_1200_01",
  motion: {
    source_pose: "inspection_conveyor_exit",
    target_pose: "pallet_station_A",
    max_velocity_mps: 0.25,
    max_force_newtons: 80,
    collision_check: true,
  },
  tool: {
    type: "vacuum_gripper",
    payload_kg: 2.4,
  },
  requires: {
    simulation_receipt: true,
    human_approval: true,
    safety_zone_clear: true,
  },
  adapter_hint: "sint-adapter-abb-rapid",
};

describe("Factory Action Profile ROS2 mapping", () => {
  it("maps RobotActionProfile into the canonical ROS2 joint command surface", () => {
    const message = robotActionProfileToRos2TopicMessage(robotAction, {
      timestamp: "2026-05-26T20:00:00.000Z",
      cellId: "packaging_cell_001",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
    });

    expect(message.topicName).toBe("/joint_commands");
    expect(message.messageType).toBe(FACTORY_ROBOT_ACTION_MESSAGE_TYPE);
    expect(message.data).toEqual({
      action_type: "robot.motion.pick_and_place",
      target_robot: "robot_abb_irb_1200_01",
      source_pose: "inspection_conveyor_exit",
      target_pose: "pallet_station_A",
      max_velocity_mps: 0.25,
      max_force_newtons: 80,
      collision_check: true,
      tool_type: "vacuum_gripper",
      payload_kg: 2.4,
      requires_simulation_receipt: true,
      requires_human_approval: true,
      requires_safety_zone_clear: true,
      adapter_hint: "sint-adapter-abb-rapid",
      cell_id: "packaging_cell_001",
      simulation_receipt_id: "simr_packaging_001",
      approval_id: "approval_packaging_001",
    });
    expect(factoryRobotActionToRos2ResourceUri()).toBe("ros2:///joint_commands");
  });

  it("extracts physical constraints from factory action data", () => {
    const data = robotActionProfileToRos2Data(robotAction);
    const context = extractPhysicalContext({
      topicName: "/joint_commands",
      messageType: FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
      data,
      timestamp: "2026-05-26T20:00:00.000Z",
    });

    expect(context).toEqual({
      currentVelocityMps: 0.25,
      currentForceNewtons: 80,
    });
  });

  it("derives a Universal Robots ROS2 demo path without bypassing SINT", () => {
    const demoPath = robotActionProfileToUniversalRobotsRos2DemoPath(robotAction, {
      timestamp: "2026-05-26T20:00:00.000Z",
      cellId: "packaging_cell_001",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
      robotModel: "ur10e",
      driverNamespace: "/ur10e",
    });

    expect(demoPath.profile_id).toBe("universal-robots-ros2-demo");
    expect(demoPath.execution_mode).toBe("simulation_or_test_only");
    expect(demoPath.policy_resource).toBe("ros2:///joint_commands");
    expect(demoPath.guarded_message.topicName).toBe("/joint_commands");
    expect(demoPath.guarded_message.data.target_robot).toBe(robotAction.target_robot);
    expect(demoPath.command_surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "action",
          name: "/ur10e/scaled_joint_trajectory_controller/follow_joint_trajectory",
        }),
        expect.objectContaining({
          kind: "topic",
          name: "/ur10e/script_command",
        }),
      ]),
    );
    expect(demoPath.required_preconditions).toEqual([
      "simulation_receipt",
      "human_approval",
      "safety_zone_clear",
    ]);
  });

  it("maps RobotActionProfile into an SRCI command profile", () => {
    const profile = robotActionProfileToSrciCommandProfile(robotAction, {
      cellId: "packaging_cell_001",
      controllerAssetId: "plc_siemens_1500_01",
    });

    expect(profile.profile_id).toBe("srci-command-profile");
    expect(profile.standard).toBe("SRCI");
    expect(profile.command).toBe("PickPlace");
    expect(profile.resource).toBe(
      "srci://cell/packaging_cell_001/controller/plc_siemens_1500_01/robot/robot_abb_irb_1200_01/command/pick_place",
    );
    expect(profile.gated_policy_resource).toBe("ros2:///joint_commands");
    expect(profile.motion.max_velocity_mps).toBe(0.25);
    expect(profile.motion.max_force_newtons).toBe(80);
    expect(profile.requires.human_approval).toBe(true);
  });

  it("generates vendor export stubs from the same gated action", () => {
    const commonOptions = {
      cellId: "packaging_cell_001",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
    };
    const abb = robotActionProfileToAbbRapidExportStub(robotAction, {
      ...commonOptions,
      robotAssetId: "robot_abb_irb_1200_01",
      programName: "sint_packaging_rapid",
    });
    const fanuc = robotActionProfileToFanucLsExportStub(robotAction, {
      ...commonOptions,
      robotAssetId: "robot_fanuc_lr_mate_01",
      programName: "sint_packaging_ls",
    });
    const kuka = robotActionProfileToKukaKrlExportStub(robotAction, {
      ...commonOptions,
      robotAssetId: "robot_kuka_kr6_01",
      programName: "sint_packaging_krl",
    });
    const ur = robotActionProfileToUrScriptExportStub(robotAction, {
      ...commonOptions,
      robotAssetId: "robot_ur10e_01",
      programName: "sint_packaging_ur",
    });

    expect(abb.profile_id).toBe("abb-rapid-export-stub");
    expect(abb.target_language).toBe("RAPID");
    expect(abb.execution_resource).toBe(
      "robotstudio://packaging_cell_001/robot_abb_irb_1200_01/sint_packaging_rapid",
    );
    expect(abb.generated_program_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(abb.program_text).toContain("MODULE sint_packaging_rapid");
    expect(abb.program_text).toContain("sint_simulation_receipt_id");
    expect(abb.program_text).toContain("sint_approval_id");

    expect(fanuc.profile_id).toBe("fanuc-ls-export-stub");
    expect(fanuc.target_language).toBe("LS");
    expect(fanuc.execution_resource).toBe(
      "roboguide://packaging_cell_001/robot_fanuc_lr_mate_01/SINT_PACKAGING_LS",
    );
    expect(fanuc.generated_program_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fanuc.program_text).toContain("/PROG SINT_PACKAGING_LS");
    expect(fanuc.program_text).toContain("simulation_receipt_id=simr_packaging_001");
    expect(fanuc.program_text).toContain("approval_id=approval_packaging_001");

    expect(kuka.profile_id).toBe("kuka-krl-export-stub");
    expect(kuka.target_language).toBe("KRL");
    expect(kuka.execution_resource).toBe(
      "kuka-sim://packaging_cell_001/robot_kuka_kr6_01/sint_packaging_krl",
    );
    expect(kuka.generated_program_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(kuka.program_text).toContain("DEF sint_packaging_krl()");
    expect(kuka.program_text).toContain("simulation_receipt_id=simr_packaging_001");
    expect(kuka.program_text).toContain("approval_id=approval_packaging_001");

    expect(ur.profile_id).toBe("ur-script-export-stub");
    expect(ur.target_language).toBe("URScript");
    expect(ur.execution_resource).toBe(
      "polyscope://packaging_cell_001/robot_ur10e_01/sint_packaging_ur",
    );
    expect(ur.generated_program_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ur.program_text).toContain("def sint_packaging_ur():");
    expect(ur.program_text).toContain("sint_simulation_receipt_id=simr_packaging_001");
    expect(ur.program_text).toContain("sint_approval_id=approval_packaging_001");

    for (const stub of [abb, fanuc, kuka, ur]) {
      expect(stub.gated_policy_resource).toBe("ros2:///joint_commands");
      expect(stub.maps_action_fields).toEqual(
        expect.arrayContaining([
          "target_robot",
          "motion.source_pose",
          "motion.target_pose",
          "motion.max_velocity_mps",
          "motion.max_force_newtons",
          "tool.payload_kg",
        ]),
      );
      expect(stub.required_preconditions).toEqual([
        "simulation_receipt",
        "human_approval",
        "safety_zone_clear",
      ]);
    }
  });

  it("derives simulator receipt stubs from vendor export hashes", () => {
    const abb = robotActionProfileToAbbRapidExportStub(robotAction, {
      cellId: "packaging_cell_001",
      robotAssetId: "robot_abb_irb_1200_01",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
    });
    const fanuc = robotActionProfileToFanucLsExportStub(robotAction, {
      cellId: "packaging_cell_001",
      robotAssetId: "robot_fanuc_lr_mate_01",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
    });
    const kuka = robotActionProfileToKukaKrlExportStub(robotAction, {
      cellId: "packaging_cell_001",
      robotAssetId: "robot_kuka_kr6_01",
      simulationReceiptId: "simr_packaging_001",
      approvalId: "approval_packaging_001",
    });
    const isaacReceipt = robotActionProfileToIsaacSimSimulationReceiptStub(robotAction, {
      cellId: "packaging_cell_001",
      robotAssetId: "robot_abb_irb_1200_01",
      vendorProgramHash: abb.generated_program_hash,
      measuredMaxForceNewtons: 62,
      cycleTimeSeconds: 2.4,
    });
    const roboDkReceipt = robotActionProfileToRoboDkSimulationReceiptStub(robotAction, {
      cellId: "packaging_cell_001",
      robotAssetId: "robot_fanuc_lr_mate_01",
      vendorProgramHash: fanuc.generated_program_hash,
      measuredMaxForceNewtons: 62,
      cycleTimeSeconds: 2.6,
    });
    const robotStudioReceipt =
      robotActionProfileToRobotStudioSimulationReceiptStub(robotAction, {
        cellId: "packaging_cell_001",
        robotAssetId: "robot_abb_irb_1200_01",
        vendorProgramHash: abb.generated_program_hash,
        measuredMaxForceNewtons: 62,
        cycleTimeSeconds: 2.4,
      });
    const roboGuideReceipt = robotActionProfileToRoboGuideSimulationReceiptStub(
      robotAction,
      {
        cellId: "packaging_cell_001",
        robotAssetId: "robot_fanuc_lr_mate_01",
        vendorProgramHash: fanuc.generated_program_hash,
        measuredMaxForceNewtons: 62,
        cycleTimeSeconds: 2.6,
      },
    );
    const kukaSimReceipt = robotActionProfileToKukaSimSimulationReceiptStub(
      robotAction,
      {
        cellId: "packaging_cell_001",
        robotAssetId: "robot_kuka_kr6_01",
        vendorProgramHash: kuka.generated_program_hash,
        measuredMaxForceNewtons: 62,
        cycleTimeSeconds: 2.8,
      },
    );

    expect(isaacReceipt.profile_id).toBe("isaac-sim-simulation-receipt-stub");
    expect(isaacReceipt.gated_policy_resource).toBe("ros2:///joint_commands");
    expect(isaacReceipt.stage_uri).toContain("isaac-sim://stage");
    expect(isaacReceipt.simulation_artifact_uri).toBe(isaacReceipt.stage_uri);
    expect(isaacReceipt.simulation_receipt.simulator).toBe("Isaac_Sim");
    expect(isaacReceipt.simulation_receipt.vendor_program_hash).toBe(
      abb.generated_program_hash,
    );
    expect(roboDkReceipt.profile_id).toBe("robodk-simulation-receipt-stub");
    expect(roboDkReceipt.simulator).toBe("RoboDK");
    expect(roboDkReceipt.simulation_artifact_uri).toContain("robodk://station");
    expect(roboDkReceipt.simulation_receipt.vendor_program_hash).toBe(
      fanuc.generated_program_hash,
    );

    expect(robotStudioReceipt.profile_id).toBe(
      "robotstudio-simulation-receipt-stub",
    );
    expect(robotStudioReceipt.simulator).toBe("RobotStudio");
    expect(robotStudioReceipt.simulation_artifact_uri).toContain(
      "robotstudio://station",
    );
    expect(robotStudioReceipt.simulation_receipt.vendor_program_hash).toBe(
      abb.generated_program_hash,
    );
    expect(roboGuideReceipt.profile_id).toBe(
      "roboguide-simulation-receipt-stub",
    );
    expect(roboGuideReceipt.simulator).toBe("ROBOGUIDE");
    expect(roboGuideReceipt.simulation_artifact_uri).toContain("roboguide://cell");
    expect(roboGuideReceipt.simulation_receipt.vendor_program_hash).toBe(
      fanuc.generated_program_hash,
    );

    expect(kukaSimReceipt.profile_id).toBe("kuka-sim-simulation-receipt-stub");
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
      expect(receipt.simulation_receipt.max_force_newtons).toBe(62);
      expect(receipt.simulation_receipt.metadata.decision_digest).toMatch(
        /^sha256:[a-f0-9]{64}$/,
      );
      expect(receipt.simulation_receipt.metadata.policy_resource).toBe(
        "ros2:///joint_commands",
      );
      expect(receipt.simulation_receipt.metadata.simulator_profile_id).toBe(
        receipt.profile_id,
      );
    }
  });

  it("routes factory robot actions through the normal ROS2 interceptor path", async () => {
    const root = generateKeypair();
    const agent = generateKeypair();
    const tokenStore = new Map<string, SintCapabilityToken>();
    const revocationStore = new RevocationStore();
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
    });

    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///joint_commands",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.3, maxForceNewtons: 100 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
    };
    const issued = issueCapabilityToken(request, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: issued.value.tokenId,
    });

    const result = await interceptor.interceptPublish(
      robotActionProfileToRos2TopicMessage(robotAction, {
        timestamp: "2026-05-26T20:00:00.000Z",
        cellId: "packaging_cell_001",
      }),
    );

    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("denies factory robot action when profile force exceeds token envelope", async () => {
    const root = generateKeypair();
    const agent = generateKeypair();
    const tokenStore = new Map<string, SintCapabilityToken>();
    const revocationStore = new RevocationStore();
    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
    });

    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///joint_commands",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.3, maxForceNewtons: 50 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
    };
    const issued = issueCapabilityToken(request, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: issued.value.tokenId,
    });

    const result = await interceptor.interceptPublish(
      robotActionProfileToRos2TopicMessage(robotAction, {
        timestamp: "2026-05-26T20:00:00.000Z",
        cellId: "packaging_cell_001",
      }),
    );

    expect(result.action).toBe("deny");
    expect(result.decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });
});
