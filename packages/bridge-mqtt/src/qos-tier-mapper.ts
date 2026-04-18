/**
 * SINT bridge-mqtt — MQTT QoS to Approval Tier Mapping
 *
 * Maps MQTT Quality of Service levels to SINT approval tiers,
 * providing graduated risk management for IoT message delivery guarantees.
 *
 * @module @pshkv/bridge-mqtt
 */

import { ApprovalTier } from "@pshkv/core";

/**
 * MQTT Quality of Service levels.
 */
export type MQTTQoS = 0 | 1 | 2;

/**
 * Map MQTT QoS level to SINT approval tier.
 *
 * QoS 0 (At most once): Fire-and-forget, best effort delivery
 * → T0_OBSERVE: Observation only, no action required
 *
 * QoS 1 (At least once): Guaranteed delivery, possible duplicates
 * → T1_PREPARE: Idempotent writes / staging, auto-approved with audit
 *
 * QoS 2 (Exactly once): Guaranteed delivery, no duplicates
 * → T2_ACT: AI can act immediately, logged for review
 *
 * @param qos - MQTT QoS level (0, 1, or 2)
 * @returns Corresponding SINT approval tier
 *
 * @example
 * ```typescript
 * // Sensor reading (QoS 0 = best effort)
 * const tier = mapQoSToTier(0);
 * // Returns: ApprovalTier.T0_OBSERVE
 *
 * // Actuator command (QoS 2 = exactly once)
 * const tier = mapQoSToTier(2);
 * // Returns: ApprovalTier.T2_ACT
 * ```
 */
export function mapQoSToTier(qos: MQTTQoS): ApprovalTier {
  switch (qos) {
    case 0:
      return ApprovalTier.T0_OBSERVE; // Fire-and-forget
    case 1:
      return ApprovalTier.T1_PREPARE; // At-least-once (staging / idempotent writes)
    case 2:
      return ApprovalTier.T2_ACT; // Exactly-once
    default:
      throw new Error(`Invalid MQTT QoS level: ${qos}`);
  }
}

/**
 * Map SINT approval tier to recommended MQTT QoS level.
 * Inverse of mapQoSToTier for publishing MQTT messages.
 *
 * @param tier - SINT approval tier
 * @returns Recommended MQTT QoS level
 *
 * @example
 * ```typescript
 * // For observation-only action
 * const qos = mapTierToQoS(ApprovalTier.T0_OBSERVE);
 * // Returns: 0
 *
 * // For commit-level action
 * const qos = mapTierToQoS(ApprovalTier.T3_COMMIT);
 * // Returns: 2 (exactly-once delivery required)
 * ```
 */
export function mapTierToQoS(tier: ApprovalTier): MQTTQoS {
  switch (tier) {
    case ApprovalTier.T0_OBSERVE:
      return 0; // Best effort sufficient
    case ApprovalTier.T1_PREPARE:
      return 1; // At-least-once
    case ApprovalTier.T2_ACT:
    case ApprovalTier.T3_COMMIT:
      return 2; // Exactly-once (critical actions)
    default:
      throw new Error(`Invalid approval tier: ${tier}`);
  }
}

/**
 * MQTT topic pattern matcher for determining tier based on topic.
 * Extends QoS-based tier mapping with topic-specific overrides.
 */
export interface MQTTTopicRule {
  /** Topic pattern (supports MQTT wildcards: +, #) */
  pattern: string;

  /** Override tier for this topic pattern */
  tier: ApprovalTier;

  /** Rationale for override (for audit trail) */
  rationale: string;
}

/**
 * Match MQTT topic against rules to determine tier.
 * Topic patterns support MQTT wildcards:
 * - '+' matches single level
 * - '#' matches multiple levels
 *
 * @param topic - MQTT topic string
 * @param rules - Array of topic rules
 * @param defaultQoS - Default QoS if no rule matches
 * @returns Approval tier for this topic
 *
 * @example
 * ```typescript
 * const rules: MQTTTopicRule[] = [
 *   {
 *     pattern: 'home/+/lock/+',
 *     tier: ApprovalTier.T2_ACT,
 *     rationale: 'Physical security devices require immediate action'
 *   },
 *   {
 *     pattern: 'sensors/#',
 *     tier: ApprovalTier.T0_OBSERVE,
 *     rationale: 'Sensor data is observation-only'
 *   }
 * ];
 *
 * const tier = matchTopicToTier('home/bedroom/lock/unlock', rules, 1);
 * // Returns: ApprovalTier.T2_ACT (matches first rule)
 * ```
 */
