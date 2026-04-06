/**
 * SINT bridge-iot — IoT Device Profiles.
 *
 * Typed device profiles for common IoT device classes.
 * Profiles drive tier overrides and safety topic detection
 * in IotInterceptor.
 */

import { ApprovalTier } from "@sint/core";

export type IotDeviceClass = "temperature-sensor" | "actuator" | "plc" | "smart-meter";

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
