/**
 * SINT Protocol - Per-part factory trace bundle types.
 *
 * Part trace bundles capture the portable evidence thread from material and
 * route planning through inspection, approvals, rework, and final disposition.
 */

import type {
  TraceBundleBase,
} from "./trace-bundle.js";
import type { ISO8601, SHA256 } from "./primitives.js";

export interface PartTraceRouteStep {
  readonly stepId: string;
  readonly operation: string;
  readonly machineId?: string;
  readonly cellId?: string;
  readonly programDigest?: SHA256;
  readonly simulationReceiptRef?: string;
  readonly inspectionReceiptRef?: string;
  readonly approvalRef?: string;
  readonly completedAt?: ISO8601;
}

export type PartTraceDisposition =
  | "release"
  | "hold"
  | "quarantine"
  | "ship";

export interface PartTraceBundle extends TraceBundleBase {
  readonly traceKind: "factory-part";
  readonly partNumber: string;
  readonly revision?: string;
  readonly materialLotId?: string;
  readonly routeId?: string;
  readonly routeSteps: readonly PartTraceRouteStep[];
  readonly authorityTokenRefs: readonly string[];
  readonly inspectionReceiptRefs: readonly string[];
  readonly approvalRefs: readonly string[];
  readonly nonconformanceRefs: readonly string[];
  readonly reworkRefs: readonly string[];
  readonly shipmentDisposition: PartTraceDisposition;
  readonly customerSafe?: boolean;
}