export function matchTopicToTier(
  topic: string,
  rules: MQTTTopicRule[],
  defaultQoS: MQTTQoS = 1
): ApprovalTier {
  // Find first matching rule
  for (const rule of rules) {
    if (matchesMQTTPattern(topic, rule.pattern)) {
      return rule.tier;
    }
  }

  // No rule matched, use QoS-based default
  return mapQoSToTier(defaultQoS);
}

/**
 * Check if MQTT topic matches pattern with wildcards.
 *
 * @param topic - Actual MQTT topic
 * @param pattern - Pattern with MQTT wildcards (+, #)
 * @returns true if topic matches pattern
 */
function matchesMQTTPattern(topic: string, pattern: string): boolean {
  // Convert MQTT pattern to regex
  // '+' matches single level (non-greedy)
  // '#' matches remaining levels (must be last)

  let regexPattern = pattern
    .replace(/\+/g, "[^/]+") // + matches single level
    .replace(/#/g, ".*"); // # matches all remaining

  // Anchor pattern
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  return regex.test(topic);
}

/**
 * MQTT message envelope with tier and metadata.
 */
export interface MQTTMessage {
  /** MQTT topic */
  topic: string;

  /** Message payload */
  payload: Buffer | string;

  /** Quality of Service level */
  qos: MQTTQoS;

  /** Retain flag */
  retain: boolean;

  /** Determined approval tier */
  tier: ApprovalTier;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Create MQTT message envelope with tier determination.
 *
 * @param topic - MQTT topic
 * @param payload - Message payload
 * @param qos - Quality of Service level
 * @param rules - Optional topic rules for tier override
 * @param retain - Retain flag (default: false)
 * @returns MQTT message envelope with tier
 *
 * @example
 * ```typescript
 * const message = createMQTTMessage(
 *   'home/living-room/thermostat/set',
 *   JSON.stringify({ temperature: 72 }),
 *   2,  // QoS 2 = exactly once
 *   topicRules
 * );
 *
 * console.log(message.tier); // ApprovalTier.T2_ACT
 * ```
 */
export function createMQTTMessage(
  topic: string,
  payload: Buffer | string,
  qos: MQTTQoS,
  rules: MQTTTopicRule[] = [],
  retain: boolean = false
): MQTTMessage {
  const tier = matchTopicToTier(topic, rules, qos);

  return {
    topic,
    payload,
    qos,
    retain,
    tier,
    timestamp: new Date(),
  };
}

/**
 * Common MQTT topic rules for smart home environments.
 * These can be used as defaults and extended per deployment.
 */
export const DEFAULT_SMART_HOME_RULES: MQTTTopicRule[] = [
  // Physical security devices
  {
    pattern: "home/+/lock/#",
    tier: ApprovalTier.T2_ACT,
    rationale: "Physical security devices require immediate action with audit",
  },
  {
    pattern: "home/+/alarm/#",
    tier: ApprovalTier.T2_ACT,
    rationale: "Security alarms require immediate response",
  },
  {
    pattern: "home/+/camera/#",
    tier: ApprovalTier.T0_OBSERVE,
    rationale: "Camera feeds are observation-only (EU AI Act Article 5)",
  },

  // Environmental controls
  {
    pattern: "home/+/thermostat/#",
    tier: ApprovalTier.T1_PREPARE,
    rationale: "HVAC changes are low-impact staged writes; log + allow operator confirmation upstream",
  },
  {
    pattern: "home/+/light/#",
    tier: ApprovalTier.T1_PREPARE,
    rationale: "Lighting changes are low-impact staged writes; log for review",
  },

  // Sensors (read-only)
  {
    pattern: "sensors/#",
    tier: ApprovalTier.T0_OBSERVE,
    rationale: "All sensor data is observation-only",
  },
  {
    pattern: "status/#",
    tier: ApprovalTier.T0_OBSERVE,
    rationale: "Status updates are informational",
  },

  // Appliances
  {
    pattern: "home/+/appliance/+/on",
    tier: ApprovalTier.T2_ACT,
    rationale: "Turning on appliances requires confirmation (safety)",
  },
  {
    pattern: "home/+/appliance/+/off",
    tier: ApprovalTier.T1_PREPARE,
    rationale: "Turning off appliances is lower risk; log for audit",
  },
];
