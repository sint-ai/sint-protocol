import {
  ApprovalTier,
  RiskTier,
  canonicalJsonStringify,
  type Ed25519PublicKey,
  type ISO8601,
  type PolicyDecision,
  type SimulationEvidenceGrade,
  type SimulationEvidenceReceipt,
  type SimulationEvidenceRequirement,
  type SimulationPreflight,
  type SintCapabilityToken,
  type SintRequest,
  type UUIDv7,
} from "@pshkv/core";
import { hashSha256, verify } from "@pshkv/gate-capability-tokens";

export interface SimulationEvidencePolicyPlugin {
  getRequirement?(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ): SimulationEvidenceRequirement | undefined;
  getEnforcementMode?(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ): SimulationEvidenceEnforcementMode;
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
    context: { readonly requestId: UUIDv7; readonly timestamp: ISO8601 },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

/** Shadow evaluates and audits evidence but cannot block the request. */
export type SimulationEvidenceEnforcementMode = "enforce" | "shadow";

/** Read-side replay check. The execution broker owns atomic nonce consumption. */
export interface SimulationReceiptReplayStore {
  isConsumed(receiptId: string, nonce: string): Promise<boolean> | boolean;
}

/** Useful for local deployments and deterministic conformance tests. */
export class InMemorySimulationReceiptReplayStore implements SimulationReceiptReplayStore {
  private readonly consumed = new Set<string>();

  isConsumed(receiptId: string, nonce: string): boolean {
    return this.consumed.has(this.key(receiptId, nonce));
  }

  consume(receiptId: string, nonce: string): boolean {
    const key = this.key(receiptId, nonce);
    if (this.consumed.has(key)) return false;
    this.consumed.add(key);
    return true;
  }

  private key(receiptId: string, nonce: string): string {
    return `${receiptId}:${nonce}`;
  }
}

export interface DefaultSimulationEvidencePolicyOptions {
  /** Preferred tier matrix. Omitted tiers do not require simulation evidence. */
  readonly tierRequirements?: Partial<Record<ApprovalTier, SimulationEvidenceRequirement>>;
  /** Resource/effect-specific override for the tier matrix. */
  readonly requirementFor?: (
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ) => SimulationEvidenceRequirement | undefined;
  /** Tier-wide shadow evaluation. Intended for T1 calibration before promotion. */
  readonly shadowTiers?: readonly ApprovalTier[];
  /** Resource/effect-specific enforcement override. */
  readonly enforcementModeFor?: (
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ) => SimulationEvidenceEnforcementMode;
  /** @deprecated Use tierRequirements or requirementFor. */
  readonly requiredFor?: (request: SintRequest, token: SintCapabilityToken) => boolean;
  readonly trustedSignerKeys: readonly Ed25519PublicKey[];
  /** Maximum evidence grade each trusted signer is accredited to issue. */
  readonly maxEvidenceGradeBySigner?: Readonly<Record<string, SimulationEvidenceGrade>>;
  readonly allowedBackends?: readonly string[];
  readonly maxReceiptAgeMs?: number;
  readonly maxWorldStateAgeMs?: number;
  readonly maxWorldUncertainty?: number;
  readonly minScenarioRuns?: number;
  readonly minScenarioCoverage?: number;
  readonly maxClockSkewMs?: number;
  readonly denyUnsupportedPhenomena?: boolean;
  readonly replayStore?: SimulationReceiptReplayStore;
  /** Injectable clock for deterministic verification. */
  readonly now?: () => number;
}

const EVIDENCE_GRADE_ORDER: Record<SimulationEvidenceGrade, number> = {
  deterministic: 0,
  physics: 1,
  "digital-twin": 2,
};

function deny(
  context: { readonly requestId: UUIDv7; readonly timestamp: ISO8601 },
  policyViolated: string,
  reason: string,
): PolicyDecision {
  return {
    requestId: context.requestId,
    timestamp: context.timestamp,
    action: "deny",
    denial: { reason, policyViolated },
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
  };
}

/** Canonical payload signed by a simulation service. */
export function computeSimulationEvidenceSigningPayload(
  receipt: SimulationEvidenceReceipt,
): string {
  const { signature: _signature, ...payload } = receipt;
  return canonicalJsonStringify(payload);
}

/** Exact request binding; simulationEvidence is removed to avoid a recursive digest. */
export function computeSimulationRequestDigest(request: SintRequest): string {
  const { simulationEvidence: _simulationEvidence, ...remainingExecutionContext } =
    request.executionContext ?? {};
  const executionContext = Object.keys(remainingExecutionContext).length > 0
    ? remainingExecutionContext
    : undefined;
  return hashSha256(canonicalJsonStringify({ ...request, executionContext }));
}

/** Stable digest for the actual external effect proposed by the agent. */
export function computeSimulationEffectPlanDigest(request: SintRequest): string {
  return hashSha256(canonicalJsonStringify({
    resource: request.resource,
    action: request.action,
    params: request.params,
  }));
}

export function computeSimulationTokenDigest(token: SintCapabilityToken): string {
  return hashSha256(canonicalJsonStringify(token));
}

/** Build an EffectSimulator input without making an authorization decision. */
export function createSimulationPreflight(
  request: SintRequest,
  token: SintCapabilityToken,
  assignedTier: ApprovalTier,
  requirement?: SimulationEvidenceRequirement,
): SimulationPreflight {
  return {
    kind: "simulation-preflight",
    authorizesExecution: false,
    assignedTier,
    effectPlan: {
      requestDigest: computeSimulationRequestDigest(request),
      effectPlanDigest: computeSimulationEffectPlanDigest(request),
      tokenDigest: computeSimulationTokenDigest(token),
      resource: request.resource,
      action: request.action,
      params: request.params,
    },
    ...(requirement !== undefined && { requirement }),
  };
}

/**
 * Fail-closed verification of signed simulation evidence.
 * A valid receipt only permits the request to continue through the gateway.
 */
export class DefaultSimulationEvidencePolicy implements SimulationEvidencePolicyPlugin {
  private readonly trustedSignerKeys: ReadonlySet<string>;
  private readonly shadowTiers: ReadonlySet<ApprovalTier>;

