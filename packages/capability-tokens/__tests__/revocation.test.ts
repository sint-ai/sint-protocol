import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "../src/index.js";
import type { SintCapabilityTokenRequest } from "@sint-ai/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Revocation Store", () => {
  const store = new RevocationStore();
  const issuer = generateKeypair();
  const subject = generateKeypair();

  function issueTestToken() {
    const request: SintCapabilityTokenRequest = {
      issuer: issuer.publicKey,
      subject: subject.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
    };
    const result = issueCapabilityToken(request, issuer.privateKey);
    if (!result.ok) throw new Error("Failed to issue test token");
    return result.value;
  }

  it("should report non-revoked tokens as valid", () => {
    const token = issueTestToken();
    const result = store.checkRevocation(token.tokenId);
    expect(result.ok).toBe(true);
  });

  it("should detect revoked tokens immediately", () => {
    const token = issueTestToken();
    store.revoke(token.tokenId, "Security incident", "admin");

    const result = store.checkRevocation(token.tokenId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("TOKEN_REVOKED");
  });

  it("should store revocation records with metadata", () => {
    const token = issueTestToken();
    store.revoke(token.tokenId, "Test revocation", "test-admin");

    const record = store.getRevocationRecord(token.tokenId);
    expect(record).toBeDefined();
    expect(record!.reason).toBe("Test revocation");
    expect(record!.revokedBy).toBe("test-admin");
    expect(record!.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("should support bulk revocation checking", () => {
    const t1 = issueTestToken();
    const t2 = issueTestToken();
    const t3 = issueTestToken();

    store.revoke(t2.tokenId, "Revoked t2", "admin");

    const result = store.checkBulkRevocation([t1.tokenId, t2.tokenId, t3.tokenId]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("TOKEN_REVOKED");
  });
});
