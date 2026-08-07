import {
  BoundedMotionEffectModel,
  DeterministicEffectSimulator,
  FileSystemSimulationArtifactStore,
} from "@pshkv/engine-effect-simulator";
import {
  EvidenceLedgerSimulationReceiptRecorder,
  LedgerWriter,
} from "@pshkv/gate-evidence-ledger";
import type { SimulationWorkerConfig } from "./config.js";

export interface ConfiguredSimulationRuntime {
  readonly simulator: DeterministicEffectSimulator;
  readonly evidenceLedger: LedgerWriter;
}

/** Assemble the worker and its issuance ledger without granting gateway authority. */
export function createConfiguredSimulationRuntime(config: SimulationWorkerConfig): ConfiguredSimulationRuntime {
  const evidenceLedger = new LedgerWriter();
  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: config.signerPublicKey,
    signerPrivateKey: config.signerPrivateKey,
    version: config.version,
    modelDigest: config.modelDigest,
    artifactStore: new FileSystemSimulationArtifactStore(config.artifactDirectory),
    receiptRecorder: new EvidenceLedgerSimulationReceiptRecorder(evidenceLedger),
    models: [new BoundedMotionEffectModel({
      id: config.model.id,
      resources: config.model.resources,
      actions: config.model.actions,
      envelope: config.model.envelope,
    })],
  });
  return { simulator, evidenceLedger };
}

/** Compatibility helper for embedders that only need the simulator contract. */
export function createConfiguredSimulator(config: SimulationWorkerConfig): DeterministicEffectSimulator {
  return createConfiguredSimulationRuntime(config).simulator;
}
