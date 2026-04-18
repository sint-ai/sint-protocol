/**
 * SINT Protocol — IoT Resource Mapper.
 *
 * Maps MQTT topics and CoAP URIs to canonical SINT resource URIs.
 * Targets constrained edge devices: industrial sensors, actuators, gateways.
 *
 * MQTT resource URI: mqtt://broker/topic/path
 * CoAP resource URI: coap://host:port/path
 *
 * Tier assignment:
 * - Sensor telemetry (temperature, humidity, pressure, energy) → T0_OBSERVE
 * - Config read/status → T0_OBSERVE
 * - Threshold/config write → T1_PREPARE
 * - Actuator command (valve, pump, fan, relay, switch) → T2_ACT
 * - Safety interlock / emergency stop → T3_COMMIT
 * - OTA firmware update → T3_COMMIT (critical)
 */

import { ApprovalTier } from "@sint-ai/core";

export type IotProtocol = "mqtt" | "coap";
export type IotQos = 0 | 1 | 2;

export interface MqttTopicInfo {
  readonly protocol: "mqtt";
  readonly broker: string;
  readonly topic: string;
  readonly qos: IotQos;
  readonly retained: boolean;
}

export interface CoapRequestInfo {
  readonly protocol: "coap";
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  readonly confirmable: boolean;
}

/** Keywords identifying sensor/telemetry topics (→ T0_OBSERVE) */
const SENSOR_KEYWORDS = [
  "temperature",
  "humidity",
  "pressure",
  "energy",
  "telemetry",
  "sensor",
  "status",
  "state",
  "reading",
  "measure",
  "metric",
  "monitor",
];

/** Keywords identifying actuator command topics (→ T2_ACT) */
const ACTUATOR_KEYWORDS = [
  "valve",
  "pump",
  "fan",
  "relay",
  "switch",
  "actuator",
  "motor",
  "servo",
  "output",
  "command",
  "cmd",
  "control",
  "set",
  "drive",
];

/** Keywords identifying safety-critical topics (→ T3_COMMIT) */
const SAFETY_KEYWORDS = [
  "estop",
  "emergency",
  "interlock",
  "shutdown",
  "ota",
  "firmware",
  "update",
  "flash",
  "boot",
];

/** Keywords identifying config-write topics (→ T1_PREPARE) */
const CONFIG_WRITE_KEYWORDS = ["config", "threshold", "setpoint", "calibrat", "param"];

function topicMatchesAny(topic: string, keywords: readonly string[]): boolean {
  const lower = topic.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Convert an MQTT broker+topic to a canonical SINT resource URI.
 * Format: mqtt://broker/topic/path
 */
export function mqttTopicToResourceUri(broker: string, topic: string): string {
  // Normalize: strip leading slashes from topic
  const normalizedTopic = topic.startsWith("/") ? topic.slice(1) : topic;
  const encodedBroker = encodeURIComponent(broker);
  return `mqtt://${encodedBroker}/${normalizedTopic}`;
}

/**
 * Convert a CoAP host+port+path to a canonical SINT resource URI.
 * Format: coap://host:port/path
 */
export function coapToResourceUri(host: string, port: number, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `coap://${host}:${port}${normalizedPath}`;
}

/**
 * Determine the default approval tier for an MQTT topic.
 * Uses keyword-based heuristics layered from most to least critical.
 */
export function defaultTierForMqttTopic(topic: string): ApprovalTier {
  // Safety/OTA is highest priority
  if (topicMatchesAny(topic, SAFETY_KEYWORDS)) {
    return ApprovalTier.T3_COMMIT;
  }
  // Actuator commands → T2
  if (topicMatchesAny(topic, ACTUATOR_KEYWORDS)) {
    return ApprovalTier.T2_ACT;
  }
  // Config writes → T1
  if (topicMatchesAny(topic, CONFIG_WRITE_KEYWORDS)) {
    return ApprovalTier.T1_PREPARE;
  }
  // Sensor telemetry / status → T0
  if (topicMatchesAny(topic, SENSOR_KEYWORDS)) {
    return ApprovalTier.T0_OBSERVE;
  }
  // Default unknown: treat conservatively as T1
  return ApprovalTier.T1_PREPARE;
}

/**
 * Determine the default approval tier for a CoAP request.
 * GET → T0_OBSERVE; PUT/POST/PATCH/DELETE on actuator or firmware paths → T2/T3.
 */
export function defaultTierForCoapMethod(path: string, method: string): ApprovalTier {
  const upperMethod = method.toUpperCase();

  // Read-only methods → T0
  if (upperMethod === "GET") {
    return ApprovalTier.T0_OBSERVE;
  }

  // DELETE is always high-impact
  if (upperMethod === "DELETE") {
    return ApprovalTier.T2_ACT;
  }

  // For write methods (PUT, POST, PATCH), inspect the path
  if (topicMatchesAny(path, SAFETY_KEYWORDS)) {
    return ApprovalTier.T3_COMMIT;
  }
  if (topicMatchesAny(path, ACTUATOR_KEYWORDS)) {
    return ApprovalTier.T2_ACT;
  }
  if (topicMatchesAny(path, CONFIG_WRITE_KEYWORDS)) {
    return ApprovalTier.T1_PREPARE;
  }
  if (topicMatchesAny(path, SENSOR_KEYWORDS)) {
    return ApprovalTier.T0_OBSERVE;
  }

  // Default for write methods: T1_PREPARE
  return ApprovalTier.T1_PREPARE;
}

/**
 * Returns true if the MQTT topic is safety-critical.
 * Checks for estop, emergency, interlock, shutdown, ota, firmware keywords.
 */
export function isSafetyCriticalIotTopic(topic: string): boolean {
  return topicMatchesAny(topic, SAFETY_KEYWORDS);
}

/**
 * Parse an IoT resource URI back into its component parts.
 * Supports mqtt:// and coap:// schemes.
 * Returns null for unrecognized URIs.
 */
export function parseIotResourceUri(
  uri: string,
): { protocol: IotProtocol; host: string; path: string } | null {
  try {
    if (!uri.startsWith("mqtt://") && !uri.startsWith("coap://")) {
      return null;
    }

    const url = new URL(uri);
    const protocol = url.protocol === "mqtt:" ? "mqtt" : "coap";
    const host = decodeURIComponent(url.hostname);
    const path = url.pathname;

    if (!host || !path) {
      return null;
    }

    return { protocol, host, path };
  } catch {
    return null;
  }
}
