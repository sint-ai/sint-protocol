import type { ISO8601, PolicyDecision, SintRequest, UUIDv7 } from "@pshkv/core";
import { ApprovalTier, RiskTier } from "@pshkv/core";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";
import type {
  GatePrerequisiteResult,
  GuardedExecutionOptions,
  GuardedExecutionResult,
  PDPDecision,
  PDPInterceptorCall,
  PDPInterceptorRequest,
  SINTPDPInterceptorConfig,
} from "./types.js";

function defaultResource(call: PDPInterceptorCall): string {
  if (call.resource) return call.resource;
  const serverName = call.serverName ?? "unknown";
  const toolName = call.toolName ?? call.method ?? "unknown";
  return `mcp://${serverName}/${toolName}`;
}

function defaultAction(call: PDPInterceptorCall): string {
  if (call.action) return call.action;
  return "call";
}

function denyFromError(
  requestId: UUIDv7,
  timestamp: ISO8601,
  reason: string,
): PDPDecision {
  const decision: PolicyDecision = {
    requestId,
    timestamp,
    action: "deny",
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
    denial: {
      reason,
      policyViolated: "GATEWAY_UNAVAILABLE",
      suggestedAlternative: "Retry once the SINT policy gateway is healthy.",
    },
  };

  return {
    verdict: "deny",
    tier: decision.assignedTier,
    reason,
    decision,
  };
}

function normalizeDecision(decision: PolicyDecision): PDPDecision {
  const verdict =
    decision.action === "deny"
      ? "deny"
      : decision.action === "escalate"
        ? "escalate"
        : "allow";

  return {
    verdict,
    tier: decision.assignedTier,
    reason: decision.denial?.reason ?? decision.escalation?.reason,
    decision,
  };
}

function denyFromGateFailure(
  requestId: UUIDv7,
  timestamp: ISO8601,
  reason: string,
): PDPDecision {
  const decision: PolicyDecision = {
    requestId,
    timestamp,
    action: "deny",
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
    denial: {
      reason,
      policyViolated: "GATE_PREREQUISITE_MISSING",
      suggestedAlternative: "Do not execute until a valid gate receipt or prerequisite is present.",
    },
  };

  return {
    verdict: "deny",
    tier: decision.assignedTier,
    reason,
    decision,
  };
}

/**
 * Thin adapter that presents a SEP-1763-style PDP interface on top of SINT's PolicyGateway.
 */
export class SINTPDPInterceptor {
  readonly type = "policy-pdp" as const;

  private readonly gateway: SINTPDPInterceptorConfig["gateway"];
  private readonly defaultTokenId?: UUIDv7;
  private readonly defaultAction: string;
  private readonly failClosed: boolean;
  private readonly now: () => ISO8601;
  private readonly createRequestId: () => UUIDv7;
  private readonly resolveResource: (call: PDPInterceptorCall) => string;
  private readonly resolveAction: (call: PDPInterceptorCall) => string;

  constructor(config: SINTPDPInterceptorConfig) {
    this.gateway = config.gateway;
    this.defaultTokenId = config.defaultTokenId;
    this.defaultAction = config.defaultAction ?? "call";
    this.failClosed = config.failClosed ?? true;
    this.now = config.now ?? (() => nowISO8601() as ISO8601);
    this.createRequestId = config.createRequestId ?? (() => generateUUIDv7() as UUIDv7);
    this.resolveResource = config.resolveResource ?? defaultResource;
    this.resolveAction = config.resolveAction ?? ((call) => call.action ?? this.defaultAction ?? defaultAction(call));
  }

  async evaluate(request: PDPInterceptorRequest): Promise<PDPDecision> {
    const requestId = request.context?.requestId ?? this.createRequestId();
    const timestamp = request.context?.timestamp ?? this.now();
    const tokenId = request.context?.tokenId ?? this.defaultTokenId;

    if (!tokenId) {
      throw new Error(
        "SINTPDPInterceptor requires a tokenId either in config.defaultTokenId or request.context.tokenId",
      );
    }

    const sintRequest: SintRequest = {
      requestId,
      timestamp,
      agentId: request.caller_identity,
      tokenId,
      resource: this.resolveResource(request.mcp_call),
      action: this.resolveAction(request.mcp_call),
      params: request.mcp_call.params ?? {},
      physicalContext: request.context?.physicalContext,
      recentActions: request.context?.recentActions,
      executionContext: request.context?.executionContext,
    };

    try {
      const decision = await this.gateway.intercept(sintRequest);
      return normalizeDecision(decision);
    } catch (error) {
      if (!this.failClosed) throw error;
      const reason =
        error instanceof Error
          ? `SINT gateway unavailable: ${error.message}`
          : "SINT gateway unavailable";
      return denyFromError(requestId, timestamp, reason);
    }
  }

  async runGuarded<Result = unknown>(
    request: PDPInterceptorRequest,
    options: GuardedExecutionOptions<Result> = {},
  ): Promise<GuardedExecutionResult<Result>> {
    const decision = await this.evaluate(request);

    if (decision.verdict === "deny") {
      return { stage: "denied", decision };
    }

    if (decision.verdict === "escalate") {
      return { stage: "escalated", decision };
    }

    let gate: GatePrerequisiteResult | undefined;
    if (options.verifyGatePrerequisite) {
      gate = await options.verifyGatePrerequisite(decision, request);
      if (!gate.ok) {
        const requestId = request.context?.requestId ?? decision.decision.requestId;
        const timestamp = request.context?.timestamp ?? decision.decision.timestamp;
        return {
          stage: "blocked",
          decision: denyFromGateFailure(
            requestId,
            timestamp,
            gate.reason ?? "Gate prerequisite verification failed",
          ),
          gate,
        };
      }
    }

    if (!options.execute) {
      return { stage: "executed", decision, gate };
    }

    try {
      const result = await options.execute();
      return { stage: "executed", decision, gate, result };
    } catch (error) {
      await options.onExecutionError?.(error);
      return { stage: "failed", decision, gate, error };
    }
  }
}
