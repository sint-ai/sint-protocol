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

  const redactedFields =
    mode === "partial"
      ? ["authorityTokenRefs", "approvalRefs"]
      : [
          "authorityTokenRefs",
          "inspectionReceiptRefs",
          "approvalRefs",
          "nonconformanceRefs",
          "reworkRefs",
        ];

  return {
    ...bundle,
    authorityTokenRefs: [],
    inspectionReceiptRefs: mode === "redacted" ? [] : bundle.inspectionReceiptRefs,
    approvalRefs: [],
    nonconformanceRefs: mode === "redacted" ? [] : bundle.nonconformanceRefs,
    reworkRefs: mode === "redacted" ? [] : bundle.reworkRefs,
    customerSafe: true,
    redactionProfile: {
      mode,
      policyRef: "policy://factory/customer-safe-export",
      redactedFields,
      justification: "Customer-safe factory trace export",
    },
  };
}
