/**
 * Backward compatibility conformance for v0-style clients.
 *
 * Ensures additive v0.2 fields do not break older token/request payloads.
 */

import { describe, expect, it } from "vitest";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint-ai/core";
import {
  delegateCapabilityToken,
  type DelegationParams,
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  validateCapabilityToken,
} from "@sint-ai/gate-capability-tokens";
import { PolicyGateway } from "@sint-ai/gate-policy-gateway";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Backward Compatibility (v0 clients)", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const delegated = generateKeypair();

  function legacyTokenRequest(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityTokenRequest {
    return {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };
  }

  it("legacy token payloads without v0.2 optional fields remain valid", () => {
    const issued = issueCapabilityToken(legacyTokenRequest(), root.privateKey);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const validation = validateCapabilityToken(issued.value, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    expect(validation.ok).toBe(true);
  });

  it("legacy requests without executionContext continue to pass gateway", async () => {
    const issued = issueCapabilityToken(legacyTokenRequest(), root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    const token = issued.value;
    const tokenStore = new Map<string, SintCapabilityToken>([[token.tokenId, token]]);
    const gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
    });

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    expect(decision.action).toBe("allow");
  });

  it("legacy delegation requests remain valid without new optional fields", () => {
    const issued = issueCapabilityToken(
      legacyTokenRequest({
        resource: "ros2:///*",
        actions: ["subscribe", "publish"],
      }),
      root.privateKey,
    );
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }

    const delegatedRequest: DelegationParams = {
      newSubject: delegated.publicKey,
      restrictActions: ["subscribe"],
      expiresAt: futureISO(2),
    };

    const delegatedResult = delegateCapabilityToken(
      issued.value,
      delegatedRequest,
      agent.privateKey,
    );
    expect(delegatedResult.ok).toBe(true);
  });
});
