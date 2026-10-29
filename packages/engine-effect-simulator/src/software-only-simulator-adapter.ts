import type {
  EffectSimulator,
  EffectSimulationError,
  Result,
  SimulationEvidenceReceipt,
  SimulationPreflight,
  SimulationWorldSnapshot,
} from "@pshkv/core";

/** One completed software-only run. Physics engines are outside this record. */
export interface SoftwareOnlySimulationRecord {
  readonly outcome: "pass" | "fail" | "indeterminate";
  readonly backend: string;
  readonly evidenceGrade: "deterministic";
}

/**
 * Wraps a software effect simulator and keeps the outcomes it actually returned.
 * Pass, fail, and indeterminate are recorded. A simulator error is not an outcome.
 * The receipt backend stays the inner software worker. This adapter does not
 * name a physics engine.
 */
export class SoftwareOnlySimulatorAdapter implements EffectSimulator {
  readonly backend: string;
  readonly supportedGrades = ["deterministic"] as const;
  private readonly runs: SoftwareOnlySimulationRecord[] = [];

  constructor(private readonly inner: EffectSimulator) {
    this.backend = inner.backend;
  }

  get records(): readonly SoftwareOnlySimulationRecord[] {
    return this.runs;
  }

  async simulate(
    preflight: SimulationPreflight,
    worldSnapshot?: SimulationWorldSnapshot,
  ): Promise<Result<SimulationEvidenceReceipt, EffectSimulationError>> {
    const simulated = await this.inner.simulate(preflight, worldSnapshot);
    if (!simulated.ok) return simulated;
    this.runs.push({
      outcome: simulated.value.result.outcome,
      backend: simulated.value.simulator.backend,
      evidenceGrade: "deterministic",
    });
    return simulated;
  }
}
