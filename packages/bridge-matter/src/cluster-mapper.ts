/**
 * SINT bridge-matter — Matter Cluster Mapper
 *
 * Maps Matter 1.3+ device clusters to SINT resource URIs and actions.
 * Implements Phase 2 Matter protocol support per Physical AI Governance
 * Roadmap 2026-2029.
 *
 * Matter uses a cluster-based data model: every device exposes typed clusters
 * (OnOff, LevelControl, DoorLock, Thermostat, etc.) with standardized attributes
 * and commands.
 *
 * @module @pshkv/bridge-matter/cluster-mapper
 */

import { ApprovalTier } from "@pshkv/core";

/**
 * Matter cluster IDs (subset of most common clusters).
 * Full list: https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml
 */
export enum MatterClusterId {
  // General clusters
  OnOff = 0x0006,
  LevelControl = 0x0008,
  
  // Lighting
  ColorControl = 0x0300,
  
  // Closure
  DoorLock = 0x0101,
  WindowCovering = 0x0102,
  
  // HVAC
  Thermostat = 0x0201,
  FanControl = 0x0202,
  
  // Media
  MediaPlayback = 0x0506,
  MediaInput = 0x0507,
  
  // Appliances (Matter 1.4)
  RobotVacuumCleaner = 0x0060, // Provisional
  Laundry = 0x0053,
  Dishwasher = 0x0059,
  
  // Energy
  EnergyEVSE = 0x0099, // EV charging
  PowerSource = 0x002F,
  
  // Sensors
  TemperatureMeasurement = 0x0402,
  RelativeHumidityMeasurement = 0x0405,
  OccupancySensing = 0x0406,
}

/**
 * Matter command types (standardized across clusters).
 */
export type MatterCommandType = "read" | "write" | "subscribe" | "invoke";

/**
 * Matter cluster access context for Policy Gateway.
 */
export interface MatterAccessContext {
  /** Matter fabric ID (network identifier) */
  fabricId: string;
  /** Node ID (device identifier within fabric) */
  nodeId: string;
  /** Endpoint ID (device may have multiple endpoints) */
  endpointId: number;
  /** Cluster ID */
  clusterId: MatterClusterId;
  /** Command or attribute name */
  commandOrAttribute: string;
  /** Command type */
  commandType: MatterCommandType;
  /** Command arguments (for invoke operations) */
  commandArgs?: Record<string, unknown>;
}

/**
 * SINT resource mapping for Matter access.
 */
export interface MatterResourceMapping {
  /** SINT resource URI (e.g., matter://fabric-01/node/123/ep/1/DoorLock/commands/UnlockDoor) */
  resource: string;
  /** SINT action (invoke, read, write, subscribe) */
  action: string;
  /** Minimum required approval tier */
  tier: ApprovalTier;
  /** Whether this cluster represents a physical actuator */
  isPhysicalActuator: boolean;
  /** Additional context */
  context: {
    fabricId: string;
    nodeId: string;
    endpointId: number;
    clusterId: MatterClusterId;
    clusterName: string;
    commandOrAttribute: string;
    commandType: MatterCommandType;
  };
}

/**
 * Default tier mappings for Matter clusters.
 * Based on physical consequence and reversibility.
 */
export const MATTER_CLUSTER_TIER_DEFAULTS: Record<MatterClusterId, ApprovalTier> = {
  // Lighting (low consequence, reversible)
  [MatterClusterId.OnOff]: ApprovalTier.T1_PREPARE,
  [MatterClusterId.LevelControl]: ApprovalTier.T1_PREPARE,
  [MatterClusterId.ColorControl]: ApprovalTier.T1_PREPARE,
  
  // Closures (high consequence, security-critical)
  [MatterClusterId.DoorLock]: ApprovalTier.T2_ACT,
  [MatterClusterId.WindowCovering]: ApprovalTier.T1_PREPARE,
  
  // HVAC (moderate consequence, comfort-critical)
  [MatterClusterId.Thermostat]: ApprovalTier.T1_PREPARE,
  [MatterClusterId.FanControl]: ApprovalTier.T1_PREPARE,
  
  // Media (low consequence, entertainment)
  [MatterClusterId.MediaPlayback]: ApprovalTier.T1_PREPARE,
  [MatterClusterId.MediaInput]: ApprovalTier.T1_PREPARE,
  
  // Appliances (moderate consequence, physical movement)
  [MatterClusterId.RobotVacuumCleaner]: ApprovalTier.T1_PREPARE, // Escalates to T2 with Δ_human
  [MatterClusterId.Laundry]: ApprovalTier.T1_PREPARE,
  [MatterClusterId.Dishwasher]: ApprovalTier.T1_PREPARE,
  
  // Energy (financial consequence)
  [MatterClusterId.EnergyEVSE]: ApprovalTier.T2_ACT, // EV charging = $$$
  [MatterClusterId.PowerSource]: ApprovalTier.T0_OBSERVE, // Read-only
  
  // Sensors (read-only)
  [MatterClusterId.TemperatureMeasurement]: ApprovalTier.T0_OBSERVE,
  [MatterClusterId.RelativeHumidityMeasurement]: ApprovalTier.T0_OBSERVE,
  [MatterClusterId.OccupancySensing]: ApprovalTier.T0_OBSERVE,
};

