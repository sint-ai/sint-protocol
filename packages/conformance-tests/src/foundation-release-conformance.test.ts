import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok, type HumanAuthorityProof, type SintCapabilityTokenRequest, type SintRequest } from "@pshkv/core";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { PolicyGateway, type PolicyGatewayConfig } from "@pshkv/gate-policy-gateway";

const signer = generateKeypair();
const iso = (offset = 0) => new Date(Date.now() + offset).toISOString();
const fixture = JSON.parse(readFileSync(new URL("../fixtures/security/signed-token-persistence.v1.json", import.meta.url), "utf8"));
afterEach(() => vi.useRealTimers());

function proof(): HumanAuthorityProof {
  return { principalRef: "did:example:operator", assuranceLevel: "contextual_binding", proofRef: "proof://operator/1",
    proofHash: "a".repeat(64), verifierRef: "verifier://operator", observedAt: iso(),
    binding: { applicationId: "runtime-1", resource: "mcp://filesystem/readFile", action: "call", maxValue: 100, validUntil: iso(60_000) } };
}

function setup(extra: Partial<SintCapabilityTokenRequest>, context?: SintRequest["executionContext"], config: Partial<PolicyGatewayConfig> = {}) {
  const issued = issueCapabilityToken({
    issuer: signer.publicKey, subject: signer.publicKey, resource: "mcp://*", actions: ["call"], constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false }, expiresAt: iso(3_600_000), revocable: true, ...extra,
  }, signer.privateKey);
  expect(issued.ok).toBe(true);
  if (!issued.ok) return undefined;
  const request: SintRequest = { requestId: generateUUIDv7(), timestamp: iso(), agentId: signer.publicKey,
    tokenId: issued.value.tokenId, resource: "mcp://filesystem/readFile", action: "call", params: { amount: 50 }, executionContext: context };
  return { request, gateway: new PolicyGateway({ resolveToken: () => issued.value, ...config }) };
}

function authority(trusted: HumanAuthorityProof, submitted = trusted, config: Partial<PolicyGatewayConfig> = {}) {
  return setup({ humanAuthorityRequirements: { requiredAssuranceLevel: "delegation", maxProofAgeMs: 5_000,
    allowedProofProviders: ["verifier://operator"], requiredBinding: { applicationId: "runtime-1", resource: "mcp://filesystem/readFile", action: "call", maxValue: 100 } } },
  { executor: { runtimeId: "runtime-1" }, humanAuthority: submitted }, { resolveHumanAuthorityProof: () => ok(trusted), ...config });
}

