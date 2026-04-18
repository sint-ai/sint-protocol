/**
 * SINT Policy Gateway — Δ_human Occupancy Plugin (Phase 2)
 *
 * Reads Home Assistant occupancy state and escalates tier when humans are
 * detected near physical actuators. Implements human-aware tier escalation
 * from Physical AI Governance Roadmap Phase 2.
 *
 * Architecture:
 *   Policy Gateway → computeDeltaHuman() → HA occupancy entities → tier += 1
 *
 * @module @pshkv/gate-policy-gateway/plugins/delta-human
 */

import { ApprovalTier } from "@pshkv/core";

export interface OccupancyState {
  /** Entity ID (e.g., 'person.alice', 'binary_sensor.kitchen_motion') */
  entityId: string;
  /** State value ('home', 'away', 'on', 'off') */
  state: string;
  /** Last updated timestamp */
  lastUpdated: Date;
  /** Additional attributes from HA */
  attributes?: Record<string, unknown>;
}

export interface DeltaHumanContext {
  /** SINT resource URI being accessed */
  resource: string;
  /** Action being performed */
  action: string;
  /** Base tier before escalation */
  baseTier: ApprovalTier;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

export interface DeltaHumanConfig {
  /** Home Assistant instance URL (e.g., 'http://homeassistant.local:8123') */
  homeAssistantUrl: string;
  /** HA Long-Lived Access Token */
  accessToken: string;
  /**
   * Entity ID patterns to monitor for human presence.
   * Default: ['person.*', 'device_tracker.*', 'binary_sensor.*_motion']
   */
  occupancyEntityPatterns?: string[];
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Δ_human escalation result.
 */
export interface DeltaHumanResult {
  /** Escalation delta (0.0 = no humans, 1.0 = humans present) */
  delta: number;
  /** Escalated tier (baseTier + delta) */
  escalatedTier: ApprovalTier;
  /** Number of humans detected */
  humansDetected: number;
  /** Occupancy entities that triggered escalation */
  triggeringEntities: string[];
  /** Explanation for audit log */
  explanation: string;
}

/**
 * Fetch current state of Home Assistant entities.
 *
 * @param config - HA connection config
 * @param entityIds - Entity IDs to fetch (optional, fetches all if omitted)
 * @returns Array of entity states
 */
export async function fetchHAStates(
  config: Pick<DeltaHumanConfig, "homeAssistantUrl" | "accessToken">,
  entityIds?: string[]
): Promise<OccupancyState[]> {
  const url = `${config.homeAssistantUrl}/api/states`;
  
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      throw new Error(`HA API error: ${response.status} ${response.statusText}`);
    }
    
    const allStates = await response.json();
    
    // Filter to requested entities if specified
    const states = entityIds
      ? allStates.filter((s: any) => entityIds.includes(s.entity_id))
      : allStates;
    
    return states.map((s: any) => ({
      entityId: s.entity_id,
      state: s.state,
      lastUpdated: new Date(s.last_updated),
      attributes: s.attributes,
    }));
  } catch (error) {
    console.error("[DeltaHuman] Failed to fetch HA states:", error);
    return [];
  }
}

/**
 * Check if an entity indicates human presence.
 *
 * @param state - HA entity state
 * @returns true if entity indicates human is present
 */
export function indicatesHumanPresence(state: OccupancyState): boolean {
  const { entityId, state: value } = state;
  
  // person.* entities
  if (entityId.startsWith("person.")) {
    return value === "home";
  }
  
  // device_tracker.* entities (phones, wearables)
  if (entityId.startsWith("device_tracker.")) {
    return value === "home";
  }
  
  // binary_sensor.*_motion entities
  if (entityId.includes("motion") && entityId.startsWith("binary_sensor.")) {
    return value === "on";
  }
  
  // binary_sensor.*_occupancy entities
  if (entityId.includes("occupancy") && entityId.startsWith("binary_sensor.")) {
    return value === "on";
  }
  
  return false;
}

/**
 * Match entity ID against glob-style pattern.
 * Supports '*' wildcard (e.g., 'person.*' matches 'person.alice').
 */
export function matchesPattern(entityId: string, pattern: string): boolean {
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return regex.test(entityId);
}

/**
 * Compute Δ_human escalation for a given context.
 *
 * Logic:
 * 1. Fetch occupancy states from Home Assistant
 * 2. Count humans present (person.* = home, device_tracker.* = home, motion = on)
 * 3. If resource is a physical actuator AND humans present → delta = 1.0
 * 4. Return escalated tier (baseTier + delta)
 *
 * @param context - Policy context (resource, action, baseTier)
 * @param config - HA connection config
 * @returns Escalation result with delta and escalated tier
 *
 * @example
 * ```ts
 * const result = await computeDeltaHuman(
 *   {
 *     resource: 'ha://home/vacuum.roomba',
 *     action: 'start',
 *     baseTier: ApprovalTier.T1_PREPARE,
 *   },
 *   { homeAssistantUrl: 'http://ha.local:8123', accessToken: '...' }
 * );
 * // If person detected: result.delta = 1.0, result.escalatedTier = T2_ACT
 * ```
 */
