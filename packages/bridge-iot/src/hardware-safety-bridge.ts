/**
 * SINT bridge-iot — Hardware Safety Bridge.
 *
 * Extracts SintHardwareSafetyContext from MQTT/CoAP payload bytes.
 * Used by IotInterceptor to populate executionContext.hardwareSafety
 * before calling PolicyGateway.intercept().
 */

import type { SintHardwareSafetyContext } from "@pshkv/core";
import type { IoTDeviceProfile } from "./device-profiles.js";

export interface HardwareSafetyPayload {
  readonly estop?: "clear" | "triggered" | "unknown";
  readonly permit?: "granted" | "denied" | "unknown" | "stale";
  readonly interlock?: "closed" | "open" | "fault" | "unknown";
  readonly controllerId?: string;
}

/**
 * Build a SintHardwareSafetyContext from a parsed MQTT safety payload.
 * observedAt defaults to now if not provided.
 */
export function hardwareSafetyContextFromPayload(
  payload: HardwareSafetyPayload,
  observedAt?: string,
): SintHardwareSafetyContext {
  return {
    ...(payload.estop !== undefined && { estopState: payload.estop }),
    ...(payload.permit !== undefined && { permitState: payload.permit }),
    ...(payload.interlock !== undefined && { interlockState: payload.interlock }),
    ...(payload.controllerId !== undefined && { controllerId: payload.controllerId }),
    observedAt: observedAt ?? new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
  };
}

/**
 * Check if a full MQTT topic string matches any safety topic suffix for a device profile.
 * The topic must end with one of the profile's safetyTopics entries.
 */
export function isSafetyTopic(topic: string, profile: IoTDeviceProfile): boolean {
  for (const suffix of profile.safetyTopics) {
    if (topic.endsWith(`/${suffix}`) || topic === suffix) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a MQTT payload buffer or string as JSON HardwareSafetyPayload.
 * Returns undefined if parsing fails or payload is not an object.
 */
export function parseHardwareSafetyPayload(
  raw: Buffer | string,
): HardwareSafetyPayload | undefined {
  try {
    const str = typeof raw === "string" ? raw : raw.toString("utf8");
    const parsed = JSON.parse(str) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as HardwareSafetyPayload;
  } catch {
    return undefined;
  }
}
