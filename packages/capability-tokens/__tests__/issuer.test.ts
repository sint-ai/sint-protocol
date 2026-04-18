import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  getPublicKey,
  issueCapabilityToken,
  validateCapabilityToken,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@sint-ai/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Capability Token Issuer", () => {
  const issuerKeypair = generateKeypair();
  const subjectKeypair = generateKeypair();

  const validRequest: SintCapabilityTokenRequest = {
    issuer: issuerKeypair.publicKey,
    subject: subjectKeypair.publicKey,
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints: {
      maxVelocityMps: 0.5,
      maxForceNewtons: 50,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(12),
    revocable: true,
  };

  it("should issue a valid token with correct signature", () => {
    const result = issueCapabilityToken(validRequest, issuerKeypair.privateKey);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const token = result.value;
    expect(token.tokenId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(token.issuer).toBe(issuerKeypair.publicKey);
    expect(token.subject).toBe(subjectKeypair.publicKey);
    expect(token.resource).toBe("ros2:///cmd_vel");
    expect(token.actions).toEqual(["publish"]);
    expect(token.signature).toHaveLength(128);
  });

  it("should produce tokens that pass full validation", () => {
    const issueResult = issueCapabilityToken(validRequest, issuerKeypair.privateKey);
    expect(issueResult.ok).toBe(true);
    if (!issueResult.ok) return;

    const validateResult = validateCapabilityToken(issueResult.value, {
      resource: "ros2:///cmd_vel",
      action: "publish",
    });
    expect(validateResult.ok).toBe(true);
  });

  it("should reject expired token requests", () => {
    const expiredRequest: SintCapabilityTokenRequest = {
      ...validRequest,
      expiresAt: pastISO(1),
    };
    const result = issueCapabilityToken(expiredRequest, issuerKeypair.privateKey);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("TOKEN_EXPIRED");
  });

  it("should reject malformed requests", () => {
    const malformed = { ...validRequest, issuer: "not-a-valid-key" };
    const result = issueCapabilityToken(malformed, issuerKeypair.privateKey);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("MALFORMED_TOKEN");
  });

  it("should produce unique token IDs for each issuance", () => {
    const r1 = issueCapabilityToken(validRequest, issuerKeypair.privateKey);
    const r2 = issueCapabilityToken(validRequest, issuerKeypair.privateKey);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value.tokenId).not.toBe(r2.value.tokenId);
  });
});