/**
 * Command-specific tier overrides.
 * Some commands within a cluster require higher tiers than the cluster default.
 */
export const MATTER_COMMAND_TIER_OVERRIDES: Record<string, ApprovalTier> = {
  // DoorLock commands (all security-critical)
  "DoorLock.LockDoor": ApprovalTier.T2_ACT,
  "DoorLock.UnlockDoor": ApprovalTier.T2_ACT,
  "DoorLock.UnlockWithTimeout": ApprovalTier.T2_ACT,
  
  // Thermostat mode changes (affects comfort)
  "Thermostat.SetpointRaiseLower": ApprovalTier.T1_PREPARE,
  
  // EVSE charging (financial)
  "EnergyEVSE.EnableCharging": ApprovalTier.T2_ACT,
  "EnergyEVSE.DisableCharging": ApprovalTier.T2_ACT,
};

/**
 * Get human-readable cluster name from cluster ID.
 */
export function getClusterName(clusterId: MatterClusterId): string {
  const names: Record<MatterClusterId, string> = {
    [MatterClusterId.OnOff]: "OnOff",
    [MatterClusterId.LevelControl]: "LevelControl",
    [MatterClusterId.ColorControl]: "ColorControl",
    [MatterClusterId.DoorLock]: "DoorLock",
    [MatterClusterId.WindowCovering]: "WindowCovering",
    [MatterClusterId.Thermostat]: "Thermostat",
    [MatterClusterId.FanControl]: "FanControl",
    [MatterClusterId.MediaPlayback]: "MediaPlayback",
    [MatterClusterId.MediaInput]: "MediaInput",
    [MatterClusterId.RobotVacuumCleaner]: "RobotVacuumCleaner",
    [MatterClusterId.Laundry]: "Laundry",
    [MatterClusterId.Dishwasher]: "Dishwasher",
    [MatterClusterId.EnergyEVSE]: "EnergyEVSE",
    [MatterClusterId.PowerSource]: "PowerSource",
    [MatterClusterId.TemperatureMeasurement]: "TemperatureMeasurement",
    [MatterClusterId.RelativeHumidityMeasurement]: "RelativeHumidityMeasurement",
    [MatterClusterId.OccupancySensing]: "OccupancySensing",
  };
  
  return names[clusterId] ?? `Cluster0x${clusterId.toString(16).toUpperCase()}`;
}

/**
 * Map a Matter cluster access to a SINT resource URI and action.
 *
 * @param context - Matter access context
 * @returns SINT resource mapping with tier and physical actuator flag
 *
 * @example
 * ```ts
 * const mapping = mapMatterToSint({
 *   fabricId: 'fabric-01',
 *   nodeId: 'node-123',
 *   endpointId: 1,
 *   clusterId: MatterClusterId.DoorLock,
 *   commandOrAttribute: 'UnlockDoor',
 *   commandType: 'invoke',
 * });
 * // Returns:
 * // {
 * //   resource: 'matter://fabric-01/node/node-123/ep/1/DoorLock/commands/UnlockDoor',
 * //   action: 'invoke',
 * //   tier: ApprovalTier.T2_ACT,
 * //   isPhysicalActuator: true,
 * //   context: { ... }
 * // }
 * ```
 */
export function mapMatterToSint(context: MatterAccessContext): MatterResourceMapping {
  const { fabricId, nodeId, endpointId, clusterId, commandOrAttribute, commandType, commandArgs } = context;
  
  const clusterName = getClusterName(clusterId);
  
  // Construct SINT resource URI
  // Format: matter://fabric-id/node/node-id/ep/endpoint/ClusterName/type/commandOrAttribute
  const resourceType = commandType === "invoke" ? "commands" : "attributes";
  const resource = `matter://${fabricId}/node/${nodeId}/ep/${endpointId}/${clusterName}/${resourceType}/${commandOrAttribute}`;
  
  // Get base tier for cluster
  const baseTier = MATTER_CLUSTER_TIER_DEFAULTS[clusterId] ?? ApprovalTier.T1_PREPARE;
  
  // Check for command-specific override
  const commandKey = `${clusterName}.${commandOrAttribute}`;
  const tier = MATTER_COMMAND_TIER_OVERRIDES[commandKey] ?? baseTier;
  
  // Determine if this is a physical actuator
  const isPhysicalActuator = isPhysicalActuatorCluster(clusterId);
  
  return {
    resource,
    action: commandType,
    tier,
    isPhysicalActuator,
    context: {
      fabricId,
      nodeId,
      endpointId,
      clusterId,
      clusterName,
      commandOrAttribute,
      commandType,
    },
  };
}

