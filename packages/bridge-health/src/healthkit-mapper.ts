/**
 * SINT bridge-health — HealthKit / Health Connect Mapper
 *
 * Maps Apple HealthKit and Google Health Connect data types to SINT
 * resource URIs with on-device governance. Implements Phase 5 health
 * fabric with differential privacy and user-owned keys.
 *
 * @module @pshkv/bridge-health/healthkit-mapper
 */

import { ApprovalTier } from "@sint-ai/core";

/**
 * HealthKit quantity type identifiers (subset of most common types).
 * Full list: https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier
 */
export type HealthKitQuantityType =
  | "HKQuantityTypeIdentifierStepCount"
  | "HKQuantityTypeIdentifierDistanceWalkingRunning"
  | "HKQuantityTypeIdentifierHeartRate"
  | "HKQuantityTypeIdentifierRestingHeartRate"
  | "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
  | "HKQuantityTypeIdentifierBodyMass"
  | "HKQuantityTypeIdentifierHeight"
  | "HKQuantityTypeIdentifierBodyMassIndex"
  | "HKQuantityTypeIdentifierBloodPressureSystolic"
  | "HKQuantityTypeIdentifierBloodPressureDiastolic"
  | "HKQuantityTypeIdentifierBloodGlucose"
  | "HKQuantityTypeIdentifierOxygenSaturation"
  | "HKQuantityTypeIdentifierBodyTemperature"
  | "HKQuantityTypeIdentifierRespiratoryRate"
  | "HKQuantityTypeIdentifierActiveEnergyBurned"
  | "HKQuantityTypeIdentifierBasalEnergyBurned"
  | "HKQuantityTypeIdentifierVO2Max";

/**
 * HealthKit category type identifiers.
 */
export type HealthKitCategoryType =
  | "HKCategoryTypeIdentifierSleepAnalysis"
  | "HKCategoryTypeIdentifierMindfulSession"
  | "HKCategoryTypeIdentifierAppleStandHour"
  | "HKCategoryTypeIdentifierHighHeartRateEvent"
  | "HKCategoryTypeIdentifierLowHeartRateEvent"
  | "HKCategoryTypeIdentifierIrregularHeartRhythmEvent";

/**
 * Union of all HealthKit data types.
 */
export type HealthKitDataType = HealthKitQuantityType | HealthKitCategoryType;

/**
 * HealthKit permission types.
 */
export type HealthKitPermission = "read" | "write" | "share";

/**
 * Data sensitivity tiers for health data.
 * Used to determine egress policies and differential privacy budgets.
 */
export enum DataSensitivity {
  /** Public aggregates (e.g., daily step count average) */
  PUBLIC = "public",
  /** Personal insights (e.g., weekly trends, correlations) */
  PERSONAL = "personal",
  /** Raw sensor data (e.g., real-time heart rate waveform) */
  RAW = "raw",
  /** Medical records (e.g., diagnoses, prescriptions) */
  MEDICAL = "medical",
}

/**
 * HealthKit access context for Policy Gateway.
 */
export interface HealthKitAccessContext {
  /** HealthKit data type identifier */
  dataType: HealthKitDataType;
  /** Permission being requested */
  permission: HealthKitPermission;
  /** Date range for data access (optional) */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Data aggregation level (affects sensitivity tier) */
  aggregation?: "raw" | "hourly" | "daily" | "weekly" | "monthly";
  /** Destination for data egress (undefined = on-device only) */
  destination?: string;
}

/**
 * SINT resource mapping for HealthKit access.
 */
export interface HealthKitResourceMapping {
  /** SINT resource URI (e.g., healthkit://local/HKQuantityTypeIdentifierStepCount) */
  resource: string;
  /** SINT action (read, write, share) */
  action: string;
  /** Minimum required approval tier */
  tier: ApprovalTier;
  /** Data sensitivity classification */
  sensitivity: DataSensitivity;
  /** Whether data stays on-device */
  onDeviceOnly: boolean;
  /** Additional context */
  context: {
    dataType: HealthKitDataType;
    permission: HealthKitPermission;
    aggregation?: string;
    destination?: string;
  };
}

/**
 * Default sensitivity classifications for HealthKit data types.
 */
