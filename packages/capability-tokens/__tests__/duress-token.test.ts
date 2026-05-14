import { describe, it, expect } from "vitest";
import {
  createDuressCapabilityToken,
  detectCoercion,
  generateKeypair,
  issueCapabilityToken,
  validateDuressResolution,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Duress token helpers", () => {
  const issuer = generateKeypair();
  const subject = generateKeypair();

  const request: SintCapabilityTokenRequest = {
    issuer: issuer.publicKey,
    subject: subject.publicKey,
    resource: "home://lock/front-door",
    actions: ["unlock", "lock"],
    constraints: { maxRepetitions: 20 },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(8),
    revocable: true,
  };

  it("creates duress token profile with split control metadata", () => {
    const base = issueCapabilityToken(request, issuer.privateKey);
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const result = createDuressCapabilityToken(
      base.value,
      {
        survivorId: "did:key:z6Mksurvivor",
        trustedPartyId: "did:key:z6Mktrusted",
        requiresDualApproval: true,
      },
      {
        evidenceHash: "a".repeat(64),
        judicialPublicKeyRef: "did:key:z6Mkjurisdiction",
        encryptedEvidenceKey: "ciphertext:abc123",
      },
      "2026-05-14T02:30:00.000000Z",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.duressControl.requiresDualApproval).toBe(true);
    expect(result.value.createdAt).toBe("2026-05-14T02:30:00.000000Z");
  });

  it("enforces survivor + trusted-party dual approval", () => {
    const base = issueCapabilityToken(request, issuer.privateKey);
    if (!base.ok) throw new Error("token issuance failed");

    const duress = createDuressCapabilityToken(
      base.value,
      {
        survivorId: "did:key:z6Mksurvivor",
        trustedPartyId: "did:key:z6Mktrusted",
        requiresDualApproval: true,
      },
      {
        evidenceHash: "b".repeat(64),
        judicialPublicKeyRef: "did:key:z6Mkjurisdiction",
        encryptedEvidenceKey: "ciphertext:def456",
      },
      "2026-05-14T02:30:00.000000Z",
    );
    if (!duress.ok) throw new Error("duress token creation failed");

    const missingTrusted = validateDuressResolution(duress.value, [
      "did:key:z6Mksurvivor",
    ]);
    expect(missingTrusted.ok).toBe(false);

    const full = validateDuressResolution(duress.value, [
      "did:key:z6Mksurvivor",
      "did:key:z6Mktrusted",
    ]);
    expect(full.ok).toBe(true);
  });

  it("detects coercion patterns from action logs", () => {
    const logs = [
      {
        timestamp: "2026-05-14T02:20:00.000000Z",
        actorId: "actor-a",
        action: "unlock" as const,
        sourceNetwork: "10.0.0.10",
      },
      {
        timestamp: "2026-05-14T02:21:00.000000Z",
        actorId: "actor-a",
        action: "unlock" as const,
        sourceNetwork: "10.0.0.11",
      },
      {
        timestamp: "2026-05-14T02:22:00.000000Z",
        actorId: "actor-a",
        action: "revoke_token" as const,
        sourceNetwork: "10.0.0.12",
      },
    ];

    const result = detectCoercion(logs);
    expect(result.coercionDetected).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(0.5);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

