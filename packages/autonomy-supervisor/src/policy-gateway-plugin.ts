/**
 * Policy Gateway pre-intercept plugin for the managed-autonomy authority axis.
 */

import {
  ApprovalTier,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  RiskTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintLedgerEvent,
  type SintRequest,
} from "@pshkv/core";
import { LedgerWriter, computeCsml } from "@pshkv/gate-evidence-ledger";
import { AutonomyState } from "./autonomy-states.js";
import {
  createDefaultGuardRegistry,
  type ExternalAuthorizationSignal,
  type GuardRegistry,
} from "./guard-registry.js";
import { autonomyEvaluationToLedgerEvents, asSintEventType } from "./ledger-events.js";
import { evaluateAutonomy, type AutonomyEvaluation, type SupervisorPort } from "./supervisor.js";
import {
  defaultAutonomyPolicy,
  getTokenAutonomyPolicy,
  type AutonomyPolicy,
} from "./token-extension.js";

export interface AutonomyStateStore {
  getState(agentId: string): AutonomyState;
  setState(agentId: string, state: AutonomyState): void;
  getDwellMs(agentId: string, nowMs: number): number;
}

export class InMemoryAutonomyStateStore implements AutonomyStateStore {
  private readonly states = new Map<string, {
    readonly state: AutonomyState;
    readonly enteredAtMs: number;
  }>();

  getState(agentId: string): AutonomyState {
    return this.states.get(agentId)?.state ?? AutonomyState.STABLE;
  }

  setState(agentId: string, state: AutonomyState): void {
    this.states.set(agentId, { state, enteredAtMs: Date.now() });
  }

  getDwellMs(agentId: string, nowMs: number): number {
    const entry = this.states.get(agentId);
    return entry ? Math.max(0, nowMs - entry.enteredAtMs) : 0;
  }
}

export interface AutonomyRuntimeSignals {
  readonly assistAvailable?: boolean;
  readonly signals?: Record<string, unknown>;
}

export interface PolicyGatewayAutonomySupervisorOptions {
  readonly ledgerWriter: LedgerWriter;
  readonly registry?: GuardRegistry;
  readonly stateStore?: AutonomyStateStore;
  readonly getRecentLedgerEvents?: (
    agentId: string,
    request: SintRequest,
  ) => readonly SintLedgerEvent[];
  readonly getCsmlScore?: (
    agentId: string,
    events: readonly SintLedgerEvent[],
    request: SintRequest,
  ) => number | null;
  readonly getExternalAuthorization?: (
    request: SintRequest,
    token: SintCapabilityToken,
    policy: AutonomyPolicy,
  ) => ExternalAuthorizationSignal | undefined;
  readonly getRuntimeSignals?: (
    request: SintRequest,
    token: SintCapabilityToken,
    policy: AutonomyPolicy,
  ) => AutonomyRuntimeSignals | undefined;
  readonly nowMs?: () => number;
}

export class PolicyGatewayAutonomySupervisor {
  private readonly ledgerWriter: LedgerWriter;
  private readonly registry: GuardRegistry;
  private readonly stateStore: AutonomyStateStore;
  private readonly getRecentLedgerEvents?: PolicyGatewayAutonomySupervisorOptions["getRecentLedgerEvents"];
  private readonly getCsmlScore?: PolicyGatewayAutonomySupervisorOptions["getCsmlScore"];
  private readonly getExternalAuthorization?: PolicyGatewayAutonomySupervisorOptions["getExternalAuthorization"];
  private readonly getRuntimeSignals?: PolicyGatewayAutonomySupervisorOptions["getRuntimeSignals"];
  private readonly nowMs: () => number;

