import { describe, expect, it, vi } from "vitest";
import { PgTokenStore } from "../src/pg-token-store.js";
import type { SintCapabilityToken } from "@pshkv/core";

function makeToken(): SintCapabilityToken {
  return {
    tokenId: "0195f7c4-e8a7-7b3d-9a1e-f2c3d4e5f6a7",
    issuer: "issuer-pub-key",
    subject: "subject-pub-key",
    resource: "ros2:///camera/front",
    actions: ["publish", "subscribe"],
    constraints: {
      maxVelocityMps: 0.5,
    },
    modelConstraints: {
      allowedModelIds: ["gpt-5.4"],
    },
    attestationRequirements: {
      minAttestationGrade: 2,
    },
    verifiableComputeRequirements: {
      requireForTiers: ["T2_act"],
      allowedProofTypes: ["snark"],
    },
    executionEnvelope: {
      kind: "corridor",
      maxLatencyMs: 50,
      corridor: {
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 1 },
        ],
        radiusM: 0.25,
      },
    },
    behavioralConstraints: {
      toolAllowlist: ["publishVelocity"],
      maxCallsPerMinute: 12,
    },
    passportId: "aps:passport:robot-7",
    delegationDepth: 3,
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    issuedAt: "2026-03-16T10:00:00.000000Z",
    expiresAt: "2026-03-16T22:00:00.000000Z",
    revocable: true,
    revocationEndpoint: "https://example.com/revoke",
    signature: "a".repeat(128),
  };
}

describe("PgTokenStore", () => {
  it("stores the full capability token payload", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const pool = { query } as unknown as import("pg").Pool;
    const store = new PgTokenStore(pool);
    const token = makeToken();

    await store.store(token);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("model_constraints");
    expect(sql).toContain("behavioral_constraints");
    expect(sql).toContain("passport_id");
    expect(sql).toContain("delegation_depth");
    expect(sql).toContain("revocation_endpoint");
    expect(values).toHaveLength(19);
    expect(values[6]).toBe(JSON.stringify(token.modelConstraints));
    expect(values[10]).toBe(JSON.stringify(token.behavioralConstraints));
    expect(values[11]).toBe(token.passportId);
    expect(values[12]).toBe(token.delegationDepth);
    expect(values[17]).toBe(token.revocationEndpoint);
  });

  it("reconstructs optional fields on read", async () => {
    const token = makeToken();
    const query = vi.fn(async () => ({
      rows: [
        {
          token_id: token.tokenId,
          issuer: token.issuer,
          subject: token.subject,
          resource: token.resource,
          actions: token.actions,
          constraints: token.constraints,
          model_constraints: token.modelConstraints,
          attestation_requirements: token.attestationRequirements,
          verifiable_compute_requirements: token.verifiableComputeRequirements,
          execution_envelope: token.executionEnvelope,
          behavioral_constraints: token.behavioralConstraints,
          passport_id: token.passportId,
          delegation_depth: token.delegationDepth,
          delegation_chain: token.delegationChain,
          issued_at: token.issuedAt,
          expires_at: token.expiresAt,
          revocable: token.revocable,
          revocation_endpoint: token.revocationEndpoint,
          signature: token.signature,
        },
      ],
    }));
    const pool = { query } as unknown as import("pg").Pool;
    const store = new PgTokenStore(pool);

    const retrieved = await store.get(token.tokenId);

    expect(retrieved).toEqual(token);
  });
});
