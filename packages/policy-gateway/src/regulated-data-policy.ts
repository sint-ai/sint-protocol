/**
 * SINT regulated-data runtime policy.
 *
 * Enforces processor, region, model, and context-minimization guardrails for
 * requests that carry `params.regulatedData` metadata.
 */

import {
  ApprovalTier,
  RiskTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

export type RegulatedDataClass = "PHI" | "PII" | "ADMIN" | string;

export interface RegulatedDataFallbackRoute {
  readonly processor: string;
  readonly region: string;
  readonly model: string;
  readonly transformations: readonly string[];
}

export interface RegulatedDataRequestMetadata {
  readonly dataClasses: readonly RegulatedDataClass[];
  readonly purposeOfUse: string;
  readonly processor: string;
  readonly region: string;
  readonly model: string;
  readonly requestedContextFields?: readonly string[];
  readonly fallback?: RegulatedDataFallbackRoute;
}

export interface RegulatedDataPolicyConfig {
  readonly approvedProcessors: readonly string[];
  readonly approvedRegions: readonly string[];
  readonly approvedModels: readonly string[];
  readonly allowedPurposes?: readonly string[];
  readonly allowedContextFieldsByTokenId?: Readonly<Record<string, readonly string[]>>;
}

export interface RegulatedDataPolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

const REGULATED_METADATA_PARAM = "regulatedData";

export class DefaultRegulatedDataPolicyPlugin implements RegulatedDataPolicyPlugin {
  private readonly approvedProcessors: Set<string>;
  private readonly approvedRegions: Set<string>;
  private readonly approvedModels: Set<string>;
  private readonly allowedPurposes?: Set<string>;

  constructor(private readonly config: RegulatedDataPolicyConfig) {
    this.approvedProcessors = new Set(config.approvedProcessors);
    this.approvedRegions = new Set(config.approvedRegions);
    this.approvedModels = new Set(config.approvedModels);
    this.allowedPurposes = config.allowedPurposes
      ? new Set(config.allowedPurposes)
      : undefined;
  }

  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): PolicyDecision | undefined {
    const metadata = parseRegulatedDataMetadata(request.params[REGULATED_METADATA_PARAM]);
    if (!metadata) {
      return undefined;
    }

    const assignedTier = assignRegulatedDataTier(metadata, request);
    const assignedRisk = riskForTier(assignedTier);
    const policy = this.resolveEffectivePolicy(token);

    if (
      policy.allowedPurposes &&
      !policy.allowedPurposes.has(metadata.purposeOfUse)
    ) {
      return deny(
        context,
        assignedTier,
        assignedRisk,
        "PURPOSE_NOT_AUTHORIZED",
        `Purpose of use ${metadata.purposeOfUse} is not authorized`,
      );
    }

    if (!metadata.dataClasses.every((dataClass) => policy.allowedDataClasses?.has(dataClass) ?? true)) {
      return deny(
        context,
        assignedTier,
        assignedRisk,
        "DATA_CLASS_NOT_AUTHORIZED",
        "One or more regulated data classes are not authorized by this token",
      );
    }

    if (this.fallbackAllowed(metadata, policy)) {
      return transform(context, assignedTier, assignedRisk, {
        transformations: metadata.fallback!.transformations,
        fallbackProcessor: metadata.fallback!.processor,
        fallbackRegion: metadata.fallback!.region,
        fallbackModel: metadata.fallback!.model,
        reason: "approved_fallback_route",
      });
    }

    if (!policy.approvedProcessors.has(metadata.processor)) {
      return deny(
        context,
        assignedTier,
        assignedRisk,
        "PROCESSOR_NOT_APPROVED",
        `Processor ${metadata.processor} is not approved for regulated data`,
      );
    }

    if (!policy.approvedRegions.has(metadata.region)) {
      return deny(
        context,
        assignedTier,
        assignedRisk,
        "REGION_NOT_APPROVED",
        `Region ${metadata.region} is not approved for regulated data`,
      );
    }

    if (!policy.approvedModels.has(metadata.model)) {
      return deny(
        context,
        assignedTier,
        assignedRisk,
        "MODEL_NOT_APPROVED",
        `Model ${metadata.model} is not approved for regulated data`,
      );
    }

    const requestedContextFields = metadata.requestedContextFields ?? [];
    if (
      policy.allowedContextFields &&
      exceedsContextScope(requestedContextFields, policy.allowedContextFields)
    ) {
      const minimizedFields = requestedContextFields.filter(
        (field) => !policy.allowedContextFields!.has(field),
      );
      return transform(context, assignedTier, assignedRisk, {
        transformations: ["minimize_context"],
        requestedContextFields,
        effectiveContextFields: requestedContextFields.filter((field) =>
          policy.allowedContextFields!.has(field),
        ),
        minimizedFields,
        reason: "delegated_context_minimized",
      });
    }

    return undefined;
  }

  private fallbackAllowed(
    metadata: RegulatedDataRequestMetadata,
    policy: EffectiveRegulatedDataPolicy,
  ): boolean {
    const fallback = metadata.fallback;
    if (!fallback) {
      return false;
    }
    if (policy.allowFallback === false) {
      return false;
    }
    return (
      policy.approvedProcessors.has(fallback.processor) &&
      policy.approvedRegions.has(fallback.region) &&
      policy.approvedModels.has(fallback.model)
    );
  }

  private resolveEffectivePolicy(token: SintCapabilityToken): EffectiveRegulatedDataPolicy {
    const tokenPolicy = token.regulatedDataPolicy;
    return {
      approvedProcessors: intersectIfPresent(
        this.approvedProcessors,
        tokenPolicy?.approvedProcessors,
      ),
      approvedRegions: intersectIfPresent(
        this.approvedRegions,
        tokenPolicy?.approvedRegions,
      ),
      approvedModels: intersectIfPresent(
        this.approvedModels,
        tokenPolicy?.approvedModels,
      ),
      allowedPurposes: intersectOptionalIfPresent(
        this.allowedPurposes,
        tokenPolicy?.allowedPurposes,
      ),
      allowedDataClasses: tokenPolicy?.allowedDataClasses
        ? new Set(tokenPolicy.allowedDataClasses)
        : undefined,
      allowedContextFields: resolveContextFields(
        this.config.allowedContextFieldsByTokenId?.[token.tokenId],
        tokenPolicy?.allowedContextFields,
      ),
      allowFallback: tokenPolicy?.allowFallback,
    };
  }
}

