/**
 * SINT bridge-homeassistant — Resource Mapper
 *
 * Maps Home Assistant MCP tool calls to SINT resource URIs and actions.
 * Integrates with Policy Gateway for tier-based authorization.
 *
 * @module @pshkv/bridge-homeassistant/resource-mapper
 */

import { ApprovalTier } from "@pshkv/core";
import { getTierForService, getProfileForDomain } from "./consumer-profiles.js";

export interface HAEntity {
  entityId: string;
  domain: string;
  objectId: string;
}

export interface HAServiceCall {
  entity: HAEntity;
  service: string;
  serviceData?: Record<string, unknown>;
}

export interface SintResourceMapping {
  /** SINT resource URI (e.g., ha://homeassistant.local/entity/light.living_room) */
  resource: string;
  /** SINT action (e.g., 'turn_on', 'unlock') */
  action: string;
  /** Minimum required approval tier */
  tier: ApprovalTier;
  /** Additional context for Policy Gateway */
  context?: {
    domain: string;
    service: string;
    entityId: string;
    serviceData?: Record<string, unknown>;
  };
}

/**
 * Parse a Home Assistant entity ID into domain and object ID.
 * Format: domain.object_id (e.g., 'light.living_room' → domain='light', objectId='living_room')
 */
export function parseEntityId(entityId: string): HAEntity {
  const [domain, ...rest] = entityId.split(".");
  const objectId = rest.join(".");
  
  if (!domain || !objectId) {
    throw new Error(`Invalid Home Assistant entity ID: ${entityId}`);
  }
  
  return {
    entityId,
    domain,
    objectId,
  };
}

/**
 * Map a Home Assistant service call to a SINT resource URI and action.
 * This is the core mapping function used by HAInterceptor.
 *
 * @param call - Home Assistant service call details
 * @param homeAssistantHost - HA instance hostname (default: 'homeassistant.local')
 * @returns SINT resource mapping with tier and context
 *
 * @example
 * ```ts
 * const mapping = mapServiceCallToSint({
 *   entity: parseEntityId('lock.front_door'),
 *   service: 'unlock',
 * });
 * // Returns:
 * // {
 * //   resource: 'ha://homeassistant.local/entity/lock.front_door',
 * //   action: 'unlock',
 * //   tier: ApprovalTier.T2_ACT,
 * //   context: { domain: 'lock', service: 'unlock', entityId: 'lock.front_door' }
 * // }
 * ```
 */
export function mapServiceCallToSint(
  call: HAServiceCall,
  homeAssistantHost = "homeassistant.local"
): SintResourceMapping {
  const { entity, service, serviceData } = call;
  
  // Get tier from consumer profile
  const tier = getTierForService(entity.domain, service);
  
  if (tier === undefined) {
    // Domain not recognized in consumer profiles - default to T1
    // This allows graceful degradation for unknown device types
    return {
      resource: `ha://${homeAssistantHost}/entity/${entity.entityId}`,
      action: service,
      tier: ApprovalTier.T1_PREPARE,
      context: {
        domain: entity.domain,
        service,
        entityId: entity.entityId,
        serviceData,
      },
    };
  }
  
  return {
    resource: `ha://${homeAssistantHost}/entity/${entity.entityId}`,
    action: service,
    tier,
    context: {
      domain: entity.domain,
      service,
      entityId: entity.entityId,
      serviceData,
    },
  };
}

/**
 * Check if a service call targets a safety-critical device.
 * Used to trigger additional logging or escalation in Policy Gateway.
 */
export function isSafetyCritical(domain: string): boolean {
  const profile = getProfileForDomain(domain);
  if (!profile) return false;
  
  // Devices with safety topics or high default tiers are safety-critical
  return (
    profile.safetyTopics.length > 0 ||
    profile.defaultTier === ApprovalTier.T2_ACT ||
    profile.defaultTier === ApprovalTier.T3_COMMIT
  );
}

/**
 * Extract entity ID from a Home Assistant MCP tool call.
 * MCP tools typically pass entity_id as a parameter.
 *
 * @param toolName - MCP tool name (e.g., 'call_service')
 * @param toolInput - MCP tool input arguments
 * @returns Entity ID if found, undefined otherwise
 */
export function extractEntityIdFromMCP(
  toolName: string,
  toolInput: Record<string, unknown>
): string | undefined {
  // Home Assistant MCP Server uses 'entity_id' parameter
  if (typeof toolInput.entity_id === "string") {
    return toolInput.entity_id;
  }
  
  // Fallback: check 'target' object (HA service call format)
  if (typeof toolInput.target === "object" && toolInput.target !== null) {
    const target = toolInput.target as Record<string, unknown>;
    if (typeof target.entity_id === "string") {
      return target.entity_id;
    }
  }
  
  return undefined;
}

/**
 * Extract service name from MCP tool input.
 *
 * @param toolInput - MCP tool input arguments
 * @returns Service name (e.g., 'turn_on', 'unlock')
 */
export function extractServiceFromMCP(toolInput: Record<string, unknown>): string | undefined {
  if (typeof toolInput.service === "string") {
    return toolInput.service;
  }
  return undefined;
}
