/**
 * SINT Bridge A2A — A2A Interceptor.
 *
 * The A2AInterceptor sits between an orchestrating agent and a target agent.
 * Every `tasks/send` (and `tasks/sendSubscribe`) call is intercepted and run
 * through the SINT PolicyGateway before the task is forwarded.
 *
 * If the gateway allows → the task is forwarded as-is.
 * If the gateway denies → the task is rejected with a SINT error code.
 * If the gateway escalates → the task is held pending human approval.
 *
 * @module @sint/bridge-a2a/interceptor
 */

import type { PolicyDecision, SintRequest, UUIDv7 } from "@sint/core";
import type { PolicyGateway } from "@sint/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@sint/gate-capability-tokens";
import {
  type A2AAgentCard,
  type A2AInterceptResult,
  type A2AInterceptorConfig,
  type A2ASendTaskParams,
  type A2ATask,
  A2A_ERROR_CODES,
} from "./types.js";
import {
  buildResourceUri,
  extractA2APhysicalContext,
  mapMethodToAction,
  resolveSkill,
} from "./a2a-resource-mapper.js";

/**
 * A2A Interceptor — the SINT security layer for agent-to-agent communication.
 *
 * @example
 * ```ts
 * const interceptor = new A2AInterceptor(gateway, {
 *   agentCard: fleetManagerCard,
 *   agentId: myAgent.publicKey,
 *   tokenId: myToken.tokenId,
 * });
 *
 * const result = await interceptor.interceptSend(params);
 * if (result.action === "forward") {
 *   // Safe to call the downstream agent
 *   return await callAgent(fleetManagerCard.url, params);
 * }
 * ```
 */
export class A2AInterceptor {
  private readonly gateway: PolicyGateway;
  private readonly agentCard: A2AAgentCard;
  private readonly agentId: string;
  private readonly tokenId: UUIDv7;

  constructor(
    gateway: PolicyGateway,
    agentId: string,
    tokenId: UUIDv7,
    config: A2AInterceptorConfig,
  ) {
    this.gateway = gateway;
    this.agentId = agentId;
    this.tokenId = tokenId;
    this.agentCard = config.agentCard;
  }

  /**
   * Intercept a `tasks/send` call.
   * Returns an `A2AInterceptResult` — the caller decides whether to forward.
   */
  async interceptSend(params: A2ASendTaskParams): Promise<A2AInterceptResult> {
    return this.intercept(params, "tasks/send");
  }

  /**
   * Intercept a `tasks/sendSubscribe` (streaming) call.
   */
  async interceptStream(params: A2ASendTaskParams): Promise<A2AInterceptResult> {
    return this.intercept(params, "tasks/sendSubscribe");
  }

  /**
   * Intercept a `tasks/cancel` call.
   */
  async interceptCancel(taskId: string): Promise<A2AInterceptResult> {
    const cancelParams: A2ASendTaskParams = {
      id: taskId,
      message: { role: "user", parts: [{ type: "text", text: `Cancel task ${taskId}` }] },
    };
    return this.intercept(cancelParams, "tasks/cancel");
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async intercept(
    params: A2ASendTaskParams,
    method: string,
  ): Promise<A2AInterceptResult> {
    const skill = resolveSkill(this.agentCard, params);
    const resource = buildResourceUri(this.agentCard.url, skill?.id ?? params.skillId);
    const action = mapMethodToAction(method);
    const physicalContext = extractA2APhysicalContext(params);

    const request: SintRequest = {
      requestId: generateUUIDv7() as UUIDv7,
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource,
      action,
      params: {
        taskId: params.id,
        sessionId: params.sessionId,
        skillId: skill?.id,
        message: params.message,
        metadata: params.metadata,
        method,
      },
      physicalContext,
    };

    const decision = await this.gateway.intercept(request);
    return this.mapDecision(decision, params);
  }

  private mapDecision(decision: PolicyDecision, params: A2ASendTaskParams): A2AInterceptResult {
    const task = this.makeTask(params, decision);

    switch (decision.action) {
      case "allow":
      case "transform":
        return { action: "forward", task: { ...task, status: "submitted" } };

      case "deny":
        return {
          action: "deny",
          task: { ...task, status: "failed" },
          reason: decision.denial?.reason ?? "Denied by SINT policy gateway",
          policyViolated: decision.denial?.policyViolated ?? "POLICY_DENY",
        };

      case "escalate":
        return {
          action: "escalate",
          task: { ...task, status: "input-required" },
          reason: decision.escalation?.reason ?? "Escalated for human approval",
        };

      default:
        return {
          action: "deny",
          task: { ...task, status: "failed" },
          reason: "Unknown decision action",
          policyViolated: "INTERNAL_ERROR",
        };
    }
  }

  private makeTask(params: A2ASendTaskParams, decision: PolicyDecision): A2ATask {
    return {
      id: params.id,
      sessionId: params.sessionId,
      status: "working",
      message: params.message,
      metadata: {
        ...params.metadata,
        sint: {
          requestId: decision.requestId,
          assignedTier: decision.assignedTier,
          assignedRisk: decision.assignedRisk,
        },
      },
      createdAt: nowISO8601(),
    };
  }
}

/**
 * Build a JSON-RPC 2.0 error response for a SINT deny decision.
 */
export function buildDenyResponse(
  id: string | number,
  reason: string,
  code = A2A_ERROR_CODES.SINT_POLICY_DENY,
): object {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message: reason,
      data: { sint: true },
    },
  };
}

/**
 * Build a JSON-RPC 2.0 error response for a SINT escalation.
 */
export function buildEscalationResponse(id: string | number, reason: string): object {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: A2A_ERROR_CODES.SINT_ESCALATION_REQUIRED,
      message: reason,
      data: { sint: true, awaitingApproval: true },
    },
  };
}
