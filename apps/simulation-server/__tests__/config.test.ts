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
