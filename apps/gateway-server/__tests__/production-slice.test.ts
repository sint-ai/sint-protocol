/**
 * Production-slice verification path.
 *
 * This is the smallest supported runtime story from NEXT_PRIORITIES.md:
 * issue a capability token, enforce through the gateway HTTP API, persist
 * the decision trail, prove the ledger chain, then revoke and fail closed.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier, type SintCapabilityToken } from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { createApp, createContext } from "../src/server.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  let last = await read();
  for (let i = 0; i < 20; i++) {
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 5));
    last = await read();
  }
  return last;
}

describe("Gateway production slice", () => {
  it("issues, enforces, persists evidence, proves chain, and revokes via the supported HTTP surface", async () => {
    const ctx = createContext();
    const app = createApp(ctx);
    const issuer = generateKeypair();
    const agent = generateKeypair();

    const tokenRequest = {
      issuer: issuer.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
    };

    const issueRes = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: tokenRequest,
        privateKey: issuer.privateKey,
      }),
    });
    expect(issueRes.status).toBe(201);
    const token = (await issueRes.json()) as SintCapabilityToken;

    const storedToken = await ctx.tokenStore.get(token.tokenId);
    expect(storedToken?.tokenId).toBe(token.tokenId);
    expect(storedToken?.resource).toBe(tokenRequest.resource);

    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "mcp://filesystem/readFile",
        action: "call",
        params: { path: "/var/sint/readiness.json" },
      }),
    });
    expect(interceptRes.status).toBe(200);
    const decision = await interceptRes.json();
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);

    const persistedPolicyEvents = await eventually(
      () => ctx.ledgerStore.query({ eventType: "policy.evaluated" }),
      (events) => events.length > 0,
    );
    expect(persistedPolicyEvents.length).toBeGreaterThan(0);
    expect(persistedPolicyEvents[0]?.payload["decision"]).toBe("allow");
    expect(await ctx.ledgerStore.verifyChain()).toBe(true);

    const ledgerRes = await app.request("/v1/ledger?eventType=policy.evaluated");
    expect(ledgerRes.status).toBe(200);
    const ledgerBody = await ledgerRes.json();
    expect(ledgerBody.chainIntegrity).toBe(true);
    expect(ledgerBody.events.length).toBeGreaterThan(0);

    const proofRes = await app.request(`/v1/ledger/${ledgerBody.events[0].eventId}/proof`);
    expect(proofRes.status).toBe(200);
    const proof = await proofRes.json();
    expect(proof.eventId).toBe(ledgerBody.events[0].eventId);
    expect(proof.proofValid).toBe(true);
    expect(proof.verificationSteps.every((step: { valid: boolean }) => step.valid)).toBe(true);

    const revokeRes = await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenId: token.tokenId,
        reason: "production-slice verification complete",
        revokedBy: issuer.publicKey,
      }),
    });
    expect(revokeRes.status).toBe(200);

    const revokedInterceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "mcp://filesystem/readFile",
        action: "call",
        params: { path: "/var/sint/readiness.json" },
      }),
    });
    expect(revokedInterceptRes.status).toBe(200);
    const revokedDecision = await revokedInterceptRes.json();
    expect(revokedDecision.action).toBe("deny");
    expect(revokedDecision.denial.policyViolated).toBe("TOKEN_REVOKED");
  });
});
