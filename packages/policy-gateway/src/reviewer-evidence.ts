import { createHash } from "node:crypto";
import {
  canonicalJsonStringify,
  type ISO8601,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

export interface ReviewerEvidenceBundle {
  readonly schemaVersion: "sint.review-evidence.v1";
  readonly generatedAt: ISO8601;
  readonly requestId: string;
  readonly agentId: string;
  readonly authority: {
    readonly tokenId: string;
    readonly issuer: string;
    readonly subject: string;
    readonly resource: string;
    readonly actions: readonly string[];
    readonly expiresAt: ISO8601;
    readonly delegationDepth: number;
    readonly constraints: SintCapabilityToken["constraints"];
  };
  readonly decision: {
    readonly action: PolicyDecision["action"];
    readonly tier: PolicyDecision["assignedTier"];
    readonly risk: PolicyDecision["assignedRisk"];
    readonly reason?: string;
  };
  readonly requestedEffect: {
    readonly resource: string;
    readonly action: string;
    readonly paramsDigest: `sha256:${string}`;
    readonly consequence?: SintRequest["consequenceContext"];
  };
  readonly independentEvidence: {
    readonly hardwareSafety?: NonNullable<SintRequest["executionContext"]>["hardwareSafety"];
    readonly deploymentEvidence?: readonly unknown[];
    readonly factoryReceiptChain?: readonly unknown[];
    readonly simulationEvidence?: unknown;
  };
  readonly evaluatedBy: "PolicyGateway.intercept";
  readonly bundleHash: `sha256:${string}`;
}

function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJsonStringify(value)).digest("hex")}`;
}

/** Build gateway-owned review context; no agent-authored summary is accepted. */
export function buildReviewerEvidenceBundle(
  request: SintRequest,
  decision: PolicyDecision,
  token: SintCapabilityToken,
  generatedAt: ISO8601,
): ReviewerEvidenceBundle {
  const withoutHash = {
    schemaVersion: "sint.review-evidence.v1" as const,
    generatedAt,
    requestId: request.requestId,
    agentId: request.agentId,
    authority: {
      tokenId: token.tokenId,
      issuer: token.issuer,
      subject: token.subject,
      resource: token.resource,
      actions: [...token.actions],
      expiresAt: token.expiresAt,
      delegationDepth: token.delegationChain.depth,
      constraints: token.constraints,
    },
    decision: {
      action: decision.action,
      tier: decision.assignedTier,
      risk: decision.assignedRisk,
      reason: decision.escalation?.reason ?? decision.denial?.reason,
    },
    requestedEffect: {
      resource: request.resource,
      action: request.action,
      paramsDigest: sha256(request.params),
      consequence: request.consequenceContext,
    },
    independentEvidence: {
      hardwareSafety: request.executionContext?.hardwareSafety,
      deploymentEvidence: request.executionContext?.deploymentEvidence,
      factoryReceiptChain: request.executionContext?.factoryReceiptChain,
      simulationEvidence: request.executionContext?.simulationEvidence,
    },
    evaluatedBy: "PolicyGateway.intercept" as const,
  };
  return { ...withoutHash, bundleHash: sha256(withoutHash) };
}
