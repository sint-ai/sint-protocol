/**
 * SINT Protocol — ASI04 SupplyChainVerifier tests.
 *
 * 10 test cases covering:
 * 1. Matching fingerprint → verified
 * 2. Mismatched fingerprint → high severity violation
 * 3. Model ID in allowlist → verified
 * 4. Model ID NOT in allowlist → high severity
 * 5. Bridge protocol mismatch → medium severity
 * 6. No modelConstraints on token → verified (nothing to check)
 * 7. Gateway: high severity → SUPPLY_CHAIN_VIOLATION deny
 * 8. Gateway: medium severity → warning event, allow
 * 9. Gateway: plugin error → fail-open
 * 10. "agent.supply_chain.warning" event emitted for medium
 */

import { describe, it, expect, vi } from "vitest";
import { DefaultSupplyChainVerifier } from "../src/supply-chain.js";
import type { SupplyChainVerifierPlugin } from "../src/supply-chain.js";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint-ai/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@sint-ai/core";

const VALID_HASH_A = "a".repeat(64);
const VALID_HASH_B = "b".repeat(64);

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function makeToken(overrides: Partial<Parameters<typeof issueCapabilityToken>[0]> = {}): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(),
      revocable: false,
      ...overrides,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

let _seq = 0;
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  const seq = String(++_seq).padStart(4, "0");
  return {
    requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5${seq}` as any,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: token.resource,
    action: "call",
    params: {},
    ...overrides,
  };
}

describe("DefaultSupplyChainVerifier", () => {
  it("1. Matching fingerprint → verified", () => {
    const verifier = new DefaultSupplyChainVerifier();
    const token = makeToken({
      modelConstraints: { modelFingerprintHash: VALID_HASH_A },
    });
    const request = makeRequest(token, {
      executionContext: { model: { modelFingerprintHash: VALID_HASH_A } },
    });
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("2. Mismatched fingerprint → high severity violation", () => {
    const verifier = new DefaultSupplyChainVerifier();
    const token = makeToken({
      modelConstraints: { modelFingerprintHash: VALID_HASH_A },
    });
    const request = makeRequest(token, {
      executionContext: { model: { modelFingerprintHash: VALID_HASH_B } },
    });
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(false);
    expect(result.severity).toBe("high");
    expect(result.violations.some((v) => v.includes("fingerprint mismatch"))).toBe(true);
  });

  it("3. Model ID in allowlist → verified", () => {
    const verifier = new DefaultSupplyChainVerifier();
    const token = makeToken({
      modelConstraints: { allowedModelIds: ["gpt-5.4", "gemini-robotics"] },
    });
    const request = makeRequest(token, {
      executionContext: { model: { modelId: "gpt-5.4" } },
    });
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("4. Model ID NOT in allowlist → high severity", () => {
    const verifier = new DefaultSupplyChainVerifier();
    const token = makeToken({
      modelConstraints: { allowedModelIds: ["gpt-5.4", "gemini-robotics"] },
    });
    const request = makeRequest(token, {
      executionContext: { model: { modelId: "llama-4-adversarial" } },
    });
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(false);
    expect(result.severity).toBe("high");
    expect(result.violations.some((v) => v.includes("not in allowlist"))).toBe(true);
  });

  it("5. Bridge protocol mismatch → medium severity", () => {
    const verifier = new DefaultSupplyChainVerifier();
    // Token resource is mcp:// scheme
    const token = makeToken({ resource: "mcp://filesystem/readFile", actions: ["call"] });
    const request = makeRequest(token, {
      params: { bridgeProtocol: "ros2" },
    });
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(false);
    expect(result.severity).toBe("medium");
    expect(result.violations.some((v) => v.includes("Bridge protocol mismatch"))).toBe(true);
  });

  it("6. No modelConstraints on token → verified (nothing to check)", () => {
    const verifier = new DefaultSupplyChainVerifier();
    const token = makeToken(); // no modelConstraints
    const request = makeRequest(token);
    const result = verifier.verify(request, token);
    expect(result.verified).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe("SupplyChainVerifier — Gateway integration", () => {
  it("7. high severity → SUPPLY_CHAIN_VIOLATION deny", async () => {
    // Use a token without modelConstraints so built-in validator doesn't block first.
    // The supply chain verifier plugin returns high severity unconditionally.
    const token = makeToken(); // no modelConstraints
    const tokenStore = new Map([[token.tokenId, token]]);

    const alwaysHighVerifier: SupplyChainVerifierPlugin = {
      verify: () => ({
        verified: false,
        violations: ["Tampered tool binary detected"],
        severity: "high",
      }),
    };

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      supplyChainVerifier: alwaysHighVerifier,
    });

    const request = makeRequest(token);
    const decision = await gateway.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SUPPLY_CHAIN_VIOLATION");
  });

  it("8. medium severity → warning event emitted, request allowed", async () => {
    const token = makeToken({ resource: "mcp://filesystem/readFile", actions: ["call"] });
    const tokenStore = new Map([[token.tokenId, token]]);
    const emitSpy = vi.fn();

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      emitLedgerEvent: emitSpy,
      supplyChainVerifier: new DefaultSupplyChainVerifier(),
    });

    // Bridge protocol mismatch → medium
    const request = makeRequest(token, {
      params: { bridgeProtocol: "ros2" },
    });
    const decision = await gateway.intercept(request);

    // Should NOT be denied
    expect(decision.action).not.toBe("deny");

    // Warning event should be emitted
    const warningEvent = emitSpy.mock.calls.find(
      (call) => call[0]?.eventType === "agent.supply_chain.warning",
    );
    expect(warningEvent).toBeDefined();
  });

  it("9. plugin error → fail-open (request proceeds normally)", async () => {
    const token = makeToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });
    const tokenStore = new Map([[token.tokenId, token]]);

    const brokenVerifier: SupplyChainVerifierPlugin = {
      verify: () => { throw new Error("verifier internal failure"); },
    };

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      supplyChainVerifier: brokenVerifier,
    });

    const request = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gateway.intercept(request);

    // Fail-open: should not deny due to verifier error
    expect(decision.action).not.toBe("deny");
  });

  it("10. 'agent.supply_chain.warning' event emitted for medium severity", async () => {
    const token = makeToken({ resource: "mcp://tools/search", actions: ["call"] });
    const tokenStore = new Map([[token.tokenId, token]]);
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      emitLedgerEvent: (e) => events.push(e as typeof events[0]),
      supplyChainVerifier: new DefaultSupplyChainVerifier(),
    });

    // Bridge mismatch → medium → warning event
    const request = makeRequest(token, {
      params: { bridgeProtocol: "ros2" },
    });
    await gateway.intercept(request);

    const warningEvent = events.find((e) => e.eventType === "agent.supply_chain.warning");
    expect(warningEvent).toBeDefined();
    expect(warningEvent?.payload?.severity).toBe("medium");
  });
});
