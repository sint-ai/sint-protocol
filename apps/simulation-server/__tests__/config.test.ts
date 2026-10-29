import { describe, expect, it } from "vitest";
import { generateKeypair } from "@pshkv/gate-capability-tokens";
import { loadSimulationWorkerConfig } from "../src/config.js";

describe("standalone simulation worker configuration", () => {
  it("creates an ephemeral signer only outside production", () => {
    const config = loadSimulationWorkerConfig({ NODE_ENV: "test" });
    expect(config.port).toBe(3201);
    expect(config.ephemeralSigner).toBe(true);
    expect(config.model.resources).toEqual(["ros2:///cmd_vel"]);
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
