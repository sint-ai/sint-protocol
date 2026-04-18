/**
 * SINT Bridge-ROS2 — Interceptor.
 *
 * Intercepts ROS 2 topic publishes, subscriptions, service calls,
 * and action goals through the SINT Policy Gateway.
 *
 * @module @sint/bridge-ros2/ros2-interceptor
 */

import type { SintRequest } from "@sint-ai/core";
import type { PolicyGateway } from "@sint-ai/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@sint-ai/gate-capability-tokens";
import type {
  ROS2TopicMessage,
  ROS2ServiceCall,
  ROS2ActionGoal,
  ROS2InterceptResult,
} from "./types.js";
import {
  topicToResourceUri,
  serviceToResourceUri,
  actionToResourceUri,
  extractPhysicalContext,
} from "./ros2-resource-mapper.js";

/** Configuration for the ROS 2 interceptor. */
export interface ROS2InterceptorConfig {
  /** The SINT Policy Gateway instance. */
  readonly gateway: PolicyGateway;
  /** Agent ID (Ed25519 public key). */
  readonly agentId: string;
  /** Capability token ID bound to this interceptor. */
  readonly tokenId: string;
  /** Robot mass in kg (for force estimation from velocity). */
  readonly robotMassKg?: number;
}

/**
 * ROS 2 Interceptor — routes all robot operations through the SINT security gate.
 *
 * @example
 * ```ts
 * const interceptor = new ROS2Interceptor({
 *   gateway,
 *   agentId: agent.publicKey,
 *   tokenId: token.tokenId,
 *   robotMassKg: 25,
 * });
 *
 * const result = interceptor.interceptPublish({
 *   topicName: "/cmd_vel",
 *   messageType: "geometry_msgs/Twist",
 *   data: { linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.1 } },
 *   timestamp: new Date().toISOString(),
 * });
 * ```
 */
export class ROS2Interceptor {
  private readonly gateway: PolicyGateway;
  private readonly agentId: string;
  private readonly tokenId: string;
  private readonly robotMassKg?: number;

  constructor(config: ROS2InterceptorConfig) {
    this.gateway = config.gateway;
    this.agentId = config.agentId;
    this.tokenId = config.tokenId;
    this.robotMassKg = config.robotMassKg;
  }

  /**
   * Intercept a topic publish operation.
   */
  async interceptPublish(message: ROS2TopicMessage): Promise<ROS2InterceptResult> {
    const physicalCtx = extractPhysicalContext(message, this.robotMassKg);

    const request: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: topicToResourceUri(message.topicName),
      action: "publish",
      params: message.data,
      physicalContext: physicalCtx
        ? {
            currentVelocityMps: physicalCtx.currentVelocityMps,
            currentForceNewtons: physicalCtx.currentForceNewtons,
          }
        : undefined,
    };

    return this.evaluate(request, message.topicName);
  }

  /**
   * Intercept a topic subscribe operation.
   */
  async interceptSubscribe(topicName: string): Promise<ROS2InterceptResult> {
    const request: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: topicToResourceUri(topicName),
      action: "subscribe",
      params: {},
    };

    return this.evaluate(request, topicName);
  }

  /**
   * Intercept a service call.
   */
  async interceptServiceCall(serviceCall: ROS2ServiceCall): Promise<ROS2InterceptResult> {
    const request: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: serviceToResourceUri(serviceCall.serviceName),
      action: "call",
      params: serviceCall.request,
    };

    return this.evaluate(request, serviceCall.serviceName);
  }

  /**
   * Intercept an action goal submission.
   */
  async interceptActionGoal(actionGoal: ROS2ActionGoal): Promise<ROS2InterceptResult> {
    const request: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: actionToResourceUri(actionGoal.actionName),
      action: "call",
      params: actionGoal.goal,
    };

    return this.evaluate(request, actionGoal.actionName);
  }

  private async evaluate(request: SintRequest, resourceName: string): Promise<ROS2InterceptResult> {
    const decision = await this.gateway.intercept(request);

    const result: ROS2InterceptResult = {
      action: decision.action === "allow" ? "forward" : decision.action === "deny" ? "deny" : "escalate",
      decision,
      resourceName,
    };

    if (decision.action === "deny" && decision.denial) {
      return { ...result, denyReason: decision.denial.reason };
    }

    if (decision.action === "escalate" && decision.escalation) {
      return { ...result, requiredTier: decision.escalation.requiredTier };
    }

    return result;
  }
}
