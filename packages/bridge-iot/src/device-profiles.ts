/**
 * SINT bridge-iot — IoT Device Profiles.
 *
 * Typed device profiles for common IoT device classes.
 * Profiles drive tier overrides and safety topic detection
 * in IotInterceptor.
 */

import { ApprovalTier } from "@pshkv/core";

export type IotDeviceClass = 
  // Industrial IoT
  | "temperature-sensor" 
  | "actuator" 
  | "plc" 
  | "smart-meter"
  // Consumer IoT (Phase 1 consumer smart home)
  | "smart-lock"
  | "security-camera"
  | "robot-vacuum"
  | "smart-thermostat"
  | "garage-door";

export interface IoTDeviceProfile {
  readonly deviceClass: IotDeviceClass;
  readonly topicPrefix: string;
  readonly broker: string;
  /** Topic suffixes (relative to topicPrefix) that carry hardware safety state. */
  readonly safetyTopics: readonly string[];
  /** Maps to SintHardwareSafetyContext.controllerId */
  readonly controllerId?: string | undefined;
  /** Minimum tier overrides by topic pattern (glob-style suffix match). */
  readonly tierOverrides?: readonly { readonly pattern: string; readonly tier: ApprovalTier }[] | undefined;
}

/**
 * Default profile templates by device class.
 * Callers supply topicPrefix and broker; other fields use these defaults.
 */
export const DEFAULT_PROFILE_TEMPLATES: Record<
  IotDeviceClass,
  Omit<IoTDeviceProfile, "topicPrefix" | "broker">
> = {
  // Industrial IoT profiles
  "temperature-sensor": {
    deviceClass: "temperature-sensor",
    safetyTopics: [],
    tierOverrides: [],
  },
  "actuator": {
    deviceClass: "actuator",
    safetyTopics: ["estop", "interlock"],
    tierOverrides: [],
  },
  "plc": {
    deviceClass: "plc",
    safetyTopics: ["estop", "interlock", "permit"],
    tierOverrides: [
      { pattern: "/cmd/*", tier: ApprovalTier.T2_ACT },
      { pattern: "/write/*", tier: ApprovalTier.T2_ACT },
    ],
  },
  "smart-meter": {
    deviceClass: "smart-meter",
    safetyTopics: [],
    tierOverrides: [],
  },
  
  // Consumer IoT profiles (Phase 1 consumer smart home)
  "smart-lock": {
    deviceClass: "smart-lock",
    safetyTopics: ["lock-jammed", "tamper-detected", "battery-critical"],
    tierOverrides: [
      { pattern: "/lock", tier: ApprovalTier.T2_ACT },
      { pattern: "/unlock", tier: ApprovalTier.T2_ACT },
      { pattern: "/state", tier: ApprovalTier.T0_OBSERVE },
    ],
  },
  "security-camera": {
    deviceClass: "security-camera",
    safetyTopics: [],
    tierOverrides: [
      { pattern: "/stream", tier: ApprovalTier.T0_OBSERVE },
      { pattern: "/snapshot", tier: ApprovalTier.T0_OBSERVE },
      { pattern: "/ptz/*", tier: ApprovalTier.T1_PREPARE },
    ],
  },
  "robot-vacuum": {
    deviceClass: "robot-vacuum",
    safetyTopics: ["cliff-detected", "stuck", "bin-full"],
    tierOverrides: [
      { pattern: "/start", tier: ApprovalTier.T1_PREPARE }, // Escalates to T2 if Δ_human > 0
      { pattern: "/pause", tier: ApprovalTier.T0_OBSERVE },
      { pattern: "/stop", tier: ApprovalTier.T0_OBSERVE },
    ],
  },
  "smart-thermostat": {
    deviceClass: "smart-thermostat",
    safetyTopics: ["aux-heat-active"],
    tierOverrides: [
      { pattern: "/set-temperature", tier: ApprovalTier.T1_PREPARE },
      { pattern: "/set-mode", tier: ApprovalTier.T1_PREPARE },
    ],
  },
  "garage-door": {
    deviceClass: "garage-door",
    safetyTopics: ["obstruction-detected"],
    tierOverrides: [
      { pattern: "/open", tier: ApprovalTier.T2_ACT },
      { pattern: "/close", tier: ApprovalTier.T2_ACT },
      { pattern: "/stop", tier: ApprovalTier.T0_OBSERVE },
    ],
  },
};

/**
 * Create a complete device profile from a class template + caller-supplied fields.
 */
export function createDeviceProfile(
  deviceClass: IotDeviceClass,
  topicPrefix: string,
  broker: string,
  overrides?: Partial<Pick<IoTDeviceProfile, "controllerId" | "safetyTopics" | "tierOverrides">>,
): IoTDeviceProfile {
  const template = DEFAULT_PROFILE_TEMPLATES[deviceClass];
  return {
    ...template,
    topicPrefix,
    broker,
    ...overrides,
  };
}
