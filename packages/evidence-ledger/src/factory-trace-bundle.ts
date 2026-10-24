import {
  type PartTraceBundle,
} from "@pshkv/core";
import { buildTraceBundle, verifyTraceBundle } from "./trace-bundle.js";
import { partTraceBundleSchema } from "@pshkv/core";

export type PartTraceBundleInput = Omit<
  PartTraceBundle,
  "bundleHash" | "signature" | "signerPublicKey"
>;

export function buildPartTraceBundle(params: {
  readonly bundle: PartTraceBundleInput;
  readonly signerPublicKey: string;
  readonly signFn: (data: string) => string;
}): PartTraceBundle {
  return buildTraceBundle({
    bundle: params.bundle,
    signerPublicKey: params.signerPublicKey,
    signFn: params.signFn,
  }) as PartTraceBundle;
}

export function verifyPartTraceBundle(
  bundle: PartTraceBundle,
  verifySignatureFn: (
    publicKey: string,
    signature: string,
    data: string,
  ) => boolean,
): boolean {
  const parsed = partTraceBundleSchema.safeParse(bundle);
  if (!parsed.success) return false;

  return verifyTraceBundle(parsed.data, verifySignatureFn);
}

export function redactPartTraceBundle(
  bundle: PartTraceBundleInput,
  mode: "unredacted" | "partial" | "redacted",
): PartTraceBundleInput {
  if (mode === "unredacted") return bundle;

  const redactInspection = mode === "redacted";
  const redactedFields =
    mode === "partial"
      ? ["authorityTokenRefs", "approvalRefs", "routeSteps.approvalRef"]
      : [
          "authorityTokenRefs",
          "inspectionReceiptRefs",
          "approvalRefs",
          "nonconformanceRefs",
          "reworkRefs",
          "routeSteps.approvalRef",
          "routeSteps.inspectionReceiptRef",
          "evidenceArtifacts",
        ];

  // The same identifiers removed from the top-level ref arrays also appear in
  // nested route steps and in evidence artifacts; a customer-safe export must
  // strip them everywhere, not just at the top level.
  const redactedRefs = new Set<string>([...bundle.authorityTokenRefs, ...bundle.approvalRefs]);
  if (redactInspection) {
    bundle.inspectionReceiptRefs.forEach((ref) => redactedRefs.add(ref));
    bundle.nonconformanceRefs.forEach((ref) => redactedRefs.add(ref));
    bundle.reworkRefs.forEach((ref) => redactedRefs.add(ref));
  }

  const routeSteps = bundle.routeSteps.map((step) => {
    // approvalRef is always redacted (mirrors the top-level approvalRefs);
    // inspectionReceiptRef is redacted only in the fully redacted mode.
    const { approvalRef: _approvalRef, inspectionReceiptRef, ...rest } = step;
    if (_approvalRef !== undefined) redactedRefs.add(_approvalRef);
    if (redactInspection && inspectionReceiptRef !== undefined) redactedRefs.add(inspectionReceiptRef);
    return redactInspection || inspectionReceiptRef === undefined
      ? rest
      : { ...rest, inspectionReceiptRef };
  });

  const evidenceArtifacts = bundle.evidenceArtifacts.filter(
    (artifact) => !redactedRefs.has(artifact.evidenceRef),
  );

  return {
    ...bundle,
    routeSteps,
    evidenceArtifacts,
    authorityTokenRefs: [],
    inspectionReceiptRefs: redactInspection ? [] : bundle.inspectionReceiptRefs,
    approvalRefs: [],
    nonconformanceRefs: redactInspection ? [] : bundle.nonconformanceRefs,
    reworkRefs: redactInspection ? [] : bundle.reworkRefs,
    customerSafe: true,
    redactionProfile: {
      mode,
      policyRef: "policy://factory/customer-safe-export",
      redactedFields,
      justification: "Customer-safe factory trace export",
    },
  };
}
