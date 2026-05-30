import { z } from "zod";
import {
  FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
  factoryRobotActionToRos2ResourceUri,
  robotActionProfileSchema,
  robotActionProfileToRos2TopicMessage,
  type RobotActionProfile,
} from "./factory-action-profile.js";
import {
  robotActionProfileToIsaacSimSimulationReceiptStub,
  type IsaacSimSimulationReceiptStub,
} from "./industrial-adapter-profiles.js";
import { actionToResourceUri } from "./ros2-resource-mapper.js";
import type { ROS2TopicMessage } from "./types.js";

export const shipyardHumanoidPreconditionSchema = z.enum([
  "hot_work_permit",
  "fire_watch_ready",
  "fume_extraction_online",
  "gas_atmosphere_safe",
  "simulation_receipt",
  "supervisor_approval",
]);

export type ShipyardHumanoidPrecondition = z.infer<
  typeof shipyardHumanoidPreconditionSchema
>;

const shipyardSafetySignalBindingSchema = z.object({
  signal: z.enum([
    "hotWorkPermit",
    "fireWatchReady",
    "fumeExtractionOnline",
    "gasAtmosphereSafe",
    "estopClear",
  ]),
  source: z.literal("opcua"),
  resourceHint: z.string().min(1),
  requiredFreshnessMs: z.number().int().positive(),
});

export const shipyardHumanoidWeldStartProfileSchema = z.object({
  profile_id: z.literal("shipyard-humanoid-weld-start-profile"),
  site_id: z.string().min(1),
  vessel_block_id: z.string().min(1),
  robot_id: z.string().min(1),
  work_order_id: z.string().min(1),
  weld_procedure_spec_id: z.string().min(1),
  humanoid_policy_resource: z.string().min(1),
  ros2_policy_resource: z.string().min(1),
  ros2_action_resource: z.string().min(1),
  policy_message_type: z.literal(FACTORY_ROBOT_ACTION_MESSAGE_TYPE),
  guarded_message: z.object({
    topicName: z.string().min(1),
    messageType: z.literal(FACTORY_ROBOT_ACTION_MESSAGE_TYPE),
    data: z.record(z.unknown()),
    timestamp: z.string().datetime(),
  }),
  required_preconditions: z.array(shipyardHumanoidPreconditionSchema),
  safety_signal_bindings: z.array(shipyardSafetySignalBindingSchema).min(1),
  simulation_receipt: z.unknown(),
  evidence_export_required_fields: z.array(z.string().min(1)).min(1),
  scope_note: z.string().min(1),
});

export type ShipyardHumanoidWeldStartProfile = z.infer<
  typeof shipyardHumanoidWeldStartProfileSchema
> & {
  readonly guarded_message: ROS2TopicMessage & {
    readonly messageType: typeof FACTORY_ROBOT_ACTION_MESSAGE_TYPE;
  };
  readonly simulation_receipt: IsaacSimSimulationReceiptStub;
};

export interface ShipyardHumanoidWeldStartOptions {
  readonly siteId: string;
  readonly vesselBlockId: string;
  readonly robotId: string;
  readonly workOrderId: string;
  readonly weldProcedureSpecId: string;
  readonly sourcePose?: string;
  readonly targetPose?: string;
  readonly topicName?: string;
  readonly actionName?: string;
  readonly timestamp?: string;
  readonly maxVelocityMps?: number;
  readonly maxTorchForceNewtons?: number;
  readonly torchPayloadKg?: number;
  readonly programDigest?: string;
  readonly stageUri?: string;
  readonly approvalId?: string;
}

const SHIPYARD_WELD_PRECONDITIONS: readonly ShipyardHumanoidPrecondition[] = [
  "hot_work_permit",
  "fire_watch_ready",
  "fume_extraction_online",
  "gas_atmosphere_safe",
  "simulation_receipt",
  "supervisor_approval",
];

function shipyardHumanoidPolicyResource(robotId: string): string {
  return `humanoid://shipyard/robot/${robotId}/tool/welding-torch/arc_start`;
}

function defaultShipyardTopic(robotId: string): string {
  return `/shipyard/${robotId}/weld_start`;
}

function defaultShipyardAction(robotId: string): string {
  return `/shipyard/${robotId}/execute_weld_start`;
}

function opcUaResourceHint(nodeId: string): string {
  return `opcua://safety-plc.shipyard.local/${encodeURIComponent(nodeId)}`;
}

