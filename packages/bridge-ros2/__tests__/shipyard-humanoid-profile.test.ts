import { describe, expect, it } from "vitest";
import {
  FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
  shipyardHumanoidWeldStartProfile,
  shipyardHumanoidWeldStartToRobotActionProfile,
} from "../src/index.js";

const weldStartOptions = {
  siteId: "shipyard-demo-01",
  vesselBlockId: "hull-block-17",
  robotId: "welder-humanoid-01",
  workOrderId: "WO-HULL-17-001",
  weldProcedureSpecId: "WPS-ABS-DEMO-001",
  timestamp: "2026-05-30T12:00:00.000Z",
  programDigest: "sha256:1d5d2f257b67bb66f7a2f6c72d1c67f8aeafedec8bb8e9c1d12f962ef889d5b8",
};

describe("shipyard humanoid weld-start profile", () => {
  it("maps a shipyard weld start to a gated robot action profile", () => {
    const action = shipyardHumanoidWeldStartToRobotActionProfile(weldStartOptions);

    expect(action.action_type).toBe("robot.welding.arc_start");
    expect(action.target_robot).toBe("welder-humanoid-01");
    expect(action.motion.collision_check).toBe(true);
    expect(action.tool.type).toBe("welding_torch");
    expect(action.requires).toEqual({
      simulation_receipt: true,
      human_approval: true,
      safety_zone_clear: true,
    });
  });

  it("builds the ROS2, OPC UA, simulator, and evidence mapping bundle", () => {
    const profile = shipyardHumanoidWeldStartProfile(weldStartOptions);

    expect(profile.profile_id).toBe("shipyard-humanoid-weld-start-profile");
    expect(profile.humanoid_policy_resource).toBe(
      "humanoid://shipyard/robot/welder-humanoid-01/tool/welding-torch/arc_start",
    );
    expect(profile.ros2_policy_resource).toBe(
      "ros2:///shipyard/welder-humanoid-01/weld_start",
    );
    expect(profile.ros2_action_resource).toBe(
      "ros2:///shipyard/welder-humanoid-01/execute_weld_start",
    );
    expect(profile.policy_message_type).toBe(FACTORY_ROBOT_ACTION_MESSAGE_TYPE);
    expect(profile.guarded_message).toEqual(
      expect.objectContaining({
        topicName: "/shipyard/welder-humanoid-01/weld_start",
        messageType: FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
        timestamp: "2026-05-30T12:00:00.000Z",
      }),
    );
    expect(profile.guarded_message.data).toEqual(
      expect.objectContaining({
        action_type: "robot.welding.arc_start",
        cell_id: "hull-block-17",
        requires_human_approval: true,
        requires_simulation_receipt: true,
      }),
    );
    expect(profile.required_preconditions).toEqual([
      "hot_work_permit",
      "fire_watch_ready",
      "fume_extraction_online",
      "gas_atmosphere_safe",
      "simulation_receipt",
      "supervisor_approval",
    ]);
    expect(profile.safety_signal_bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          signal: "hotWorkPermit",
          resourceHint:
            "opcua://safety-plc.shipyard.local/ns%3D2%3Bs%3DHotWork%2FPermit",
        }),
        expect.objectContaining({
          signal: "gasAtmosphereSafe",
          resourceHint:
            "opcua://safety-plc.shipyard.local/ns%3D2%3Bs%3DGasMonitor%2FO2",
        }),
      ]),
    );
    expect(profile.simulation_receipt.profile_id).toBe(
      "isaac-sim-simulation-receipt-stub",
    );
    expect(profile.simulation_receipt.gated_policy_resource).toBe(
      "ros2:///shipyard/welder-humanoid-01/weld_start",
    );
    expect(profile.simulation_receipt.simulation_receipt.vendor_program_hash).toBe(
      weldStartOptions.programDigest,
    );
    expect(profile.evidence_export_required_fields).toEqual(
      expect.arrayContaining(["eventHash", "previousHash", "simulationReceiptDigest"]),
    );
    expect(profile.scope_note).toContain("does not certify");
  });
});
