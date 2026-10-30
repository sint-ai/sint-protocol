/**
 * SINT deterministic predictive-safety backend.
 *
 * @packageDocumentation
 * @module @sint/engine-effect-simulator
 */

export { BoundedMotionEffectModel } from "./bounded-motion-model.js";
export { SceneAwareNavigationModel } from "./scene-aware-navigation-model.js";
export { FixedCaseNavigationModel, isValidNavigationScenarioPolicy, navigationScenarioPolicyDigest, sampleNavigationPerturbations } from "./fixed-case-navigation-model.js";
export { FixedCaseBoundedMotionModel, boundedMotionScenarioPolicyDigest, isValidBoundedMotionScenarioPolicy, sampleBoundedMotionPerturbations } from "./fixed-case-bounded-motion-model.js";
export { DeterministicEffectSimulator } from "./deterministic-effect-simulator.js";
export { SoftwareOnlySimulatorAdapter } from "./software-only-simulator-adapter.js";
export type { SoftwareOnlySimulationRecord } from "./software-only-simulator-adapter.js";
export {
  FileSystemSimulationArtifactStore,
  InMemorySimulationArtifactStore,
} from "./artifact-store.js";
export type {
  AxisAlignedWorkspace,
  BoundedMotionEffectModelOptions,
  BoundedMotionScenarioPolicy,
  DeterministicCheckRecord,
  DeterministicCheckResult,
  DeterministicEffectModel,
  DeterministicEffectSimulatorOptions,
  DeterministicSafetyEnvelope,
  NumericRange,
  BoundedMotionStressCase,
  NavigationScenarioPolicy,
  NavigationStressCase,
  SeededBoundedMotionDistribution,
  SeededNavigationDistribution,
  SceneAwareNavigationModelOptions,
} from "./types.js";
export type {
  SimulationArtifact,
  SimulationArtifactStore,
  SimulationArtifactStoreError,
  StoredSimulationArtifact,
} from "@pshkv/core";
