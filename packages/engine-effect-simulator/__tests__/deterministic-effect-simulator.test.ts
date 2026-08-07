import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApprovalTier,
  ok,
  simulationEvidenceReceiptSchema,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import {
  generateKeypair,
  verify,
} from "@pshkv/gate-capability-tokens";
import { computeSimulationEvidenceSigningPayload } from "@pshkv/gate-policy-gateway";
import {
  BoundedMotionEffectModel,
  DeterministicEffectSimulator,
  FileSystemSimulationArtifactStore,
  InMemorySimulationArtifactStore,
} from "../src/index.js";

const signer = generateKeypair();
const now = Date.now();
const digest = (character: string): string => character.repeat(64);

function world(overrides: Partial<SimulationWorldSnapshot> = {}): SimulationWorldSnapshot {
  return {
    digest: digest("a"),
    observedAt: new Date(now - 100).toISOString(),
    validUntil: new Date(now + 10_000).toISOString(),
    stateEpoch: "cell-7:42",
    uncertainty: 0.01,
    ...overrides,
  };
}

function preflight(
  params: Record<string, unknown>,
  overrides: Partial<SimulationPreflight> = {},
): SimulationPreflight {
  return {
    kind: "simulation-preflight",
    authorizesExecution: false,
    assignedTier: ApprovalTier.T2_ACT,
    effectPlan: {
      requestDigest: digest("1"),
      effectPlanDigest: digest("2"),
      tokenDigest: digest("3"),
      resource: "ros2:///arm/command",
      action: "publish",
      params,
    },
    requirement: { minEvidenceGrade: "deterministic" },
    ...overrides,
  };
}

function simulator(artifactStore = new InMemorySimulationArtifactStore()) {
  return new DeterministicEffectSimulator({
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    version: "0.1.0",
    modelDigest: digest("b"),
    imageDigest: digest("c"),
    receiptTtlMs: 5_000,
    bindings: { robotId: "arm-7", controllerId: "ctrl-7" },
    now: () => now,
    artifactStore,
    receiptRecorder: { recordIssued: async () => ok(undefined) },
    models: [new BoundedMotionEffectModel({
      resources: ["ros2:///arm/command"],
      actions: ["publish"],
      envelope: {
        jointLimits: { shoulder: { min: -1.5, max: 1.5 } },
        workspace: {
          x: { min: 0, max: 2 },
          y: { min: -1, max: 1 },
          z: { min: 0, max: 2.5 },
        },
        maxVelocityMps: 0.5,
        maxForceNewtons: 80,
        minClearanceMeters: 0.2,
      },
    })],
  });
}

const safeParams = {
  jointPositions: { shoulder: 0.25 },
  target: { x: 1, y: 0.2, z: 1.4 },
  velocityMps: 0.3,
  forceNewtons: 45,
  clearanceMeters: 0.4,
  collisions: 0,
  safetyZoneViolations: 0,
};