export const HEALTHKIT_SENSITIVITY_DEFAULTS: Record<HealthKitDataType, DataSensitivity> = {
  // Fitness metrics (less sensitive)
  "HKQuantityTypeIdentifierStepCount": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierDistanceWalkingRunning": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierActiveEnergyBurned": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierBasalEnergyBurned": DataSensitivity.PERSONAL,
  "HKCategoryTypeIdentifierAppleStandHour": DataSensitivity.PERSONAL,
  
  // Body measurements (moderately sensitive)
  "HKQuantityTypeIdentifierBodyMass": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierHeight": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierBodyMassIndex": DataSensitivity.PERSONAL,
  
  // Vital signs (sensitive - medical relevance)
  "HKQuantityTypeIdentifierHeartRate": DataSensitivity.RAW,
  "HKQuantityTypeIdentifierRestingHeartRate": DataSensitivity.PERSONAL,
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": DataSensitivity.RAW,
  "HKQuantityTypeIdentifierBloodPressureSystolic": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierBloodPressureDiastolic": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierBloodGlucose": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierOxygenSaturation": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierBodyTemperature": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierRespiratoryRate": DataSensitivity.MEDICAL,
  "HKQuantityTypeIdentifierVO2Max": DataSensitivity.PERSONAL,
  
  // Sleep and mindfulness
  "HKCategoryTypeIdentifierSleepAnalysis": DataSensitivity.PERSONAL,
  "HKCategoryTypeIdentifierMindfulSession": DataSensitivity.PERSONAL,
  
  // Cardiac events (highly sensitive - medical alerts)
  "HKCategoryTypeIdentifierHighHeartRateEvent": DataSensitivity.MEDICAL,
  "HKCategoryTypeIdentifierLowHeartRateEvent": DataSensitivity.MEDICAL,
  "HKCategoryTypeIdentifierIrregularHeartRhythmEvent": DataSensitivity.MEDICAL,
};

/**
 * Map a HealthKit data access to a SINT resource URI and action.
 *
 * @param context - HealthKit access context
 * @returns SINT resource mapping with tier and sensitivity
 *
 * @example
 * ```ts
 * const mapping = mapHealthKitToSint({
 *   dataType: 'HKQuantityTypeIdentifierHeartRate',
 *   permission: 'read',
 *   aggregation: 'daily',
 *   destination: undefined, // on-device only
 * });
 * // Returns:
 * // {
 * //   resource: 'healthkit://local/HKQuantityTypeIdentifierHeartRate',
 * //   action: 'read',
 * //   tier: ApprovalTier.T0_OBSERVE,
 * //   sensitivity: DataSensitivity.PERSONAL, // downgraded from RAW due to daily aggregation
 * //   onDeviceOnly: true,
 * //   context: { ... }
 * // }
 * ```
 */
export function mapHealthKitToSint(context: HealthKitAccessContext): HealthKitResourceMapping {
  const { dataType, permission, aggregation, destination } = context;
  
  // Construct SINT resource URI
  const resource = `healthkit://local/${dataType}`;
  
  // Get base sensitivity for data type
  let sensitivity = HEALTHKIT_SENSITIVITY_DEFAULTS[dataType] ?? DataSensitivity.PERSONAL;
  
  // Downgrade sensitivity if aggregated
  if (aggregation && aggregation !== "raw") {
    if (sensitivity === DataSensitivity.RAW) {
      sensitivity = DataSensitivity.PERSONAL; // Aggregation removes raw waveform details
    }
  }
  
  // Determine if data stays on-device
  const onDeviceOnly = destination === undefined;
  
  // Determine tier based on permission and destination
  let tier: ApprovalTier;
  
  if (permission === "read" && onDeviceOnly) {
    // On-device reads: T0 (no egress)
    tier = ApprovalTier.T0_OBSERVE;
  } else if (permission === "read" && !onDeviceOnly) {
    // Off-device reads (sharing): T1 or T2 depending on sensitivity
    tier = sensitivity === DataSensitivity.MEDICAL
      ? ApprovalTier.T2_ACT
      : ApprovalTier.T1_PREPARE;
  } else if (permission === "write") {
    // Writing health data: T1 (logged, auto-allow for personal use)
    tier = ApprovalTier.T1_PREPARE;
  } else if (permission === "share") {
    // Explicit sharing: T2 (requires approval)
    tier = ApprovalTier.T2_ACT;
  } else {
    tier = ApprovalTier.T1_PREPARE;
  }
  
  return {
    resource,
    action: permission,
    tier,
    sensitivity,
    onDeviceOnly,
    context: {
      dataType,
      permission,
      aggregation,
      destination,
    },
  };
}

/**
 * Check if a HealthKit data type requires caregiver delegation token.
 * Medical-grade data (blood pressure, glucose, cardiac events) requires
 * explicit delegation for third-party access.
 *
 * @param dataType - HealthKit data type
 * @returns true if caregiver delegation required
 */
