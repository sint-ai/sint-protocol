/**
 * SINT bridge-matter — Matter Protocol Interceptor
 *
 * Intercepts Matter device interactions and routes them through SINT Policy
 * Gateway for tier-based authorization. Implements Phase 2 Matter protocol
 * support per Physical AI Governance Roadmap.
 *
 * @module @pshkv/bridge-matter/interceptor
 */

import type { PolicyGateway, PolicyContext } from "@pshkv/gate-policy-gateway";
import { ApprovalTier } from "@pshkv/core";
import {
  mapMatterToSint,
  isPhysicalActuatorCluster,
  type MatterAccessContext,
  type MatterClusterId,
  type MatterResourceMapping,
} from "./cluster-mapper.js";

export interface MatterInterceptorConfig {
  /** SINT Policy Gateway instance */
  policyGateway: PolicyGateway;
  /** Agent DID (e.g., 'did:key:z6Mk...') */
  agentDid: string;
  /** Matter fabric ID (network identifier) */
  fabricId: string;
  /** Enable verbose logging for debugging */
  debug?: boolean;
}

export interface MatterOperationResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Matter Protocol Interceptor.
 *
 * Wraps Matter device interactions and intercepts all commands/attribute writes.
 * Each operation is mapped to a SINT resource + action, checked against Policy
 * Gateway, and either allowed, denied, or escalated for human approval.
 *
 * @example
 * ```ts
 * const interceptor = new MatterInterceptor({
 *   policyGateway,
 *   agentDid: 'did:key:z6Mk...',
 *   fabricId: 'fabric-home-01',
 * });
 *
 * // Intercept a DoorLock unlock command
 * const result = await interceptor.intercept({
 *   fabricId: 'fabric-home-01',
 *   nodeId: 'node-123',
 *   endpointId: 1,
 *   clusterId: MatterClusterId.DoorLock,
 *   commandOrAttribute: 'UnlockDoor',
 *   commandType: 'invoke',
 * });
 * ```
 */
export class MatterInterceptor {
  private readonly config: Required<MatterInterceptorConfig>;
  
  constructor(config: MatterInterceptorConfig) {
    this.config = {
      policyGateway: config.policyGateway,
      agentDid: config.agentDid,
      fabricId: config.fabricId,
      debug: config.debug ?? false,
    };
  }
  
  /**
   * Intercept a Matter cluster operation.
   * Routes through Policy Gateway for authorization before execution.
   *
   * @param context - Matter access context
   * @returns Operation execution result or denial explanation
   */
  async intercept(context: MatterAccessContext): Promise<MatterOperationResult> {
    this.log(`Intercepting Matter operation: ${context.commandOrAttribute} on cluster ${context.clusterId}`);
    
    // Map to SINT resource
    const mapping = mapMatterToSint(context);
    
    this.log(`Mapped to SINT resource: ${mapping.resource}, action: ${mapping.action}, tier: ${mapping.tier}`);
    
    // Create Policy Gateway context
    const policyContext: PolicyContext = {
      agentDid: this.config.agentDid,
      resource: mapping.resource,
      action: mapping.action,
      tier: mapping.tier,
      timestamp: new Date(),
      metadata: {
        matterFabricId: context.fabricId,
        matterNodeId: context.nodeId,
        matterEndpointId: context.endpointId,
        matterClusterId: context.clusterId,
        matterClusterName: mapping.context.clusterName,
        matterCommand: context.commandOrAttribute,
        isPhysicalActuator: mapping.isPhysicalActuator,
        commandArgs: context.commandArgs,
      },
    };
    
    // Route through Policy Gateway
    const decision = await this.config.policyGateway.evaluatePolicy(policyContext);
    
    this.log(`Policy decision: ${decision.decision}`);
    
    // Handle decision
    switch (decision.decision) {
      case "allow":
        // Proceed with Matter operation (delegate to actual Matter controller)
        return await this.executeMatterOperation(context, mapping);
      
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
   * Execute the actual Matter cluster operation.
   * This is called AFTER Policy Gateway approval.
   *
   * In production, this would delegate to the Matter.js controller.
   * For now, returns a placeholder success response.
   *
   * @param context - Original Matter access context
   * @param mapping - SINT resource mapping
   * @returns Operation execution result
   */
  private async executeMatterOperation(
    context: MatterAccessContext,
    mapping: MatterResourceMapping
  ): Promise<MatterOperationResult> {
    this.log(`Executing Matter operation: ${mapping.action} on ${mapping.resource}`);
    
    // TODO: Delegate to Matter.js controller
    // Example:
    // const controller = await MatterController.connect(context.fabricId);
    // const node = await controller.getNode(context.nodeId);
    // const endpoint = await node.getEndpoint(context.endpointId);
    // const cluster = await endpoint.getCluster(context.clusterId);
    // const result = await cluster.invoke(context.commandOrAttribute, context.commandArgs);
    
    // For Phase 2, return success placeholder
    return {
      success: true,
      result: {
        message: `Matter operation executed: ${mapping.action} on ${mapping.context.clusterName}`,
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
      console.log(`[MatterInterceptor] ${message}`);
    }
  }
}

/**
 * Create a capability token for a Matter cluster operation.
 * Used when pre-authorizing common actions (e.g., "lights on/off anytime").
 *
 * @param agentDid - Agent DID requesting access
 * @param fabricId - Matter fabric ID
 * @param nodeId - Matter node ID
 * @param endpointId - Matter endpoint ID
 * @param clusterId - Matter cluster ID
 * @param commandOrAttribute - Command or attribute name
 * @param validUntil - Token expiration (default: 30 days)
 * @returns Partial capability token for Policy Gateway
 */
export function createMatterCapabilityToken(
  agentDid: string,
  fabricId: string,
  nodeId: string,
  endpointId: number,
  clusterId: MatterClusterId,
  commandOrAttribute: string,
  validUntil?: Date
) {
  const mapping = mapMatterToSint({
    fabricId,
    nodeId,
    endpointId,
    clusterId,
    commandOrAttribute,
    commandType: "invoke",
  });
  
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
