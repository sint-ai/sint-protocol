/**
 * SINT Gateway Server — Authentication middleware tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import {
  generateKeypair,
  issueCapabilityToken,
  sign,
} from "@sint/gate-capability-tokens";
import type { SintCapabilityTokenRequest } from "@sint/core";
import { clearRateLimits } from "../src/middleware/auth.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Authentication Middleware", () => {
  const root = generateKeypair();
  const agent = generateKeypair();

  afterEach(() => {
    clearRateLimits();
  });

  // ── Ed25519 Signature Auth ──

  describe("Ed25519 request signing", () => {
    let ctx: ServerContext;
    let app: Hono;

    beforeEach(() => {
      ctx = createContext();
      app = createApp(ctx, { requireSignatures: true });
    });

    async function storeToken() {
      const request: SintCapabilityTokenRequest = {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///camera/front",
        actions: ["subscribe"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(12),
        revocable: true,
      };
      const result = issueCapabilityToken(request, root.privateKey);
      if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
      await ctx.tokenStore.store(result.value);
      return result.value;
    }

    it("allows requests with valid Ed25519 signature", async () => {
      const token = await storeToken();
      const body = JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
      });

      const signature = sign(agent.privateKey, body);

      const res = await app.request("/v1/intercept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ed25519-Signature": `${agent.publicKey}:${signature}`,
        },
        body,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe("allow");
    });

    it("rejects requests with missing signature header", async () => {
      const res = await app.request("/v1/intercept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Missing Ed25519-Signature");
    });

    it("rejects requests with invalid signature", async () => {
      const body = JSON.stringify({ test: true });
      const wrongKey = generateKeypair();
      const signature = sign(wrongKey.privateKey, body);

      const res = await app.request("/v1/intercept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ed25519-Signature": `${agent.publicKey}:${signature}`,
        },
        body,
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Invalid Ed25519 signature");
    });

    it("rejects malformed signature header", async () => {
      const res = await app.request("/v1/intercept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ed25519-Signature": "not-a-valid-format",
        },
        body: JSON.stringify({ test: true }),
      });

      expect(res.status).toBe(401);
    });

    it("exempts /v1/health from signature requirement", async () => {
      const res = await app.request("/v1/health");
      expect(res.status).toBe(200);
    });

    it("exempts /.well-known/sint.json from signature requirement", async () => {
      const res = await app.request("/.well-known/sint.json");
      expect(res.status).toBe(200);
    });

    it("exempts /v1/keypair from signature requirement", async () => {
      const res = await app.request("/v1/keypair", { method: "POST" });
      expect(res.status).toBe(200);
    });
  });

  // ── API Key Auth ──

  describe("API key authentication", () => {
    const TEST_API_KEY = "test-admin-key-12345";
    let ctx: ServerContext;
    let app: Hono;

    beforeEach(() => {
      ctx = createContext();
      app = createApp(ctx, { apiKey: TEST_API_KEY });
    });

    it("allows admin endpoints with valid API key", async () => {
      const res = await app.request("/v1/ledger", {
        headers: { "X-API-Key": TEST_API_KEY },
      });

      expect(res.status).toBe(200);
    });

    it("rejects admin endpoints without API key", async () => {
      const res = await app.request("/v1/ledger");
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Missing X-API-Key");
    });

    it("rejects admin endpoints with wrong API key", async () => {
      const res = await app.request("/v1/ledger", {
        headers: { "X-API-Key": "wrong-key" },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Invalid API key");
    });

    it("exempts /v1/health from API key requirement", async () => {
      const res = await app.request("/v1/health");
      expect(res.status).toBe(200);
    });

    it("exempts /.well-known/sint.json from API key requirement", async () => {
      const res = await app.request("/.well-known/sint.json");
      expect(res.status).toBe(200);
    });

    it("skips API key auth when no key is configured (dev mode)", async () => {
      const devApp = createApp(ctx);
      const res = await devApp.request("/v1/ledger");
      expect(res.status).toBe(200);
    });
  });

  // ── Rate Limiting ──

  describe("Rate limiting", () => {
    let ctx: ServerContext;
    let app: Hono;

    beforeEach(() => {
      ctx = createContext();
      app = createApp(ctx, { rateLimitMax: 3, rateLimitWindowMs: 60_000 });
    });

    it("allows requests within rate limit", async () => {
      const res1 = await app.request("/v1/health");
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

      const res2 = await app.request("/v1/health");
      expect(res2.status).toBe(200);
    });

    it("returns 429 when rate limit exceeded", async () => {
      // Exhaust the limit (3 requests)
      await app.request("/v1/health");
      await app.request("/v1/health");
      await app.request("/v1/health");

      // 4th request should be rate limited
      const res = await app.request("/v1/health");
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toContain("Rate limit exceeded");
    });

    it("includes rate limit headers", async () => {
      const res = await app.request("/v1/health");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
    });
  });
});
