/**
 * SINT PolicyGateway — Rate-limit enforcement tests.
 *
 * Verifies that tokens carrying a `rateLimit` constraint are blocked
 * by the PolicyGateway after maxCalls within the window.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { InMemoryRateLimitStore } from "@sint/persistence";
import type { SintCapabilityToken, SintCapabilityTokenRequest, SintRequest } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(overrides: Partial<SintRequest> & { tokenId: string; agentId: string }): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: "mcp://filesystem/readFile",
    action: "call",
    params: {},
    ...overrides,
  };
}

describe("PolicyGateway — rate-limit enforcement", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let rateLimitStore: InMemoryRateLimitStore;
  let gateway: PolicyGateway;

  function issueRateLimitedToken(maxCalls: number, windowMs: number): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {
        rateLimit: { maxCalls, windowMs },
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(1),
      revocable: false,
    };
    const result = issueCapabilityToken(req, root.privateKey);
    if (!result.ok) throw new Error("Token issuance failed");
    return result.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    rateLimitStore = new InMemoryRateLimitStore();
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      rateLimitStore,
    });
  });

  it("allows requests under the rate limit", async () => {
    const token = issueRateLimitedToken(5, 60_000);
    tokenStore.set(token.tokenId, token);

    for (let i = 0; i < 5; i++) {
      const req = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f${i.toString().padStart(3, "0")}` as any });
      const decision = await gateway.intercept(req);
      expect(decision.action).not.toBe("deny");
    }
  });

  it("denies the (maxCalls+1)th request in the window", async () => {
    const token = issueRateLimitedToken(3, 60_000);
    tokenStore.set(token.tokenId, token);

    for (let i = 0; i < 3; i++) {
      const req = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f${i.toString().padStart(3, "0")}` as any });
      await gateway.intercept(req);
    }

    // 4th call exceeds limit
    const overflow = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f999" as any });
    const decision = await gateway.intercept(overflow);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("denial message includes count and limit", async () => {
    const token = issueRateLimitedToken(2, 60_000);
    tokenStore.set(token.tokenId, token);

    for (let i = 0; i < 2; i++) {
      await gateway.intercept(makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12, "0")}` as any }));
    }
    const decision = await gateway.intercept(makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-9a1e-999999999999" as any }));

    expect(decision.denial?.reason).toContain("3/2");
    expect(decision.denial?.reason).toContain("60000ms");
  });

  it("token without rateLimit is never blocked by rate-limit check", async () => {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: {},   // no rateLimit
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(1),
      revocable: false,
    };
    const result = issueCapabilityToken(req, root.privateKey);
    if (!result.ok) throw new Error("Token issuance failed");
    const token = result.value;
    tokenStore.set(token.tokenId, token);

    for (let i = 0; i < 20; i++) {
      const r = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12, "0")}` as any });
      const d = await gateway.intercept(r);
      expect(d.action).not.toBe("deny");
    }
  });

  it("gateway without rateLimitStore ignores rateLimit in token", async () => {
    // Gateway configured without rateLimitStore — should not block
    const gatewayNoRl = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      // no rateLimitStore
    });
    const token = issueRateLimitedToken(1, 60_000);
    tokenStore.set(token.tokenId, token);

    for (let i = 0; i < 5; i++) {
      const r = makeRequest({ tokenId: token.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-9a1e-${String(i).padStart(12, "0")}` as any });
      const d = await gatewayNoRl.intercept(r);
      expect(d.action).not.toBe("deny");
    }
  });

  it("different tokens have independent rate-limit counters", async () => {
    const tokenA = issueRateLimitedToken(2, 60_000);
    const req2: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
      constraints: { rateLimit: { maxCalls: 2, windowMs: 60_000 } },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(1),
      revocable: false,
    };
    const resB = issueCapabilityToken(req2, root.privateKey);
    if (!resB.ok) throw new Error();
    const tokenB = resB.value;

    tokenStore.set(tokenA.tokenId, tokenA);
    tokenStore.set(tokenB.tokenId, tokenB);

    // Exhaust token A
    for (let i = 0; i < 2; i++) {
      await gateway.intercept(makeRequest({ tokenId: tokenA.tokenId, agentId: agent.publicKey,
        requestId: `01905f7c-4e8a-7b3d-aaaa-${String(i).padStart(12, "0")}` as any }));
    }
    const deniedA = await gateway.intercept(makeRequest({ tokenId: tokenA.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-aaaa-999999999999" as any }));
    expect(deniedA.action).toBe("deny");

    // Token B should still be allowed (different counter)
    const allowedB = await gateway.intercept(makeRequest({ tokenId: tokenB.tokenId, agentId: agent.publicKey,
      requestId: "01905f7c-4e8a-7b3d-bbbb-000000000001" as any }));
    expect(allowedB.action).not.toBe("deny");
  });

  it("InMemoryRateLimitStore.getCount returns 0 for unknown key", async () => {
    const count = await rateLimitStore.getCount("sint:rate:nonexistent:0");
    expect(count).toBe(0);
  });

  it("InMemoryRateLimitStore increments correctly", async () => {
    const key = "sint:rate:test-token:bucket1";
    expect(await rateLimitStore.increment(key, 60_000)).toBe(1);
    expect(await rateLimitStore.increment(key, 60_000)).toBe(2);
    expect(await rateLimitStore.increment(key, 60_000)).toBe(3);
    expect(await rateLimitStore.getCount(key)).toBe(3);
  });
});
