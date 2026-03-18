/**
 * SINT Protocol — Policy Gateway.
 *
 * THE SINGLE CHOKE POINT. Every agent action — tool call, ROS 2 topic
 * publish, actuator command, capsule execution — flows through here.
 *
 * No action ever bypasses the Policy Gateway.
 *
 * @module @sint/gate-policy-gateway/gateway
 */

import {
  type ApprovalTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
  sintRequestSchema,
  DEFAULT_APPROVAL_TIMEOUT_MS,
} from "@sint/core";
import {
  validateCapabilityToken,
  type RevocationStore,
} from "@sint/gate-capability-tokens";
import { nowISO8601 } from "@sint/gate-capability-tokens";
import { assignTier, type TierAssignment } from "./tier-assigner.js";
import { checkConstraints } from "./constraint-checker.js";
import { checkForbiddenCombos } from "./forbidden-combos.js";
import type { AgentTrustLevel } from "@sint/core";

/** Token resolver — looks up a capability token by ID (sync or async). */
export type TokenResolver = (tokenId: string) => SintCapabilityToken | undefined | Promise<SintCapabilityToken | undefined>;

/** Event emitter for ledger integration. */
export type LedgerEmitter = (event: {
  eventType: string;
  agentId: string;
  tokenId?: string;
  payload: Record<string, unknown>;
}) => void;

/**
 * Economy plugin hooks for PolicyGateway integration.
 *
 * preIntercept runs before tier assignment — can short-circuit with a deny.
 * postIntercept runs after an allow decision — bills the action.
 */
export interface EconomyPluginHooks {
  /** Called before tier assignment. Return PolicyDecision to short-circuit, undefined to proceed. */
  preIntercept(request: SintRequest): Promise<PolicyDecision | undefined>;
  /** Called after final decision. Used for billing on allow. */
  postIntercept(request: SintRequest, decision: PolicyDecision): Promise<void>;
}

/** Policy Gateway configuration. */
export interface PolicyGatewayConfig {
  readonly resolveToken: TokenResolver;
  readonly revocationStore?: RevocationStore;
  readonly emitLedgerEvent?: LedgerEmitter;
  readonly getAgentTrustLevel?: (agentId: string) => AgentTrustLevel;
  /** Optional economy plugin for budget/balance/trust enforcement. */
  readonly economyPlugin?: EconomyPluginHooks;
}

/**
 * The Policy Gateway — core interception logic.
 *
 * Every request flows through `intercept()`. The gateway:
 * 1. Validates the request schema
 * 2. Resolves and validates the capability token
 * 3. Checks revocation status
 * 4. Assigns an approval tier
 * 5. Checks forbidden tool combinations
 * 6. Checks physical constraints
 * 7. Returns a PolicyDecision (allow/deny/escalate/transform)
 *
 * @example
 * ```ts
 * const gateway = new PolicyGateway({
 *   resolveToken: (id) => tokenStore.get(id),
 *   revocationStore: revocationStore,
 *   emitLedgerEvent: (event) => ledger.write(event),
 * });
 *
 * const decision = gateway.intercept(request);
 * ```
 */
export class PolicyGateway {
  private readonly config: PolicyGatewayConfig;

  constructor(config: PolicyGatewayConfig) {
    this.config = config;
  }

