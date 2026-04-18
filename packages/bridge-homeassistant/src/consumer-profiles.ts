/**
 * SINT bridge-homeassistant — Consumer Device Profiles
 *
 * Maps Home Assistant entity domains to SINT approval tiers and safety topics.
 * Implements Phase 1 consumer smart home governance per Physical AI Governance
 * Roadmap 2026-2029.
 *
 * @module @pshkv/bridge-homeassistant/consumer-profiles
 */

import { ApprovalTier } from "@pshkv/core";

export type ConsumerDeviceClass =
  | "smart-lock"
  | "security-camera"
  | "robot-vacuum"
  | "smart-thermostat"
  | "garage-door"
  | "energy-meter"
  | "light"
  | "switch"
  | "media-player"
  | "alarm-control-panel"
  | "climate"
  | "automation";

export interface ConsumerDeviceProfile {
  readonly deviceClass: ConsumerDeviceClass;
  /** Home Assistant entity domain (e.g., 'lock', 'camera', 'vacuum') */
  readonly domain: string;
  /** Default approval tier for this device class */
  readonly defaultTier: ApprovalTier;
  /**
   * Home Assistant state attributes that indicate safety-relevant conditions.
   * These are monitored to trigger CSML escalation or emergency protocols.
   */
  readonly safetyTopics: readonly string[];
  /**
   * Service-specific tier overrides.
   * Maps HA service calls to minimum required approval tiers.
   */
  readonly tierOverrides?: ReadonlyMap<string, ApprovalTier>;
  /**
   * If true, escalate tier when humans are detected in proximity.
   * Implements Δ_human escalation from roadmap Phase 2.
   */
  readonly humanAware?: boolean;
}

/**
 * Consumer device profile templates.
 * Based on roadmap Section II.1.2 Consumer Device Profiles.
 */
