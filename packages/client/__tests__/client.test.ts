/**
 * SINT Client SDK — Tests.
 *
 * Tests the SintClient against a real Hono app instance (no network).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SintClient } from "../src/sint-client.js";
import {
  createApp,
  createContext,
  type ServerContext,
} from "@sint/gateway-server";
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

describe("SintClient", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;
  let client: SintClient;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);

    // Create a client that uses Hono's built-in request() as fetch
    client = new SintClient({
      baseUrl: "http://localhost",
      fetch: (input, init) => app.request(
        typeof input === "string" ? input.replace("http://localhost", "") : input,
        init,
      ),
    });
  });

  async function issueAndStoreToken(overrides?: Partial<SintCapabilityTokenRequest>) {
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
    await ctx.tokenStore.store(result.value);
    return result.value;
  }

  it("health() returns server status", async () => {
    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(result.protocol).toBe("SINT Gate");
  });

  it("intercept() evaluates a request", async () => {
    const token = await issueAndStoreToken();
    const result = await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    expect(result.action).toBe("allow");
  });

  it("interceptBatch() evaluates multiple requests", async () => {
    const token = await issueAndStoreToken();
    const timestamp = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
    const results = await client.interceptBatch([
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
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe(200);
  });

  it("issueToken() issues a new token", async () => {
    const result = await client.issueToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///cmd_vel",
        actions: ["publish"],
        constraints: { maxVelocityMps: 0.5 },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(12),
        revocable: true,
      },
      root.privateKey,
    );
    expect(result.tokenId).toBeDefined();
    expect(await ctx.tokenStore.get(result.tokenId)).toBeDefined();
  });

  it("revokeToken() revokes a token", async () => {
    const token = await issueAndStoreToken();
    const result = await client.revokeToken(
      token.tokenId,
      "Security incident",
      "admin",
    );
    expect(result.status).toBe("revoked");
  });

  it("queryLedger() returns events", async () => {
    const token = await issueAndStoreToken();
    await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    const result = await client.queryLedger();
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.chainIntegrity).toBe(true);
  });

  it("generateKeypair() generates Ed25519 keypair", async () => {
    const kp = await client.generateKeypair();
    expect(kp.publicKey).toHaveLength(64);
    expect(kp.privateKey).toBeDefined();
  });

  it("pendingApprovals() lists pending requests", async () => {
    const token = await issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
    await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    });
    const pending = await client.pendingApprovals();
    expect(pending.count).toBe(1);
  });

  it("resolveApproval() approves a pending request", async () => {
    const token = await issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
    const interceptResult = await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    });
    const result = await client.resolveApproval(
      interceptResult.approvalRequestId!,
      "approved",
      "operator-1",
    );
    expect(result.resolution.status).toBe("approved");
  });

  it("intercept() throws on invalid request", async () => {
    await expect(
      client.intercept({
        requestId: "",
        timestamp: "",
        agentId: "",
        tokenId: "",
        resource: "",
        action: "",
      }),
    ).rejects.toThrow("Intercept failed");
  });
});
