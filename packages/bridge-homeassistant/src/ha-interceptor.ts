/**
 * SINT bridge-homeassistant — MCP Interceptor
 *
 * Intercepts Home Assistant MCP Server tool calls and routes them through
 * SINT Policy Gateway for tier-based authorization. Implements Phase 1
 * consumer smart home governance.
 *
 * Architecture:
 *   Claude Desktop → HAInterceptor → Policy Gateway → HA MCP Server → Home Assistant
 *
 * @module @pshkv/bridge-homeassistant/interceptor
 */

import type { PolicyGateway, PolicyContext, PolicyDecision } from "@pshkv/gate-policy-gateway";
import type { CapabilityToken } from "@pshkv/gate-capability-tokens";
import { ApprovalTier } from "@pshkv/core";
import {
  parseEntityId,
  mapServiceCallToSint,
  extractEntityIdFromMCP,
  extractServiceFromMCP,
  isSafetyCritical,
  type SintResourceMapping,
} from "./resource-mapper.js";

export interface HAInterceptorConfig {
  /** Home Assistant instance hostname (default: 'homeassistant.local') */
  homeAssistantHost?: string;
  /** SINT Policy Gateway instance */
  policyGateway: PolicyGateway;
  /** Agent DID (e.g., 'did:key:z6Mk...') */
  agentDid: string;
  /** Enable verbose logging for debugging */
  debug?: boolean;
}

export interface MCPToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Home Assistant MCP Interceptor.
 *
 * Wraps the Home Assistant MCP Server and intercepts all tool calls.
 * Each call is mapped to a SINT resource + action, checked against Policy Gateway,
 * and either allowed, denied, or escalated for human approval.
 *
 * @example
 * ```ts
 * const interceptor = new HAInterceptor({
 *   policyGateway,
 *   agentDid: 'did:key:z6Mk...',
 *   homeAssistantHost: 'homeassistant.local',
 * });
 *
 * // Intercept an MCP tool call from Claude
 * const result = await interceptor.intercept({
 *   toolName: 'call_service',
 *   toolInput: {
 *     domain: 'lock',
 *     service: 'unlock',
 *     entity_id: 'lock.front_door',
 *   },
 * });
 * ```
 */
export class HAInterceptor {
  private readonly config: Required<HAInterceptorConfig>;
  
  constructor(config: HAInterceptorConfig) {
    this.config = {
      homeAssistantHost: config.homeAssistantHost ?? "homeassistant.local",
      policyGateway: config.policyGateway,
      agentDid: config.agentDid,
      debug: config.debug ?? false,
    };
  }
  
  /**
   * Intercept a Home Assistant MCP tool call.
   * Routes through Policy Gateway for authorization before execution.
   *
   * @param call - MCP tool call from AI agent
   * @returns Tool execution result or denial explanation
   */
  async intercept(call: MCPToolCall): Promise<MCPToolResult> {
    this.log(`Intercepting MCP tool call: ${call.toolName}`);
    
    // Extract entity ID and service from MCP parameters
    const entityId = extractEntityIdFromMCP(call.toolName, call.toolInput);
    const service = extractServiceFromMCP(call.toolInput);
    
    if (!entityId || !service) {
      return {
        success: false,
        error: "Could not extract entity_id or service from MCP tool call",
      };
    }
    
    // Parse entity and map to SINT resource
    const entity = parseEntityId(entityId);
    const mapping = mapServiceCallToSint(
      { entity, service, serviceData: call.toolInput },
      this.config.homeAssistantHost
    );
    
    this.log(`Mapped to SINT resource: ${mapping.resource}, action: ${mapping.action}, tier: ${mapping.tier}`);
    
    // Create Policy Gateway context
    const policyContext: PolicyContext = {
      agentDid: this.config.agentDid,
      resource: mapping.resource,
      action: mapping.action,
      tier: mapping.tier,
      timestamp: new Date(),
      metadata: {
        mcpToolName: call.toolName,
        haEntity: entity.entityId,
        haDomain: entity.domain,
        haService: service,
        safetyCritical: isSafetyCritical(entity.domain),
        ...mapping.context,
      },
    };
    
    // Route through Policy Gateway
    const decision = await this.config.policyGateway.evaluatePolicy(policyContext);
    
    this.log(`Policy decision: ${decision.decision}`);
    
    // Handle decision
    switch (decision.decision) {
      case "allow":
        // Proceed with service call (delegate to actual HA MCP Server)
        return await this.executeServiceCall(call, mapping);
      
      case "deny":
        return {
          success: false,
          error: `Access denied by SINT Policy Gateway: ${decision.reason ?? "Insufficient permissions"}`,
        };
      
      case "escalate":
        return {
          success: false,
          error: `Human approval required (${mapping.tier}): ${decision.reason ?? "Action requires explicit authorization"}`,
        };
      
      default:
        return {
          success: false,
          error: `Unknown policy decision: ${decision.decision}`,
        };
    }
  }
  
  /**
   * Execute the actual Home Assistant service call.
   * This is called AFTER Policy Gateway approval.
   *
   * In production, this would delegate to the official Home Assistant MCP Server.
   * For now, returns a placeholder success response.
   *
   * @param call - Original MCP tool call
   * @param mapping - SINT resource mapping
   * @returns Service call execution result
   */
  private async executeServiceCall(
    call: MCPToolCall,
    mapping: SintResourceMapping
  ): Promise<MCPToolResult> {
    this.log(`Executing HA service call: ${mapping.action} on ${mapping.resource}`);
    
    // TODO: Delegate to official Home Assistant MCP Server
    // For Phase 1, return success placeholder
    return {
      success: true,
      result: {
        message: `Service call executed: ${mapping.action} on ${mapping.context?.entityId}`,
        tier: mapping.tier,
        approved: true,
      },
    };
  }
  
  /**
   * Log debug message if debug mode enabled.
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[HAInterceptor] ${message}`);
    }
  }
}

/**
 * Create a capability token for a Home Assistant service call.
 * Used when pre-authorizing common actions (e.g., "lights on between 6 AM - 11 PM").
 *
 * @param agentDid - Agent DID requesting access
 * @param entityId - Home Assistant entity ID
 * @param service - Home Assistant service name
 * @param validUntil - Token expiration (default: 30 days)
 * @returns Capability token for Policy Gateway
 */
export function createHACapabilityToken(
  agentDid: string,
  entityId: string,
  service: string,
  validUntil?: Date
): Partial<CapabilityToken> {
  const entity = parseEntityId(entityId);
  const mapping = mapServiceCallToSint({ entity, service });
  
  const expiresAt = validUntil ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  
  return {
    subject: agentDid,
    resource: mapping.resource,
    actions: [mapping.action],
    tier: mapping.tier,
    issuedAt: new Date(),
    expiresAt,
  };
}
