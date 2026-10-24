/**
 * SINT Protocol - Inspection receipt types.
 *
 * Inspection receipts provide structured quality evidence for factory
 * execution gates, downstream routing, and lot-level traceability.
 */

import type { ISO8601, SHA256, UUIDv7 } from "./primitives.js";

export type InspectionCalibrationState = "fresh" | "stale" | "expired" | "unknown";
export type InspectionDisposition = "pass" | "conditional" | "fail";

export interface InspectionFeatureResult {
  readonly featureName: string;
  readonly measuredValue: number;
  readonly nominalValue?: number;
  readonly lowerTolerance?: number;
  readonly upperTolerance?: number;
  readonly unit?: string;
  readonly withinTolerance: boolean;
}

export interface InspectionReceipt {
  readonly receiptId: UUIDv7;
  readonly receiptRef?: string;
  readonly partNumber?: string;
  readonly revision?: string;
  readonly inspectionPlanDigest?: SHA256;
  readonly machineId?: string;
  readonly cellId?: string;
  readonly instrumentId?: string;
  readonly calibrationState: InspectionCalibrationState;
  readonly calibrationValidUntil?: ISO8601;
  readonly measuredFeatureResults: readonly InspectionFeatureResult[];
  readonly disposition: InspectionDisposition;
  readonly approverRef?: string;
  readonly nonconformanceRef?: string;
  readonly reworkRef?: string;
  readonly inspectedAt: ISO8601;
  readonly evidenceRef?: string;
}
