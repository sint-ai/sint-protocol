import {
  ApprovalTier,
  RiskTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

export interface DeploymentEnvelopePolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

export class DefaultDeploymentEnvelopePolicy implements DeploymentEnvelopePolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): PolicyDecision | undefined {
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

    const evidence = request.executionContext?.deploymentEvidence ?? [];
    const requiredEvidenceRefs = envelope.requiredEvidenceRefs ?? [];
    const freshnessAgeMs = envelope.proofFreshness?.maxProofAgeMs;
    const requireObservedAt = envelope.proofFreshness?.requireObservedAt === true || freshnessAgeMs !== undefined;

    if ((requiredEvidenceRefs.length > 0 || freshnessAgeMs !== undefined) && evidence.length === 0) {
      return this.deny(
        context,
        "DEPLOYMENT_PROOF_MISSING",
        "Deployment envelope requires evidence but none was provided",
      );
    }

    for (const required of requiredEvidenceRefs) {
      const matched = evidence.find(
        (entry) => entry.evidenceType === required.evidenceType && entry.evidenceRef === required.evidenceRef,
      );
      if (!matched) {
        return this.deny(
          context,
          "DEPLOYMENT_PROOF_MISSING",
          `Required deployment evidence ${required.evidenceType}:${required.evidenceRef} is missing`,
        );
      }

      const maxAgeMs = required.maxAgeMs ?? freshnessAgeMs;
      if ((requireObservedAt || maxAgeMs !== undefined) && !matched.observedAt) {
        return this.deny(
          context,
          "DEPLOYMENT_PROOF_MISSING",
          `Deployment evidence ${required.evidenceType}:${required.evidenceRef} is missing observedAt`,
        );
      }

      if (maxAgeMs !== undefined) {
        const observedAtMs = Date.parse(matched.observedAt);
        if (!Number.isFinite(observedAtMs) || Date.now() - observedAtMs > maxAgeMs) {
          return this.deny(
            context,
            "DEPLOYMENT_PROOF_STALE",
            `Deployment evidence ${required.evidenceType}:${required.evidenceRef} exceeded maxAgeMs`,
          );
        }
      }

      if (required.proofHash && matched.proofHash && required.proofHash !== matched.proofHash) {
        return this.deny(
          context,
          "DEPLOYMENT_CONTEXT_MISMATCH",
          `Deployment evidence ${required.evidenceType}:${required.evidenceRef} hash mismatch`,
        );
      }

      if (envelope.allowedVerifiers?.length && (!matched.verifierRef || !envelope.allowedVerifiers.includes(matched.verifierRef))) {
        return this.deny(
          context,
          "DEPLOYMENT_CONTEXT_MISMATCH",
          `Deployment evidence ${required.evidenceType}:${required.evidenceRef} verifier is not allowlisted`,
        );
      }
    }

    if (envelope.proofFreshness?.maxProofAgeMs !== undefined && requiredEvidenceRefs.length === 0) {
      const staleEvidence = evidence.find((entry) => {
        if (!entry.observedAt) {
          return true;
        }
        const observedAtMs = Date.parse(entry.observedAt);
        return !Number.isFinite(observedAtMs) || Date.now() - observedAtMs > envelope.proofFreshness!.maxProofAgeMs!;
      });
      if (staleEvidence) {
        return this.deny(
          context,
          "DEPLOYMENT_PROOF_STALE",
          "Deployment proof freshness requirement was not satisfied",
        );
      }
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
