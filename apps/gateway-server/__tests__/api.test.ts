/**
 * SINT Gateway Server — API end-to-end tests.
 *
 * Tests HTTP endpoints using Hono's built-in test client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint/gate-capability-tokens";
import type { SintCapabilityTokenRequest } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Gateway Server API", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  function issueAndStoreToken(
    overrides?: Partial<SintCapabilityTokenRequest>,
  ) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    ctx.tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  // ── Health ──

  it("GET /v1/health returns 200", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.protocol).toBe("SINT Gate");
  });

  // ── Intercept ──

  it("POST /v1/intercept with valid request", async () => {
    const token = issueAndStoreToken();

    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("allow");
  });

  it("POST /v1/intercept with invalid request returns 400", async () => {
    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
  });

  // ── Batch Intercept ──

  it("POST /v1/intercept/batch returns 207", async () => {
    const token = issueAndStoreToken();
    const timestamp = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

    const res = await app.request("/v1/intercept/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
          timestamp,
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///camera/front",
          action: "subscribe",
          params: {},
        },
        {
          requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a8",
          timestamp,
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///camera/front",
          action: "subscribe",
          params: {},
        },
      ]),
    });

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe(200);
  });

  it("POST /v1/intercept/batch rejects non-array", async () => {
    const res = await app.request("/v1/intercept/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "array" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Tokens ──

  it("POST /v1/tokens issues a new token", async () => {
    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: {
          issuer: root.publicKey,
          subject: agent.publicKey,
          resource: "ros2:///cmd_vel",
          actions: ["publish"],
          constraints: { maxVelocityMps: 0.5 },
          delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
          expiresAt: futureISO(12),
          revocable: true,
        },
        privateKey: root.privateKey,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tokenId).toBeDefined();
    expect(ctx.tokenStore.has(body.tokenId)).toBe(true);
  });

  // ── Token Revocation ──

  it("POST /v1/tokens/revoke revokes a token", async () => {
    const token = issueAndStoreToken();

    const res = await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: token.tokenId,
        reason: "Security incident",
        revokedBy: "admin",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revoked");
  });

  it("POST /v1/tokens/revoke rejects missing fields", async () => {
    const res = await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenId: "abc" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Ledger ──

  it("GET /v1/ledger returns events", async () => {
    const token = issueAndStoreToken();

    // Generate some ledger events via intercept
    await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
      }),
    });

    const res = await app.request("/v1/ledger");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.chainIntegrity).toBe(true);
  });

  // ── Keypair ──

  it("POST /v1/keypair generates a keypair", async () => {
    const res = await app.request("/v1/keypair", { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.publicKey).toBeDefined();
    expect(body.privateKey).toBeDefined();
    expect(body.publicKey).toHaveLength(64);
  });

  // ── Request ID header ──

  it("responses include x-request-id header", async () => {
    const res = await app.request("/v1/health");
    expect(res.headers.get("x-request-id")).toBeDefined();
  });
});
