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
  ApprovalTier,
  RiskTier,
  type PolicyDecision,
  type RateLimitStore,
  type SintCapabilityToken,
  type SintRequest,
  type TierAssignmentRule,
  sintRequestSchema,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_FORBIDDEN_COMBOS,
  normalizeComboAction,
  parseMcpResource,
} from "@pshkv/core";
import {
  validateCapabilityToken,
  type RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { nowISO8601 } from "@pshkv/gate-capability-tokens";
import { PluginFailureScope, type PluginFailureOptions } from "./plugin-failures.js";
import { assignTier, type TierAssignment } from "./tier-assigner.js";
import { checkConstraints, type EnvelopeOverrides } from "./constraint-checker.js";
import { checkForbiddenCombos, type TimedComboAction } from "./forbidden-combos.js";
import type { CircuitBreakerPlugin, CircuitState } from "./circuit-breaker.js";
import type { AgentTrustLevel } from "@pshkv/core";
import type { GoalHijackPlugin } from "./goal-hijack.js";
import type { MemoryIntegrityPlugin } from "./memory-integrity.js";
import type { SupplyChainVerifierPlugin } from "./supply-chain.js";
import type { SafetyPermitPlugin } from "./safety-permit.js";
import type { ArgInjectionDetector } from "./arg-injection-detector.js";
import type { RegulatedDataPolicyPlugin } from "./regulated-data-policy.js";
import type { SpatialIntegrityPolicyPlugin } from "./spatial-integrity-policy.js";
import type { HumanAuthorityPolicyPlugin } from "./human-authority-policy.js";
import { DefaultHumanAuthorityPolicy } from "./human-authority-policy.js";
import {
  decisionForCodeAsPolicyViolation,
  type CodeAsPolicyGuardPlugin,
} from "./code-as-policy-guard.js";

const INDUSTRIAL_DEPLOYMENT_PROFILES = new Set(["warehouse-amr", "industrial-cell"]);
const MAX_HARDWARE_SAFETY_STALENESS_MS = 5_000;

/** Token resolver — looks up a capability token by ID (sync or async). */
export type TokenResolver = (tokenId: string) => SintCapabilityToken | undefined | Promise<SintCapabilityToken | undefined>;

/** Event emitter for ledger integration. */
export type LedgerEmitter = (event: {
  eventType: string;
  agentId: string;
  tokenId?: string;
  payload: Record<string, unknown>;
}) => unknown;

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
  postIntercept(request: SintRequest, decision: PolicyDecision): Promise<void | import("@pshkv/core").Result<void, string>>;
}

/**
 * Managed-autonomy authority pre-gate.
 *
 * Runs after token resolution/validation but before tier assignment. Returning
 * a decision short-circuits the normal policy pipeline; returning undefined
 * means authority is retained and permission evaluation can proceed.
 */
export interface AutonomySupervisorPlugin {
  preIntercept(
    request: SintRequest,
    token: SintCapabilityToken,
  ): Promise<PolicyDecision | undefined>;
}

/** Policy Gateway configuration. */
/**
 * CSML escalation hook — called after tier assignment to optionally bump the tier.
 * Provided by @sint/avatar's CsmlEscalator. Decoupled via interface to avoid circular dep.
 */
/**
 * Dynamic envelope plugin — environment-adaptive safety constraint tightening.
 *
 * Solves the ROSClaw static-envelope gap: token constraints are fixed at issuance
 * time, but physical safety depends on real-time sensor state (obstacle distance,
 * human proximity, environmental hazards).
 *
 * The plugin receives the request + any physical context and returns tighter limits.
 * Effective limit = min(token.constraint, envelope.limit).
 * Failures, unavailable results, and async timeouts deny; static limits are not an implicit fallback.
 *
 * @example
 * // Obstacle at 0.8m → cap velocity to 0.2 m/s regardless of token's 2.0 m/s limit
 * const envelope: DynamicEnvelopePlugin = {
 *   computeEnvelope(request) {
 *     const dist = lidar.nearestObstacleM();
 *     return { maxVelocityMps: dist * REACTION_FACTOR, reason: `obstacle at ${dist}m` };
 *   }
 * };
 */
export interface DynamicEnvelopePlugin {
  /**
   * Compute environment-aware constraint overrides for this request.
   * All returned limits MUST be ≤ the corresponding token constraint.
   * The gateway enforces min(token, override) — returning a looser value is a no-op.
   */
  computeEnvelope(request: SintRequest): Promise<{
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    reason?: string;
  }>;
}

/**
 * Corridor verifier hook for spatial mission envelopes.
 *
 * Deployments can bind corridor IDs to signed geometry, route reservations, or
 * map-server lookups outside the gateway. The gateway consumes only measured
 * facts and compares them against the token execution envelope.
 */
export interface SpatialCorridorVerifierPlugin {
  verifyCorridor(
    request: SintRequest,
    token: SintCapabilityToken,
  ): Promise<{
    readonly verified: boolean;
    readonly insideCorridor?: boolean;
    readonly lateralDeviationMeters?: number;
    readonly headingDeviationDeg?: number;
    readonly verifierRef?: string;
    readonly reason?: string;
  }>;
}

export interface CsmlEscalationPlugin {
  /**
   * Evaluate whether this agent's CSML score warrants tier escalation.
   * Returns a decision including the (possibly bumped) resultTier.
   */
  evaluateAgent(agentId: string, assignedTier: ApprovalTier): Promise<{
    readonly escalated: boolean;
    readonly resultTier: ApprovalTier;
    readonly csmlScore: number | null;
    readonly reason: string;
  }>;
}

/**
 * Edge-mode control-plane hooks for split deployments.
 *
 * T0/T1 can be handled locally. T2/T3 escalations must verify central
 * authority availability before continuing.
 */
export interface EdgeControlPlanePlugin {
  /**
   * Gate T2/T3 escalations in edge deployments.
   * Return `allowed: false` to fail-closed while central authority is unavailable.
   */
  checkCentralEscalation(
    request: SintRequest,
    decision: PolicyDecision,
  ): Promise<{ readonly allowed: boolean; readonly reason?: string }> | { readonly allowed: boolean; readonly reason?: string };

  /**
   * Best-effort revocation relay hook used by edge gateways to fan out or
   * reconcile revocations across disconnected peers.
   */
  relayRevocation?(
    event: {
      readonly requestId: string;
      readonly agentId: string;
      readonly tokenId: string;
      readonly reason?: string;
      readonly revokedBy?: string;
    },
  ): Promise<void> | void;

  /**
   * Best-effort evidence replication hook for edge-to-central ledger sync.
   */
  replicateEvidenceEvent?(
    event: {
      readonly eventType: string;
      readonly agentId: string;
      readonly tokenId?: string;
      readonly payload: Record<string, unknown>;
    },
  ): Promise<void> | void;
}

/**
 * Optional verifier hook for verifiable-compute proof metadata.
 *
 * The gateway enforces structural proof requirements itself (presence, type,
 * freshness, hash fields). This hook allows deployments to run backend-specific
 * verification logic (e.g., zkVM receipt verification).
 */
