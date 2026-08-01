import {
  ApprovalTier,
  RiskTier,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

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
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: { readonly requestId: string; readonly timestamp: string },
  ): PolicyDecision | undefined {
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
      const receipt = execution.inspectionReceipt;
      if (receipt) {
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
      } else {
        if (!execution.inspectionReceiptRef || execution.inspectionStatus !== "pass") {
          return deny(context, "FACTORY_PROOF_MISSING", "Inspection receipt is required before factory execution");
        }
        if (!execution.inspectedAt) {
          return deny(context, "FACTORY_PROOF_MISSING", "Inspection timestamp is required before factory execution");
        }
      }
    }

    return undefined;
  }
}
