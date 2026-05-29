/**
 * SINT Bridge-ROS2 — Industrial adapter profile helpers.
 *
 * These helpers turn the neutral RobotActionProfile into partner-facing
 * command shapes while preserving the normal ROS 2 PolicyGateway choke point.
 *
 * @module @sint/bridge-ros2/industrial-adapter-profiles
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
  factoryRobotActionRos2DataSchema,
  factoryRobotActionToRos2ResourceUri,
  robotActionProfileSchema,
  robotActionProfileToRos2TopicMessage,
  type FactoryRobotActionRos2Options,
  type RobotActionProfile,
} from "./factory-action-profile.js";
import { actionToResourceUri, topicToResourceUri } from "./ros2-resource-mapper.js";
import type { ROS2TopicMessage } from "./types.js";

const universalRobotsPreconditionSchema = z.enum([
  "simulation_receipt",
  "human_approval",
  "safety_zone_clear",
]);

const simulatorKindSchema = z.enum([
  "Isaac_Sim",
  "RoboDK",
  "RobotStudio",
  "ROBOGUIDE",
  "KUKA.Sim",
]);

const commandSurfaceSchema = z.object({
  kind: z.enum(["topic", "action", "service"]),
  name: z.string().min(1),
  resource: z.string().min(1),
  purpose: z.string().min(1),
});

export const universalRobotsRos2DemoPathSchema = z.object({
  profile_id: z.literal("universal-robots-ros2-demo"),
  vendor: z.literal("Universal Robots"),
  driver: z.literal("ur_robot_driver"),
  robot_model: z.string().min(1),
  driver_namespace: z.string().min(1),
  execution_mode: z.literal("simulation_or_test_only"),
  policy_topic: z.string().min(1),
  policy_resource: z.string().min(1),
  policy_message_type: z.literal(FACTORY_ROBOT_ACTION_MESSAGE_TYPE),
  guarded_message: z.object({
    topicName: z.string().min(1),
    messageType: z.literal(FACTORY_ROBOT_ACTION_MESSAGE_TYPE),
    data: factoryRobotActionRos2DataSchema,
    timestamp: z.string().datetime(),
  }),
  command_surfaces: z.array(commandSurfaceSchema).min(1),
  required_preconditions: z.array(universalRobotsPreconditionSchema),
  scope_note: z.string().min(1),
});

export type UniversalRobotsRos2DemoPath = z.infer<
  typeof universalRobotsRos2DemoPathSchema
>;

export interface UniversalRobotsRos2DemoOptions extends FactoryRobotActionRos2Options {
  readonly robotModel?: string;
  readonly driverNamespace?: string;
}

export const srciCommandNameSchema = z.enum([
  "PickPlace",
  "MoveLinear",
  "ExecuteSkill",
]);

export type SrciCommandName = z.infer<typeof srciCommandNameSchema>;

export const srciCommandProfileSchema = z.object({
  profile_id: z.literal("srci-command-profile"),
  standard: z.literal("SRCI"),
  command: srciCommandNameSchema,
  cell_id: z.string().min(1),
  controller_asset_id: z.string().min(1),
  robot_asset_id: z.string().min(1),
  resource: z.string().min(1),
  gated_policy_resource: z.string().min(1),
  motion: z.object({
    source_pose: z.string().min(1),
    target_pose: z.string().min(1),
    max_velocity_mps: z.number().positive(),
    max_force_newtons: z.number().positive(),
    collision_check: z.boolean(),
  }),
  tool: z.object({
    type: z.string().min(1),
    payload_kg: z.number().nonnegative(),
  }),
  requires: z.object({
    simulation_receipt: z.boolean(),
    human_approval: z.boolean(),
    safety_zone_clear: z.boolean(),
  }),
  scope_note: z.string().min(1),
});

export type SrciCommandProfile = z.infer<typeof srciCommandProfileSchema>;

export interface SrciCommandProfileOptions {
  readonly cellId: string;
  readonly controllerAssetId: string;
  readonly robotAssetId?: string;
  readonly policyTopicName?: string;
}

export const robotProgramExportStubSchema = z.object({
  profile_id: z.enum([
    "abb-rapid-export-stub",
    "fanuc-ls-export-stub",
    "kuka-krl-export-stub",
    "ur-script-export-stub",
  ]),
  vendor: z.enum(["ABB", "FANUC", "KUKA", "Universal Robots"]),
  target_language: z.enum(["RAPID", "LS", "KRL", "URScript"]),
  cell_id: z.string().min(1),
  robot_asset_id: z.string().min(1),
  program_name: z.string().min(1),
  execution_resource: z.string().min(1),
  gated_policy_resource: z.string().min(1),
  program_text: z.string().min(1),
  generated_program_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  maps_action_fields: z.array(z.string().min(1)).min(1),
  required_preconditions: z.array(universalRobotsPreconditionSchema),
  scope_note: z.string().min(1),
});

export type RobotProgramExportStub = z.infer<
  typeof robotProgramExportStubSchema
>;

export interface RobotProgramExportStubOptions {
  readonly cellId: string;
  readonly robotAssetId?: string;
  readonly programName?: string;
  readonly policyTopicName?: string;
  readonly simulationReceiptId?: string;
  readonly approvalId?: string;
}

const simulationReceiptSchema = z.object({
  simulation_receipt_id: z.string().regex(/^simr_[A-Za-z0-9._-]+$/),
  cell_id: z.string().min(1),
  simulator: simulatorKindSchema,
  vendor_program_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  collision_free: z.boolean(),
  cycle_time_seconds: z.number().positive(),
  safety_zone_violations: z.number().int().nonnegative(),
  max_force_newtons: z.number().nonnegative(),
  approved_for_execution: z.boolean(),
  signed_by: z.string().min(1),
  metadata: z.object({
    artifact_uri: z.string().min(1),
    decision_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    source_action_type: z.string().min(1),
    policy_resource: z.string().min(1),
    simulator_profile_id: z.string().min(1),
  }),
});

export const industrialSimulationReceiptStubSchema = z.object({
  profile_id: z.enum([
    "isaac-sim-simulation-receipt-stub",
    "robodk-simulation-receipt-stub",
    "robotstudio-simulation-receipt-stub",
    "roboguide-simulation-receipt-stub",
    "kuka-sim-simulation-receipt-stub",
  ]),
  simulator: simulatorKindSchema,
  cell_id: z.string().min(1),
  robot_asset_id: z.string().min(1),
  simulation_artifact_uri: z.string().min(1),
  gated_policy_resource: z.string().min(1),
  simulation_receipt: simulationReceiptSchema,
  required_preconditions: z.array(universalRobotsPreconditionSchema),
  scope_note: z.string().min(1),
});

export const isaacSimSimulationReceiptStubSchema =
  industrialSimulationReceiptStubSchema.extend({
    profile_id: z.literal("isaac-sim-simulation-receipt-stub"),
    simulator: z.literal("Isaac_Sim"),
    stage_uri: z.string().min(1),
  });

export const roboDkSimulationReceiptStubSchema =
  industrialSimulationReceiptStubSchema.extend({
    profile_id: z.literal("robodk-simulation-receipt-stub"),
    simulator: z.literal("RoboDK"),
  });

export const robotStudioSimulationReceiptStubSchema =
  industrialSimulationReceiptStubSchema.extend({
    profile_id: z.literal("robotstudio-simulation-receipt-stub"),
    simulator: z.literal("RobotStudio"),
  });

export const roboGuideSimulationReceiptStubSchema =
  industrialSimulationReceiptStubSchema.extend({
    profile_id: z.literal("roboguide-simulation-receipt-stub"),
    simulator: z.literal("ROBOGUIDE"),
  });

export const kukaSimSimulationReceiptStubSchema =
  industrialSimulationReceiptStubSchema.extend({
    profile_id: z.literal("kuka-sim-simulation-receipt-stub"),
    simulator: z.literal("KUKA.Sim"),
  });

export type IndustrialSimulationReceiptStub = z.infer<
  typeof industrialSimulationReceiptStubSchema
>;

export type IsaacSimSimulationReceiptStub = z.infer<
  typeof isaacSimSimulationReceiptStubSchema
>;

export type RoboDkSimulationReceiptStub = z.infer<
  typeof roboDkSimulationReceiptStubSchema
>;

export type RobotStudioSimulationReceiptStub = z.infer<
  typeof robotStudioSimulationReceiptStubSchema
>;

export type RoboGuideSimulationReceiptStub = z.infer<
  typeof roboGuideSimulationReceiptStubSchema
>;

export type KukaSimSimulationReceiptStub = z.infer<
  typeof kukaSimSimulationReceiptStubSchema
>;

export interface IndustrialSimulationReceiptStubOptions {
  readonly cellId: string;
  readonly robotAssetId?: string;
  readonly vendorProgramHash?: string;
  readonly policyTopicName?: string;
  readonly artifactUri?: string;
  readonly cycleTimeSeconds?: number;
  readonly collisionFree?: boolean;
  readonly safetyZoneViolations?: number;
  readonly measuredMaxForceNewtons?: number;
  readonly signedBy?: string;
}

export interface IsaacSimSimulationReceiptStubOptions
  extends IndustrialSimulationReceiptStubOptions {
  readonly stageUri?: string;
}

function normalizeNamespace(namespace: string): string {
  const prefixed = namespace.startsWith("/") ? namespace : `/${namespace}`;
  return prefixed.endsWith("/") && prefixed.length > 1
    ? prefixed.slice(0, -1)
    : prefixed;
}

function namespaced(namespace: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (namespace === "/") {
    return cleanPath;
  }
  return `${namespace}${cleanPath}`;
}

function requiredPreconditions(
  action: RobotActionProfile,
): Array<z.infer<typeof universalRobotsPreconditionSchema>> {
  const required: Array<z.infer<typeof universalRobotsPreconditionSchema>> = [];
  if (action.requires.simulation_receipt) {
    required.push("simulation_receipt");
  }
  if (action.requires.human_approval) {
    required.push("human_approval");
  }
  if (action.requires.safety_zone_clear) {
    required.push("safety_zone_clear");
  }
  return required;
}

function commandNameForAction(actionType: string): SrciCommandName {
  if (actionType === "robot.motion.pick_and_place") {
    return "PickPlace";
  }
  if (actionType.startsWith("robot.motion.")) {
    return "MoveLinear";
  }
  return "ExecuteSkill";
}

function commandSlug(command: SrciCommandName): string {
  switch (command) {
    case "PickPlace":
      return "pick_place";
    case "MoveLinear":
      return "move_linear";
    case "ExecuteSkill":
      return "execute_skill";
  }
}

function sha256Ref(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sanitizeProgramName(input: string, fallback: string): string {
  const sanitized = input
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+/, "")
    .slice(0, 28);
  if (!sanitized) {
    return fallback;
  }
  return /^[a-zA-Z]/.test(sanitized) ? sanitized : `${fallback}_${sanitized}`;
}

function adapterFieldMap(): string[] {
  return [
    "target_robot",
    "motion.source_pose",
    "motion.target_pose",
    "motion.max_velocity_mps",
    "motion.max_force_newtons",
    "tool.payload_kg",
    "requires.simulation_receipt",
    "requires.human_approval",
    "requires.safety_zone_clear",
  ];
}

function quoted(input: string): string {
  return input.replace(/"/g, '\\"');
}

function buildAbbRapidProgram(
  action: RobotActionProfile,
  options: Required<Pick<RobotProgramExportStubOptions, "cellId" | "robotAssetId">> &
    Pick<RobotProgramExportStubOptions, "programName" | "simulationReceiptId" | "approvalId">,
): { readonly programName: string; readonly programText: string } {
  const programName = sanitizeProgramName(
    options.programName ?? `SINT_${options.cellId}_RAPID`,
    "SINT_RAPID",
  );
  const procName = sanitizeProgramName(
    `${action.motion.source_pose}_to_${action.motion.target_pose}`,
    "PickPlace",
  );
  const lines = [
    `MODULE ${programName}`,
    "  ! SINT export stub only. Do not run on a controller without a real adapter backend.",
    "  ! Required gate: simulation receipt, human approval, safety-zone clear.",
    `  CONST string sint_action_type := "${quoted(action.action_type)}";`,
    `  CONST string sint_cell_id := "${quoted(options.cellId)}";`,
    `  CONST string sint_robot_asset_id := "${quoted(options.robotAssetId)}";`,
    `  CONST string sint_source_pose := "${quoted(action.motion.source_pose)}";`,
    `  CONST string sint_target_pose := "${quoted(action.motion.target_pose)}";`,
    `  CONST num sint_max_velocity_mps := ${action.motion.max_velocity_mps};`,
    `  CONST num sint_max_force_newtons := ${action.motion.max_force_newtons};`,
    `  CONST num sint_payload_kg := ${action.tool.payload_kg};`,
    `  CONST string sint_simulation_receipt_id := "${quoted(options.simulationReceiptId ?? "required")}";`,
    `  CONST string sint_approval_id := "${quoted(options.approvalId ?? "required")}";`,
    "",
    `  PROC ${procName}()`,
    "    ! Adapter backend resolves named poses and tool data after SINT approval.",
    "    ! Placeholder motion line is intentionally non-operational.",
    "    TPWrite \"SINT approved export stub reached adapter boundary\";",
    "  ENDPROC",
    "ENDMODULE",
  ];
  return { programName, programText: lines.join("\n") };
}

function buildFanucLsProgram(
  action: RobotActionProfile,
  options: Required<Pick<RobotProgramExportStubOptions, "cellId" | "robotAssetId">> &
    Pick<RobotProgramExportStubOptions, "programName" | "simulationReceiptId" | "approvalId">,
): { readonly programName: string; readonly programText: string } {
  const programName = sanitizeProgramName(
    options.programName ?? `SINT_${options.cellId}_LS`,
    "SINT_LS",
  ).toUpperCase();
  const lines = [
    `/PROG ${programName}`,
    "/ATTR",
    "OWNER       = MNEDITOR;",
    "COMMENT     = \"SINT export stub\";",
    "/MN",
    "   1:  ! SINT export stub only ;",
    "   2:  ! Do not run without real adapter backend ;",
    `   3:  ! action=${action.action_type} ;`,
    `   4:  ! cell=${options.cellId} ;`,
    `   5:  ! robot=${options.robotAssetId} ;`,
    `   6:  ! source_pose=${action.motion.source_pose} ;`,
    `   7:  ! target_pose=${action.motion.target_pose} ;`,
    `   8:  ! max_velocity_mps=${action.motion.max_velocity_mps} ;`,
    `   9:  ! max_force_newtons=${action.motion.max_force_newtons} ;`,
    `  10:  ! payload_kg=${action.tool.payload_kg} ;`,
    `  11:  ! simulation_receipt_id=${options.simulationReceiptId ?? "required"} ;`,
    `  12:  ! approval_id=${options.approvalId ?? "required"} ;`,
    "  13:  ! Adapter backend resolves positions after SINT approval ;",
    "/POS",
    "/END",
  ];
  return { programName, programText: lines.join("\n") };
}

function buildKukaKrlProgram(
  action: RobotActionProfile,
  options: Required<Pick<RobotProgramExportStubOptions, "cellId" | "robotAssetId">> &
    Pick<RobotProgramExportStubOptions, "programName" | "simulationReceiptId" | "approvalId">,
): { readonly programName: string; readonly programText: string } {
  const programName = sanitizeProgramName(
    options.programName ?? `SINT_${options.cellId}_KRL`,
    "SINT_KRL",
  );
  const lines = [
    `DEF ${programName}()`,
    "  ; SINT export stub only. Do not run without a real adapter backend.",
    "  ; Required gate: simulation receipt, human approval, safety-zone clear.",
    `  ; action=${action.action_type}`,
    `  ; cell=${options.cellId}`,
    `  ; robot=${options.robotAssetId}`,
    `  ; source_pose=${action.motion.source_pose}`,
    `  ; target_pose=${action.motion.target_pose}`,
    `  ; max_velocity_mps=${action.motion.max_velocity_mps}`,
    `  ; max_force_newtons=${action.motion.max_force_newtons}`,
    `  ; payload_kg=${action.tool.payload_kg}`,
    `  ; simulation_receipt_id=${options.simulationReceiptId ?? "required"}`,
    `  ; approval_id=${options.approvalId ?? "required"}`,
    "  ; Adapter backend resolves frames and SafeOperation envelope after SINT approval.",
    "  HALT",
    "END",
  ];
  return { programName, programText: lines.join("\n") };
}

function buildUrScriptProgram(
  action: RobotActionProfile,
  options: Required<Pick<RobotProgramExportStubOptions, "cellId" | "robotAssetId">> &
    Pick<RobotProgramExportStubOptions, "programName" | "simulationReceiptId" | "approvalId">,
): { readonly programName: string; readonly programText: string } {
  const programName = sanitizeProgramName(
    options.programName ?? `sint_${options.cellId}_urscript`,
    "sint_urscript",
  );
  const lines = [
    `def ${programName}():`,
    "  # SINT export stub only. Do not run without a real adapter backend.",
    "  # Required gate: simulation receipt, human approval, safety-zone clear.",
    `  textmsg("sint_action_type=${quoted(action.action_type)}")`,
    `  textmsg("sint_cell_id=${quoted(options.cellId)}")`,
    `  textmsg("sint_robot_asset_id=${quoted(options.robotAssetId)}")`,
    `  textmsg("sint_source_pose=${quoted(action.motion.source_pose)}")`,
    `  textmsg("sint_target_pose=${quoted(action.motion.target_pose)}")`,
    `  textmsg("sint_max_velocity_mps=${action.motion.max_velocity_mps}")`,
    `  textmsg("sint_max_force_newtons=${action.motion.max_force_newtons}")`,
    `  textmsg("sint_payload_kg=${action.tool.payload_kg}")`,
    `  textmsg("sint_simulation_receipt_id=${quoted(options.simulationReceiptId ?? "required")}")`,
    `  textmsg("sint_approval_id=${quoted(options.approvalId ?? "required")}")`,
    "  halt",
    "end",
  ];
  return { programName, programText: lines.join("\n") };
}

type SimulationReceiptProfileConfig = {
  readonly profileId:
    | "isaac-sim-simulation-receipt-stub"
    | "robodk-simulation-receipt-stub"
    | "robotstudio-simulation-receipt-stub"
    | "roboguide-simulation-receipt-stub"
    | "kuka-sim-simulation-receipt-stub";
  readonly simulator: z.infer<typeof simulatorKindSchema>;
  readonly defaultArtifactUri: (cellId: string, robotAssetId: string) => string;
  readonly defaultSigner: string;
  readonly scopeNote: string;
};

function buildIndustrialSimulationReceiptStub(
  action: RobotActionProfile,
  options: IndustrialSimulationReceiptStubOptions,
  config: SimulationReceiptProfileConfig,
): IndustrialSimulationReceiptStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";
  const policyResource = factoryRobotActionToRos2ResourceUri({
    topicName: policyTopicName,
  });
  const vendorProgramHash =
    options.vendorProgramHash ?? sha256Ref(stableJson(parsed));
  const measuredMaxForceNewtons =
    options.measuredMaxForceNewtons ?? parsed.motion.max_force_newtons;
  const safetyZoneViolations = options.safetyZoneViolations ?? 0;
  const collisionFree = options.collisionFree ?? true;
  const approvedForExecution =
    collisionFree &&
    safetyZoneViolations === 0 &&
    measuredMaxForceNewtons <= parsed.motion.max_force_newtons;
  const simulationArtifactUri =
    options.artifactUri ?? config.defaultArtifactUri(options.cellId, robotAssetId);
  const decisionPayload = {
    action_type: parsed.action_type,
    approved_for_execution: approvedForExecution,
    cell_id: options.cellId,
    collision_free: collisionFree,
    max_force_newtons: measuredMaxForceNewtons,
    policy_resource: policyResource,
    robot_asset_id: robotAssetId,
    safety_zone_violations: safetyZoneViolations,
    simulator: config.simulator,
    vendor_program_hash: vendorProgramHash,
  };
  const digest = sha256Ref(stableJson(decisionPayload));
  const receiptId = `simr_${sanitizeProgramName(
    `${options.cellId}_${robotAssetId}_${config.simulator}_${digest.slice(7, 15)}`,
    "sim",
  )}`;

  return industrialSimulationReceiptStubSchema.parse({
    profile_id: config.profileId,
    simulator: config.simulator,
    cell_id: options.cellId,
    robot_asset_id: robotAssetId,
    simulation_artifact_uri: simulationArtifactUri,
    gated_policy_resource: policyResource,
    simulation_receipt: {
      simulation_receipt_id: receiptId,
      cell_id: options.cellId,
      simulator: config.simulator,
      vendor_program_hash: vendorProgramHash,
      collision_free: collisionFree,
      cycle_time_seconds: options.cycleTimeSeconds ?? 2.4,
      safety_zone_violations: safetyZoneViolations,
      max_force_newtons: measuredMaxForceNewtons,
      approved_for_execution: approvedForExecution,
      signed_by: options.signedBy ?? config.defaultSigner,
      metadata: {
        artifact_uri: `${simulationArtifactUri}/receipts/${receiptId}`,
        decision_digest: digest,
        source_action_type: parsed.action_type,
        policy_resource: policyResource,
        simulator_profile_id: config.profileId,
      },
    },
    required_preconditions: requiredPreconditions(parsed),
    scope_note: config.scopeNote,
  });
}

export function robotActionProfileToUniversalRobotsRos2DemoPath(
  action: RobotActionProfile,
  options: UniversalRobotsRos2DemoOptions = {},
): UniversalRobotsRos2DemoPath {
  const parsed = robotActionProfileSchema.parse(action);
  const driverNamespace = normalizeNamespace(options.driverNamespace ?? "/ur");
  const policyTopic = options.topicName ?? "/joint_commands";
  const guardedMessage = robotActionProfileToRos2TopicMessage(
    {
      ...parsed,
      adapter_hint: parsed.adapter_hint ?? "sint-adapter-ur-polyscope-srci-ros2",
    },
    {
      ...options,
      topicName: policyTopic,
    },
  );

  const path = {
    profile_id: "universal-robots-ros2-demo" as const,
    vendor: "Universal Robots" as const,
    driver: "ur_robot_driver" as const,
    robot_model: options.robotModel ?? "ur10e",
    driver_namespace: driverNamespace,
    execution_mode: "simulation_or_test_only" as const,
    policy_topic: policyTopic,
    policy_resource: factoryRobotActionToRos2ResourceUri({ topicName: policyTopic }),
    policy_message_type: FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
    guarded_message: guardedMessage as ROS2TopicMessage & {
      messageType: typeof FACTORY_ROBOT_ACTION_MESSAGE_TYPE;
    },
    command_surfaces: [
      {
        kind: "topic" as const,
        name: policyTopic,
        resource: factoryRobotActionToRos2ResourceUri({ topicName: policyTopic }),
        purpose: "SINT-gated factory action envelope",
      },
      {
        kind: "action" as const,
        name: namespaced(
          driverNamespace,
          "/scaled_joint_trajectory_controller/follow_joint_trajectory",
        ),
        resource: actionToResourceUri(
          namespaced(
            driverNamespace,
            "/scaled_joint_trajectory_controller/follow_joint_trajectory",
          ),
        ),
        purpose: "UR ROS 2 driver trajectory handoff after SINT approval",
      },
      {
        kind: "topic" as const,
        name: namespaced(driverNamespace, "/script_command"),
        resource: topicToResourceUri(namespaced(driverNamespace, "/script_command")),
        purpose: "URScript handoff stub after SINT approval",
      },
    ],
    required_preconditions: requiredPreconditions(parsed),
    scope_note:
      "Demo mapping only: SINT produces the gated command envelope and adapter plan, not live UR control.",
  };

  return universalRobotsRos2DemoPathSchema.parse(path);
}

export function robotActionProfileToSrciCommandProfile(
  action: RobotActionProfile,
  options: SrciCommandProfileOptions,
): SrciCommandProfile {
  const parsed = robotActionProfileSchema.parse(action);
  const command = commandNameForAction(parsed.action_type);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";

  const profile = {
    profile_id: "srci-command-profile" as const,
    standard: "SRCI" as const,
    command,
    cell_id: options.cellId,
    controller_asset_id: options.controllerAssetId,
    robot_asset_id: robotAssetId,
    resource: `srci://cell/${options.cellId}/controller/${options.controllerAssetId}/robot/${robotAssetId}/command/${commandSlug(command)}`,
    gated_policy_resource: factoryRobotActionToRos2ResourceUri({
      topicName: policyTopicName,
    }),
    motion: parsed.motion,
    tool: parsed.tool,
    requires: parsed.requires,
    scope_note:
      "SRCI profile mapping only: PLC or robot execution still requires SINT policy approval and a real adapter backend.",
  };

  return srciCommandProfileSchema.parse(profile);
}

export function robotActionProfileToAbbRapidExportStub(
  action: RobotActionProfile,
  options: RobotProgramExportStubOptions,
): RobotProgramExportStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";
  const { programName, programText } = buildAbbRapidProgram(parsed, {
    ...options,
    robotAssetId,
  });

  return robotProgramExportStubSchema.parse({
    profile_id: "abb-rapid-export-stub",
    vendor: "ABB",
    target_language: "RAPID",
    cell_id: options.cellId,
    robot_asset_id: robotAssetId,
    program_name: programName,
    execution_resource: `robotstudio://${options.cellId}/${robotAssetId}/${programName}`,
    gated_policy_resource: factoryRobotActionToRos2ResourceUri({
      topicName: policyTopicName,
    }),
    program_text: programText,
    generated_program_hash: sha256Ref(programText),
    maps_action_fields: adapterFieldMap(),
    required_preconditions: requiredPreconditions(parsed),
    scope_note:
      "RAPID export stub only: RobotStudio or controller execution requires a real adapter backend and SINT approval.",
  });
}

export function robotActionProfileToFanucLsExportStub(
  action: RobotActionProfile,
  options: RobotProgramExportStubOptions,
): RobotProgramExportStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";
  const { programName, programText } = buildFanucLsProgram(parsed, {
    ...options,
    robotAssetId,
  });

  return robotProgramExportStubSchema.parse({
    profile_id: "fanuc-ls-export-stub",
    vendor: "FANUC",
    target_language: "LS",
    cell_id: options.cellId,
    robot_asset_id: robotAssetId,
    program_name: programName,
    execution_resource: `roboguide://${options.cellId}/${robotAssetId}/${programName}`,
    gated_policy_resource: factoryRobotActionToRos2ResourceUri({
      topicName: policyTopicName,
    }),
    program_text: programText,
    generated_program_hash: sha256Ref(programText),
    maps_action_fields: adapterFieldMap(),
    required_preconditions: requiredPreconditions(parsed),
    scope_note:
      "FANUC LS export stub only: ROBOGUIDE or controller execution requires a real adapter backend and SINT approval.",
  });
}

export function robotActionProfileToKukaKrlExportStub(
  action: RobotActionProfile,
  options: RobotProgramExportStubOptions,
): RobotProgramExportStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";
  const { programName, programText } = buildKukaKrlProgram(parsed, {
    ...options,
    robotAssetId,
  });

  return robotProgramExportStubSchema.parse({
    profile_id: "kuka-krl-export-stub",
    vendor: "KUKA",
    target_language: "KRL",
    cell_id: options.cellId,
    robot_asset_id: robotAssetId,
    program_name: programName,
    execution_resource: `kuka-sim://${options.cellId}/${robotAssetId}/${programName}`,
    gated_policy_resource: factoryRobotActionToRos2ResourceUri({
      topicName: policyTopicName,
    }),
    program_text: programText,
    generated_program_hash: sha256Ref(programText),
    maps_action_fields: adapterFieldMap(),
    required_preconditions: requiredPreconditions(parsed),
    scope_note:
      "KUKA KRL export stub only: KUKA.Sim or controller execution requires a real adapter backend and SINT approval.",
  });
}

export function robotActionProfileToUrScriptExportStub(
  action: RobotActionProfile,
  options: RobotProgramExportStubOptions,
): RobotProgramExportStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const policyTopicName = options.policyTopicName ?? "/joint_commands";
  const { programName, programText } = buildUrScriptProgram(parsed, {
    ...options,
    robotAssetId,
  });

  return robotProgramExportStubSchema.parse({
    profile_id: "ur-script-export-stub",
    vendor: "Universal Robots",
    target_language: "URScript",
    cell_id: options.cellId,
    robot_asset_id: robotAssetId,
    program_name: programName,
    execution_resource: `polyscope://${options.cellId}/${robotAssetId}/${programName}`,
    gated_policy_resource: factoryRobotActionToRos2ResourceUri({
      topicName: policyTopicName,
    }),
    program_text: programText,
    generated_program_hash: sha256Ref(programText),
    maps_action_fields: adapterFieldMap(),
    required_preconditions: requiredPreconditions(parsed),
    scope_note:
      "URScript export stub only: PolyScope or controller execution requires a real adapter backend and SINT approval.",
  });
}

export function robotActionProfileToIsaacSimSimulationReceiptStub(
  action: RobotActionProfile,
  options: IsaacSimSimulationReceiptStubOptions,
): IsaacSimSimulationReceiptStub {
  const parsed = robotActionProfileSchema.parse(action);
  const robotAssetId = options.robotAssetId ?? parsed.target_robot;
  const stageUri =
    options.stageUri ??
    options.artifactUri ??
    `isaac-sim://stage/${options.cellId}/${robotAssetId}`;
  const receipt = buildIndustrialSimulationReceiptStub(
    parsed,
    {
      ...options,
      artifactUri: stageUri,
      robotAssetId,
    },
    {
      profileId: "isaac-sim-simulation-receipt-stub",
      simulator: "Isaac_Sim",
      defaultArtifactUri: (cellId, assetId) =>
        `isaac-sim://stage/${cellId}/${assetId}`,
      defaultSigner: "sint-isaac-sim-receipt-stub",
      scopeNote:
        "Isaac Sim receipt stub only: it models the receipt shape SINT expects after simulation, not a certified simulator result.",
    },
  );

  return isaacSimSimulationReceiptStubSchema.parse({
    ...receipt,
    stage_uri: stageUri,
  });
}

export function robotActionProfileToRoboDkSimulationReceiptStub(
  action: RobotActionProfile,
  options: IndustrialSimulationReceiptStubOptions,
): RoboDkSimulationReceiptStub {
  return roboDkSimulationReceiptStubSchema.parse(
    buildIndustrialSimulationReceiptStub(action, options, {
      profileId: "robodk-simulation-receipt-stub",
      simulator: "RoboDK",
      defaultArtifactUri: (cellId, assetId) =>
        `robodk://station/${cellId}/${assetId}`,
      defaultSigner: "sint-robodk-receipt-stub",
      scopeNote:
        "RoboDK receipt stub only: it models simulation evidence for offline-programming artifacts, not certified live execution.",
    }),
  );
}

export function robotActionProfileToRobotStudioSimulationReceiptStub(
  action: RobotActionProfile,
  options: IndustrialSimulationReceiptStubOptions,
): RobotStudioSimulationReceiptStub {
  return robotStudioSimulationReceiptStubSchema.parse(
    buildIndustrialSimulationReceiptStub(action, options, {
      profileId: "robotstudio-simulation-receipt-stub",
      simulator: "RobotStudio",
      defaultArtifactUri: (cellId, assetId) =>
        `robotstudio://station/${cellId}/${assetId}`,
      defaultSigner: "sint-robotstudio-receipt-stub",
      scopeNote:
        "RobotStudio receipt stub only: it models simulation evidence for ABB RAPID artifacts, not certified live execution.",
    }),
  );
}

export function robotActionProfileToRoboGuideSimulationReceiptStub(
  action: RobotActionProfile,
  options: IndustrialSimulationReceiptStubOptions,
): RoboGuideSimulationReceiptStub {
  return roboGuideSimulationReceiptStubSchema.parse(
    buildIndustrialSimulationReceiptStub(action, options, {
      profileId: "roboguide-simulation-receipt-stub",
      simulator: "ROBOGUIDE",
      defaultArtifactUri: (cellId, assetId) =>
        `roboguide://cell/${cellId}/${assetId}`,
      defaultSigner: "sint-roboguide-receipt-stub",
      scopeNote:
        "ROBOGUIDE receipt stub only: it models FANUC offline-programming evidence, not certified live execution.",
    }),
  );
}

export function robotActionProfileToKukaSimSimulationReceiptStub(
  action: RobotActionProfile,
  options: IndustrialSimulationReceiptStubOptions,
): KukaSimSimulationReceiptStub {
  return kukaSimSimulationReceiptStubSchema.parse(
    buildIndustrialSimulationReceiptStub(action, options, {
      profileId: "kuka-sim-simulation-receipt-stub",
      simulator: "KUKA.Sim",
      defaultArtifactUri: (cellId, assetId) =>
        `kuka-sim://cell/${cellId}/${assetId}`,
      defaultSigner: "sint-kuka-sim-receipt-stub",
      scopeNote:
        "KUKA.Sim receipt stub only: it models KRL simulation evidence and SafeOperation envelope checks, not certified live execution.",
    }),
  );
}
