import { describe, expect, it } from "vitest";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { createPersistentContext } from "../src/server.js";
import type { SintConfig } from "../src/config.js";

const baseConfig: SintConfig = {
  env: "test",
  port: 3100,
  store: "memory",
  cache: "memory",
  requireSignatures: false,
  rateLimitMax: 100,
  wsAllowQueryApiKey: false,
};

describe("server simulation enforcement", () => {
  it("refuses production context construction without trusted simulator keys", async () => {
    await expect(createPersistentContext({ ...baseConfig, env: "production" }))
      .rejects.toThrow("SINT_SIMULATION_SIGNERS is required");
  });

  it("requires simulation evidence for a motion request when simulator trust is configured", async () => {
    const issuer = generateKeypair();
    const simulator = generateKeypair();
    const context = await createPersistentContext({
      ...baseConfig,
      trustedIssuers: [issuer.publicKey],
      simulationSignerKeys: [simulator.publicKey],
    });
    const issued = issueCapabilityToken({
      issuer: issuer.publicKey,
      subject: issuer.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 1 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revocable: true,
    }, issuer.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    await context.tokenStore.store(issued.value);

    const request = {
      requestId: generateUUIDv7(),
      timestamp: new Date().toISOString(),
      agentId: issuer.publicKey,
      tokenId: issued.value.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 }, angular: { z: 0 } },
    };
    const preflight = await context.gateway.preflightSimulation(request);
    expect(preflight.ok).toBe(true);
    if (preflight.ok) {
      expect(preflight.value.requirement).toEqual({ minEvidenceGrade: "deterministic" });
    }

    const decision = await context.gateway.intercept(request);
    expect(decision).toMatchObject({
      action: "deny",
      denial: { policyViolated: "SIMULATION_EVIDENCE_MISSING" },
    });
  });
});