export async function computeDeltaHuman(
  context: DeltaHumanContext,
  config: DeltaHumanConfig
): Promise<DeltaHumanResult> {
  const {
    occupancyEntityPatterns = ["person.*", "device_tracker.*", "binary_sensor.*_motion"],
  } = config;
  
  // Fetch all states
  const allStates = await fetchHAStates(config);
  
  // Filter to occupancy entities
  const occupancyStates = allStates.filter((state) =>
    occupancyEntityPatterns.some((pattern) => matchesPattern(state.entityId, pattern))
  );
  
  // Count humans present
  const presentEntities = occupancyStates.filter(indicatesHumanPresence);
  const humansDetected = presentEntities.length;
  
  if (config.debug) {
    console.log(`[DeltaHuman] Checked ${occupancyStates.length} occupancy entities, found ${humansDetected} humans`);
  }
  
  // Check if resource is a physical actuator
  const isPhysicalActuator = isPhysicalActuatorResource(context.resource);
  
  // Compute delta
  let delta = 0.0;
  if (humansDetected > 0 && isPhysicalActuator) {
    delta = 1.0; // Full tier escalation
  }
  
  // Escalate tier
  const escalatedTier = escalateTier(context.baseTier, delta);
  
  // Generate explanation
  const explanation = delta > 0
    ? `${humansDetected} human(s) detected near physical actuator (${presentEntities.map(e => e.entityId).join(", ")})`
    : "No humans detected or non-physical resource";
  
  return {
    delta,
    escalatedTier,
    humansDetected,
    triggeringEntities: presentEntities.map((e) => e.entityId),
    explanation,
  };
}

/**
 * Check if a resource URI represents a physical actuator.
 * Physical actuators include robots, locks, garage doors, vacuums, etc.
 *
 * @param resource - SINT resource URI
 * @returns true if resource is a physical actuator
 */
export function isPhysicalActuatorResource(resource: string): boolean {
  // Home Assistant resources
  if (resource.startsWith("ha://")) {
    // Extract entity domain from URI (e.g., 'ha://home/vacuum.roomba' → 'vacuum')
    const match = resource.match(/ha:\/\/[^/]+\/(?:entity\/)?([^.]+)\./);
    if (match) {
      const domain = match[1];
      const physicalDomains = [
        "lock",
        "cover", // garage doors, blinds
        "vacuum",
        "fan",
        "climate",
        "switch", // power switches can control physical devices
      ];
      return physicalDomains.includes(domain);
    }
  }
  
  // ROS 2 resources (all robot commands are physical)
  if (resource.startsWith("ros2://")) {
    return true;
  }
  
  // MAVLink resources (drones are physical)
  if (resource.startsWith("mavlink://")) {
    return true;
  }
  
  // Default: assume non-physical
  return false;
}

/**
 * Escalate a tier by a given delta.
 *
 * @param baseTier - Starting tier
 * @param delta - Escalation amount (0.0 to 1.0+)
 * @returns Escalated tier (capped at T3_COMMIT)
 */
export function escalateTier(baseTier: ApprovalTier, delta: number): ApprovalTier {
  if (delta === 0) return baseTier;
  
  // Map tiers to numeric values
  const tierValue = {
    [ApprovalTier.T0_OBSERVE]: 0,
    [ApprovalTier.T1_PREPARE]: 1,
    [ApprovalTier.T2_ACT]: 2,
    [ApprovalTier.T3_COMMIT]: 3,
  }[baseTier];
  
  // Escalate by delta (1.0 = +1 tier)
  const escalatedValue = Math.min(3, tierValue + Math.floor(delta));
  
  // Map back to tier
  const tiers = [
    ApprovalTier.T0_OBSERVE,
    ApprovalTier.T1_PREPARE,
    ApprovalTier.T2_ACT,
    ApprovalTier.T3_COMMIT,
  ];
  
  return tiers[escalatedValue];
}

/**
 * Create a middleware function for Policy Gateway that applies Δ_human escalation.
 *
 * @param config - HA connection config
 * @returns Middleware function that escalates tier when humans detected
 *
 * @example
 * ```ts
 * const deltaHumanMiddleware = createDeltaHumanMiddleware({
 *   homeAssistantUrl: 'http://homeassistant.local:8123',
 *   accessToken: process.env.HA_TOKEN,
 * });
 *
 * policyGateway.use(deltaHumanMiddleware);
 * ```
 */
export function createDeltaHumanMiddleware(config: DeltaHumanConfig) {
  return async (context: DeltaHumanContext, next: () => Promise<void>) => {
    const result = await computeDeltaHuman(context, config);
    
    if (result.delta > 0) {
      // Log escalation in context metadata
      context.metadata = context.metadata || {};
      context.metadata.deltaHuman = result.delta;
      context.metadata.deltaHumanExplanation = result.explanation;
      context.metadata.humansDetected = result.humansDetected;
      
      // Update tier in context
      (context as any).tier = result.escalatedTier;
      
      if (config.debug) {
        console.log(`[DeltaHuman] Escalated ${context.resource} from ${context.baseTier} to ${result.escalatedTier}`);
      }
    }
    
    await next();
  };
}