interface EffectiveRegulatedDataPolicy {
  readonly approvedProcessors: ReadonlySet<string>;
  readonly approvedRegions: ReadonlySet<string>;
  readonly approvedModels: ReadonlySet<string>;
  readonly allowedPurposes?: ReadonlySet<string>;
  readonly allowedDataClasses?: ReadonlySet<string>;
  readonly allowedContextFields?: ReadonlySet<string>;
  readonly allowFallback?: boolean;
}

function parseRegulatedDataMetadata(value: unknown): RegulatedDataRequestMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dataClasses = readStringArray(value.dataClasses);
  const purposeOfUse = readString(value.purposeOfUse);
  const processor = readString(value.processor);
  const region = readString(value.region);
  const model = readString(value.model);
  if (!dataClasses.length || !purposeOfUse || !processor || !region || !model) {
    return undefined;
  }

  const fallback = parseFallback(value.fallback);

  return {
    dataClasses,
    purposeOfUse,
    processor,
    region,
    model,
    requestedContextFields: readStringArray(value.requestedContextFields),
    ...(fallback && { fallback }),
  };
}

function parseFallback(value: unknown): RegulatedDataFallbackRoute | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const processor = readString(value.processor);
  const region = readString(value.region);
  const model = readString(value.model);
  const transformations = readStringArray(value.transformations);
  if (!processor || !region || !model || transformations.length === 0) {
    return undefined;
  }

  return { processor, region, model, transformations };
}

function assignRegulatedDataTier(
  metadata: RegulatedDataRequestMetadata,
  request: SintRequest,
): ApprovalTier {
  if (request.resource.startsWith("health://consent/") && request.action !== "read") {
    return ApprovalTier.T3_COMMIT;
  }
  if (metadata.dataClasses.includes("PHI")) {
    return ApprovalTier.T2_ACT;
  }
  if (metadata.dataClasses.includes("PII")) {
    return ApprovalTier.T1_PREPARE;
  }
  return ApprovalTier.T0_OBSERVE;
}

function riskForTier(tier: ApprovalTier): RiskTier {
  switch (tier) {
    case ApprovalTier.T0_OBSERVE:
      return RiskTier.T0_READ;
    case ApprovalTier.T1_PREPARE:
      return RiskTier.T1_WRITE_LOW;
    case ApprovalTier.T2_ACT:
      return RiskTier.T2_STATEFUL;
    case ApprovalTier.T3_COMMIT:
      return RiskTier.T3_IRREVERSIBLE;
  }
}

function deny(
  context: { readonly requestId: string; readonly timestamp: string },
  assignedTier: ApprovalTier,
  assignedRisk: RiskTier,
  policyViolated: string,
  reason: string,
): PolicyDecision {
  return {
    requestId: context.requestId as any,
    timestamp: context.timestamp as any,
    action: "deny",
    denial: { policyViolated, reason },
    assignedTier,
    assignedRisk,
  };
}

function transform(
  context: { readonly requestId: string; readonly timestamp: string },
  assignedTier: ApprovalTier,
  assignedRisk: RiskTier,
  additionalAuditFields: Record<string, unknown>,
): PolicyDecision {
  return {
    requestId: context.requestId as any,
    timestamp: context.timestamp as any,
    action: "transform",
    transformations: { additionalAuditFields },
    assignedTier,
    assignedRisk,
  };
}

function exceedsContextScope(
  requestedContextFields: readonly string[],
  allowedContextFields: ReadonlySet<string>,
): boolean {
  return requestedContextFields.some((field) => !allowedContextFields.has(field));
}

function intersectIfPresent(
  deploymentAllowed: ReadonlySet<string>,
  tokenAllowed: readonly string[] | undefined,
): ReadonlySet<string> {
  if (!tokenAllowed) {
    return deploymentAllowed;
  }
  const tokenSet = new Set(tokenAllowed);
  return new Set([...deploymentAllowed].filter((value) => tokenSet.has(value)));
}

function intersectOptionalIfPresent(
  deploymentAllowed: ReadonlySet<string> | undefined,
  tokenAllowed: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (!deploymentAllowed && !tokenAllowed) {
    return undefined;
  }
  if (!deploymentAllowed) {
    return new Set(tokenAllowed ?? []);
  }
  return intersectIfPresent(deploymentAllowed, tokenAllowed);
}

function resolveContextFields(
  deploymentFields: readonly string[] | undefined,
  tokenFields: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (!deploymentFields && !tokenFields) {
    return undefined;
  }
  if (!deploymentFields) {
    return new Set(tokenFields ?? []);
  }
  return intersectIfPresent(new Set(deploymentFields), tokenFields);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