export const CONSUMER_DEVICE_PROFILES: Record<ConsumerDeviceClass, ConsumerDeviceProfile> = {
  "smart-lock": {
    deviceClass: "smart-lock",
    domain: "lock",
    defaultTier: ApprovalTier.T2_ACT,
    safetyTopics: ["lock-jammed", "tamper-detected", "battery-critical"],
    tierOverrides: new Map([
      ["lock", ApprovalTier.T2_ACT],
      ["unlock", ApprovalTier.T2_ACT],
      ["open", ApprovalTier.T2_ACT],
    ]),
    humanAware: false, // Locks are T2 regardless of occupancy
  },
  
  "security-camera": {
    deviceClass: "security-camera",
    domain: "camera",
    defaultTier: ApprovalTier.T0_OBSERVE,
    safetyTopics: [],
    tierOverrides: new Map([
      ["snapshot", ApprovalTier.T0_OBSERVE],
      ["enable_motion_detection", ApprovalTier.T1_PREPARE],
      ["disable_motion_detection", ApprovalTier.T1_PREPARE],
      // NOTE: No facial recognition services exposed - EU AI Act Article 5 prohibition
    ]),
    humanAware: false,
  },
  
  "robot-vacuum": {
    deviceClass: "robot-vacuum",
    domain: "vacuum",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: ["cliff-detected", "stuck", "bin-full", "battery-low"],
    tierOverrides: new Map([
      ["start", ApprovalTier.T1_PREPARE], // Escalates to T2 if Δ_human > 0
      ["pause", ApprovalTier.T0_OBSERVE],
      ["stop", ApprovalTier.T0_OBSERVE],
      ["return_to_base", ApprovalTier.T1_PREPARE],
      ["clean_spot", ApprovalTier.T1_PREPARE],
    ]),
    humanAware: true, // Escalate if humans present (Δ_human plugin)
  },
  
  "smart-thermostat": {
    deviceClass: "smart-thermostat",
    domain: "climate",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: ["aux-heat-active", "emergency-heat"],
    tierOverrides: new Map([
      ["set_temperature", ApprovalTier.T1_PREPARE],
      ["set_hvac_mode", ApprovalTier.T1_PREPARE],
      ["set_preset_mode", ApprovalTier.T1_PREPARE],
      // NOTE: Time-window constraints applied via deployment profile
      // (outside 06:00-23:00 escalates to T2)
    ]),
    humanAware: false,
  },
  
  "garage-door": {
    deviceClass: "garage-door",
    domain: "cover",
    defaultTier: ApprovalTier.T2_ACT,
    safetyTopics: ["obstruction-detected"],
    tierOverrides: new Map([
      ["open_cover", ApprovalTier.T2_ACT],
      ["close_cover", ApprovalTier.T2_ACT],
      ["stop_cover", ApprovalTier.T0_OBSERVE], // Emergency stop always allowed
    ]),
    humanAware: false,
  },
  
  "energy-meter": {
    deviceClass: "energy-meter",
    domain: "sensor",
    defaultTier: ApprovalTier.T0_OBSERVE,
    safetyTopics: [],
    tierOverrides: new Map(),
    humanAware: false,
  },
  
  "light": {
    deviceClass: "light",
    domain: "light",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: [],
    tierOverrides: new Map([
      ["turn_on", ApprovalTier.T1_PREPARE],
      ["turn_off", ApprovalTier.T1_PREPARE],
      ["toggle", ApprovalTier.T1_PREPARE],
    ]),
    humanAware: false,
  },
  
  "switch": {
    deviceClass: "switch",
    domain: "switch",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: [],
    tierOverrides: new Map([
      ["turn_on", ApprovalTier.T1_PREPARE],
      ["turn_off", ApprovalTier.T1_PREPARE],
      ["toggle", ApprovalTier.T1_PREPARE],
    ]),
    humanAware: false,
  },
  
  "media-player": {
    deviceClass: "media-player",
    domain: "media_player",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: [],
    tierOverrides: new Map([
      ["turn_on", ApprovalTier.T1_PREPARE],
      ["turn_off", ApprovalTier.T1_PREPARE],
      ["media_play", ApprovalTier.T1_PREPARE],
      ["media_pause", ApprovalTier.T1_PREPARE],
      ["volume_set", ApprovalTier.T1_PREPARE],
    ]),
    humanAware: false,
  },
  
  "alarm-control-panel": {
    deviceClass: "alarm-control-panel",
    domain: "alarm_control_panel",
    defaultTier: ApprovalTier.T2_ACT,
    safetyTopics: ["triggered", "arming", "disarming"],
    tierOverrides: new Map([
      ["alarm_arm_away", ApprovalTier.T2_ACT],
      ["alarm_arm_home", ApprovalTier.T2_ACT],
      ["alarm_disarm", ApprovalTier.T2_ACT],
      ["alarm_trigger", ApprovalTier.T3_COMMIT], // Irreversible emergency action
    ]),
    humanAware: false,
  },
  
  "climate": {
    deviceClass: "climate",
    domain: "climate",
    defaultTier: ApprovalTier.T1_PREPARE,
    safetyTopics: [],
    tierOverrides: new Map([
      ["set_temperature", ApprovalTier.T1_PREPARE],
      ["set_hvac_mode", ApprovalTier.T1_PREPARE],
    ]),
    humanAware: false,
  },
  
  "automation": {
    deviceClass: "automation",
    domain: "automation",
    defaultTier: ApprovalTier.T3_COMMIT, // Persistent behavior change
    safetyTopics: [],
    tierOverrides: new Map([
      ["trigger", ApprovalTier.T2_ACT], // One-time execution
      ["turn_on", ApprovalTier.T3_COMMIT], // Enable recurring automation
      ["turn_off", ApprovalTier.T2_ACT], // Disable automation
    ]),
    humanAware: false,
  },
};

/**
 * Get the consumer device profile for a given Home Assistant entity domain.
 * Returns undefined if domain is not a recognized consumer device class.
 */
export function getProfileForDomain(domain: string): ConsumerDeviceProfile | undefined {
  // Find profile by matching domain
  for (const profile of Object.values(CONSUMER_DEVICE_PROFILES)) {
    if (profile.domain === domain) {
      return profile;
    }
  }
  return undefined;
}

/**
 * Get the minimum required tier for a Home Assistant service call.
 * Applies tier overrides if specified, otherwise returns profile default.
 *
 * @param domain - HA entity domain (e.g., 'lock')
 * @param service - HA service name (e.g., 'unlock')
 * @returns Minimum approval tier, or undefined if domain not recognized
 */
export function getTierForService(domain: string, service: string): ApprovalTier | undefined {
  const profile = getProfileForDomain(domain);
  if (!profile) return undefined;
  
  return profile.tierOverrides?.get(service) ?? profile.defaultTier;
}

/**
 * Check if a device class is human-aware (requires Δ_human escalation).
 * Used by Phase 2 occupancy plugin.
 */
export function isHumanAware(domain: string): boolean {
  const profile = getProfileForDomain(domain);
  return profile?.humanAware ?? false;
}