  constructor(options: PolicyGatewayAutonomySupervisorOptions) {
    this.ledgerWriter = options.ledgerWriter;
    this.registry = options.registry ?? createDefaultGuardRegistry();
    this.stateStore = options.stateStore ?? new InMemoryAutonomyStateStore();
    this.getRecentLedgerEvents = options.getRecentLedgerEvents;
    this.getCsmlScore = options.getCsmlScore;
    this.getExternalAuthorization = options.getExternalAuthorization;
    this.getRuntimeSignals = options.getRuntimeSignals;
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  setState(agentId: string, state: AutonomyState): void {
    this.stateStore.setState(agentId, state);
  }

  getState(agentId: string): AutonomyState {
    return this.stateStore.getState(agentId);
  }

  async preIntercept(
    request: SintRequest,
    token: SintCapabilityToken,
  ): Promise<PolicyDecision | undefined> {
    if (request.executionContext?.hardwareSafety?.estopState === "triggered") {
      return undefined;
    }

    const policyResult = getTokenAutonomyPolicy(token);
    if (!policyResult.ok && policyResult.error === "AUTONOMY_POLICY_INVALID") {
      return this.deny(request, "AUTONOMY_POLICY_INVALID", "Invalid autonomyPolicy on capability token");
    }
    const policy = policyResult.ok ? policyResult.value : defaultAutonomyPolicy();
    const providerResult = this.registry.get(policy.guardProfileId);
    if (!providerResult.ok) {
      return this.deny(
        request,
        "AUTONOMY_GUARD_PROFILE_NOT_FOUND",
        `Autonomy guard profile not found: ${policy.guardProfileId}`,
      );
    }

    const recentLedgerEvents = this.getRecentLedgerEvents
      ? this.getRecentLedgerEvents(request.agentId, request)
      : this.ledgerWriter.getAll().filter((event) => event.agentId === request.agentId);
    const latestCsmlScore = this.getCsmlScore
      ? this.getCsmlScore(request.agentId, recentLedgerEvents, request)
      : computeCsml(recentLedgerEvents).score;
    const runtime = this.getRuntimeSignals?.(request, token, policy);
    const nowMs = this.nowMs();
    const state = this.stateStore.getState(request.agentId);
    const dwellMs = this.stateStore.getDwellMs(request.agentId, nowMs);
    const guard = providerResult.value.evaluate({
      agentId: request.agentId,
      requestId: request.requestId,
      guardProfileId: policy.guardProfileId,
      recentLedgerEvents,
      latestCsmlScore,
      physicalContext: request.physicalContext,
      executionContext: request.executionContext,
      metacognitiveElapsedMs: state === AutonomyState.METACOGNITIVE ? dwellMs : 0,
      assistedElapsedMs: state === AutonomyState.ASSISTED ? dwellMs : 0,
      maxMetacognitiveRecoveryMs: policy.maxMetacognitiveRecoveryMs,
      maxAssistedRecoveryMs: policy.maxAssistedRecoveryMs,
      assistAvailable: runtime?.assistAvailable ?? policy.assistanceQuorum !== undefined,
      externalAuthorization: this.getExternalAuthorization?.(request, token, policy),
      signals: runtime?.signals,
    });

    const port: SupervisorPort = {
      getState: (agentId) => this.stateStore.getState(agentId),
      setState: (agentId, nextState) => this.stateStore.setState(agentId, nextState),
      ledger: (evaluation) => this.appendEvaluation(evaluation, request.tokenId),
    };
    const evaluation = evaluateAutonomy(
      request.agentId,
      request.requestId,
      guard,
      port,
    );

    if (evaluation.outputPermitted) {
      return undefined;
    }

    if (evaluation.decision === "request_assistance") {
      return this.escalate(request, evaluation);
    }

    return this.deny(request, "AUTONOMY_OUTPUT_SUPPRESSED", evaluation.reason);
  }

  private appendEvaluation(evaluation: AutonomyEvaluation, tokenId: string): void {
    for (const event of autonomyEvaluationToLedgerEvents(evaluation, {
      tokenId,
      outputAttempted: true,
    })) {
      this.ledgerWriter.append({
        eventType: asSintEventType(event.eventType),
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    }
  }

  private deny(
    request: SintRequest,
    policyViolated: string,
    reason: string,
  ): PolicyDecision {
    return {
      requestId: request.requestId,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      action: "deny",
      denial: { reason, policyViolated },
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: RiskTier.T3_IRREVERSIBLE,
    };
  }

  private escalate(
    request: SintRequest,
    evaluation: AutonomyEvaluation,
  ): PolicyDecision {
    return {
      requestId: request.requestId,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      action: "escalate",
      escalation: {
        requiredTier: ApprovalTier.T3_COMMIT,
        reason: evaluation.reason,
        timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
        fallbackAction: "deny",
      },
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: RiskTier.T3_IRREVERSIBLE,
    };
  }
}