  constructor(private readonly options: DefaultSimulationEvidencePolicyOptions) {
    this.trustedSignerKeys = new Set(options.trustedSignerKeys);
    this.shadowTiers = new Set(options.shadowTiers ?? []);
  }

  getEnforcementMode(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ): SimulationEvidenceEnforcementMode {
    return this.options.enforcementModeFor?.(request, token, assignedTier)
      ?? (this.shadowTiers.has(assignedTier) ? "shadow" : "enforce");
  }

  getRequirement(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
  ): SimulationEvidenceRequirement | undefined {
    if (this.options.requirementFor) {
      return this.options.requirementFor(request, token, assignedTier);
    }
    if (this.options.tierRequirements) {
      return this.options.tierRequirements[assignedTier];
    }
    if (this.options.requiredFor?.(request, token) === false) {
      return undefined;
    }
    // Backward-compatible default for deployments that enable the plugin
    // without a tier matrix.
    return { minEvidenceGrade: "deterministic" };
  }

  async evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    assignedTier: ApprovalTier,
    context: { readonly requestId: UUIDv7; readonly timestamp: ISO8601 },
  ): Promise<PolicyDecision | undefined> {
    const requirement = this.getRequirement(request, token, assignedTier);
    const receipt = request.executionContext?.simulationEvidence;
    if (!receipt) {
      return requirement
        ? deny(context, "SIMULATION_EVIDENCE_MISSING", "Predictive simulation evidence is required")
        : undefined;
    }

    if (!this.trustedSignerKeys.has(receipt.signerPublicKey)) {
      return deny(context, "SIMULATION_SIGNER_UNTRUSTED", "Simulation receipt signer is not trusted");
    }
    if (!verify(receipt.signerPublicKey, receipt.signature, computeSimulationEvidenceSigningPayload(receipt))) {
      return deny(context, "SIMULATION_SIGNATURE_INVALID", "Simulation receipt signature is invalid");
    }
    const signerMaxGrade = this.options.maxEvidenceGradeBySigner?.[receipt.signerPublicKey];
    if (
      signerMaxGrade !== undefined
      && EVIDENCE_GRADE_ORDER[receipt.evidenceGrade] > EVIDENCE_GRADE_ORDER[signerMaxGrade]
    ) {
      return deny(
        context,
        "SIMULATION_SIGNER_GRADE_UNTRUSTED",
        `Simulation signer is accredited only through ${signerMaxGrade} evidence`,
      );
    }

    if (
      requirement
      && EVIDENCE_GRADE_ORDER[receipt.evidenceGrade]
        < EVIDENCE_GRADE_ORDER[requirement.minEvidenceGrade]
    ) {
      return deny(
        context,
        "SIMULATION_EVIDENCE_GRADE_INSUFFICIENT",
        `Tier ${assignedTier} requires ${requirement.minEvidenceGrade} evidence; receipt is ${receipt.evidenceGrade}`,
      );
    }
    if (
      requirement?.minApprovalQuorum !== undefined
      && (token.constraints.quorum?.required ?? 0) < requirement.minApprovalQuorum
    ) {
      return deny(
        context,
        "SIMULATION_APPROVAL_QUORUM_INSUFFICIENT",
        `Tier ${assignedTier} requires an approval quorum of at least ${requirement.minApprovalQuorum}`,
      );
    }

    if (
      receipt.requestDigest !== computeSimulationRequestDigest(request)
      || receipt.effectPlanDigest !== computeSimulationEffectPlanDigest(request)
      || receipt.tokenDigest !== computeSimulationTokenDigest(token)
      || receipt.resource !== request.resource
      || receipt.action !== request.action
    ) {
      return deny(
        context,
        "SIMULATION_CONTEXT_MISMATCH",
        "Simulation evidence is not bound to this exact request, effect plan, and capability token",
      );
    }

    const now = this.options.now?.() ?? Date.now();
    const generatedAt = Date.parse(receipt.generatedAt);
    const expiresAt = Date.parse(receipt.expiresAt);
    const observedAt = Date.parse(receipt.worldSnapshot.observedAt);
    const worldValidUntil = Date.parse(receipt.worldSnapshot.validUntil);
    const maxClockSkewMs = this.options.maxClockSkewMs ?? 5_000;
    const maxReceiptAgeMs = this.options.maxReceiptAgeMs ?? 30_000;
    const maxWorldStateAgeMs = this.options.maxWorldStateAgeMs ?? 5_000;

    if (
      !Number.isFinite(generatedAt)
      || !Number.isFinite(expiresAt)
      || generatedAt > now + maxClockSkewMs
      || now - generatedAt > maxReceiptAgeMs
      || expiresAt <= generatedAt
      || expiresAt <= now
    ) {
      return deny(context, "SIMULATION_EVIDENCE_STALE", "Simulation receipt is expired, stale, or future-dated");
    }
    if (
      !Number.isFinite(observedAt)
      || !Number.isFinite(worldValidUntil)
      || observedAt > now + maxClockSkewMs
      || now - observedAt > maxWorldStateAgeMs
      || worldValidUntil <= observedAt
      || worldValidUntil <= now
    ) {
      return deny(context, "SIMULATION_WORLD_STATE_STALE", "Simulation world snapshot is no longer safe to rely on");
    }

    const allowedBackends = requirement?.allowedBackends ?? this.options.allowedBackends;
    if (allowedBackends?.length && !allowedBackends.includes(receipt.simulator.backend)) {
      return deny(context, "SIMULATION_BACKEND_NOT_ALLOWED", "Simulation backend is not approved for this deployment");
    }
    const minScenarioRuns = requirement?.minScenarioRuns ?? this.options.minScenarioRuns ?? 1;
    if (receipt.scenarios.runCount < minScenarioRuns) {
      return deny(context, "SIMULATION_COVERAGE_INSUFFICIENT", "Simulation scenario run count is below policy minimum");
    }
    const minScenarioCoverage = requirement?.minScenarioCoverage ?? this.options.minScenarioCoverage;
    if (
      minScenarioCoverage !== undefined
      && (receipt.scenarios.coverage === undefined || receipt.scenarios.coverage < minScenarioCoverage)
    ) {
      return deny(context, "SIMULATION_COVERAGE_INSUFFICIENT", "Simulation scenario coverage is below policy minimum");
    }
    const maxWorldUncertainty = requirement?.maxWorldUncertainty ?? this.options.maxWorldUncertainty;
    if (
      maxWorldUncertainty !== undefined
      && (receipt.worldSnapshot.uncertainty === undefined
        || receipt.worldSnapshot.uncertainty > maxWorldUncertainty)
    ) {
      return deny(context, "SIMULATION_UNCERTAINTY_EXCEEDED", "World-state uncertainty exceeds the policy limit");
    }
    for (const binding of requirement?.requiredBindings ?? []) {
      if (receipt.bindings?.[binding] === undefined) {
        return deny(
          context,
          "SIMULATION_BINDING_MISSING",
          `Simulation evidence is missing required ${binding} binding`,
        );
      }
    }
    for (const [binding, expected] of Object.entries(requirement?.expectedBindings ?? {})) {
      const observed = receipt.bindings?.[binding as keyof NonNullable<typeof receipt.bindings>];
      if (observed !== expected) {
        return deny(
          context,
          "SIMULATION_BINDING_MISMATCH",
          `Simulation ${binding} binding does not match the tier policy`,
        );
      }
    }

    if (
      receipt.result.outcome !== "pass"
      || receipt.result.collisions > 0
      || receipt.result.safetyZoneViolations > 0
    ) {
      return deny(context, "SIMULATION_UNSAFE", "Simulation did not produce an unambiguous safe outcome");
    }

    const constrainedMetrics: ReadonlyArray<{
      readonly name: string;
      readonly limit: number | undefined;
      readonly observed: number | undefined;
    }> = [
      { name: "force", limit: token.constraints.maxForceNewtons, observed: receipt.result.maxForceNewtons },
      { name: "velocity", limit: token.constraints.maxVelocityMps, observed: receipt.result.maxVelocityMps },
      { name: "torque", limit: token.constraints.maxTorqueNm, observed: receipt.result.maxTorqueNm },
      { name: "jerk", limit: token.constraints.maxJerkMps3, observed: receipt.result.maxJerkMps3 },
      {
        name: "angular velocity",
        limit: token.constraints.maxAngularVelocityRps,
        observed: receipt.result.maxAngularVelocityRps,
      },
    ];
    for (const metric of constrainedMetrics) {
      if (metric.limit !== undefined && metric.observed === undefined) {
        return deny(
          context,
          "SIMULATION_METRIC_MISSING",
          `Simulation evidence is missing predicted ${metric.name} required by token constraints`,
        );
      }
      if (metric.limit !== undefined && metric.observed !== undefined && metric.observed > metric.limit) {
        return deny(
          context,
          "SIMULATION_CONSTRAINT_VIOLATION",
          `Predicted ${metric.name} ${metric.observed} exceeds token limit ${metric.limit}`,
        );
      }
    }
    if (
      (this.options.denyUnsupportedPhenomena ?? true)
      && (receipt.result.unsupportedPhenomena?.length ?? 0) > 0
    ) {
      return deny(context, "SIMULATION_MODEL_GAP", "Simulation reports unsupported physical phenomena");
    }

    if (this.options.replayStore) {
      const consumed = await this.options.replayStore.isConsumed(receipt.receiptId, receipt.nonce);
      if (consumed) {
        return deny(context, "SIMULATION_EVIDENCE_REPLAYED", "Simulation receipt nonce has already been consumed");
      }
    }

    return undefined;
  }
}
