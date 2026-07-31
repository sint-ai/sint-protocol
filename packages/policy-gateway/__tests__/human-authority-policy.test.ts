/**
 * Human authority policy tests.
 */

import { describe, expect, it } from "vitest";
import { type SintCapabilityToken, type SintRequest } from "@pshkv/core";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";

const root = generateKeypair();
const agent = generateKeypair();

function futureISO(hours = 1): string {
  return new Date(Date.now() + hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hours = 1): string {
  return new Date(Date.now() - hours * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(
  overrides: Partial<Parameters<typeof issueCapabilityToken>[0]> = {},
): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "payments://ledger/transfer",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: false,
      humanAuthorityRequirements: {
        requiredAssuranceLevel: "humanhood",
        allowedProofProviders: ["verifier://human-proof"],
        maxProofAgeMs: 10 * 60 * 1000,
        requiredBinding: {
          applicationId: "human-authority-runtime",
          siteId: "site-7",
          resource: "payments://ledger/transfer",
          action: "call",
          valueCurrency: "USD",
          minValue: 10,
          maxValue: 100,
        },
        allowedDelegationDepth: 2,
        requireUniquePrincipal: true,
      },
      ...overrides,
    },
    root.privateKey,
  );
  if (!result.ok) {
    throw new Error(`Token issuance failed: ${result.error}`);
  }
  return result.value;
}

let seq = 0;
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  const suffix = String(++seq).padStart(4, "0");
  return {
    requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5${suffix}` as any,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: token.resource,
    action: "call",
    params: {
      amount: 50,
      currency: "USD",
    },
    executionContext: {
      siteId: "site-7",
      executor: {
        runtimeId: "human-authority-runtime",
      },
      humanAuthority: {
        principalRef: "did:example:human-001",
        assuranceLevel: "contextual_binding",
        proofRef: "proof://human-001",
        proofHash: "a".repeat(64),
        verifierRef: "verifier://human-proof",
        observedAt: futureISO(0),
        binding: {
          applicationId: "human-authority-runtime",
          siteId: "site-7",
          resource: token.resource,
          action: "call",
          valueCurrency: "USD",
          minValue: 10,
          maxValue: 100,
        },
        delegationChain: {
          depth: 1,
          rootPrincipalRef: "did:example:human-001",
        },
      },
    },
    ...overrides,
  };
}

describe("HumanAuthorityPolicy", () => {
  it("allows a request with a valid human authority proof", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const decision = await gateway.intercept(makeRequest(token));

    expect(decision.action).toBe("allow");
  });

  it("denies a request when the human authority proof is missing", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const request = makeRequest(token, {
      executionContext: {
        siteId: "site-7",
        executor: {
          runtimeId: "human-authority-runtime",
        },
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HUMAN_AUTHORITY_MISSING");
  });

  it("denies a request when the proof is stale or too permissive", async () => {
    const token = makeToken({
      humanAuthorityRequirements: {
        requiredAssuranceLevel: "delegation",
        maxProofAgeMs: 1_000,
      },
    });
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });

    const request = makeRequest(token, {
      executionContext: {
        siteId: "site-7",
        executor: {
          runtimeId: "human-authority-runtime",
        },
        humanAuthority: {
          principalRef: "did:example:human-001",
          assuranceLevel: "delegation",
          proofRef: "proof://human-001",
          proofHash: "b".repeat(64),
          verifierRef: "verifier://human-proof",
          observedAt: pastISO(2),
        },
      },
    });

    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HUMAN_AUTHORITY_PROOF_STALE");
  });
});
