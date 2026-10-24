import {
  ApprovalTier,
  RiskTier,
  canonicalJsonStringify,
  inspectionReceiptSchema,
  type InspectionReceipt,
  type Result,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";
import { evaluateDeploymentEvidenceRequirements, type DeploymentEvidenceResolver } from "./deployment-envelope-policy.js";

/** Resolve a receipt from an authenticated, operator-controlled quality system. */
export type InspectionReceiptResolver = (
  reference: string,
) => Result<InspectionReceipt, { readonly message: string }>
  | Promise<Result<InspectionReceipt, { readonly message: string }>>;

export interface ManufacturingExecutionPolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

function deny(
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

function sameSet(
  expected?: readonly string[],
  observed?: readonly string[],
): boolean {
  if (!expected) return true;
  if (!observed) return false;
  const observedSet = new Set(observed);
  return expected.every((value) => observedSet.has(value));
}

export class DefaultManufacturingExecutionPolicy
  implements ManufacturingExecutionPolicyPlugin
{
  constructor(
    private readonly resolveEvidence?: DeploymentEvidenceResolver,
    private readonly resolveInspectionReceipt?: InspectionReceiptResolver,
  ) {}

  async evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): Promise<PolicyDecision | undefined> {
    const envelope = token.manufacturingEnvelope;
    if (!envelope) return undefined;

    const execution = request.executionContext?.manufacturingExecution;
    if (!execution) {
      return deny(
        context,
        "FACTORY_PROOF_MISSING",
        "Manufacturing execution envelope requires manufacturing execution context",
      );
    }

    const binding = envelope.contextualBinding;
    if (binding) {
      if (binding.deploymentProfile !== undefined && request.executionContext?.deploymentProfile !== binding.deploymentProfile) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Deployment profile does not match manufacturing binding");
      }
      if (binding.siteId !== undefined && request.executionContext?.siteId !== binding.siteId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Site does not match manufacturing binding");
      }
      if (binding.bridgeId !== undefined && request.executionContext?.bridgeId !== binding.bridgeId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Bridge does not match manufacturing binding");
      }
      if (binding.bridgeProtocol !== undefined && request.executionContext?.bridgeProtocol !== binding.bridgeProtocol) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Bridge protocol does not match manufacturing binding");
      }
      if (binding.controllerId !== undefined && request.executionContext?.hardwareSafety?.controllerId !== binding.controllerId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Controller does not match manufacturing binding");
      }
      if (binding.robotId !== undefined && request.executionContext?.executor?.nodeId !== binding.robotId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Robot does not match manufacturing binding");
      }
      if (binding.fleetId !== undefined && request.executionContext?.executor?.runtimeId !== binding.fleetId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Fleet does not match manufacturing binding");
      }
      if (binding.zoneId !== undefined && request.executionContext?.preapprovedCorridor?.corridorId !== binding.zoneId) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Zone does not match manufacturing binding");
      }
      if (binding.resource !== undefined && request.resource !== binding.resource) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Resource does not match manufacturing binding");
      }
      if (binding.action !== undefined && request.action !== binding.action) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Action does not match manufacturing binding");
      }
    }

    if (envelope.partNumber !== undefined && execution.partNumber !== envelope.partNumber) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Part number does not match manufacturing envelope");
    }
    if (envelope.revision !== undefined && execution.revision !== envelope.revision) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Revision does not match manufacturing envelope");
    }
    if (envelope.drawingDigest !== undefined && execution.drawingDigest !== envelope.drawingDigest) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Drawing digest does not match manufacturing envelope");
    }
    if (envelope.modelDigest !== undefined && execution.modelDigest !== envelope.modelDigest) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Model digest does not match manufacturing envelope");
    }
    if (envelope.camProgramDigest !== undefined && execution.camProgramDigest !== envelope.camProgramDigest) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "CAM program digest does not match manufacturing envelope");
    }
    if (envelope.machineId !== undefined && execution.machineId !== envelope.machineId) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Machine does not match manufacturing envelope");
    }
    if (envelope.cellId !== undefined && execution.cellId !== envelope.cellId) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Cell does not match manufacturing envelope");
    }
    if (!sameSet(envelope.fixtureSet, execution.fixtureSet)) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Fixture set does not satisfy manufacturing envelope");
    }
    if (!sameSet(envelope.toolingSet, execution.toolingSet)) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Tooling set does not satisfy manufacturing envelope");
    }
    if (envelope.materialLotId !== undefined && execution.materialLotId !== envelope.materialLotId) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Material lot does not match manufacturing envelope");
    }
    if (
      envelope.allowedMaterialSubstitutions?.length
      && execution.materialSubstitution
      && !envelope.allowedMaterialSubstitutions.includes(execution.materialSubstitution)
    ) {
      return deny(
        context,
        "FACTORY_CONTEXT_MISMATCH",
        "Material substitution is not allowed by manufacturing envelope",
      );
    }
    if (envelope.routeId !== undefined && execution.routeId !== envelope.routeId) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Route does not match manufacturing envelope");
    }
    if (envelope.maxRouteStep !== undefined) {
      if (execution.routeStep === undefined) {
        return deny(context, "FACTORY_PROOF_MISSING", "Route step evidence is required by the manufacturing envelope");
      }
      if (execution.routeStep > envelope.maxRouteStep) {
        return deny(context, "FACTORY_SEQUENCE_VIOLATION", "Route step exceeds manufacturing envelope limit");
      }
    }
    if (envelope.qualityPlanDigest !== undefined && execution.qualityPlanDigest !== envelope.qualityPlanDigest) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Quality plan digest does not match manufacturing envelope");
    }
    if (envelope.flowdownTags?.length && !sameSet(envelope.flowdownTags, execution.flowdownTags)) {
      return deny(context, "FACTORY_CONTEXT_MISMATCH", "Flowdown tags do not satisfy manufacturing envelope");
    }
    if (envelope.inspectionRequired === true) {
      const inlineReceipt = execution.inspectionReceipt;
      const reference = execution.inspectionReceiptRef ?? inlineReceipt?.receiptRef ?? inlineReceipt?.receiptId;
      if (!reference || !this.resolveInspectionReceipt) {
        return deny(context, "FACTORY_PROOF_MISSING", "Inspection requires a trusted receipt resolver and reference");
      }
      const resolved = await this.resolveInspectionReceipt(reference);
      if (!resolved.ok || !inspectionReceiptSchema.safeParse(resolved.value).success) {
        return deny(context, "FACTORY_PROOF_MISSING", "Inspection receipt could not be authenticated");
      }
      const receipt = resolved.value;
      if ((receipt.receiptRef !== reference && receipt.receiptId !== reference)
        || (inlineReceipt && canonicalJsonStringify(inlineReceipt) !== canonicalJsonStringify(receipt))) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection receipt does not match the authenticated record");
      }
      const now = Date.now();
      const inspectedAt = Date.parse(receipt.inspectedAt);
      const calibratedUntil = Date.parse(receipt.calibrationValidUntil ?? "");
      if (!Number.isFinite(inspectedAt) || inspectedAt > now + 5_000
        || !Number.isFinite(calibratedUntil) || calibratedUntil <= now || calibratedUntil <= inspectedAt) {
        return deny(context, "FACTORY_PROOF_MISSING", "Inspection timestamp or calibration validity is invalid or expired");
      }
      if (receipt.measuredFeatureResults.length === 0 || receipt.measuredFeatureResults.some(feature => {
        if (!feature.withinTolerance || !Number.isFinite(feature.measuredValue)) return true;
        if (feature.nominalValue !== undefined && !Number.isFinite(feature.nominalValue)) return true;
        if (feature.lowerTolerance !== undefined && !Number.isFinite(feature.lowerTolerance)) return true;
        if (feature.upperTolerance !== undefined && !Number.isFinite(feature.upperTolerance)) return true;
        if (feature.lowerTolerance !== undefined && feature.upperTolerance !== undefined
          && feature.lowerTolerance > feature.upperTolerance) return true;
        if (feature.lowerTolerance === undefined && feature.upperTolerance === undefined) return false;
        if (feature.nominalValue === undefined) return true;
        const deviation = feature.measuredValue - feature.nominalValue;
        return (feature.lowerTolerance !== undefined && deviation < feature.lowerTolerance)
          || (feature.upperTolerance !== undefined && deviation > feature.upperTolerance);
      })) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection measurements do not satisfy their tolerance limits");
      }
      const authorizedPart = envelope.partNumber ?? execution.partNumber;
      if (authorizedPart !== undefined && receipt.partNumber !== authorizedPart) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection receipt part number does not match the authorized part");
      }
      const authorizedRevision = envelope.revision ?? execution.revision;
      if (authorizedRevision !== undefined && receipt.revision !== authorizedRevision) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection receipt revision does not match the authorized revision");
      }
      if (receipt.disposition !== "pass") {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection receipt disposition must be pass before factory execution");
      }
      if (receipt.calibrationState !== "fresh") {
        return deny(context, "FACTORY_PROOF_MISSING", "Inspection calibration must be fresh before factory execution");
      }
      if (!receipt.inspectedAt) {
        return deny(context, "FACTORY_PROOF_MISSING", "Inspection timestamp is required before factory execution");
      }
      if (envelope.qualityPlanDigest !== undefined && receipt.inspectionPlanDigest !== envelope.qualityPlanDigest) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection plan digest does not match manufacturing envelope");
      }
      if (execution.inspectionReceiptRef && receipt.receiptRef && execution.inspectionReceiptRef !== receipt.receiptRef) {
        return deny(context, "FACTORY_CONTEXT_MISMATCH", "Inspection receipt ref does not match manufacturing execution context");
      }
    }

    const inheritedDenial = await evaluateDeploymentEvidenceRequirements(envelope, request, this.resolveEvidence);
    if (inheritedDenial) {
      return deny(context, inheritedDenial.policyViolated, inheritedDenial.reason);
    }

    return undefined;
  }
}