  /**
   * Intercept a request and produce a policy decision.
   *
   * This is the ONLY entry point for all agent actions.
   * NOTHING bypasses this method.
   */
  async intercept(request: SintRequest): Promise<PolicyDecision> {
    const timestamp = nowISO8601();
    const requestId = request.requestId;

    // 1. Validate request schema
    const parsed = sintRequestSchema.safeParse(request);
    if (!parsed.success) {
      return this.deny(requestId, timestamp, "MALFORMED_REQUEST", "Request failed schema validation");
    }

    // 2. Resolve the capability token
    const token = await this.config.resolveToken(request.tokenId);
    if (!token) {
      return this.deny(requestId, timestamp, "TOKEN_NOT_FOUND", "Capability token not found");
    }

    // 3. Check revocation status
    if (this.config.revocationStore) {
      const revocationResult = this.config.revocationStore.checkRevocation(token.tokenId);
      if (!revocationResult.ok) {
        return this.deny(requestId, timestamp, "TOKEN_REVOKED", "Capability token has been revoked");
      }
    }

    // 4. Validate the capability token (signature, expiry, permissions, constraints)
    const tokenValidation = validateCapabilityToken(token, {
      resource: request.resource,
      action: request.action,
      physicalContext: request.physicalContext
        ? {
            commandedForceNewtons: request.physicalContext.currentForceNewtons,
            commandedVelocityMps: request.physicalContext.currentVelocityMps,
            humanPresenceDetected: request.physicalContext.humanDetected,
            position: request.physicalContext.currentPosition
              ? {
                  x: request.physicalContext.currentPosition.x,
                  y: request.physicalContext.currentPosition.y,
                }
              : undefined,
          }
        : undefined,
    });
    if (!tokenValidation.ok) {
      return this.deny(requestId, timestamp, tokenValidation.error, `Token validation failed: ${tokenValidation.error}`);
    }

    // 4b. Economy pre-intercept (budget, balance, trust checks)
    if (this.config.economyPlugin) {
      try {
        const economyDecision = await this.config.economyPlugin.preIntercept(request);
        if (economyDecision) {
          // Economy plugin short-circuits — emit and return
          this.emitEvent("policy.evaluated", request.agentId, request.tokenId, {
            decision: economyDecision.action,
            tier: economyDecision.assignedTier,
            risk: economyDecision.assignedRisk,
            source: "economy_plugin",
          });
          return economyDecision;
        }
      } catch {
        // Economy plugin error → fail-open, continue normal flow
      }
    }

    // 5. Assign approval tier
    const agentTrustLevel = this.config.getAgentTrustLevel?.(request.agentId);
    const tierAssignment = assignTier(request, { agentTrustLevel });

    // 6. Check forbidden tool combinations
    if (request.recentActions && request.recentActions.length > 0) {
      const comboCheck = checkForbiddenCombos(request.recentActions, request.action);
      if (comboCheck.triggered && comboCheck.requiredTier) {
        // Escalate to the required tier for this forbidden combo
        return this.escalate(
          requestId,
          timestamp,
          comboCheck.requiredTier,
          `Forbidden combination detected: ${comboCheck.matchedCombo?.reason}`,
          tierAssignment,
        );
      }
    }

    // 7. Check physical constraints
    const constraintResult = checkConstraints(token, request);
    if (!constraintResult.ok) {
      const violations = constraintResult.error;
      return this.deny(
        requestId,
        timestamp,
        "CONSTRAINT_VIOLATION",
        violations.map((v) => v.message).join("; "),
      );
    }

    // 8. Determine action based on tier
    const decision = this.decideBytier(
      requestId,
      timestamp,
      tierAssignment,
    );

    // 9. Emit ledger event
    this.emitEvent("policy.evaluated", request.agentId, request.tokenId, {
      decision: decision.action,
      tier: decision.assignedTier,
      risk: decision.assignedRisk,
    });

    // 10. Economy post-intercept (billing on allow)
    if (this.config.economyPlugin) {
      try {
        await this.config.economyPlugin.postIntercept(request, decision);
      } catch {
        // Post-intercept billing error → fail-open (decision stands)
      }
    }

    return decision;
  }

  /**
   * Make a decision based on the assigned tier.
   */
  private decideBytier(
    requestId: string,
    timestamp: string,
    tierAssignment: TierAssignment,
  ): PolicyDecision {
    const { approvalTier, riskTier, escalationReasons } = tierAssignment;

    switch (approvalTier as string) {
      case "T0_observe":
      case "T1_prepare":
        // Auto-approve with audit
        return {
          requestId,
          timestamp,
          action: "allow",
          assignedTier: approvalTier,
          assignedRisk: riskTier,
        };

      case "T2_act":
        // Requires review — escalate
        return {
          requestId,
          timestamp,
          action: "escalate",
          escalation: {
            requiredTier: approvalTier,
            reason: escalationReasons.length > 0
              ? escalationReasons.join("; ")
              : "Action requires human review (T2_act)",
            timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
            fallbackAction: "deny",
          },
          assignedTier: approvalTier,
          assignedRisk: riskTier,
        };

      case "T3_commit":
        // Requires explicit human approval
        return {
          requestId,
          timestamp,
          action: "escalate",
          escalation: {
            requiredTier: approvalTier,
            reason: escalationReasons.length > 0
              ? escalationReasons.join("; ")
              : "Irreversible action requires explicit human approval (T3_commit)",
            timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
            fallbackAction: "safe-stop",
          },
          assignedTier: approvalTier,
          assignedRisk: riskTier,
        };

      default:
        return this.deny(requestId, timestamp, "UNKNOWN_TIER", `Unknown tier: ${approvalTier}`);
    }
  }

  private deny(
    requestId: string,
    timestamp: string,
    policyViolated: string,
    reason: string,
  ): PolicyDecision {
    return {
      requestId,
      timestamp,
      action: "deny",
      denial: { reason, policyViolated },
      assignedTier: "T3_commit" as ApprovalTier,
      assignedRisk: "T3_irreversible" as any,
    };
  }

  private escalate(
    requestId: string,
    timestamp: string,
    requiredTier: ApprovalTier,
    reason: string,
    tierAssignment: TierAssignment,
  ): PolicyDecision {
    return {
      requestId,
      timestamp,
      action: "escalate",
      escalation: {
        requiredTier,
        reason,
        timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
        fallbackAction: "deny",
      },
      assignedTier: tierAssignment.approvalTier,
      assignedRisk: tierAssignment.riskTier,
    };
  }

  private emitEvent(
    eventType: string,
    agentId: string,
    tokenId: string | undefined,
    payload: Record<string, unknown>,
  ): void {
    this.config.emitLedgerEvent?.({ eventType, agentId, tokenId, payload });
  }
}
