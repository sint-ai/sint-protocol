/**
 * Inspection Capsule — Internal types.
 *
 * @module capsule/inspection/types
 */

/** Defect classification result. */
export interface DefectClassification {
  /** Defect type label. */
  readonly label: string;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Region of interest (normalized coordinates 0-1). */
  readonly region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Inspection result for a single frame. */
export interface InspectionResult {
  /** Timestamp of inspection. */
  readonly timestamp: string;
  /** Whether any defects were detected. */
  readonly hasDefects: boolean;
  /** List of detected defects. */
  readonly defects: readonly DefectClassification[];
  /** Overall quality score in [0, 1] (1 = perfect). */
  readonly qualityScore: number;
}

/** Inspection capsule configuration. */
export interface InspectionConfig {
  /** Minimum confidence to report a defect. */
  readonly confidenceThreshold: number;
  /** Maximum defects to report per frame. */
  readonly maxDefectsPerFrame: number;
}

export const DEFAULT_INSPECTION_CONFIG: InspectionConfig = {
  confidenceThreshold: 0.7,
  maxDefectsPerFrame: 10,
};
