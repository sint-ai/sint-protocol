import { describe, expect, it } from "vitest";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { loadSimulationWorkerConfig } from "../src/config.js";

describe("standalone simulation worker configuration", () => {
  it("creates an ephemeral signer only outside production", () => {
    const config = loadSimulationWorkerConfig({ NODE_ENV: "test" });
    expect(config.port).toBe(3201);
    expect(config.ephemeralSigner).toBe(true);
    expect(config.model.resources).toEqual(["ros2:///cmd_vel"]);
    expect(config.maxSimulateRequests).toBeUndefined();
  });

  it("loads a positive simulate quota and rejects a non-positive limit", () => {
    expect(loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MAX_SIMULATE_REQUESTS: "4",
    }).maxSimulateRequests).toBe(4);
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MAX_SIMULATE_REQUESTS: "0",
    })).toThrow("SINT_SIM_MAX_SIMULATE_REQUESTS must be a positive integer");
  });

  it("loads a tenant id and rejects a blank one", () => {
    expect(loadSimulationWorkerConfig({ NODE_ENV: "test" }).tenantId).toBeUndefined();
    expect(loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_TENANT_ID: "plant-a",
    }).tenantId).toBe("plant-a");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_TENANT_ID: " ",
    })).toThrow("SINT_SIM_TENANT_ID must be 1\u2013128 non-whitespace characters");
  });

  it("loads a workload trust domain and rejects a blank or URI value", () => {
    expect(loadSimulationWorkerConfig({ NODE_ENV: "test" }).trustDomain).toBeUndefined();
    expect(loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_TRUST_DOMAIN: "sim.sint.test",
    }).trustDomain).toBe("sim.sint.test");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_TRUST_DOMAIN: " ",
    })).toThrow("SINT_SIM_TRUST_DOMAIN must be a trust domain of 1\u2013253 non-whitespace characters without a scheme or slash");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_TRUST_DOMAIN: "spiffe://sim.sint.test/worker",
    })).toThrow("SINT_SIM_TRUST_DOMAIN must be a trust domain of 1\u2013253 non-whitespace characters without a scheme or slash");
  });

  it("fails closed when production authentication or persistent signing is absent", () => {
    expect(() => loadSimulationWorkerConfig({ NODE_ENV: "production" })).toThrow(
      "persistent simulation signer keypair",
    );
    const signer = generateKeypair();
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "production",
      SINT_SIM_SIGNER_PUBLIC_KEY: signer.publicKey,
      SINT_SIM_SIGNER_PRIVATE_KEY: signer.privateKey,
    })).toThrow("SINT_SIM_BEARER_TOKEN is required");
  });

  it("rejects mismatched signer keys", () => {
    const first = generateKeypair();
    const second = generateKeypair();
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_SIGNER_PUBLIC_KEY: first.publicKey,
      SINT_SIM_SIGNER_PRIVATE_KEY: second.privateKey,
    })).toThrow("configured public key does not match private key");
  });

  it("loads an explicit bounded-motion model", () => {
    const config = loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({
        id: "warehouse-nav-v1",
        resources: ["ros2:///nav/goal"],
        actions: ["publish"],
        envelope: { maxVelocityMps: 0.25 },
      }),
    });
    expect(config.model.id).toBe("warehouse-nav-v1");
    expect(config.model.envelope.maxVelocityMps).toBe(0.25);
  });

  it("requires explicit safety bounds for scene-aware navigation", () => {
    const model = {
      id: "warehouse-scene-v1",
      kind: "scene-aware-navigation",
      resources: ["ros2:///nav/segment"],
      actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, minClearanceMeters: 0.1 },
      scene: { robotRadiusMeters: 0.2, maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3, minDecelerationMps2: 2, reactionTimeMs: 100 },
    };
    expect(loadSimulationWorkerConfig({ NODE_ENV: "test", SINT_SIM_MODEL: JSON.stringify(model) }).model)
      .toMatchObject(model);
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({ ...model, scene: { ...model.scene, maxHumanSpeedMps: -1 } }),
    })).toThrow("scene-aware-navigation requires explicit");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({ ...model, scene: { robotRadiusMeters: 0.2, maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3 } }),
    })).toThrow("scene-aware-navigation requires explicit");
  });

  it("accepts only bounded, explicit navigation scenario policies", () => {
    const model = {
      id: "nav-cases-v1", kind: "scene-aware-navigation",
      resources: ["ros2:///nav/segment"], actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, minClearanceMeters: 0.1 },
      scene: { robotRadiusMeters: 0.2, maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3, minDecelerationMps2: 2, reactionTimeMs: 100 },
      scenarioPolicy: { version: "1.0.0", policyId: "warehouse-v1", cases: [{ id: "human-speed", extraHumanSpeedMps: 0.5 }] },
    };
    expect(loadSimulationWorkerConfig({ NODE_ENV: "test", SINT_SIM_MODEL: JSON.stringify(model) }).model)
      .toMatchObject(model);
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({ ...model, scenarioPolicy: { ...model.scenarioPolicy, cases: [{ id: "ignored", unknownStress: 1 }] } }),
    })).toThrow("scenarioPolicy must contain");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({ ...model, scenarioPolicy: { ...model.scenarioPolicy, cases: [
        { id: "duplicate", extraHumanSpeedMps: 0.2 }, { id: "duplicate", extraReactionTimeMs: 100 },
      ] } }),
    })).toThrow("scenarioPolicy must contain");
  });

  it("accepts a seeded navigation distribution and rejects a duplicated seed", () => {
    const model = {
      id: "nav-seeded-v1", kind: "scene-aware-navigation",
      resources: ["ros2:///nav/segment"], actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, minClearanceMeters: 0.1 },
      scene: { robotRadiusMeters: 0.2, maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3, minDecelerationMps2: 2, reactionTimeMs: 100 },
      scenarioPolicy: {
        version: "1.0.0",
        policyId: "warehouse-seeded-v1",
        cases: [{ id: "human-speed", extraHumanSpeedMps: 0.5 }],
        distribution: {
          version: "1.0.0",
          seeds: [7, 11],
          bounds: {
            extraRobotRadiusMeters: { min: 0, max: 0.2 },
            extraReactionTimeMs: { min: 0, max: 50 },
            extraHumanSpeedMps: { min: 0, max: 0.2 },
          },
        },
      },
    };
    expect(loadSimulationWorkerConfig({ NODE_ENV: "test", SINT_SIM_MODEL: JSON.stringify(model) }).model)
      .toMatchObject(model);
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({
        ...model,
        scenarioPolicy: {
          ...model.scenarioPolicy,
          distribution: { ...model.scenarioPolicy.distribution, seeds: [7, 7] },
        },
      }),
    })).toThrow("unique seeds");
  });

  it("rejects the parameter-only ROS 2 worker in production", () => {
    const signer = generateKeypair();
    const base = {
      NODE_ENV: "production",
      SINT_SIM_SIGNER_PUBLIC_KEY: signer.publicKey,
      SINT_SIM_SIGNER_PRIVATE_KEY: signer.privateKey,
      SINT_SIM_BEARER_TOKEN: "worker-secret",
    };
    expect(() => loadSimulationWorkerConfig(base)).toThrow("SINT_SIM_MODEL is required in production");
    expect(() => loadSimulationWorkerConfig({
      ...base,
      SINT_SIM_MODEL: JSON.stringify({
        id: "legacy-ros2",
        resources: ["ros2:///cmd_vel"],
        actions: ["publish"],
        envelope: { maxVelocityMps: 0.5 },
      }),
    })).toThrow("Physical protocol resources require a scene-aware simulation model");
    const sceneModel = {
      id: "nav-scene-v1",
      kind: "scene-aware-navigation",
      resources: ["ros2:///nav/segment"],
      actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, minClearanceMeters: 0.1 },
      scene: { robotRadiusMeters: 0.2, maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3, minDecelerationMps2: 2, reactionTimeMs: 100 },
    };
    expect(loadSimulationWorkerConfig({ ...base, SINT_SIM_MODEL: JSON.stringify(sceneModel) }).model)
      .toMatchObject(sceneModel);
  });

  it("rejects malformed physical envelopes and model digests", () => {
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL: JSON.stringify({
        id: "unsafe",
        resources: ["ros2:///cmd_vel"],
        actions: ["publish"],
        envelope: { maxVelocityMps: "fast" },
      }),
    })).toThrow("must define id, resources, actions, and envelope");
    expect(() => loadSimulationWorkerConfig({
      NODE_ENV: "test",
      SINT_SIM_MODEL_DIGEST: "not-a-digest",
    })).toThrow("lowercase SHA-256 hex digest");
  });
});
