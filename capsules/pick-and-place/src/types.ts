/**
 * Pick-and-Place Capsule — Internal types.
 *
 * @module capsule/pick-and-place/types
 */

/** Detected graspable object. */
export interface GraspTarget {
  /** Object label. */
  readonly label: string;
  /** Center position in 3D space. */
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Estimated grasp width in meters. */
  readonly graspWidth: number;
}

/** Grip state from force/torque sensor. */
export interface GripState {
  /** Current grip force in Newtons. */
  readonly forceNewtons: number;
  /** Whether an object is currently held. */
  readonly objectDetected: boolean;
  /** Whether grip force exceeds safe threshold. */
  readonly forceExceeded: boolean;
}

/** Pick-and-place operation phase. */
export type PickPlacePhase =
  | "detect"
  | "approach"
  | "grasp"
  | "lift"
  | "move"
  | "place"
  | "release"
  | "complete"
  | "error";

/** Pick-and-place result. */
export interface PickPlaceResult {
  readonly phase: PickPlacePhase;
  readonly target: GraspTarget | null;
  readonly gripState: GripState | null;
  readonly success: boolean;
  readonly message: string;
}

/** Pick-and-place configuration. */
export interface PickPlaceConfig {
  /** Maximum grip force in Newtons. */
  readonly maxGripForceNewtons: number;
  /** Target grip force for picking. */
  readonly targetGripForceNewtons: number;
  /** Minimum confidence to attempt grasp. */
  readonly minGraspConfidence: number;
}

export const DEFAULT_PICK_PLACE_CONFIG: PickPlaceConfig = {
  maxGripForceNewtons: 50,
  targetGripForceNewtons: 20,
  minGraspConfidence: 0.8,
};
