/**
 * SINT deterministic predictive-safety backend.
 *
 * @packageDocumentation
 * @module @sint/engine-effect-simulator
 */

export { BoundedMotionEffectModel } from "./bounded-motion-model.js";
export { DeterministicEffectSimulator } from "./deterministic-effect-simulator.js";
export {
  FileSystemSimulationArtifactStore,
  InMemorySimulationArtifactStore,
} from "./artifact-store.js";
export type {
  AxisAlignedWorkspace,
  BoundedMotionEffectModelOptions,
  DeterministicCheckRecord,
  DeterministicCheckResult,
  DeterministicEffectModel,
  DeterministicEffectSimulatorOptions,
  DeterministicSafetyEnvelope,
  NumericRange,
} from "./types.js";
export type {
  SimulationArtifact,
  SimulationArtifactStore,
  SimulationArtifactStoreError,
  StoredSimulationArtifact,
} from "@pshkv/core";
