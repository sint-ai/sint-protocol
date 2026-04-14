/**
 * SINT Bridge MCP — Middleware tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createSintMiddleware } from "../src/mcp-middleware.js";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
  generateUUIDv7,
  nowISO8601,
} from "@pshkv/gate-capability-tokens";
import { RevocationStore } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityTokenRequest, SintCapabilityToken } from "@pshkv/core";
import type { MCPToolCall } from "../src/types.js";

function futureISO(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("createSintMiddleware", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let tokenStore: Map<string, SintCapabilityToken>;
  let revocationStore: RevocationStore;
  let gateway: PolicyGateway;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore = new RevocationStore();
    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: () => {},
    });
  });

  function issueToken(overrides?: Partial<SintCapabilityTokenRequest>) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://test-server/readFile",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  function makeToolCall(overrides?: Partial<MCPToolCall>): MCPToolCall {
    return {
      callId: generateUUIDv7(),
      serverName: "test-server",
      toolName: "readFile",
      arguments: { path: "/tmp/test.txt" },
      timestamp: nowISO8601(),
      ...overrides,
    };
  }

  it("intercept() forwards allowed tool calls", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    const result = await middleware.intercept({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      toolCall: makeToolCall(),
    });

    expect(result.action).toBe("forward");
  });

  it("intercept() denies calls with revoked tokens", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    // Revoke the token
    revocationStore.revoke(token.tokenId, "test", "admin");

    const result = await middleware.intercept({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      toolCall: makeToolCall(),
    });

    expect(result.action).toBe("deny");
  });

  it("protect() wraps handler and allows valid calls", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    const handler = async (tc: MCPToolCall) => ({
      content: `Read file: ${tc.arguments.path}`,
    });

    const protected_ = middleware.protect(handler, agent.publicKey, token.tokenId);
    const result = await protected_(makeToolCall());
    expect(result.content).toContain("Read file");
  });

  it("protect() throws on denied calls", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    revocationStore.revoke(token.tokenId, "test", "admin");

    const handler = async () => ({ content: "should not reach" });
    const protected_ = middleware.protect(handler, agent.publicKey, token.tokenId);

    await expect(protected_(makeToolCall())).rejects.toThrow("SINT: Tool call denied");
  });

  it("auto-creates sessions per agent", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    expect(middleware.sessionCount).toBe(0);

    await middleware.intercept({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      toolCall: makeToolCall(),
    });

    expect(middleware.sessionCount).toBe(1);

    // Same agent, same session
    await middleware.intercept({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      toolCall: makeToolCall(),
    });

    expect(middleware.sessionCount).toBe(1);
  });

  it("removeSession() cleans up agent sessions", async () => {
    const token = issueToken();
    const middleware = createSintMiddleware({
      gateway,
      serverName: "test-server",
    });

    await middleware.intercept({
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      toolCall: makeToolCall(),
    });

    expect(middleware.sessionCount).toBe(1);
    middleware.removeSession(agent.publicKey);
    expect(middleware.sessionCount).toBe(0);
  });
});
