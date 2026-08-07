import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { loadSimulationWorkerConfig } from "../src/config.js";
import { createConfiguredSimulationRuntime } from "../src/runtime.js";

const digest = (character: string): string => character.repeat(64);

describe("configured simulation worker runtime", () => {
  it("records issuance before returning a receipt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sint-worker-runtime-"));
    const signer = generateKeypair();
    const now = Date.now();
    try {
      const config = loadSimulationWorkerConfig({
        NODE_ENV: "test",
        SINT_SIM_SIGNER_PUBLIC_KEY: signer.publicKey,
        SINT_SIM_SIGNER_PRIVATE_KEY: signer.privateKey,
        SINT_SIM_ARTIFACT_DIR: directory,
      });
      const runtime = createConfiguredSimulationRuntime(config);
      const preflight: SimulationPreflight = {
        kind: "simulation-preflight",
        authorizesExecution: false,
        assignedTier: ApprovalTier.T2_ACT,
        effectPlan: {
          requestDigest: digest("1"),
          effectPlanDigest: digest("2"),
          tokenDigest: digest("3"),
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: {
            velocityMps: 0.2,
            forceNewtons: 10,
            collisions: 0,
            safetyZoneViolations: 0,
          },
        },
        requirement: { minEvidenceGrade: "deterministic" },
      };
      const world: SimulationWorldSnapshot = {
        digest: digest("4"),
        observedAt: new Date(now - 10).toISOString(),
        validUntil: new Date(now + 5_000).toISOString(),
        stateEpoch: "robot:7",
        uncertainty: 0.01,
      };

      const simulated = await runtime.simulator.simulate(preflight, world);

      expect(simulated.ok).toBe(true);
      if (!simulated.ok) return;
      expect(runtime.evidenceLedger.getAll()).toEqual([
        expect.objectContaining({
          eventType: "simulation.receipt.issued",
          payload: expect.objectContaining({
            receiptId: simulated.value.receiptId,
            authorizesExecution: false,
          }),
        }),
      ]);
      expect(runtime.evidenceLedger.verifyChain()).toEqual({ ok: true, value: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
