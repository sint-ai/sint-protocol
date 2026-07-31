import {
  ApprovalTier,
  RiskTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

export interface HumanAuthorityPolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

const ASSURANCE_RANK: Record<"humanhood" | "uniqueness" | "delegation" | "contextual_binding", number> = {
  humanhood: 0,
  uniqueness: 1,
  delegation: 2,
  contextual_binding: 3,
};

export class DefaultHumanAuthorityPolicy implements HumanAuthorityPolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): PolicyDecision | undefined {
    const requirements = token.humanAuthorityRequirements;
    if (!requirements) {
      return undefined;
    }

    const proof = request.executionContext?.humanAuthority;
    if (!proof) {
      return this.deny(context, "HUMAN_AUTHORITY_MISSING", "Human authority proof is required by this token");
    }
    if (proof.revokedAt) {
      return this.deny(context, "HUMAN_AUTHORITY_REVOKED", "Human authority proof has been revoked");
    }
    if (!proof.proofRef || !proof.proofHash) {
      return this.deny(
        context,
        "HUMAN_AUTHORITY_INCOMPLETE",
        "Human authority proof is missing proofRef or proofHash",
      );
    }

    const requiredAssuranceLevel = requirements.requireUniquePrincipal
      && ASSURANCE_RANK[requirements.requiredAssuranceLevel] < ASSURANCE_RANK.uniqueness
      ? "uniqueness"
      : requirements.requiredAssuranceLevel;
    if (ASSURANCE_RANK[proof.assuranceLevel] < ASSURANCE_RANK[requiredAssuranceLevel]) {
      return this.deny(
        context,
        "HUMAN_AUTHORITY_ASSURANCE_TOO_LOW",
        `Human authority assurance level ${proof.assuranceLevel} is below required level ${requiredAssuranceLevel}`,
      );
    }

    if (requirements.allowedProofProviders?.length) {
      if (!proof.verifierRef || !requirements.allowedProofProviders.includes(proof.verifierRef)) {
        return this.deny(
          context,
          "HUMAN_AUTHORITY_PROOF_PROVIDER_DENIED",
          "Human authority proof verifier is not allowlisted for this token",
        );
      }
    }

    if (requirements.maxProofAgeMs !== undefined) {
      if (!proof.observedAt) {
        return this.deny(
          context,
          "HUMAN_AUTHORITY_PROOF_STALE",
          "Human authority proof is missing observedAt for freshness checks",
        );
      }
      const observedAt = Date.parse(proof.observedAt);
      if (!Number.isFinite(observedAt) || Date.now() - observedAt > requirements.maxProofAgeMs) {
        return this.deny(
          context,
          "HUMAN_AUTHORITY_PROOF_STALE",
          "Human authority proof exceeded maxProofAgeMs",
        );
      }
    }

    if (
      requirements.allowedDelegationDepth !== undefined
      && (proof.delegationChain?.depth ?? 0) > requirements.allowedDelegationDepth
    ) {
      return this.deny(
        context,
        "HUMAN_AUTHORITY_DELEGATION_DEPTH_EXCEEDED",
        "Human authority delegation depth exceeds token limit",
      );
    }

    const binding = requirements.requiredBinding;
    if (binding) {
      const proofBinding = proof.binding;
      if (!proofBinding) {
        return this.deny(
          context,
          "HUMAN_AUTHORITY_BINDING_MISSING",
          "Human authority proof is missing required binding",
        );
      }

      const bindingCheck = this.checkBinding(binding, proofBinding, request);
      if (!bindingCheck.ok) {
        return this.deny(context, "HUMAN_AUTHORITY_BINDING_MISMATCH", bindingCheck.reason);
      }
    }

    return undefined;
  }

  private checkBinding(
    required: NonNullable<SintCapabilityToken["humanAuthorityRequirements"]>["requiredBinding"],
    proofBinding: NonNullable<NonNullable<SintRequest["executionContext"]>["humanAuthority"]>["binding"],
    request: SintRequest,
  ): { readonly ok: boolean; readonly reason: string } {
    if (!required || !proofBinding) {
      return { ok: true, reason: "" };
    }

    if (required.applicationId !== undefined) {
      const applicationId = request.executionContext?.executor?.runtimeId ?? request.executionContext?.bridgeId;
      if (!applicationId || applicationId !== required.applicationId) {
        return { ok: false, reason: "Application identity does not match required binding" };
      }
    }

    if (required.siteId !== undefined) {
      if (request.executionContext?.siteId !== required.siteId || proofBinding.siteId !== required.siteId) {
        return { ok: false, reason: "Site binding does not match required binding" };
      }
    }

    if (required.robotId !== undefined) {
      const robotId = request.executionContext?.executor?.nodeId;
      if (!robotId || robotId !== required.robotId || proofBinding.robotId !== required.robotId) {
        return { ok: false, reason: "Robot binding does not match required binding" };
      }
    }

    if (required.resource !== undefined && request.resource !== required.resource) {
      return { ok: false, reason: "Resource does not match required binding" };
    }

    if (required.action !== undefined && request.action !== required.action) {
      return { ok: false, reason: "Action does not match required binding" };
    }

    if (required.valueCurrency !== undefined) {
      const requestCurrency = this.readCurrency(request);
      if (!requestCurrency || requestCurrency !== required.valueCurrency || proofBinding.valueCurrency !== required.valueCurrency) {
        return { ok: false, reason: "Value currency does not match required binding" };
      }
    }

    const requestValue = this.readNumericValue(request);
    if (required.minValue !== undefined) {
      if (proofBinding.minValue === undefined || proofBinding.minValue < required.minValue) {
        return { ok: false, reason: "Minimum value binding is weaker than required" };
      }
      if (requestValue !== undefined && requestValue < required.minValue) {
        return { ok: false, reason: "Request value is below the required minimum" };
      }
    }
    if (required.maxValue !== undefined) {
      if (proofBinding.maxValue === undefined || proofBinding.maxValue > required.maxValue) {
        return { ok: false, reason: "Maximum value binding is weaker than required" };
      }
      if (requestValue !== undefined && requestValue > required.maxValue) {
        return { ok: false, reason: "Request value exceeds the required maximum" };
      }
    }

    if (required.validFrom !== undefined) {
      if (!proofBinding.validFrom) {
        return { ok: false, reason: "Proof binding is missing validFrom" };
      }
      if (Date.parse(proofBinding.validFrom) < Date.parse(required.validFrom)) {
        return { ok: false, reason: "Proof binding starts before required validFrom" };
      }
    }
    if (required.validUntil !== undefined) {
      if (!proofBinding.validUntil) {
        return { ok: false, reason: "Proof binding is missing validUntil" };
      }
      if (Date.parse(proofBinding.validUntil) > Date.parse(required.validUntil)) {
        return { ok: false, reason: "Proof binding expires after required validUntil" };
      }
    }

    return { ok: true, reason: "" };
  }

  private readNumericValue(request: SintRequest): number | undefined {
    const params = request.params;
    if (!params || typeof params !== "object") {
      return undefined;
    }
    const record = params as Record<string, unknown>;
    for (const key of ["value", "amount", "cost", "total", "price"]) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  private readCurrency(request: SintRequest): string | undefined {
    const params = request.params;
    if (!params || typeof params !== "object") {
      return undefined;
    }
    const record = params as Record<string, unknown>;
    for (const key of ["currency", "valueCurrency"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
    return undefined;
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
      denial: { policyViolated, reason },
      assignedTier: ApprovalTier.T3_COMMIT,
      assignedRisk: RiskTier.T3_IRREVERSIBLE,
    };
  }
}