describe("DeterministicEffectSimulator", () => {
  it("issues a signed, exactly bound V2 receipt for a safe bounded motion", async () => {
    const artifactStore = new InMemorySimulationArtifactStore();
    const simulated = await simulator(artifactStore).simulate(preflight(safeParams), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("pass");
    expect(simulated.value.evidenceGrade).toBe("deterministic");
    expect(simulated.value.effectPlanDigest).toBe(digest("2"));
    expect(simulated.value.worldSnapshot.stateEpoch).toBe("cell-7:42");
    expect(simulated.value.bindings).toEqual({ robotId: "arm-7", controllerId: "ctrl-7" });
    expect(simulated.value.scenarios).toMatchObject({ runCount: 1, coverage: 1 });
    expect(simulationEvidenceReceiptSchema.safeParse(simulated.value).success).toBe(true);
    expect(verify(
      signer.publicKey,
      simulated.value.signature,
      computeSimulationEvidenceSigningPayload(simulated.value),
    )).toBe(true);
    const artifact = await artifactStore.get(simulated.value.artifactDigest);
    expect(artifact.ok).toBe(true);
    if (artifact.ok) {
      expect(JSON.parse(artifact.value.content)).toMatchObject({
        schemaVersion: "1.0.0",
        effectPlanDigest: digest("2"),
        worldSnapshotDigest: digest("a"),
      });
    }
  });

  it("issues a signed fail result when a declared bound is exceeded", async () => {
    const simulated = await simulator().simulate(preflight({
      ...safeParams,
      velocityMps: 0.8,
      target: { x: 3, y: 0, z: 1 },
    }), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("fail");
    expect(simulated.value.result.maxVelocityMps).toBe(0.8);
  });

  it("returns indeterminate evidence when a configured observation is missing", async () => {
    const { clearanceMeters: _clearanceMeters, ...missingClearance } = safeParams;
    const simulated = await simulator().simulate(preflight(missingClearance), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("indeterminate");
    expect(simulated.value.scenarios.coverage).toBe(0);
  });

  it("returns indeterminate evidence for an unmodeled effect instead of silently passing", async () => {
    const unknown = preflight(safeParams);
    const simulated = await simulator().simulate({
      ...unknown,
      effectPlan: { ...unknown.effectPlan, resource: "ros2:///unknown/actuator" },
    }, world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("indeterminate");
    expect(simulated.value.result.unsupportedPhenomena?.[0]).toContain("unsupported effect");
  });

  it("rejects an evidence grade this backend cannot produce", async () => {
    const simulated = await simulator().simulate(preflight(safeParams, {
      assignedTier: ApprovalTier.T3_COMMIT,
      requirement: { minEvidenceGrade: "physics" },
    }), world());

    expect(simulated).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_EVIDENCE_GRADE",
        message: "Backend sint-deterministic cannot satisfy physics evidence",
        retryable: false,
      },
    });
  });

  it("rejects missing and expired world snapshots", async () => {
    const missing = await simulator().simulate(preflight(safeParams));
    const stale = await simulator().simulate(preflight(safeParams), world({
      validUntil: new Date(now - 1).toISOString(),
    }));

    expect(missing.ok ? undefined : missing.error.code).toBe("WORLD_SNAPSHOT_REQUIRED");
    expect(stale.ok ? undefined : stale.error.code).toBe("WORLD_SNAPSHOT_STALE");
  });

  it("clamps receipt validity to the world snapshot boundary", async () => {
    const validUntil = new Date(now + 1_000).toISOString();
    const simulated = await simulator().simulate(preflight(safeParams), world({ validUntil }));

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.expiresAt).toBe(validUntil);
  });

  it("reports invalid safety-envelope bounds as worker misconfiguration", async () => {
    const invalid = new DeterministicEffectSimulator({
      signerPublicKey: signer.publicKey,
      signerPrivateKey: signer.privateKey,
      version: "0.1.0",
      modelDigest: digest("b"),
      now: () => now,
      artifactStore: new InMemorySimulationArtifactStore(),
      receiptRecorder: { recordIssued: async () => ok(undefined) },
      models: [new BoundedMotionEffectModel({
        resources: ["ros2:///arm/command"],
        actions: ["publish"],
        envelope: { maxVelocityMps: -1 },
      })],
    });
    const simulated = await invalid.simulate(preflight(safeParams), world());

    expect(simulated.ok ? undefined : simulated.error.code).toBe("SIMULATOR_MISCONFIGURED");
  });

  it("round-trips and integrity-checks artifacts in the durable filesystem store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sint-simulation-artifacts-"));
    try {
      const artifactStore = new FileSystemSimulationArtifactStore(directory);
      const simulated = await simulator(artifactStore).simulate(preflight(safeParams), world());
      expect(simulated.ok).toBe(true);
      if (!simulated.ok) return;

      const artifact = await artifactStore.get(simulated.value.artifactDigest);
      expect(artifact.ok).toBe(true);
      if (artifact.ok) {
        expect(artifact.value.mediaType).toContain("vnd.sint.deterministic-trace");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed when the trace artifact cannot be persisted", async () => {
    const failingStore = {
      put: async () => ({
        ok: false as const,
        error: { code: "ARTIFACT_WRITE_FAILED" as const, message: "storage unavailable" },
      }),
      get: async () => ({
        ok: false as const,
        error: { code: "ARTIFACT_NOT_FOUND" as const, message: "not found" },
      }),
    };
    const simulated = await simulator(failingStore).simulate(preflight(safeParams), world());

    expect(simulated).toEqual({
      ok: false,
      error: {
        code: "ARTIFACT_PERSISTENCE_FAILED",
        message: "storage unavailable",
        retryable: true,
      },
    });
  });

  it("fails closed when receipt issuance cannot be appended to the ledger", async () => {
    const failing = new DeterministicEffectSimulator({
      signerPublicKey: signer.publicKey,
      signerPrivateKey: signer.privateKey,
      version: "0.1.0",
      modelDigest: digest("b"),
      now: () => now,
      artifactStore: new InMemorySimulationArtifactStore(),
      receiptRecorder: {
        recordIssued: async () => ({
          ok: false,
          error: { code: "EVIDENCE_LEDGER_WRITE_FAILED", message: "ledger unavailable" },
        }),
      },
      models: [new BoundedMotionEffectModel({
        resources: ["ros2:///arm/command"],
        actions: ["publish"],
        envelope: { maxVelocityMps: 0.5 },
      })],
    });

    const simulated = await failing.simulate(preflight(safeParams), world());

    expect(simulated).toEqual({
      ok: false,
      error: {
        code: "EVIDENCE_LEDGER_WRITE_FAILED",
        message: "ledger unavailable",
        retryable: true,
      },
    });
  });
});