/**
 * Check if a Matter cluster represents a physical actuator.
 * Used by Δ_human plugin to determine whether to escalate tier when humans present.
 *
 * @param clusterId - Matter cluster ID
 * @returns true if cluster controls physical actuators
 */
export function isPhysicalActuatorCluster(clusterId: MatterClusterId): boolean {
  const physicalClusters: MatterClusterId[] = [
    MatterClusterId.DoorLock,
    MatterClusterId.WindowCovering,
    MatterClusterId.Thermostat,
    MatterClusterId.FanControl,
    MatterClusterId.RobotVacuumCleaner,
    MatterClusterId.Laundry,
    MatterClusterId.Dishwasher,
    MatterClusterId.EnergyEVSE,
  ];
  
  return physicalClusters.includes(clusterId);
}

/**
 * Check if a Matter cluster is read-only (sensors).
 *
 * @param clusterId - Matter cluster ID
 * @returns true if cluster is sensor-only (no actuator commands)
 */
export function isReadOnlyCluster(clusterId: MatterClusterId): boolean {
  const readOnlyClusters: MatterClusterId[] = [
    MatterClusterId.TemperatureMeasurement,
    MatterClusterId.RelativeHumidityMeasurement,
    MatterClusterId.OccupancySensing,
    MatterClusterId.PowerSource, // Read battery/power state only
  ];
  
  return readOnlyClusters.includes(clusterId);
}

/**
 * Parse a Matter resource URI into components.
 *
 * @param matterUri - Matter resource URI
 * @returns Parsed components (fabricId, nodeId, endpointId, clusterName, commandOrAttribute)
 *
 * @example
 * ```ts
 * const parsed = parseMatterUri('matter://fabric-01/node/123/ep/1/DoorLock/commands/UnlockDoor');
 * // Returns:
 * // {
 * //   fabricId: 'fabric-01',
 * //   nodeId: '123',
 * //   endpointId: 1,
 * //   clusterName: 'DoorLock',
 * //   resourceType: 'commands',
 * //   commandOrAttribute: 'UnlockDoor'
 * // }
 * ```
 */
export function parseMatterUri(matterUri: string): {
  fabricId: string;
  nodeId: string;
  endpointId: number;
  clusterName: string;
  resourceType: "commands" | "attributes";
  commandOrAttribute: string;
} | null {
  // Match pattern: matter://fabric-id/node/node-id/ep/endpoint-id/ClusterName/commands|attributes/name
  const match = matterUri.match(
    /^matter:\/\/([^/]+)\/node\/([^/]+)\/ep\/(\d+)\/([^/]+)\/(commands|attributes)\/([^/]+)$/
  );
  
  if (!match) return null;
  
  const [, fabricId, nodeId, endpointIdStr, clusterName, resourceType, commandOrAttribute] = match;
  
  return {
    fabricId,
    nodeId,
    endpointId: parseInt(endpointIdStr, 10),
    clusterName,
    resourceType: resourceType as "commands" | "attributes",
    commandOrAttribute,
  };
}

/**
 * Get safety topics for a Matter cluster.
 * These are cluster-specific events that should trigger CSML escalation.
 *
 * @param clusterId - Matter cluster ID
 * @returns Array of safety topic names
 */
export function getSafetyTopics(clusterId: MatterClusterId): string[] {
  const safetyTopics: Record<MatterClusterId, string[]> = {
    [MatterClusterId.DoorLock]: ["lock-jammed", "tamper-detected", "battery-low"],
    [MatterClusterId.WindowCovering]: ["obstruction-detected"],
    [MatterClusterId.RobotVacuumCleaner]: ["cliff-detected", "stuck", "bin-full"],
    [MatterClusterId.Thermostat]: ["extreme-temperature"],
    [MatterClusterId.EnergyEVSE]: ["charging-fault", "overcurrent"],
  };
  
  return safetyTopics[clusterId as MatterClusterId] ?? [];
}