export interface VerifiableComputePlugin {
  verify(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ): Promise<{
    readonly verified: boolean;
    readonly reason?: string;
    readonly verifierRef?: string;
  }>;
}

export interface PolicyGatewayConfig extends PluginFailureOptions {
  readonly resolveToken: TokenResolver;
  readonly revocationStore?: RevocationStore;
  readonly emitLedgerEvent?: LedgerEmitter;
  /** Custom resource rules cannot lower the built-in MCP consequence floor. */
  readonly tierRules?: readonly TierAssignmentRule[];
  readonly getAgentTrustLevel?: (agentId: string) => AgentTrustLevel;
  /** Optional economy plugin for budget/balance/trust enforcement. */
  readonly economyPlugin?: EconomyPluginHooks;
  /**
   * Optional rate-limit store for per-token sliding-window enforcement.
   * When a token carries a `constraints.rateLimit`, calls are counted here.
   */
  readonly rateLimitStore?: RateLimitStore;
  /**
   * Optional CSML escalation plugin (Avatar Layer 5).
   * When provided, called after tier assignment. If the agent's CSML score
   * exceeds θ, the tier is bumped up by 1. Failures deny unless explicitly advisory at T0/T1.
   */
  readonly csmlEscalation?: CsmlEscalationPlugin;
  /**
   * Optional managed-autonomy authority supervisor.
   * When provided, it gates whether the agent still has authority to produce
   * external output before the normal permission pipeline assigns tiers.
   * Fail-closed: supervisor errors deny the request.
   */
  readonly autonomySupervisor?: AutonomySupervisorPlugin;
  /**
   * Optional circuit breaker plugin (ASI10 / EU AI Act Article 14(4)(e)).
   * Provides the operator "stop button" and automatic rogue-agent containment.
   *
   * State machine: CLOSED → OPEN (N denials) → HALF_OPEN (after timeout) → CLOSED
   * Operators can force OPEN via trip() or force CLOSED via reset().
   * CSML anomalous persona auto-trips the circuit.
   * Failures deny and are recorded on the decision and evidence ledger.
   */
  readonly circuitBreaker?: CircuitBreakerPlugin;
  /**
   * Optional dynamic envelope plugin (ROSClaw gap mitigation).
   * When provided, called just before physical constraint checking.
   * Returns environment-adaptive limits that tighten (never loosen) the token's
   * static constraints. Failure denies; static token limits are not an outage fallback.
   */
  readonly dynamicEnvelope?: DynamicEnvelopePlugin;
  /**
   * Optional spatial corridor verifier for mission envelopes.
   * When a token requires spatial proof and declares deviation/heading limits,
   * absence or failure of this verifier denies the request fail-closed.
   */
  readonly spatialCorridorVerifier?: SpatialCorridorVerifierPlugin;
  /**
   * Optional goal hijack detector (ASI01).
   * Scans request params for prompt injection, role override, escalation
   * attempts, exfil probes, and cross-agent injection. Failures deny by default.
   */
  readonly goalHijackDetector?: GoalHijackPlugin;
  /**
   * Optional memory integrity checker (ASI06).
   * Checks recentActions history for repetition, privilege claims, and
   * history overflow anomalies. High severity → deny; others → warn.
   * Failures deny by default.
   */
  readonly memoryIntegrity?: MemoryIntegrityPlugin;
  /**
   * Optional supply chain verifier (ASI04).
   * Checks model fingerprint, model ID allowlist, and bridge protocol
   * consistency at runtime. High severity → deny. Medium → warn and continue.
   * Failures deny and are recorded on the decision and evidence ledger.
   */
  readonly supplyChainVerifier?: SupplyChainVerifierPlugin;
  /**
   * Optional verifiable-compute proof verifier.
   * Used to validate runtime proof material for high-consequence actions.
   */
  readonly verifiableCompute?: VerifiableComputePlugin;
  /**
   * Optional edge-mode control-plane hooks.
   */
  readonly edgeControlPlane?: EdgeControlPlanePlugin;
  /**
   * Optional async hardware safety permit resolver (Phase 9.3).
   * Resolves hardware safety state from an external source (OPC-UA, PLC REST API,
   * MQTT) before the built-in hardware safety handshake check.
   * Configured plugin state is authoritative; a caller cannot override it.
   * Failures deny and are recorded on the decision and evidence ledger.
   */
  readonly safetyPermit?: SafetyPermitPlugin | undefined;
  /**
   * Optional argument injection detector (ASI05).
   * Recursively scans request.params for shell metacharacters, path traversal,
   * environment variable injection, and code execution patterns.
   * High severity + confidence > 0.5 → deny with ARG_INJECTION_DETECTED.
   * Failures deny and are recorded on the decision and evidence ledger.
   */
  readonly argInjectionDetector?: ArgInjectionDetector;
  /**
   * Optional regulated-data runtime policy hook.
   * Runs after token validation and before tier assignment. Intended for
   * processor, residency, model, and context-minimization checks on requests
   * carrying regulated data metadata. Fail-closed on plugin errors.
   */
  readonly regulatedDataPolicy?: RegulatedDataPolicyPlugin;
  /**
   * Optional human authority policy hook.
   * When omitted, the gateway uses the built-in default policy evaluator.
   */
  readonly humanAuthorityPolicy?: HumanAuthorityPolicyPlugin;
  /**
   * Optional deployment-profile spatial integrity policy.
   * Enforces fresh localization evidence for GPS-denied, underground, or other
   * degraded physical deployments before normal tier assignment.
   * Fail-closed on plugin errors.
   */
  readonly spatialIntegrityPolicy?: SpatialIntegrityPolicyPlugin;
  /**
   * Optional code-as-policy robot-agent guard.
   * Enforces generated-program/skill digest binding, fixed primitive
   * vocabulary, robot identity shape, and trial-loop budgets for agents that
   * write robot control programs. Fail-closed on plugin errors.
   */
  readonly codeAsPolicyGuard?: CodeAsPolicyGuardPlugin;
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
  /** Per-agent history spans MCP sessions and tokens, using the gateway clock. */
  private readonly mcpComboHistory = new Map<string, TimedComboAction[]>();
  private readonly comboRetentionMs = Math.max(...DEFAULT_FORBIDDEN_COMBOS.map(combo => combo.windowMs));

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
    const parsed = sintRequestSchema.safeParse(request);
    const baseline = parsed.success ? assignTier(parsed.data as SintRequest).approvalTier : ApprovalTier.T3_COMMIT;
    const failures = new PluginFailureScope(request, this.config, baseline);
    const decision = await Promise.resolve().then(() => this.evaluateRequest(request, failures)).then(
      value => value,
      () => failures.unexpected(),
    );
    return failures.finalize(decision,
      this.config.emitLedgerEvent ? event => this.config.emitLedgerEvent!(event) : undefined,
      this.config.edgeControlPlane?.replicateEvidenceEvent
        ? event => this.config.edgeControlPlane!.replicateEvidenceEvent!(event) : undefined,
      this.config.economyPlugin ? async audited => {
        if (audited.action !== "allow") return undefined;
        return failures.check("economy.postIntercept",
          () => this.config.economyPlugin!.postIntercept(request, audited), () => {});
      } : undefined,
    );
  }

  private async evaluateRequest(request: SintRequest, failures: PluginFailureScope): Promise<PolicyDecision> {
    const timestamp = nowISO8601();
    const requestId = request.requestId;

    // 1. Validate request schema
    const parsed = sintRequestSchema.safeParse(request);
    if (!parsed.success) {
      return this.deny(requestId, timestamp, "MALFORMED_REQUEST", "Request failed schema validation");
    }

    if (request.executionContext?.hardwareSafety?.estopState === "triggered") {
      return this.evaluateHardwareSafetyHandshake(request, ApprovalTier.T3_COMMIT,
        requestId, timestamp, request.agentId, request.tokenId, failures)!;
    }

    // 1a. ASI01 Goal Hijack detection — scan params for prompt injection / semantic override
    if (this.config.goalHijackDetector) {
      const goalHijackFailure = await failures.check("goalHijack.analyze", () => this.config.goalHijackDetector!.analyze(
          request.params,
          request.resource,
          request.action,
        ), hijackResult => {
        if (hijackResult.hijackDetected && hijackResult.confidence >= 0.6) {
          failures.emit("agent.goal.hijack_detected", request.agentId, request.tokenId, {
            confidence: hijackResult.confidence,
            patterns: hijackResult.patterns,
            reason: hijackResult.reason,
          });
          return this.deny(requestId, timestamp, "GOAL_HIJACK",
            hijackResult.reason ?? "Goal hijack attempt detected in request params");
        }
      });
      if (goalHijackFailure) return goalHijackFailure;
    }

    // 1b-pre. ASI06 Memory Integrity check — detect poisoned history
    if (this.config.memoryIntegrity) {
      const memoryFailure = await failures.check("memoryIntegrity.check", () => this.config.memoryIntegrity!.check(request), memResult => {
        if (memResult.poisoned) {
          if (memResult.severity === "high") {
            failures.emit("agent.memory.integrity_violation", request.agentId, request.tokenId, {
              anomalies: memResult.anomalies,
              severity: memResult.severity,
            });
            return this.deny(requestId, timestamp, "MEMORY_POISONING",
              `Memory integrity violation (high severity): ${memResult.anomalies.join("; ")}`);
          } else {
            // Medium / low: warn but allow
            failures.emit("agent.memory.integrity_warning", request.agentId, request.tokenId, {
              anomalies: memResult.anomalies,
              severity: memResult.severity,
            });
          }
        }
      });
      if (memoryFailure) return memoryFailure;
    }

    // 1b. Circuit breaker check (ASI10 / EU AI Act Art. 14(4)(e) stop button)
    // Checked after schema validation (so we have agentId) but before any other work.
    // OPEN → instant deny. HALF_OPEN → allow probe through, record result.
    let circuitState: CircuitState = "CLOSED";
    if (this.config.circuitBreaker) {
      const circuitStateFailure = await failures.check("circuitBreaker.getState", () => this.config.circuitBreaker!.getState(request.agentId), value => {
        circuitState = value;
        if (circuitState === "OPEN") {
          failures.emit("agent.circuit.blocked", request.agentId, request.tokenId, {
            circuitState,
          });
          return this.deny(requestId, timestamp, "CIRCUIT_OPEN",
            "Agent circuit is OPEN — all actions blocked. Operator reset required.");
        }
      });
      if (circuitStateFailure) return circuitStateFailure;
    }

    // 2. Resolve the capability token
    const resolvedToken = await failures.run("token.resolve", () => this.config.resolveToken(request.tokenId));
    if (!resolvedToken.ok) return failures.deny(resolvedToken.error);
    const token = resolvedToken.value;
    if (!token) {
      return this.deny(requestId, timestamp, "TOKEN_NOT_FOUND", "Capability token not found");
    }

    // 2a. Bind token subject to the requesting agent identity.
    // Prevents cross-agent token replay when a valid token ID is leaked.
    if (token.subject !== request.agentId) {
      return this.deny(
        requestId,
        timestamp,
        "TOKEN_SUBJECT_MISMATCH",
        "Capability token subject does not match requesting agent identity",
      );
    }

    // 3. Check revocation status
    if (this.config.revocationStore) {
      const revocationCheck = await failures.run("revocation.check", () => this.config.revocationStore!.checkRevocation(token.tokenId));
      if (!revocationCheck.ok) return failures.deny(revocationCheck.error);
      const revocationResult = revocationCheck.value;
      if (!revocationResult.ok) {
        const record = await failures.run("revocation.record", () => this.config.revocationStore!.getRevocationRecord(token.tokenId));
        // Revocation remains authoritative even if optional explanatory metadata is unavailable.
        const revocationRecord = record.ok ? record.value : undefined;
        if (this.config.edgeControlPlane?.relayRevocation) {
          await failures.run("edge.relayRevocation", () => this.config.edgeControlPlane!.relayRevocation!({
            requestId, agentId: request.agentId, tokenId: token.tokenId,
            reason: revocationRecord?.reason, revokedBy: revocationRecord?.revokedBy,
          }));
        }
        return this.deny(requestId, timestamp, "TOKEN_REVOKED", "Capability token has been revoked");
      }
    }

    // 3b. Verify the requesting agent is the token's subject (ASI03: identity abuse)
    if (token.subject !== request.agentId) {
      return this.deny(
        requestId,
        timestamp,
        "TOKEN_SUBJECT_MISMATCH",
        `Token subject does not match requesting agent — possible stolen-token attack`,
      );
    }

    // 4. Validate the capability token (signature, expiry, permissions, constraints)
    const tokenValidation = validateCapabilityToken(token, {
      resource: request.resource,
      action: request.action,
      modelContext: {
        modelId: request.executionContext?.model?.modelId,
        modelVersion: request.executionContext?.model?.modelVersion,
        modelFingerprintHash: request.executionContext?.model?.modelFingerprintHash,
        attestationGrade: request.executionContext?.attestation?.grade,
        teeBackend: request.executionContext?.attestation?.teeBackend,
        verifiableComputeProofType: request.executionContext?.verifiableCompute?.proofType,
        verifiableComputeProofRef: request.executionContext?.verifiableCompute?.proofRef,
        verifiableComputeProofHash: request.executionContext?.verifiableCompute?.proofHash,
        verifiableComputePublicInputsHash: request.executionContext?.verifiableCompute?.publicInputsHash,
        verifiableComputeGeneratedAt: request.executionContext?.verifiableCompute?.generatedAt,
        verifiableComputeVerifierRef: request.executionContext?.verifiableCompute?.verifierRef,
      },
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
      const decision = this.deny(
        requestId,
        timestamp,
        tokenValidation.error,
        `Token validation failed: ${tokenValidation.error}`,
      );
      failures.emit("policy.evaluated", request.agentId, request.tokenId, {
        decision: decision.action,
        tier: decision.assignedTier,
        risk: decision.assignedRisk,
        policyViolated: tokenValidation.error,
      });
      return decision;
    }

    // 4a-human. Human authority proof gate.
    // Tokens can require a bound human proof before any other policy logic runs.
    // This gate is fail-closed and uses the built-in policy evaluator by default.
    const humanAuthorityPolicy = this.config.humanAuthorityPolicy ?? new DefaultHumanAuthorityPolicy();
    const humanAuthorityFailure = await failures.check("humanAuthority.evaluate", () => humanAuthorityPolicy.evaluate(
        request,
        token,
        { requestId, timestamp },
      ), humanDecision => {
      if (humanDecision) {
        failures.emit("policy.evaluated", request.agentId, request.tokenId, {
          decision: humanDecision.action,
          tier: humanDecision.assignedTier,
          risk: humanDecision.assignedRisk,
          source: "human_authority_policy",
          policyViolated: humanDecision.denial?.policyViolated,
        });
        return humanDecision;
      }
    });
    if (humanAuthorityFailure) return humanAuthorityFailure;

    // 4a-spatial. Deployment-profile spatial integrity policy.
    // Token execution envelopes handle per-token spatial proof. This hook
    // handles deployment-wide GPS-denied/degraded-perception requirements.
    if (this.config.spatialIntegrityPolicy) {
      const spatialIntegrityFailure = await failures.check("spatialIntegrity.evaluate", () => this.config.spatialIntegrityPolicy!.evaluate(
          request,
          token,
          { requestId, timestamp },
        ), spatialDecision => {
        if (spatialDecision) {
          failures.emit("policy.evaluated", request.agentId, request.tokenId, {
            decision: spatialDecision.action,
            tier: spatialDecision.assignedTier,
            risk: spatialDecision.assignedRisk,
            source: "spatial_integrity_policy",
            policyViolated: spatialDecision.denial?.policyViolated,
            escalationReason: spatialDecision.escalation?.reason,
          });
          return spatialDecision;
        }
      });
      if (spatialIntegrityFailure) return spatialIntegrityFailure;
    }

    // 4a-code. Code-as-policy robot-agent guard.
    // Generated robot programs and learned skill-library updates must be bound
    // to stable digests and fixed primitive contracts before actuation.
    if (this.config.codeAsPolicyGuard) {
      const codeGuardFailure = await failures.check("codeAsPolicy.verify", () => this.config.codeAsPolicyGuard!.verify(request, token), guardResult => {
        if (!guardResult.verified) {
          failures.emit("robot.code_policy.guard_violation", request.agentId, request.tokenId, {
            violations: guardResult.violations,
            severity: guardResult.severity,
            programRef: guardResult.metadata?.programRef,
            skillRef: guardResult.metadata?.skillRef,
            primitiveSetRef: guardResult.metadata?.primitiveSetRef,
          });
          return decisionForCodeAsPolicyViolation(request, guardResult);
        }
      });
      if (codeGuardFailure) return codeGuardFailure;
    }

    // 4a-pre. Regulated-data runtime policy.
    // Evaluates processor/model/region/context metadata after token validation
    // but before tier assignment so unsafe data paths never execute.
    if (this.config.regulatedDataPolicy) {
      const regulatedDataFailure = await failures.check("regulatedData.evaluate", () => this.config.regulatedDataPolicy!.evaluate(
          request,
          token,
          { requestId, timestamp },
        ), regulatedDecision => {
        if (regulatedDecision) {
          failures.emit("policy.evaluated", request.agentId, request.tokenId, {
            decision: regulatedDecision.action,
            tier: regulatedDecision.assignedTier,
            risk: regulatedDecision.assignedRisk,
            source: "regulated_data_policy",
            policyViolated: regulatedDecision.denial?.policyViolated,
            transformations: regulatedDecision.transformations,
          });
          return regulatedDecision;
        }
      });
      if (regulatedDataFailure) return regulatedDataFailure;
    }

    // 4a. Managed-autonomy authority pre-gate.
    // This is orthogonal to permission: first check whether the agent still has
    // authority to emit external output, then let the normal tier/token pipeline
    // decide whether the specific action is permitted.
    if (this.config.autonomySupervisor) {
      const autonomyFailure = await failures.check("autonomy.preIntercept", () => this.config.autonomySupervisor!.preIntercept(
          request,
          token,
        ), autonomyDecision => {
        if (autonomyDecision) {
          failures.emit("policy.evaluated", request.agentId, request.tokenId, {
            decision: autonomyDecision.action,
            tier: autonomyDecision.assignedTier,
            risk: autonomyDecision.assignedRisk,
            source: "autonomy_supervisor",
          });
          return autonomyDecision;
        }
      });
      if (autonomyFailure) return autonomyFailure;
    }

    // 4d. Execution envelope corridor checks (optional, additive guardrail).
    if (token.executionEnvelope?.corridorId) {
      const reqCorridor = request.executionContext?.preapprovedCorridor;
      if (!reqCorridor || reqCorridor.corridorId !== token.executionEnvelope.corridorId) {
        return this.deny(
          requestId,
          timestamp,
          "CONSTRAINT_VIOLATION",
          `Missing or mismatched preapproved corridor (expected ${token.executionEnvelope.corridorId})`,
        );
      }
      const tokenExp = token.executionEnvelope.expiresAt
        ? new Date(token.executionEnvelope.expiresAt).getTime()
        : undefined;
      const reqExp = new Date(reqCorridor.expiresAt).getTime();
      if (Number.isFinite(reqExp) && reqExp <= Date.now()) {
        return this.deny(
          requestId,
          timestamp,
          "CONSTRAINT_VIOLATION",
          "Preapproved corridor has expired",
        );
      }
      if (tokenExp !== undefined && Number.isFinite(tokenExp) && reqExp > tokenExp) {
        return this.deny(
          requestId,
          timestamp,
          "CONSTRAINT_VIOLATION",
          "Preapproved corridor exceeds token execution envelope expiry",
        );
      }
    }

    const spatialMissionDecision = await this.evaluateSpatialMissionEnvelope(
      request,
      token,
      requestId,
      timestamp,
      failures,
    );
    if (spatialMissionDecision) {
      return spatialMissionDecision;
    }

    if (token.constraints.rateLimit && !this.config.rateLimitStore) {
      return failures.missing("rateLimit.increment");
    }

    // 4b. Rate-limit check (per-token sliding window)
    if (this.config.rateLimitStore && token.constraints.rateLimit) {
      const { maxCalls, windowMs } = token.constraints.rateLimit;
      const bucket = Math.floor(Date.now() / windowMs);
      const key = `sint:rate:${token.tokenId}:${bucket}`;
      const rateLimitFailure = await failures.check("rateLimit.increment", () => this.config.rateLimitStore!.increment(key, windowMs), async count => {
        if (count > maxCalls) {
          if (this.config.circuitBreaker) {
            await failures.check("circuitBreaker.recordDenial", () => this.config.circuitBreaker!.recordDenial(
                request.agentId, "RATE_LIMIT_EXCEEDED",
              ), newState => {
              if (newState === "OPEN") {
                failures.emit("agent.circuit.opened", request.agentId, request.tokenId, {
                  triggeredBy: "RATE_LIMIT_EXCEEDED",
                  previousState: circuitState as string,
                });
              }
            });
          }
          return this.deny(requestId, timestamp, "RATE_LIMIT_EXCEEDED",
            `Token rate limit exceeded: ${count}/${maxCalls} calls in ${windowMs}ms window`);
        }
      });
      if (rateLimitFailure) return rateLimitFailure;
    }

    // 4c. Economy pre-intercept (budget, balance, trust checks)
    if (this.config.economyPlugin) {
      const economyFailure = await failures.check("economy.preIntercept", () => this.config.economyPlugin!.preIntercept(request), economyDecision => {
        if (economyDecision) {
          // Economy plugin short-circuits — emit and return
          failures.emit("policy.evaluated", request.agentId, request.tokenId, {
            decision: economyDecision.action,
            tier: economyDecision.assignedTier,
            risk: economyDecision.assignedRisk,
            source: "economy_plugin",
          });
          return economyDecision;
        }
      });
      if (economyFailure) return economyFailure;
    }

    // 4e. ASI04 Supply chain verification — model fingerprint, ID allowlist, bridge protocol
    if (this.config.supplyChainVerifier) {
      const supplyChainFailure = await failures.check("supplyChain.verify", () => this.config.supplyChainVerifier!.verify(request, token), scResult => {
        if (!scResult.verified) {
          if (scResult.severity === "high") {
            failures.emit("agent.supply_chain.violation", request.agentId, request.tokenId, {
              violations: scResult.violations,
              severity: scResult.severity,
            });
            return this.deny(requestId, timestamp, "SUPPLY_CHAIN_VIOLATION",
              `Supply chain violation: ${scResult.violations.join("; ")}`);
          } else if (scResult.severity === "medium") {
            // Medium: emit warning but continue
            failures.emit("agent.supply_chain.warning", request.agentId, request.tokenId, {
              violations: scResult.violations,
              severity: scResult.severity,
            });
          }
          // Low: no action needed
        }
      });
      if (supplyChainFailure) return supplyChainFailure;
    }

    // 5. Assign approval tier
    let agentTrustLevel: AgentTrustLevel | undefined;
    if (this.config.getAgentTrustLevel) {
      const trust = await failures.run("agentTrust.get", () => this.config.getAgentTrustLevel!(request.agentId));
      if (!trust.ok) return failures.deny(trust.error);
      agentTrustLevel = trust.value;
    }
    let tierAssignment = assignTier(request, { agentTrustLevel, rules: this.config.tierRules });

    // 5b. CSML escalation (Avatar Layer 5) — bump tier if agent's safety score exceeds θ
    if (this.config.csmlEscalation) {
      const csmlFailure = await failures.check("csml.evaluateAgent", () => this.config.csmlEscalation!.evaluateAgent(
          request.agentId,
          tierAssignment.approvalTier,
        ), async csmlDecision => {
        const orderedTiers = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];
        if (orderedTiers.indexOf(csmlDecision.resultTier) < orderedTiers.indexOf(tierAssignment.approvalTier)) {
          return failures.invalid("csml.evaluateAgent");
        }
        if (csmlDecision.escalated && csmlDecision.resultTier !== tierAssignment.approvalTier) {
          // Emit escalation event before mutating tier
          failures.emit("avatar.csml.escalated", request.agentId, request.tokenId, {
            baseTier: tierAssignment.approvalTier,
            resultTier: csmlDecision.resultTier,
            csmlScore: csmlDecision.csmlScore,
            reason: csmlDecision.reason,
          });
          tierAssignment = {
            ...tierAssignment,
            approvalTier: csmlDecision.resultTier,
            escalationReasons: [
              ...tierAssignment.escalationReasons,
              `CSML escalation: ${csmlDecision.reason}`,
            ],
          };
        }

        // 5c. CSML anomalous persona → auto-trip circuit breaker (ASI10)
        // If CSML reports "anomalous" (safety events detected), trip immediately.
        if (
          this.config.circuitBreaker &&
          csmlDecision.reason.toLowerCase().includes("anomalous")
        ) {
          const tripFailure = await failures.check("circuitBreaker.trip", () => this.config.circuitBreaker!.trip(
              request.agentId,
              `CSML anomalous persona: ${csmlDecision.reason}`,
            ), () => {
            failures.emit("agent.circuit.opened", request.agentId, request.tokenId, {
              triggeredBy: "CSML_ANOMALOUS",
              csmlScore: csmlDecision.csmlScore,
              reason: csmlDecision.reason,
            });
            return this.deny(requestId, timestamp, "CIRCUIT_OPEN", "CSML anomaly tripped the circuit; current execution is blocked");
          });
          if (tripFailure) return tripFailure;
        }
      });
      if (csmlFailure) return csmlFailure;
    }

    // 5f-pre. SafetyPermitPlugin — resolve external hardware safety state before built-in check
    let currentRequest = request; // mutable local for SafetyPermitPlugin merge
    if (this.config.safetyPermit) {
      const permitFailure = await failures.check("safetyPermit.resolve", () => this.config.safetyPermit!.resolvePermit(currentRequest), permitResult => {
        if (permitResult) {
          currentRequest = {
            ...currentRequest,
            executionContext: {
              ...currentRequest.executionContext,
              hardwareSafety: {
                permitState: permitResult.permitState,
                ...(permitResult.interlockState !== undefined && { interlockState: permitResult.interlockState }),
                ...(permitResult.estopState !== undefined && { estopState: permitResult.estopState }),
                ...(permitResult.controllerId !== undefined && { controllerId: permitResult.controllerId }),
                observedAt: permitResult.observedAt,
              },
            },
          };
        }
      });
      if (permitFailure) return permitFailure;
    }

    // 5f. Hardware safety-controller handshake checks.
    const hardwareSafetyDecision = this.evaluateHardwareSafetyHandshake(
      currentRequest,
      tierAssignment.approvalTier,
      requestId,
      timestamp,
      currentRequest.agentId,
      currentRequest.tokenId,
      failures,
    );
    if (hardwareSafetyDecision) {
      return hardwareSafetyDecision;
    }

    // 5d. Tier-gated attestation requirement checks.
    const requiredTiers = token.attestationRequirements?.requireForTiers;
    if (requiredTiers && requiredTiers.includes(tierAssignment.approvalTier)) {
      if (request.executionContext?.attestation?.grade === undefined) {
        return this.deny(
          requestId,
          timestamp,
          "CONSTRAINT_VIOLATION",
          `Attestation grade is required for tier ${tierAssignment.approvalTier}`,
        );
      }
    }

    // 5e. Tier-gated verifiable compute proof checks.
    const vc = token.verifiableComputeRequirements;
    if (vc) {
      const shouldEnforce =
        vc.requireForTiers === undefined
        || vc.requireForTiers.length === 0
        || vc.requireForTiers.includes(tierAssignment.approvalTier);

      if (shouldEnforce) {
        const proof = request.executionContext?.verifiableCompute;
        if (!proof?.proofType || !proof.proofRef || !proof.proofHash) {
          return this.deny(
            requestId,
            timestamp,
            "CONSTRAINT_VIOLATION",
            `Verifiable compute proof metadata is required for tier ${tierAssignment.approvalTier}`,
          );
        }
        if (vc.allowedProofTypes?.length && !vc.allowedProofTypes.includes(proof.proofType)) {
          return this.deny(
            requestId,
            timestamp,
            "CONSTRAINT_VIOLATION",
            `Proof type ${proof.proofType} is not allowed for this token`,
          );
        }
        if (vc.verifierRefs?.length && (!proof.verifierRef || !vc.verifierRefs.includes(proof.verifierRef))) {
          return this.deny(
            requestId,
            timestamp,
            "CONSTRAINT_VIOLATION",
            "Verifier reference is missing or not allowlisted for this token",
          );
        }
        if (vc.requirePublicInputsHash && !proof.publicInputsHash) {
          return this.deny(
            requestId,
            timestamp,
            "CONSTRAINT_VIOLATION",
            "Verifiable compute proof is missing required publicInputsHash",
          );
        }
        if (vc.maxProofAgeMs !== undefined) {
          if (!proof.generatedAt) {
            return this.deny(
              requestId,
              timestamp,
              "CONSTRAINT_VIOLATION",
              "Verifiable compute proof is missing generatedAt for freshness checks",
            );
          }
          const generatedAt = new Date(proof.generatedAt).getTime();
          if (!Number.isFinite(generatedAt) || Date.now() - generatedAt > vc.maxProofAgeMs) {
            return this.deny(
              requestId,
              timestamp,
              "CONSTRAINT_VIOLATION",
              "Verifiable compute proof exceeded maxProofAgeMs",
            );
          }
        }
        if (this.config.verifiableCompute) {
          const computeProofFailure = await failures.check("verifiableCompute.verify", () => this.config.verifiableCompute!.verify(
              request,
              token,
              tierAssignment.approvalTier,
            ), verification => {
            if (!verification.verified) {
              return this.deny(
                requestId,
                timestamp,
                "CONSTRAINT_VIOLATION",
                verification.reason ?? "Verifiable compute proof verification failed",
              );
            }
            failures.emit("verifiable.compute.verified", request.agentId, request.tokenId, {
              tier: tierAssignment.approvalTier,
              proofType: proof.proofType,
              proofRef: proof.proofRef,
              verifierRef: verification.verifierRef ?? proof.verifierRef,
            });
          });
          if (computeProofFailure) return computeProofFailure;
        } else {
          failures.emit("verifiable.compute.verified", request.agentId, request.tokenId, {
            tier: tierAssignment.approvalTier,
            proofType: proof.proofType,
            proofRef: proof.proofRef,
            verifierRef: proof.verifierRef,
          });
        }
      }
    }

    // 6b. Argument injection detection (ASI05: code execution via parameter injection)
    if (this.config.argInjectionDetector) {
      const argumentFailure = await failures.check("argInjection.analyze", () => this.config.argInjectionDetector!.analyze(request.params, request.resource), injResult => {
        if (injResult.detected && injResult.severity === "high") {
          failures.emit("agent.arg.injection_detected", request.agentId, request.tokenId, {
            patterns: injResult.patterns,
            confidence: injResult.confidence,
          });
          return this.deny(requestId, timestamp, "ARG_INJECTION_DETECTED",
            `Argument injection pattern detected: ${injResult.patterns.join(", ")}`);
        }
      });
      if (argumentFailure) return argumentFailure;
    }

    // 6c. Compute effective safety envelope (token execution envelope + dynamic envelope).
    let envelopeOverrides: EnvelopeOverrides | undefined =
      token.executionEnvelope?.maxVelocityMps !== undefined
      || token.executionEnvelope?.maxForceNewtons !== undefined
        ? {
            maxVelocityMps: token.executionEnvelope.maxVelocityMps,
            maxForceNewtons: token.executionEnvelope.maxForceNewtons,
          }
        : undefined;

    // 6d. Dynamic envelope can tighten the existing envelope further.
    if (this.config.dynamicEnvelope) {
      const envelopeFailure = await failures.check("dynamicEnvelope.compute", () => this.config.dynamicEnvelope!.computeEnvelope(request), envelope => {
        if (envelope.maxVelocityMps !== undefined || envelope.maxForceNewtons !== undefined) {
          envelopeOverrides = {
            maxVelocityMps:
              envelopeOverrides?.maxVelocityMps !== undefined && envelope.maxVelocityMps !== undefined
                ? Math.min(envelopeOverrides.maxVelocityMps, envelope.maxVelocityMps)
                : (envelope.maxVelocityMps ?? envelopeOverrides?.maxVelocityMps),
            maxForceNewtons:
              envelopeOverrides?.maxForceNewtons !== undefined && envelope.maxForceNewtons !== undefined
                ? Math.min(envelopeOverrides.maxForceNewtons, envelope.maxForceNewtons)
                : (envelope.maxForceNewtons ?? envelopeOverrides?.maxForceNewtons),
          };
          if (envelope.reason) {
            failures.emit("policy.envelope.applied", request.agentId, request.tokenId, {
              maxVelocityMps: envelope.maxVelocityMps,
              maxForceNewtons: envelope.maxForceNewtons,
              reason: envelope.reason,
            });
          }
        }
      });
      if (envelopeFailure) return envelopeFailure;
    }

    // 7. Check physical constraints (with optional dynamic envelope overrides)
    const constraintResult = checkConstraints(token, request, envelopeOverrides);
    if (!constraintResult.ok) {
      const violations = constraintResult.error;
      return this.deny(
        requestId,
        timestamp,
        "CONSTRAINT_VIOLATION",
        violations.map((v) => v.message).join("; "),
      );
    }

    // 7b. Canonical tool semantics and gateway-owned history prevent MCP naming
    // mismatches and client omission of recentActions from bypassing combinations.
    const comboNow = Date.now();
    const isMcp = parseMcpResource(request.resource) !== undefined;
    const comboAction = normalizeComboAction(request.action, isMcp ? request.resource : undefined);
    const recordedHistory = isMcp
      ? (this.mcpComboHistory.get(request.agentId) ?? []).filter(event => comboNow - event.timestampMs <= this.comboRetentionMs)
      : [];
    if (isMcp) {
      // Sweep expired agents as well as the active agent to bound idle retention.
      for (const [agentId, events] of this.mcpComboHistory) {
        if (!events.length || comboNow - events[events.length - 1]!.timestampMs > this.comboRetentionMs) {
          this.mcpComboHistory.delete(agentId);
        }
      }
      this.mcpComboHistory.set(request.agentId, recordedHistory);
      if (recordedHistory.length >= 1024) {
        return this.deny(requestId, timestamp, "COMBO_HISTORY_CAPACITY", "MCP action history capacity reached; wait for the sequence window to expire");
      }
    }
    const comboCheck = checkForbiddenCombos(
      [...recordedHistory, ...(request.recentActions ?? [])], comboAction, DEFAULT_FORBIDDEN_COMBOS, comboNow,
    );
    const recordComboAction = () => {
      if (isMcp && DEFAULT_FORBIDDEN_COMBOS.some(combo => combo.sequence.includes(comboAction))) {
        recordedHistory.push({ action: comboAction, timestampMs: comboNow });
        this.mcpComboHistory.set(request.agentId, recordedHistory);
      }
    };
    if (comboCheck.triggered && comboCheck.requiredTier) {
      const tiers = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];
      const risks = [RiskTier.T0_READ, RiskTier.T1_WRITE_LOW, RiskTier.T2_STATEFUL, RiskTier.T3_IRREVERSIBLE];
      const index = Math.max(tiers.indexOf(comboCheck.requiredTier), tiers.indexOf(tierAssignment.approvalTier));
      tierAssignment = {
        approvalTier: tiers[index]!,
        riskTier: risks[index]!,
        escalationReasons: [...tierAssignment.escalationReasons, `Forbidden combination detected: ${comboCheck.matchedCombo?.reason}`],
      };
    }

    // Server restrictions can only narrow gateway authorization. Check the
    // consequence ceiling even when a call would otherwise require approval.
    if (isMcp && request.mcpPolicy) {
      const tiers = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];
      const maxTier = request.mcpPolicy.maxTier;
      if (maxTier && tiers.indexOf(tierAssignment.approvalTier) > tiers.indexOf(maxTier)) {
        return this.deny(requestId, timestamp, "MCP_SERVER_TIER_CEILING", `MCP server policy restricts to ${maxTier}; tool requires ${tierAssignment.approvalTier}`);
      }
    }

    // 8. Determine action based on tier
    let decision = this.decideBytier(
      requestId,
      timestamp,
      tierAssignment,
    );

    // Approval policy changes the decision, not the operation's consequence tier.
    if (isMcp && request.mcpPolicy?.requireApproval && decision.action === "allow"
      && decision.assignedTier !== ApprovalTier.T0_OBSERVE) {
      decision = {
        ...decision,
        action: "escalate",
        escalation: {
          requiredTier: decision.assignedTier,
          reason: "MCP server requires human approval for non-observe actions",
          timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
          fallbackAction: "deny",
        },
      };
    }

    // Include escalated attempts: they may execute after human approval outside
    // this call. Requests rejected before tier evaluation never enter history.
    if (decision.action === "allow" || decision.action === "escalate") recordComboAction();

    // 8a. Attach token-defined approval quorum to escalations.
    decision = this.attachApprovalQuorum(decision, token);

    // 8aa. Edge mode: T2/T3 escalations fail-closed when central approval is unavailable.
    if (decision.action === "escalate" && this.config.edgeControlPlane) {
      const edgeFailure = await failures.check("edge.checkCentralEscalation", () => this.config.edgeControlPlane!.checkCentralEscalation(request, decision), gate => {
        if (!gate.allowed) {
          return this.deny(
            requestId,
            timestamp,
            "EDGE_CENTRAL_UNAVAILABLE",
            gate.reason ?? "Edge mode requires central approval plane for T2/T3 escalation",
          );
        }
      });
      if (edgeFailure) return edgeFailure;
    }

    // A failed state transition cannot silently authorize execution.
    if (this.config.circuitBreaker && decision.action === "allow") {
      const failed = await failures.check("circuitBreaker.recordSuccess",
        () => this.config.circuitBreaker!.recordSuccess(request.agentId), newState => {
          if (newState === "OPEN") return this.deny(requestId, timestamp, "CIRCUIT_OPEN", "Circuit opened before authorization completed");
          if (circuitState === "HALF_OPEN" && newState === "CLOSED") {
            failures.emit("agent.circuit.closed", request.agentId, request.tokenId, { recoveredFrom: "HALF_OPEN" });
          }
        });
      if (failed) return failed;
    } else if (this.config.circuitBreaker && decision.action === "deny") {
      await failures.check("circuitBreaker.recordDenial",
        () => this.config.circuitBreaker!.recordDenial(request.agentId, decision.denial?.policyViolated ?? "POLICY_VIOLATION"),
        newState => { if (newState === "OPEN") failures.emit("agent.circuit.opened", request.agentId, request.tokenId, { previousState: circuitState }); });
    }

    // 9. Emit ledger event
    failures.emit("policy.evaluated", request.agentId, request.tokenId, {
      decision: decision.action,
      tier: decision.assignedTier,
      risk: decision.assignedRisk,
    });

    // Billing runs only after primary audit acknowledgement in finalize().

    return decision;
  }

  /**
   * Back-compat alias for older bridge code.
   * Prefer `intercept()` in new code.
   */
  async evaluatePolicy(request: SintRequest): Promise<PolicyDecision> {
    return this.intercept(request);
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

  private attachApprovalQuorum(
    decision: PolicyDecision,
    token: SintCapabilityToken,
  ): PolicyDecision {
    const quorum = token.constraints.quorum;
    if (!quorum || decision.action !== "escalate" || !decision.escalation) {
      return decision;
    }
    return {
      ...decision,
      escalation: {
        ...decision.escalation,
        approvalQuorum: {
          required: quorum.required,
          authorized: [...quorum.authorized],
        },
      },
    };
  }

  private async evaluateSpatialMissionEnvelope(
    request: SintRequest,
    token: SintCapabilityToken,
    requestId: string,
    timestamp: string,
    failures: PluginFailureScope,
  ): Promise<PolicyDecision | undefined> {
    const envelope = token.executionEnvelope;
    if (!envelope) {
      return undefined;
    }

    const corridor = request.executionContext?.preapprovedCorridor;
    if (envelope.missionType && corridor?.missionType !== envelope.missionType) {
      return this.deny(
        requestId,
        timestamp,
        "CONSTRAINT_VIOLATION",
        `Mission type ${corridor?.missionType ?? "missing"} does not match token envelope mission ${envelope.missionType}`,
      );
    }

    if (!envelope.requiresSpatialProof) {
      return undefined;
    }

    const physical = request.physicalContext;
    if (!physical?.currentPosition) {
      return this.deny(
        requestId,
        timestamp,
        "SPATIAL_PROOF_REQUIRED",
        "Spatial proof requires currentPosition evidence",
      );
    }

    if (envelope.frameId && physical.frameId !== envelope.frameId) {
      return this.deny(
        requestId,
        timestamp,
        "SPATIAL_FRAME_MISMATCH",
        `Spatial proof frame ${physical.frameId ?? "missing"} does not match token envelope frame ${envelope.frameId}`,
      );
    }

    if (envelope.minLocalizationConfidence !== undefined) {
      const confidence = physical.localizationConfidence;
      if (confidence === undefined || confidence < envelope.minLocalizationConfidence) {
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_CONFIDENCE_LOW",
          `Localization confidence ${confidence ?? "missing"} is below required ${envelope.minLocalizationConfidence}`,
        );
      }
    }

    if (envelope.maxLocalizationAgeMs !== undefined) {
      if (!physical.localizationObservedAt) {
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_PROOF_STALE",
          "Spatial proof is missing localizationObservedAt for freshness checks",
        );
      }
      const observedAtMs = new Date(physical.localizationObservedAt).getTime();
      if (!Number.isFinite(observedAtMs) || Date.now() - observedAtMs > envelope.maxLocalizationAgeMs) {
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_PROOF_STALE",
          `Spatial proof exceeded maxLocalizationAgeMs ${envelope.maxLocalizationAgeMs}`,
        );
      }
    }

    const needsCorridorVerification =
      envelope.maxDeviationMeters !== undefined
      || envelope.maxHeadingDeviationDeg !== undefined
      || this.config.spatialCorridorVerifier !== undefined;

    if (needsCorridorVerification) {
      if (!this.config.spatialCorridorVerifier) {
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_CORRIDOR_VERIFIER_REQUIRED",
          "Spatial corridor verifier is required for this token envelope",
        );
      }

      const checkedCorridor = await failures.run("spatialCorridor.verify", () =>
        this.config.spatialCorridorVerifier!.verifyCorridor(request, token));
      if (!checkedCorridor.ok) return failures.deny(checkedCorridor.error);
      const corridorResult = checkedCorridor.value;

      if (!corridorResult.verified || corridorResult.insideCorridor === false) {
        failures.emit("policy.spatial.corridor_violation", request.agentId, request.tokenId, {
          corridorId: envelope.corridorId,
          missionType: envelope.missionType,
          verifierRef: corridorResult.verifierRef,
          reason: corridorResult.reason,
          insideCorridor: corridorResult.insideCorridor,
          lateralDeviationMeters: corridorResult.lateralDeviationMeters,
          headingDeviationDeg: corridorResult.headingDeviationDeg,
        });
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_CORRIDOR_VIOLATION",
          corridorResult.reason ?? "Spatial corridor verification failed",
        );
      }

      if (
        envelope.maxDeviationMeters !== undefined
        && corridorResult.lateralDeviationMeters !== undefined
        && corridorResult.lateralDeviationMeters > envelope.maxDeviationMeters
      ) {
        failures.emit("policy.spatial.corridor_violation", request.agentId, request.tokenId, {
          corridorId: envelope.corridorId,
          missionType: envelope.missionType,
          verifierRef: corridorResult.verifierRef,
          lateralDeviationMeters: corridorResult.lateralDeviationMeters,
          maxDeviationMeters: envelope.maxDeviationMeters,
        });
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_CORRIDOR_DEVIATION",
          `Lateral deviation ${corridorResult.lateralDeviationMeters}m exceeds limit ${envelope.maxDeviationMeters}m`,
        );
      }

      if (
        envelope.maxHeadingDeviationDeg !== undefined
        && corridorResult.headingDeviationDeg !== undefined
        && corridorResult.headingDeviationDeg > envelope.maxHeadingDeviationDeg
      ) {
        failures.emit("policy.spatial.corridor_violation", request.agentId, request.tokenId, {
          corridorId: envelope.corridorId,
          missionType: envelope.missionType,
          verifierRef: corridorResult.verifierRef,
          headingDeviationDeg: corridorResult.headingDeviationDeg,
          maxHeadingDeviationDeg: envelope.maxHeadingDeviationDeg,
        });
        return this.deny(
          requestId,
          timestamp,
          "SPATIAL_CORRIDOR_HEADING",
          `Heading deviation ${corridorResult.headingDeviationDeg}deg exceeds limit ${envelope.maxHeadingDeviationDeg}deg`,
        );
      }

      failures.emit("policy.spatial.corridor_verified", request.agentId, request.tokenId, {
        corridorId: envelope.corridorId,
        missionType: envelope.missionType,
        verifierRef: corridorResult.verifierRef,
        lateralDeviationMeters: corridorResult.lateralDeviationMeters,
        headingDeviationDeg: corridorResult.headingDeviationDeg,
      });
    }

    return undefined;
  }

  private evaluateHardwareSafetyHandshake(
    request: SintRequest,
    assignedTier: ApprovalTier,
    requestId: string,
    timestamp: string,
    agentId: string,
    tokenId: string,
    failures: PluginFailureScope,
  ): PolicyDecision | undefined {
    const safety = request.executionContext?.hardwareSafety;

    // E-stop preempts everything, including low-tier actions.
    if (safety?.estopState === "triggered") {
      failures.emit("safety.estop.triggered", agentId, tokenId, {
        source: "hardware_safety_context",
        controllerId: safety.controllerId,
        observedAt: safety.observedAt,
        deploymentProfile: request.executionContext?.deploymentProfile,
      });
      return this.deny(
        requestId,
        timestamp,
        "HARDWARE_ESTOP_ACTIVE",
        "Hardware emergency-stop is active; execution is blocked",
      );
    }

    const isHighConsequenceTier = assignedTier === "T2_act" || assignedTier === "T3_commit";
    if (!isHighConsequenceTier) {
      return undefined;
    }

    const deploymentProfile = request.executionContext?.deploymentProfile;
    const requiresIndustrialHandshake =
      typeof deploymentProfile === "string"
      && INDUSTRIAL_DEPLOYMENT_PROFILES.has(deploymentProfile);

    // Keep backward compatibility for older clients unless an industrial profile
    // explicitly declares hardware-safety handshake expectations.
    if (!requiresIndustrialHandshake && !safety) {
      return undefined;
    }

    if (!safety) {
      failures.emit("safety.hardware.permit.denied", agentId, tokenId, {
        anomalyType: "hardware_safety_context_missing",
        severity: "high",
        assignedTier,
        deploymentProfile,
      });
      return this.deny(
        requestId,
        timestamp,
        "HARDWARE_PERMIT_REQUIRED",
        `Missing hardware safety context for ${assignedTier} action in profile ${deploymentProfile}`,
      );
    }

    if (safety.observedAt) {
      const observedAtMs = new Date(safety.observedAt).getTime();
      if (!Number.isFinite(observedAtMs) || Date.now() - observedAtMs > MAX_HARDWARE_SAFETY_STALENESS_MS) {
        failures.emit("safety.hardware.state.stale", agentId, tokenId, {
          anomalyType: "hardware_state_stale",
          severity: "high",
          observedAt: safety.observedAt,
          maxStalenessMs: MAX_HARDWARE_SAFETY_STALENESS_MS,
        });
        return this.deny(
          requestId,
          timestamp,
          "HARDWARE_STATE_STALE",
          "Hardware safety state is stale or invalid; fail-closed for high-consequence action",
        );
      }
    }

    if (requiresIndustrialHandshake && safety.permitState !== "granted") {
      failures.emit("safety.hardware.permit.denied", agentId, tokenId, {
        anomalyType: "hardware_permit_not_granted",
        severity: "high",
        permitState: safety.permitState ?? "missing",
        interlockState: safety.interlockState,
      });
      return this.deny(
        requestId,
        timestamp,
        "HARDWARE_PERMIT_REQUIRED",
        `Hardware permit is not granted (${safety.permitState ?? "missing"})`,
      );
    }

    if (safety.permitState && safety.permitState !== "granted") {
      failures.emit("safety.hardware.permit.denied", agentId, tokenId, {
        anomalyType: "hardware_permit_not_granted",
        severity: "high",
        permitState: safety.permitState,
      });
      return this.deny(
        requestId,
        timestamp,
        "HARDWARE_PERMIT_REQUIRED",
        `Hardware permit is not granted (${safety.permitState})`,
      );
    }

    if (safety.interlockState && safety.interlockState !== "closed") {
      failures.emit("safety.hardware.interlock.open", agentId, tokenId, {
        anomalyType: "hardware_interlock_not_closed",
        severity: "high",
        interlockState: safety.interlockState,
      });
      return this.deny(
        requestId,
        timestamp,
        "HARDWARE_INTERLOCK_OPEN",
        `Hardware interlock state is ${safety.interlockState}; must be closed`,
      );
    }

    return undefined;
  }

}
