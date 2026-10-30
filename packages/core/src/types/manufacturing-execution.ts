/**
 * SINT Protocol - Manufacturing execution token types.
 *
 * These types extend the shared deployment-envelope semantics with
 * shop-floor-specific bindings such as part revision, CAM program digests,
 * machine/cell identity, tooling, material lots, and quality evidence.
 */

import type { DeploymentEnvelopeBase } from "./deployment-envelope.js";
import type { InspectionReceipt } from "./inspection.js";
import type { ISO8601, SHA256 } from "./primitives.js";

export interface ManufacturingExecutionContext {
  readonly partNumber?: string;
  readonly revision?: string;
  readonly drawingDigest?: SHA256;
  readonly modelDigest?: SHA256;
  readonly camProgramDigest?: SHA256;
  readonly machineId?: string;
  readonly cellId?: string;
  readonly fixtureSet?: readonly string[];
  readonly toolingSet?: readonly string[];
  readonly materialLotId?: string;
  readonly materialSubstitution?: string;
  readonly allowedMaterialSubstitutions?: readonly string[];
  readonly routeId?: string;
  readonly routeStep?: number;
  readonly qualityPlanDigest?: SHA256;
  readonly inspectionReceiptRef?: string;
  readonly inspectionStatus?: "pass" | "conditional" | "fail";
  readonly inspectedAt?: ISO8601;
  readonly inspectionReceipt?: InspectionReceipt;
  readonly flowdownTags?: readonly string[];
}

export interface ManufacturingExecutionEnvelope
  extends DeploymentEnvelopeBase {
  readonly partNumber?: string;
  readonly revision?: string;
  readonly drawingDigest?: SHA256;
  readonly modelDigest?: SHA256;
  readonly camProgramDigest?: SHA256;
  readonly machineId?: string;
  readonly cellId?: string;
  readonly fixtureSet?: readonly string[];
  readonly toolingSet?: readonly string[];
  readonly materialLotId?: string;
  readonly allowedMaterialSubstitutions?: readonly string[];
  readonly routeId?: string;
  readonly maxRouteStep?: number;
  readonly qualityPlanDigest?: SHA256;
  readonly inspectionRequired?: boolean;
  readonly flowdownTags?: readonly string[];
}
