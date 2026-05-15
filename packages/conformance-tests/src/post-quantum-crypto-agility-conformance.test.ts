/**
 * Post-quantum crypto-agility conformance.
 *
 * This test intentionally does not claim PQ verification support. It locks the
 * migration contract: classic Ed25519 remains compatible, while mandatory
 * hybrid/PQ profiles fail closed until a real verifier implementation exists.
 */

import { describe, expect, it } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  sign,
  validateCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";
import { computeSigningPayload } from "@pshkv/gate-capability-tokens";
import { loadPostQuantumCryptoAgilityFixture } from "./fixture-loader.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Post-quantum crypto agility fixture v1", () => {
  const fixture = loadPostQuantumCryptoAgilityFixture();

  function baseRequest(): {
    request: SintCapabilityTokenRequest;
    issuerPrivateKey: string;
  } {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    return {
      issuerPrivateKey: issuer.privateKey,
      request: {
        issuer: issuer.publicKey,
        subject: subject.publicKey,
        resource: "mcp://filesystem/readFile",
        actions: ["call"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(4),
        revocable: true,
      },
    };
  }

  it("declares the migration contract", () => {
    expect(fixture.fixtureId).toBe("post-quantum-crypto-agility-v1");
    expect(fixture.requirements).toEqual({
      signingPayloadBindsCryptoProfile: true,
      unsupportedMandatoryProfilesFailClosed: true,
      postQuantumSignatureMetadataPreserved: true,
      preferredFirstProductionProfile: "hybrid-ed25519-mldsa65",
    });
  });

  it("keeps classic Ed25519 tokens valid", () => {
    const { request, issuerPrivateKey } = baseRequest();
    const result = issueCapabilityToken(request, issuerPrivateKey);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const validation = validateCapabilityToken(result.value, {
      resource: request.resource,
      action: "call",
    });
    expect(validation.ok).toBe(true);
  });

  it("fails closed for mandatory hybrid/PQ profiles until verifier support is wired", () => {
    for (const profile of fixture.profiles.filter((p) => p.expectedValidation === "deny")) {
      const { request, issuerPrivateKey } = baseRequest();
      const result = issueCapabilityToken(
        {
          ...request,
          cryptoProfile: profile.cryptoProfile,
          postQuantumSignatures: [
            {
              algorithm: profile.signatureFamilies.includes("ML-DSA-65")
                ? "ML-DSA-65"
                : "SLH-DSA-SHA2-128s",
              publicKeyRef: `pq://issuer/${profile.cryptoProfile}/2026-05`,
              signature: "pq-signature-placeholder",
            },
          ],
        },
        issuerPrivateKey,
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBe(profile.expectedError);
    }
  });

  it("allows explicit verifier providers to handle reserved profiles", () => {
    const { request, issuerPrivateKey } = baseRequest();
    const result = issueCapabilityToken(request, issuerPrivateKey);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const unsignedHybrid = {
      ...result.value,
      cryptoProfile: "hybrid-ed25519-mldsa65",
      postQuantumSignatures: [
        {
          algorithm: "ML-DSA-65",
          publicKeyRef: "pq://issuer/ml-dsa-65/2026-05",
          signature: "pq-signature-placeholder",
        },
      ],
    } as Omit<SintCapabilityToken, "signature">;
    const hybrid = {
      ...unsignedHybrid,
      signature: sign(issuerPrivateKey, computeSigningPayload(unsignedHybrid)),
    } as SintCapabilityToken;

    const validation = validateCapabilityToken(hybrid, {
      resource: request.resource,
      action: "call",
      cryptoProfileVerifiers: {
        "hybrid-ed25519-mldsa65": ({ signingPayload }) => {
          expect(signingPayload).toContain("hybrid-ed25519-mldsa65");
          return { ok: true, value: true };
        },
      },
    });
    expect(validation.ok).toBe(true);
  });

  it("binds crypto profile fields into the signing payload", () => {
    const { request, issuerPrivateKey } = baseRequest();
    const result = issueCapabilityToken(request, issuerPrivateKey);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const classicPayload = computeSigningPayload(result.value);
    const hybridPayload = computeSigningPayload({
      ...result.value,
      cryptoProfile: "hybrid-ed25519-mldsa65",
      postQuantumSignatures: [
        {
          algorithm: "ML-DSA-65",
          publicKeyRef: "pq://issuer/ml-dsa-65/2026-05",
          signature: "pq-signature-placeholder",
        },
      ],
    });

    expect(hybridPayload).not.toBe(classicPayload);
    expect(hybridPayload).toContain("hybrid-ed25519-mldsa65");
    expect(hybridPayload).toContain("ML-DSA-65");
  });
});