function safetySignalBindings(): z.infer<typeof shipyardSafetySignalBindingSchema>[] {
  return [
    {
      signal: "hotWorkPermit",
      source: "opcua",
      resourceHint: opcUaResourceHint("ns=2;s=HotWork/Permit"),
      requiredFreshnessMs: 2500,
    },
    {
      signal: "fireWatchReady",
      source: "opcua",
      resourceHint: opcUaResourceHint("ns=2;s=FireWatch/Ready"),
      requiredFreshnessMs: 2500,
    },
    {
      signal: "fumeExtractionOnline",
      source: "opcua",
      resourceHint: opcUaResourceHint("ns=2;s=FumeExtraction/Status"),
      requiredFreshnessMs: 2500,
    },
    {
      signal: "gasAtmosphereSafe",
      source: "opcua",
      resourceHint: opcUaResourceHint("ns=2;s=GasMonitor/O2"),
      requiredFreshnessMs: 2500,
    },
    {
      signal: "estopClear",
      source: "opcua",
      resourceHint: opcUaResourceHint("ns=2;s=Safety/EStop"),
      requiredFreshnessMs: 1000,
    },
  ];
}

export function shipyardHumanoidWeldStartToRobotActionProfile(
  options: ShipyardHumanoidWeldStartOptions,
): RobotActionProfile {
  return robotActionProfileSchema.parse({
    action_type: "robot.welding.arc_start",
    target_robot: options.robotId,
    motion: {
      source_pose: options.sourcePose ?? `${options.vesselBlockId}_standby`,
      target_pose: options.targetPose ?? `${options.vesselBlockId}_weld_start`,
      max_velocity_mps: options.maxVelocityMps ?? 0.12,
      max_force_newtons: options.maxTorchForceNewtons ?? 40,
      collision_check: true,
    },
    tool: {
      type: "welding_torch",
      payload_kg: options.torchPayloadKg ?? 6.5,
    },
    requires: {
      simulation_receipt: true,
      human_approval: true,
      safety_zone_clear: true,
    },
    adapter_hint: "sint-adapter-shipyard-humanoid-welding",
  });
}

export function shipyardHumanoidWeldStartProfile(
  options: ShipyardHumanoidWeldStartOptions,
): ShipyardHumanoidWeldStartProfile {
  const action = shipyardHumanoidWeldStartToRobotActionProfile(options);
  const topicName = options.topicName ?? defaultShipyardTopic(options.robotId);
  const simulationReceipt = robotActionProfileToIsaacSimSimulationReceiptStub(action, {
    cellId: options.vesselBlockId,
    robotAssetId: options.robotId,
    vendorProgramHash: options.programDigest,
    policyTopicName: topicName,
    stageUri:
      options.stageUri ??
      `isaac-sim://stage/${options.siteId}/${options.vesselBlockId}/${options.robotId}`,
    measuredMaxForceNewtons: action.motion.max_force_newtons,
    signedBy: "sint-shipyard-humanoid-profile",
  });
  const guardedMessage = robotActionProfileToRos2TopicMessage(action, {
    topicName,
    timestamp: options.timestamp,
    cellId: options.vesselBlockId,
    simulationReceiptId: simulationReceipt.simulation_receipt.simulation_receipt_id,
    approvalId: options.approvalId ?? "supervisor-approval-required",
  });

  const profile = {
    profile_id: "shipyard-humanoid-weld-start-profile" as const,
    site_id: options.siteId,
    vessel_block_id: options.vesselBlockId,
    robot_id: options.robotId,
    work_order_id: options.workOrderId,
    weld_procedure_spec_id: options.weldProcedureSpecId,
    humanoid_policy_resource: shipyardHumanoidPolicyResource(options.robotId),
    ros2_policy_resource: factoryRobotActionToRos2ResourceUri({ topicName }),
    ros2_action_resource: actionToResourceUri(
      options.actionName ?? defaultShipyardAction(options.robotId),
    ),
    policy_message_type: FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
    guarded_message: guardedMessage,
    required_preconditions: SHIPYARD_WELD_PRECONDITIONS,
    safety_signal_bindings: safetySignalBindings(),
    simulation_receipt: simulationReceipt,
    evidence_export_required_fields: [
      "siteId",
      "vesselBlockId",
      "robotId",
      "workOrderId",
      "weldProcedureSpecId",
      "hotWorkPermitId",
      "fireWatchOperatorId",
      "gasMonitorCalibrationRef",
      "fumeExtractionStatus",
      "simulationReceiptDigest",
      "policyDecision",
      "assignedTier",
      "eventHash",
      "previousHash",
      "timestamp",
    ],
    scope_note:
      "Shipyard humanoid weld-start profile only: SINT gates policy, approvals, receipts, and evidence before execution; it does not certify welding procedure, robot hardware, or shipyard safety.",
  };

  return shipyardHumanoidWeldStartProfileSchema.parse(
    profile,
  ) as ShipyardHumanoidWeldStartProfile;
}