export function requiresCaregiverDelegation(dataType: HealthKitDataType): boolean {
  const sensitivity = HEALTHKIT_SENSITIVITY_DEFAULTS[dataType];
  return sensitivity === DataSensitivity.MEDICAL;
}

/**
 * Compute differential privacy epsilon budget for a HealthKit query.
 * Lower epsilon = more privacy, noisier results.
 *
 * @param dataType - HealthKit data type
 * @param aggregation - Aggregation level
 * @param queriesPerformed - Number of queries already performed
 * @returns Recommended epsilon value (privacy budget)
 *
 * @example
 * ```ts
 * const epsilon = computePrivacyBudget(
 *   'HKQuantityTypeIdentifierHeartRate',
 *   'daily',
 *   5 // 5 queries already performed this month
 * );
 * // Returns lower epsilon (more privacy) as query count increases
 * ```
 */
export function computePrivacyBudget(
  dataType: HealthKitDataType,
  aggregation: string = "raw",
  queriesPerformed: number = 0
): number {
  const sensitivity = HEALTHKIT_SENSITIVITY_DEFAULTS[dataType];
  
  // Base epsilon by sensitivity
  let baseEpsilon: number;
  switch (sensitivity) {
    case DataSensitivity.PUBLIC:
      baseEpsilon = 10.0; // High epsilon (low privacy) for public aggregates
      break;
    case DataSensitivity.PERSONAL:
      baseEpsilon = 1.0;  // Medium epsilon
      break;
    case DataSensitivity.RAW:
      baseEpsilon = 0.5;  // Low epsilon (high privacy)
      break;
    case DataSensitivity.MEDICAL:
      baseEpsilon = 0.1;  // Very low epsilon (strict privacy)
      break;
  }
  
  // Adjust for aggregation level (more aggregation = less privacy needed)
  const aggregationMultiplier = {
    "raw": 1.0,
    "hourly": 1.5,
    "daily": 2.0,
    "weekly": 3.0,
    "monthly": 4.0,
  }[aggregation] ?? 1.0;
  
  baseEpsilon *= aggregationMultiplier;
  
  // Decrease epsilon as more queries are performed (privacy budget depletion)
  const depletionFactor = Math.max(0.1, 1 - (queriesPerformed * 0.05));
  
  return baseEpsilon * depletionFactor;
}

/**
 * Get human-readable description of a HealthKit data type.
 *
 * @param dataType - HealthKit data type identifier
 * @returns User-friendly description
 */
export function getHealthKitDescription(dataType: HealthKitDataType): string {
  const descriptions: Record<HealthKitDataType, string> = {
    "HKQuantityTypeIdentifierStepCount": "Step count",
    "HKQuantityTypeIdentifierDistanceWalkingRunning": "Walking/running distance",
    "HKQuantityTypeIdentifierHeartRate": "Heart rate",
    "HKQuantityTypeIdentifierRestingHeartRate": "Resting heart rate",
    "HKQuantityTypeIdentifierHeartRateVariabilitySDNN": "Heart rate variability",
    "HKQuantityTypeIdentifierBodyMass": "Body weight",
    "HKQuantityTypeIdentifierHeight": "Height",
    "HKQuantityTypeIdentifierBodyMassIndex": "Body mass index (BMI)",
    "HKQuantityTypeIdentifierBloodPressureSystolic": "Blood pressure (systolic)",
    "HKQuantityTypeIdentifierBloodPressureDiastolic": "Blood pressure (diastolic)",
    "HKQuantityTypeIdentifierBloodGlucose": "Blood glucose",
    "HKQuantityTypeIdentifierOxygenSaturation": "Blood oxygen saturation",
    "HKQuantityTypeIdentifierBodyTemperature": "Body temperature",
    "HKQuantityTypeIdentifierRespiratoryRate": "Respiratory rate",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "Active calories burned",
    "HKQuantityTypeIdentifierBasalEnergyBurned": "Resting calories burned",
    "HKQuantityTypeIdentifierVO2Max": "VO2 max (cardio fitness)",
    "HKCategoryTypeIdentifierSleepAnalysis": "Sleep analysis",
    "HKCategoryTypeIdentifierMindfulSession": "Mindfulness sessions",
    "HKCategoryTypeIdentifierAppleStandHour": "Stand hours",
    "HKCategoryTypeIdentifierHighHeartRateEvent": "High heart rate alert",
    "HKCategoryTypeIdentifierLowHeartRateEvent": "Low heart rate alert",
    "HKCategoryTypeIdentifierIrregularHeartRhythmEvent": "Irregular heart rhythm alert",
  };
  
  return descriptions[dataType] ?? dataType;
}
