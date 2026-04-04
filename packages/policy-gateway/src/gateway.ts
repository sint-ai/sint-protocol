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
  type RateLimitStore,
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
import { checkConstraints, type EnvelopeOverrides } from "./constraint-checker.js";
import { checkForbiddenCombos } from "./forbidden-combos.js";
import type { CircuitBreakerPlugin, CircuitState } from "./circuit-breaker.js";
import type { AgentTrustLevel } from "@sint/core";
import type { GoalHijackPlugin } from "./goal-hijack.js";
import type { MemoryIntegrityPlugin } from "./memory-integrity.js";
import type { SupplyChainVerifierPlugin } from "./supply-chain.js";

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
 * Fail-open: if the plugin throws, the token's original limits are used.
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

export interface PolicyGatewayConfig {
  readonly resolveToken: TokenResolver;
  readonly revocationStore?: RevocationStore;
  readonly emitLedgerEvent?: LedgerEmitter;
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
   * exceeds θ, the tier is bumped up by 1. Fail-open: errors do not block.
   */
  readonly csmlEscalation?: CsmlEscalationPlugin;
  /**
   * Optional circuit breaker plugin (ASI10 / EU AI Act Article 14(4)(e)).
   * Provides the operator "stop button" and automatic rogue-agent containment.
   *
   * State machine: CLOSED → OPEN (N denials) → HALF_OPEN (after timeout) → CLOSED
   * Operators can force OPEN via trip() or force CLOSED via reset().
   * CSML anomalous persona auto-trips the circuit.
   * Fail-open: plugin errors do not block requests.
   */
  readonly circuitBreaker?: CircuitBreakerPlugin;
  /**
   * Optional dynamic envelope plugin (ROSClaw gap mitigation).
   * When provided, called just before physical constraint checking.
   * Returns environment-adaptive limits that tighten (never loosen) the token's
   * static constraints. Fail-open: plugin errors fall back to token limits.
   */
  readonly dynamicEnvelope?: DynamicEnvelopePlugin;
  /**
   * Optional goal hijack detector (ASI01).
   * Scans request params for prompt injection, role override, escalation
   * attempts, exfil probes, and cross-agent injection. Fail-open on errors.
   */
  readonly goalHijackDetector?: GoalHijackPlugin;
  /**
   * Optional memory integrity checker (ASI06).
   * Checks recentActions history for repetition, privilege claims, and
   * history overflow anomalies. High severity → deny; others → warn.
   * Fail-open on errors.
   */
  readonly memoryIntegrity?: MemoryIntegrityPlugin;
  /**
   * Optional supply chain verifier (ASI04).
   * Checks model fingerprint, model ID allowlist, and bridge protocol
   * consistency at runtime. High severity → deny. Medium → warn and continue.
   * Fail-open: plugin errors do not block requests.
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

    // 1a. ASI01 Goal Hijack detection — scan params for prompt injection / semantic override
    if (this.config.goalHijackDetector) {
      try {
        const hijackResult = this.config.goalHijackDetector.analyze(
          request.params,
          request.resource,
          request.action,
        );
        if (hijackResult.hijackDetected && hijackResult.confidence >= 0.6) {
          this.emitEvent("agent.goal.hijack_detected", request.agentId, request.tokenId, {
            confidence: hijackResult.confidence,
            patterns: hijackResult.patterns,
            reason: hijackResult.reason,
          });
          return this.deny(requestId, timestamp, "GOAL_HIJACK",
            hijackResult.reason ?? "Goal hijack attempt detected in request params");
        }
      } catch {
        // Goal hijack detector error → fail-open, continue
      }
    }

    // 1b-pre. ASI06 Memory Integrity check — detect poisoned history
    if (this.config.memoryIntegrity) {
      try {
        const memResult = this.config.memoryIntegrity.check(request);
        if (memResult.poisoned) {
          if (memResult.severity === "high") {
            this.emitEvent("agent.memory.integrity_violation", request.agentId, request.tokenId, {
              anomalies: memResult.anomalies,
              severity: memResult.severity,
            });
            return this.deny(requestId, timestamp, "MEMORY_POISONING",
              `Memory integrity violation (high severity): ${memResult.anomalies.join("; ")}`);
          } else {
            // Medium / low: warn but allow
            this.emitEvent("agent.memory.integrity_warning", request.agentId, request.tokenId, {
              anomalies: memResult.anomalies,
              severity: memResult.severity,
            });
          }
        }
      } catch {
        // Memory integrity error → fail-open, continue
      }
    }

    // 1b. Circuit breaker check (ASI10 / EU AI Act Art. 14(4)(e) stop button)
    // Checked after schema validation (so we have agentId) but before any other work.
    // OPEN → instant deny. HALF_OPEN → allow probe through, record result.
    let circuitState: CircuitState = "CLOSED";
    if (this.config.circuitBreaker) {
      try {
        circuitState = await this.config.circuitBreaker.getState(request.agentId);
        if (circuitState === "OPEN") {
          this.emitEvent("agent.circuit.blocked", request.agentId, request.tokenId, {
            circuitState,
          });
          return this.deny(requestId, timestamp, "CIRCUIT_OPEN",
            "Agent circuit is OPEN — all actions blocked. Operator reset required.");
        }
      } catch {
        // Circuit breaker error → fail-open, proceed as CLOSED
        circuitState = "CLOSED";
      }
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
        const revocationRecord = this.config.revocationStore.getRevocationRecord(token.tokenId);
        if (this.config.edgeControlPlane?.relayRevocation) {
          this.runBestEffort(
            this.config.edgeControlPlane.relayRevocation({
              requestId,
              agentId: request.agentId,
              tokenId: token.tokenId,
              reason: revocationRecord?.reason,
              revokedBy: revocationRecord?.revokedBy,
            }),
          );
        }
        return this.deny(requestId, timestamp, "TOKEN_REVOKED", "Capability token has been revoked");
      }
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
      return this.deny(requestId, timestamp, tokenValidation.error, `Token validation failed: ${tokenValidation.error}`);
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

    // 4b. Rate-limit check (per-token sliding window)
    if (this.config.rateLimitStore && token.constraints.rateLimit) {
      const { maxCalls, windowMs } = token.constraints.rateLimit;
      const bucket = Math.floor(Date.now() / windowMs);
      const key = `sint:rate:${token.tokenId}:${bucket}`;
      try {
        const count = await this.config.rateLimitStore.increment(key, windowMs);
        if (count > maxCalls) {
          if (this.config.circuitBreaker) {
            try {
              const newState = await this.config.circuitBreaker.recordDenial(
                request.agentId, "RATE_LIMIT_EXCEEDED",
              );
              if (newState === "OPEN") {
                this.emitEvent("agent.circuit.opened", request.agentId, request.tokenId, {
                  triggeredBy: "RATE_LIMIT_EXCEEDED",
                  previousState: circuitState as string,
                });
              }
            } catch { /* fail-open */ }
          }
          return this.deny(requestId, timestamp, "RATE_LIMIT_EXCEEDED",
            `Token rate limit exceeded: ${count}/${maxCalls} calls in ${windowMs}ms window`);
        }
      } catch {
        // Rate-limit store error → fail-open, proceed normally
      }
    }

    // 4c. Economy pre-intercept (budget, balance, trust checks)
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

    // 4e. ASI04 Supply chain verification — model fingerprint, ID allowlist, bridge protocol
    if (this.config.supplyChainVerifier) {
      try {
        const scResult = this.config.supplyChainVerifier.verify(request, token);
        if (!scResult.verified) {
          if (scResult.severity === "high") {
            this.emitEvent("agent.supply_chain.violation", request.agentId, request.tokenId, {
              violations: scResult.violations,
              severity: scResult.severity,
            });
            return this.deny(requestId, timestamp, "SUPPLY_CHAIN_VIOLATION",
              `Supply chain violation: ${scResult.violations.join("; ")}`);
          } else if (scResult.severity === "medium") {
            // Medium: emit warning but continue
            this.emitEvent("agent.supply_chain.warning", request.agentId, request.tokenId, {
              violations: scResult.violations,
              severity: scResult.severity,
            });
          }
          // Low: no action needed
        }
      } catch {
        // Supply chain verifier error → fail-open, continue
      }
    }

    // 5. Assign approval tier
    const agentTrustLevel = this.config.getAgentTrustLevel?.(request.agentId);
    let tierAssignment = assignTier(request, { agentTrustLevel });

    // 5b. CSML escalation (Avatar Layer 5) — bump tier if agent's safety score exceeds θ
    if (this.config.csmlEscalation) {
      try {
        const csmlDecision = await this.config.csmlEscalation.evaluateAgent(
          request.agentId,
          tierAssignment.approvalTier,
        );
        if (csmlDecision.escalated && csmlDecision.resultTier !== tierAssignment.approvalTier) {
          // Emit escalation event before mutating tier
          this.emitEvent("avatar.csml.escalated", request.agentId, request.tokenId, {
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
          try {
            await this.config.circuitBreaker.trip(
              request.agentId,
              `CSML anomalous persona: ${csmlDecision.reason}`,
            );
            this.emitEvent("agent.circuit.opened", request.agentId, request.tokenId, {
              triggeredBy: "CSML_ANOMALOUS",
              csmlScore: csmlDecision.csmlScore,
              reason: csmlDecision.reason,
            });
          } catch {
            // fail-open
          }
        }
      } catch {
        // CSML escalation error → fail-open, continue with base tier
      }
    }

    // 5f. Hardware safety-controller handshake checks.
    const hardwareSafetyDecision = this.evaluateHardwareSafetyHandshake(
      request,
      tierAssignment.approvalTier,
      requestId,
      timestamp,
      request.agentId,
      request.tokenId,
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
          try {
            const verification = await this.config.verifiableCompute.verify(
              request,
              token,
              tierAssignment.approvalTier,
            );
            if (!verification.verified) {
              return this.deny(
                requestId,
                timestamp,
                "CONSTRAINT_VIOLATION",
                verification.reason ?? "Verifiable compute proof verification failed",
              );
            }
            this.emitEvent("verifiable.compute.verified", request.agentId, request.tokenId, {
              tier: tierAssignment.approvalTier,
              proofType: proof.proofType,
              proofRef: proof.proofRef,
              verifierRef: verification.verifierRef ?? proof.verifierRef,
            });
          } catch {
            return this.deny(
              requestId,
              timestamp,
              "CONSTRAINT_VIOLATION",
              "Verifiable compute verifier plugin failed",
            );
          }
        } else {
          this.emitEvent("verifiable.compute.verified", request.agentId, request.tokenId, {
            tier: tierAssignment.approvalTier,
            proofType: proof.proofType,
            proofRef: proof.proofRef,
            verifierRef: proof.verifierRef,
          });
        }
      }
    }

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
      try {
        const envelope = await this.config.dynamicEnvelope.computeEnvelope(request);
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
            this.emitEvent("policy.envelope.applied", request.agentId, request.tokenId, {
              maxVelocityMps: envelope.maxVelocityMps,
              maxForceNewtons: envelope.maxForceNewtons,
              reason: envelope.reason,
            });
          }
        }
      } catch {
        // Dynamic envelope error → fail-open, use token's original limits
      }
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

    // 8. Determine action based on tier
    let decision = this.decideBytier(
      requestId,
      timestamp,
      tierAssignment,
    );

    // 8a. Attach token-defined approval quorum to escalations.
    decision = this.attachApprovalQuorum(decision, token);

    // 8aa. Edge mode: T2/T3 escalations fail-closed when central approval is unavailable.
    if (decision.action === "escalate" && this.config.edgeControlPlane) {
      try {
        const gate = await this.config.edgeControlPlane.checkCentralEscalation(request, decision);
        if (!gate.allowed) {
          return this.deny(
            requestId,
            timestamp,
            "EDGE_CENTRAL_UNAVAILABLE",
            gate.reason ?? "Edge mode requires central approval plane for T2/T3 escalation",
          );
        }
      } catch {
        return this.deny(
          requestId,
          timestamp,
          "EDGE_CENTRAL_UNAVAILABLE",
          "Edge mode central-approval check failed; fail-closed for T2/T3 actions",
        );
      }
    }

    // 8b. Record circuit breaker outcome — must happen BEFORE returning
    if (this.config.circuitBreaker) {
      try {
        if (decision.action === "allow") {
          const newState = await this.config.circuitBreaker.recordSuccess(request.agentId);
          if (circuitState === "HALF_OPEN" && newState === "CLOSED") {
            this.emitEvent("agent.circuit.closed", request.agentId, request.tokenId, {
              recoveredFrom: "HALF_OPEN",
            });
          }
        } else if (decision.action === "deny") {
          const newState = await this.config.circuitBreaker.recordDenial(
            request.agentId,
            decision.denial?.policyViolated ?? "POLICY_VIOLATION",
          );
          if (newState === "OPEN") {
            this.emitEvent("agent.circuit.opened", request.agentId, request.tokenId, {
              triggeredBy: decision.denial?.policyViolated,
              previousState: circuitState as string,
            });
          }
        }
      } catch {
        // Circuit breaker record error → fail-open, decision stands
      }
    }

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

  private evaluateHardwareSafetyHandshake(
    request: SintRequest,
    assignedTier: ApprovalTier,
    requestId: string,
    timestamp: string,
    agentId: string,
    tokenId: string,
  ): PolicyDecision | undefined {
    const safety = request.executionContext?.hardwareSafety;

    // E-stop preempts everything, including low-tier actions.
    if (safety?.estopState === "triggered") {
      this.emitEvent("safety.estop.triggered", agentId, tokenId, {
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
      this.emitEvent("safety.hardware.permit.denied", agentId, tokenId, {
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
        this.emitEvent("safety.hardware.state.stale", agentId, tokenId, {
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
      this.emitEvent("safety.hardware.permit.denied", agentId, tokenId, {
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
      this.emitEvent("safety.hardware.permit.denied", agentId, tokenId, {
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
      this.emitEvent("safety.hardware.interlock.open", agentId, tokenId, {
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

  private emitEvent(
    eventType: string,
    agentId: string,
    tokenId: string | undefined,
    payload: Record<string, unknown>,
  ): void {
    const event = { eventType, agentId, tokenId, payload };
    this.config.emitLedgerEvent?.(event);
    if (this.config.edgeControlPlane?.replicateEvidenceEvent) {
      this.runBestEffort(this.config.edgeControlPlane.replicateEvidenceEvent(event));
    }
  }

  private runBestEffort(promiseOrVoid: Promise<void> | void): void {
    if (!promiseOrVoid) return;
    void Promise.resolve(promiseOrVoid).catch(() => {});
  }
}
