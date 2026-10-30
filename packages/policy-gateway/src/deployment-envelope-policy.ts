import {
  ApprovalTier,
  RiskTier,
  type DeploymentEvidenceRef,
  type Result,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

/** Allowable future clock skew for attestor timestamps; matches the gateway-side 5s tolerance. */
const MAX_FUTURE_SKEW_MS = 5_000;

/** Fetch authenticated evidence from an operator-controlled attestor or store.
 * Never construct the result from caller-submitted metadata.
 */
export type DeploymentEvidenceResolver = (
  evidenceType: string,
  evidenceRef: string,
) => Result<DeploymentEvidenceRef, { readonly message: string }>
  | Promise<Result<DeploymentEvidenceRef, { readonly message: string }>>;

export interface DeploymentEnvelopePolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

export class DefaultDeploymentEnvelopePolicy implements DeploymentEnvelopePolicyPlugin {
  constructor(private readonly resolveEvidence?: DeploymentEvidenceResolver) {}

  async evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> {
    const envelope = token.deploymentEnvelope;
    if (!envelope) {
      return undefined;
    }

    const binding = envelope.contextualBinding;
    if (binding) {
      const bindingResult = this.checkBinding(binding, request);
      if (!bindingResult.ok) {
        return this.deny(context, "DEPLOYMENT_CONTEXT_MISMATCH", bindingResult.reason);
      }
    }

    const evidenceDenial = await evaluateDeploymentEvidenceRequirements(envelope, request, this.resolveEvidence);
    if (evidenceDenial) {
      return this.deny(context, evidenceDenial.policyViolated, evidenceDenial.reason);
    }

    return undefined;
  }

  private checkBinding(
    binding: NonNullable<SintCapabilityToken["deploymentEnvelope"]>["contextualBinding"],
    request: SintRequest,
  ): { readonly ok: boolean; readonly reason: string } {
    if (!binding) {
      return { ok: true, reason: "" };
    }

    if (binding.deploymentProfile !== undefined && request.executionContext?.deploymentProfile !== binding.deploymentProfile) {
      return { ok: false, reason: "Deployment profile does not match required binding" };
    }

    if (binding.siteId !== undefined && request.executionContext?.siteId !== binding.siteId) {
      return { ok: false, reason: "Site does not match required binding" };
    }

    if (binding.bridgeId !== undefined && request.executionContext?.bridgeId !== binding.bridgeId) {
      return { ok: false, reason: "Bridge does not match required binding" };
    }

    if (binding.bridgeProtocol !== undefined && request.executionContext?.bridgeProtocol !== binding.bridgeProtocol) {
      return { ok: false, reason: "Bridge protocol does not match required binding" };
    }

    if (binding.robotId !== undefined && request.executionContext?.executor?.nodeId !== binding.robotId) {
      return { ok: false, reason: "Robot does not match required binding" };
    }

    if (binding.fleetId !== undefined && request.executionContext?.executor?.runtimeId !== binding.fleetId) {
      return { ok: false, reason: "Fleet does not match required binding" };
    }

    if (binding.controllerId !== undefined && request.executionContext?.hardwareSafety?.controllerId !== binding.controllerId) {
      return { ok: false, reason: "Controller does not match required binding" };
    }

    if (binding.zoneId !== undefined && request.executionContext?.preapprovedCorridor?.corridorId !== binding.zoneId) {
      return { ok: false, reason: "Zone does not match required binding" };
    }

    if (binding.resource !== undefined && request.resource !== binding.resource) {
      return { ok: false, reason: "Resource does not match required binding" };
    }

    if (binding.action !== undefined && request.action !== binding.action) {
      return { ok: false, reason: "Action does not match required binding" };
    }

    return { ok: true, reason: "" };
  }

  private deny(
    context: { readonly requestId: string; readonly timestamp: string },
    policyViolated: string,
    reason: string,
  ): PolicyDecision {
    return {
      requestId: context.requestId as any,
      timestamp: context.timestamp,
      action: "deny",
      denial: { reason, policyViolated },
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: RiskTier.T3_IRREVERSIBLE,
    };
  }
}

interface EvidenceRefRequirement {
  readonly evidenceType: string;
  readonly evidenceRef: string;
  readonly proofHash?: string;
  readonly verifierRef?: string;
  readonly observedAt?: string;
  readonly maxAgeMs?: number;
}

interface EnvelopeEvidenceRequirements {
  readonly proofFreshness?: { readonly maxProofAgeMs?: number; readonly requireObservedAt?: boolean };
  readonly requiredEvidenceRefs?: readonly EvidenceRefRequirement[];
  readonly allowedVerifiers?: readonly string[];
}

/**
 * Shared evaluator for the deployment-envelope evidence contract
 * (requiredEvidenceRefs, proofFreshness, allowedVerifiers). Returns the denial
 * reason to raise, or undefined when every requirement is satisfied. Reused by
 * both the deployment and manufacturing envelope policies so a requirement that
 * is signed into a token is enforced no matter which envelope carries it.
 */
export async function evaluateDeploymentEvidenceRequirements(
  envelope: EnvelopeEvidenceRequirements,
  request: SintRequest,
  resolveEvidence?: DeploymentEvidenceResolver,
): Promise<{ readonly policyViolated: string; readonly reason: string } | undefined> {
  const evidence = request.executionContext?.deploymentEvidence ?? [];
  const requiredEvidenceRefs = envelope.requiredEvidenceRefs ?? [];
  const freshnessAgeMs = envelope.proofFreshness?.maxProofAgeMs;
  const requireObservedAt = envelope.proofFreshness?.requireObservedAt === true || freshnessAgeMs !== undefined;

  const requiresEvidence = requiredEvidenceRefs.length > 0 || requireObservedAt || Boolean(envelope.allowedVerifiers?.length);
  if (requiresEvidence && evidence.length === 0) {
    return { policyViolated: "DEPLOYMENT_PROOF_MISSING", reason: "Deployment envelope requires evidence but none was provided" };
  }

  for (const required of requiredEvidenceRefs) {
    const matched = evidence.find(
      (entry) => entry.evidenceType === required.evidenceType && entry.evidenceRef === required.evidenceRef,
    );
    if (!matched) {
      return {
        policyViolated: "DEPLOYMENT_PROOF_MISSING",
        reason: `Required deployment evidence ${required.evidenceType}:${required.evidenceRef} is missing`,
      };
    }

    const maxAgeMs = required.maxAgeMs ?? freshnessAgeMs;
    if ((requireObservedAt || maxAgeMs !== undefined) && !matched.observedAt) {
      return {
        policyViolated: "DEPLOYMENT_PROOF_MISSING",
        reason: `Deployment evidence ${required.evidenceType}:${required.evidenceRef} is missing observedAt`,
      };
    }

    if (maxAgeMs !== undefined) {
      const observedAtMs = Date.parse(matched.observedAt);
      if (
        !Number.isFinite(observedAtMs)
        || Date.now() - observedAtMs > maxAgeMs
        || observedAtMs - Date.now() > MAX_FUTURE_SKEW_MS
      ) {
        return {
          policyViolated: "DEPLOYMENT_PROOF_STALE",
          reason: `Deployment evidence ${required.evidenceType}:${required.evidenceRef} exceeded maxAgeMs or is future-dated`,
        };
      }
    }

    if (required.proofHash && required.proofHash !== matched.proofHash) {
      return {
        policyViolated: "DEPLOYMENT_CONTEXT_MISMATCH",
        reason: `Deployment evidence ${required.evidenceType}:${required.evidenceRef} proof hash is missing or does not match the pinned value`,
      };
    }

    if (required.verifierRef && matched.verifierRef !== required.verifierRef) {
      return {
        policyViolated: "DEPLOYMENT_CONTEXT_MISMATCH",
        reason: `Deployment evidence ${required.evidenceType}:${required.evidenceRef} verifier does not match the pinned verifierRef`,
      };
    }

    if (envelope.allowedVerifiers?.length && (!matched.verifierRef || !envelope.allowedVerifiers.includes(matched.verifierRef))) {
      return {
        policyViolated: "DEPLOYMENT_CONTEXT_MISMATCH",
        reason: `Deployment evidence ${required.evidenceType}:${required.evidenceRef} verifier is not allowlisted`,
      };
    }
  }

  if (freshnessAgeMs !== undefined && requiredEvidenceRefs.length === 0) {
    const staleEvidence = evidence.find((entry) => {
      if (!entry.observedAt) {
        return true;
      }
      const observedAtMs = Date.parse(entry.observedAt);
      return (
        !Number.isFinite(observedAtMs)
        || Date.now() - observedAtMs > freshnessAgeMs
        || observedAtMs - Date.now() > MAX_FUTURE_SKEW_MS
      );
    });
    if (staleEvidence) {
      return { policyViolated: "DEPLOYMENT_PROOF_STALE", reason: "Deployment proof freshness requirement was not satisfied" };
    }
  }

  if (!requiresEvidence) return undefined;

  const usedEvidence = requiredEvidenceRefs.length > 0
    ? evidence.filter(entry => requiredEvidenceRefs.some(required => required.evidenceType === entry.evidenceType && required.evidenceRef === entry.evidenceRef))
    : evidence;
  for (const entry of usedEvidence) {
    if (!resolveEvidence) {
      return { policyViolated: "DEPLOYMENT_PROOF_UNVERIFIED", reason: "Deployment evidence requires a trusted evidence resolver" };
    }
    const resolved = await resolveEvidence(entry.evidenceType, entry.evidenceRef);
    if (!resolved.ok) {
      return { policyViolated: "DEPLOYMENT_PROOF_UNVERIFIED", reason: "Deployment evidence could not be authenticated" };
    }
    const trusted = resolved.value;
    if (trusted.evidenceType !== entry.evidenceType || trusted.evidenceRef !== entry.evidenceRef
      || trusted.proofHash !== entry.proofHash || trusted.verifierRef !== entry.verifierRef
      || trusted.observedAt !== entry.observedAt) {
      return { policyViolated: "DEPLOYMENT_PROOF_UNVERIFIED", reason: "Deployment evidence metadata does not match the authenticated attestation" };
    }
    const required = requiredEvidenceRefs.find(ref => ref.evidenceType === entry.evidenceType && ref.evidenceRef === entry.evidenceRef);
    const maxAgeMs = required?.maxAgeMs ?? freshnessAgeMs;
    const observedAtMs = Date.parse(trusted.observedAt);
    if (!Number.isFinite(observedAtMs) || observedAtMs - Date.now() > MAX_FUTURE_SKEW_MS
      || (maxAgeMs !== undefined && Date.now() - observedAtMs > maxAgeMs)) {
      return { policyViolated: "DEPLOYMENT_PROOF_STALE", reason: "Authenticated deployment evidence is expired, invalid, or future-dated" };
    }
    if (required?.observedAt !== undefined && required.observedAt !== trusted.observedAt) {
      return { policyViolated: "DEPLOYMENT_CONTEXT_MISMATCH", reason: "Deployment evidence timestamp does not match the token-pinned attestation" };
    }
    if (envelope.allowedVerifiers?.length && (!trusted.verifierRef || !envelope.allowedVerifiers.includes(trusted.verifierRef))) {
      return { policyViolated: "DEPLOYMENT_CONTEXT_MISMATCH", reason: "Authenticated deployment evidence verifier is not allowlisted" };
    }
  }

  return undefined;
}