describe("Human authority authentication release gate", () => {
  it("accepts a matching authenticated provider record", async () => {
    const input = authority(proof());
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).action).toBe("allow");
  });

  it("rejects copied proof metadata when no trusted resolver is configured", async () => {
    const input = authority(proof(), undefined, { resolveHumanAuthorityProof: undefined });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("HUMAN_AUTHORITY_UNVERIFIED");
  });

  it.each(["revoked", "stale", "principal", "provider", "scope"])("rejects forged metadata hiding the provider's %s record", async mutation => {
    const submitted = proof();
    const trusted = { ...submitted,
      ...(mutation === "revoked" && { revokedAt: iso(-1) }),
      ...(mutation === "stale" && { observedAt: iso(-60_000) }),
      ...(mutation === "principal" && { principalRef: "did:example:other" }),
      ...(mutation === "provider" && { verifierRef: "verifier://other" }),
      ...(mutation === "scope" && { binding: { ...submitted.binding, maxValue: 20 } }),
    };
    const input = authority(trusted, submitted);
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("HUMAN_AUTHORITY_UNVERIFIED");
  });

  it.each(["maxValue", "resource", "applicationId", "action", "expired", "not-yet-valid", "future-observation"])("rejects authenticated proof with invalid %s", async failure => {
    const original = proof();
    const invalid = { ...original,
      ...(failure === "future-observation" && { observedAt: iso(60_000) }),
      binding: { ...original.binding,
        ...(failure === "maxValue" && { maxValue: 20 }),
        ...(failure === "resource" && { resource: "mcp://other/readFile" }),
        ...(failure === "applicationId" && { applicationId: "other-runtime" }),
        ...(failure === "action" && { action: "other" }),
        ...(failure === "expired" && { validUntil: iso(-1) }),
        ...(failure === "not-yet-valid" && { validFrom: iso(60_000) }),
      },
    };
    const input = authority(invalid);
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).action).toBe("deny");
  });

  it("rechecks proof expiry after the authenticated provider lookup", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const trusted = proof();
    const input = authority(trusted, undefined, { resolveHumanAuthorityProof: () => {
      vi.setSystemTime(Date.now() + 60_001); return ok(trusted);
    } });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe("HUMAN_AUTHORITY_PROOF_STALE");
  });

  it.each(["absent", "throw", "timeout"])("fails closed on %s authenticated proof lookup", async failure => {
    const input = authority(proof(), undefined, { pluginTimeoutMs: 10, resolveHumanAuthorityProof: () => {
      if (failure === "throw") throw new Error("private provider error");
      if (failure === "timeout") return new Promise(() => {});
      return err({ message: "not found" });
    } });
    if (!input) return;
    const decision = await input.gateway.intercept(input.request);
    expect(decision.action).toBe("deny");
    expect(JSON.stringify(decision)).not.toContain("private provider error");
    if (failure !== "absent") expect(decision.transformations?.additionalAuditFields?.["pluginFailures"]).toContainEqual(
      expect.objectContaining({ seat: "humanAuthority.evaluate", policy: "deny" }));
  });
});

describe("Unsupported foundation contracts fail closed", () => {
  it.each([
    ["hazardousEnergyEnvelope", "HAZARDOUS_ENERGY_ENFORCEMENT_UNAVAILABLE"],
    ["adaptationPermit", "VLA_ADAPTATION_ENFORCEMENT_UNAVAILABLE"],
  ])("never silently ignores signed %s", async (field, code) => {
    const input = setup({ [field!]: fixture.policyFields[field!] });
    if (!input) return;
    expect((await input.gateway.intercept(input.request)).denial?.policyViolated).toBe(code);
  });

  it.each(["maxChunkVelocityMps", "maxChunkAccelerationMps2", "maxChunkJerkMps3", "maxTransitionPositionDelta", "maxTransitionVelocityDelta"])("requires enforcement evidence for signed %s", async field => {
    const digest = "a".repeat(64);
    const input = setup({ executionEnvelope: { [field]: 0.1 } }, {
      model: { actionSpaceDigest: digest, embodimentId: "robot-1" },
      simulationEvidence: {
        schemaVersion: "2.0.0", receiptId: generateUUIDv7(), evidenceGrade: "deterministic",
        requestDigest: digest, effectPlanDigest: digest, tokenDigest: digest, resource: "mcp://filesystem/readFile", action: "call",
        worldSnapshot: { digest, observedAt: iso(), validUntil: iso(5_000), stateEpoch: "epoch-1" },
        simulator: { backend: "test", version: "1", modelDigest: digest },
        scenarios: { scenarioSetDigest: digest, runCount: 1 }, result: { outcome: "pass", collisions: 0, safetyZoneViolations: 0 },
        generatedAt: iso(), expiresAt: iso(5_000), nonce: "foundation-release", artifactDigest: digest,
        signerPublicKey: digest, signature: "a".repeat(128),
      },
      vlaActionChunk: { chunkId: generateUUIDv7(), streamId: "robot-1", sequence: 0, issuedAt: iso(), executeBy: iso(5_000),
        horizonMs: 1000, controlHz: 1, actionCount: 1, actionSpaceDigest: digest, embodimentId: "robot-1", worldSnapshotDigest: digest, safeStopOnFailure: true },
    });
    if (!input) return;
    const decision = await input.gateway.intercept(input.request);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe(field.startsWith("maxTransition")
      ? "VLA_TRANSITION_ENFORCEMENT_UNAVAILABLE" : "VLA_CHUNK_CONSTRAINT_VIOLATION");
  });
});
