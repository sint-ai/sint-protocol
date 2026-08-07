import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { EvidenceLedgerSimulationReceiptRecorder, LedgerWriter } from "@pshkv/gate-evidence-ledger";
import {
  BoundedMotionEffectModel,
  DeterministicEffectSimulator,
  InMemorySimulationArtifactStore,
} from "@pshkv/engine-effect-simulator";
import { HttpEffectSimulator } from "@pshkv/predictive-safety-client";
import { createSimulationWorkerApp } from "../src/server.js";

const signer = generateKeypair();
const now = Date.now();
const digest = (character: string): string => character.repeat(64);

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
      velocityMps: 0.3,
      forceNewtons: 10,
      collisions: 0,
      safetyZoneViolations: 0,
    },
  },
  requirement: { minEvidenceGrade: "deterministic" },
};

const worldSnapshot: SimulationWorldSnapshot = {
  digest: digest("a"),
  observedAt: new Date(now - 10).toISOString(),
  validUntil: new Date(now + 5_000).toISOString(),
  stateEpoch: "robot-1:42",
  uncertainty: 0.01,
};

function worker(maxBodyBytes?: number) {
  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    version: "0.1.0",
    modelDigest: digest("b"),
    artifactStore: new InMemorySimulationArtifactStore(),
    receiptRecorder: new EvidenceLedgerSimulationReceiptRecorder(new LedgerWriter()),
    now: () => now,
    models: [new BoundedMotionEffectModel({
      resources: ["ros2:///cmd_vel"],
      actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, maxForceNewtons: 50 },
    })],
  });
  return createSimulationWorkerApp({ simulator, bearerToken: "worker-secret", maxBodyBytes });
}

function client(fetchImpl: typeof globalThis.fetch) {
  return new HttpEffectSimulator({
    baseUrl: "http://simulation-worker",
    backend: "sint-deterministic",
    supportedGrades: ["deterministic"],
    trustedSignerKeys: [signer.publicKey],
    bearerToken: "worker-secret",
    timeoutMs: 1_000,
    fetch: fetchImpl,
  });
}

describe("simulation worker HTTP boundary", () => {
  it("reports capabilities without claiming authorization", async () => {
    const response = await worker().request("http://simulation-worker/v1/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      protocol: "sint-effect-simulator/1",
      authorizesExecution: false,
      backend: "sint-deterministic",
      supportedGrades: ["deterministic"],
    });
  });

  it("round-trips a signed receipt through the remote EffectSimulator client", async () => {
    const app = worker();
    const remote = client((input, init) => app.request(input, init));

    const simulated = await remote.simulate(preflight, worldSnapshot);
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("pass");
    expect(simulated.value.effectPlanDigest).toBe(preflight.effectPlan.effectPlanDigest);
    expect(simulated.value.worldSnapshot.digest).toBe(worldSnapshot.digest);
  });

  it("requires worker authentication", async () => {
    const app = worker();
    const response = await app.request("http://simulation-worker/v1/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preflight, worldSnapshot }),
    });

    expect(response.status).toBe(401);
  });

  it("rejects malformed or authorization-claiming preflights", async () => {
    const app = worker();
    const response = await app.request("http://simulation-worker/v1/simulate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer worker-secret",
      },
      body: JSON.stringify({
        preflight: { ...preflight, authorizesExecution: true },
        worldSnapshot,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects oversized simulation requests before parsing", async () => {
    const response = await worker(100).request("http://simulation-worker/v1/simulate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer worker-secret",
      },
      body: JSON.stringify({ padding: "x".repeat(1_000) }),
    });

    expect(response.status).toBe(413);
  });

  it("rejects a receipt whose signature is modified in transit", async () => {
    const app = worker();
    const tamperingFetch: typeof globalThis.fetch = async (input, init) => {
      const response = await app.request(input, init);
      const body = await response.json() as { receipt?: Record<string, unknown> };
      if (body.receipt) body.receipt.signature = "0".repeat(128);
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    };
    const simulated = await client(tamperingFetch).simulate(preflight, worldSnapshot);

    expect(simulated.ok ? undefined : simulated.error.message).toBe(
      "Simulation worker receipt signature is invalid",
    );
  });
});
