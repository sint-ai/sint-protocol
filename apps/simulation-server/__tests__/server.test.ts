import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  canonicalJsonStringify,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { generateKeypair, hashSha256 } from "@pshkv/gate-capability-tokens";
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

const params = {
  velocityMps: 0.3,
  forceNewtons: 10,
  collisions: 0,
  safetyZoneViolations: 0,
};
const preflight: SimulationPreflight = {
  kind: "simulation-preflight",
  authorizesExecution: false,
  assignedTier: ApprovalTier.T2_ACT,
  effectPlan: {
    requestDigest: digest("1"),
    effectPlanDigest: hashSha256(canonicalJsonStringify({ resource: "ros2:///cmd_vel", action: "publish", params })),
    tokenDigest: digest("3"),
    resource: "ros2:///cmd_vel",
    action: "publish",
    params,
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

function worker(maxBodyBytes?: number, maxSimulateRequests?: number, tenantId?: string) {
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
  return createSimulationWorkerApp({
    simulator,
    bearerToken: "worker-secret",
    maxBodyBytes,
    maxSimulateRequests,
    tenantId,
  });
}

function simulate(app: ReturnType<typeof worker>, tenantId?: string) {
  return app.request("http://simulation-worker/v1/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer worker-secret",
    },
    body: JSON.stringify({
      preflight,
      worldSnapshot,
      ...(tenantId !== undefined ? { tenantId } : {}),
    }),
  });
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

  it("rejects an authenticated simulate request past the configured quota", async () => {
    const app = worker(undefined, 1);
    const accepted = await simulate(app);
    const rejected = await simulate(app);

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({
      error: {
        code: "QUOTA_EXCEEDED",
        message: "Simulation request quota is exhausted",
        retryable: false,
      },
    });
  });

  it("rejects an authenticated simulate call while the configured in-flight limit is full", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const inner = new DeterministicEffectSimulator({
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
    const app = createSimulationWorkerApp({
      simulator: {
        backend: inner.backend,
        supportedGrades: inner.supportedGrades,
        async simulate(preflightInput: SimulationPreflight, world: SimulationWorldSnapshot) {
          started += 1;
          if (started === 1) await gate;
          return inner.simulate(preflightInput, world);
        },
      },
      bearerToken: "worker-secret",
      maxInFlightSimulateRequests: 1,
    });

    const first = simulate(app);
    const deadline = Date.now() + 1_000;
    while (started < 1) {
      if (Date.now() > deadline) throw new Error("timed out waiting for the in-flight simulate call");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const rejected = await simulate(app);
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toEqual({
      error: {
        code: "QUEUE_FULL",
        message: "Simulation request queue is full",
        retryable: true,
      },
    });
    release();
    expect((await first).status).toBe(200);
    expect((await simulate(app)).status).toBe(200);
  });

  it("does not count health checks or unauthenticated requests against the simulate quota", async () => {
    const app = worker(undefined, 1);
    const health = await app.request("http://simulation-worker/v1/health");
    const anonymous = await app.request("http://simulation-worker/v1/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preflight, worldSnapshot }),
    });
    const accepted = await simulate(app);

    expect(health.status).toBe(200);
    expect(anonymous.status).toBe(401);
    expect(accepted.status).toBe(200);
  });

  it("rejects a simulate request for a different tenant", async () => {
    const app = worker(undefined, undefined, "plant-a");
    const rejected = await simulate(app, "plant-b");

    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({
      error: {
        code: "TENANT_MISMATCH",
        message: "Simulation request tenant does not match this worker",
        retryable: false,
      },
    });
  });

  it("rejects a simulate request that omits the tenant when the worker is bound", async () => {
    const rejected = await simulate(worker(undefined, undefined, "plant-a"));

    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toEqual({
      error: {
        code: "TENANT_MISMATCH",
        message: "Simulation request tenant does not match this worker",
        retryable: false,
      },
    });
  });

  it("returns a receipt when the simulate request names the bound tenant", async () => {
    const accepted = await simulate(worker(undefined, undefined, "plant-a"), "plant-a");

    expect(accepted.status).toBe(200);
    const body = await accepted.json() as { receipt?: { result?: { outcome?: string } } };
    expect(body.receipt?.result?.outcome).toBe("pass");
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
