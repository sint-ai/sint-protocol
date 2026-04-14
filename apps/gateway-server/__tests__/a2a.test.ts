/**
 * SINT Gateway Server — A2A route tests.
 *
 * Tests the A2A JSON-RPC 2.0 HTTP endpoints using Hono's built-in test client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import type { A2ARouteContext } from "../src/routes/a2a.js";
import { AgentCardRegistry } from "@pshkv/bridge-a2a";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";

const WEATHER_AGENT_CARD = {
  url: "https://agents.example.com/weather",
  name: "Weather Agent",
  version: "1.0.0",
  skills: [
    { id: "report", name: "Weather Report", tags: ["read-only"] },
  ],
};

function futureISO(h: number) {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

describe("Gateway Server — A2A Routes", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;
  let registry: AgentCardRegistry;
  let token: SintCapabilityToken;

  beforeEach(async () => {
    ctx = createContext();
    registry = new AgentCardRegistry();
    registry.register(WEATHER_AGENT_CARD as any);

    const tokenReq: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "a2a://agents.example.com/report",
      actions: ["a2a.send"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(24),
      revocable: false,
    };
    const issued = issueCapabilityToken(tokenReq, root.privateKey);
    if (!issued.ok) throw new Error("Token issuance failed");
    token = issued.value;
    await ctx.tokenStore.store(token);

    const a2aCtx: A2ARouteContext = {
      serverContext: ctx,
      registry,
      resolveToken: (id) => (id === agent.publicKey ? token.tokenId : undefined),
    };

    app = createApp(ctx, { a2aContext: a2aCtx });
  });

  // ── Agent Card registry ──────────────────────────────────────────────────

  it("GET /v1/a2a/agents returns registered agents", async () => {
    const res = await app.request("/v1/a2a/agents");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.agents[0].url).toBe("https://agents.example.com/weather");
  });

  it("POST /v1/a2a/agents registers a new Agent Card", async () => {
    const card = {
      url: "https://agents.example.com/new-agent",
      name: "New Agent",
      version: "1.0.0",
      skills: [{ id: "task", name: "Task" }],
    };
    const res = await app.request("/v1/a2a/agents", {
      method: "POST",
      body: JSON.stringify(card),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.registered).toBe(true);

    const listRes = await app.request("/v1/a2a/agents");
    const list = await listRes.json();
    expect(list.total).toBe(2);
  });

  it("POST /v1/a2a/agents rejects invalid card", async () => {
    const res = await app.request("/v1/a2a/agents", {
      method: "POST",
      body: JSON.stringify({ name: "No URL" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  // ── JSON-RPC dispatcher ──────────────────────────────────────────────────

  it("POST /v1/a2a returns parse error for invalid JSON", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("POST /v1/a2a returns error when targetAgentUrl missing", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: { id: "task-1", message: { role: "user", parts: [] } },
      }),
      headers: {
        "Content-Type": "application/json",
        "X-SINT-Agent-Id": agent.publicKey,
      },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32602); // INVALID_PARAMS
  });

  it("POST /v1/a2a returns 404 for unregistered target agent", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: {
          id: "task-1",
          targetAgentUrl: "https://agents.example.com/unknown",
          message: { role: "user", parts: [{ type: "text", text: "Hi" }] },
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "X-SINT-Agent-Id": agent.publicKey,
      },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32001); // TASK_NOT_FOUND
  });

  it("POST /v1/a2a returns 401 when no agent header", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: {
          id: "task-1",
          targetAgentUrl: "https://agents.example.com/weather",
          skillId: "report",
          message: { role: "user", parts: [{ type: "text", text: "Weather?" }] },
        },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-33001); // SINT_POLICY_DENY
  });

  it("POST /v1/a2a tasks/send returns forward result when approved", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/send",
        params: {
          id: "task-report-001",
          targetAgentUrl: "https://agents.example.com/weather",
          skillId: "report",
          message: { role: "user", parts: [{ type: "text", text: "Get weather report" }] },
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "X-SINT-Agent-Id": agent.publicKey,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.sint.approved).toBe(true);
    expect(body.result.task.id).toBe("task-report-001");
  });

  it("POST /v1/a2a unknown method returns method-not-found", async () => {
    const res = await app.request("/v1/a2a", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/unknown",
        params: {
          targetAgentUrl: "https://agents.example.com/weather",
          message: { role: "user", parts: [] },
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "X-SINT-Agent-Id": agent.publicKey,
      },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32601); // METHOD_NOT_FOUND
  });
});

describe("Gateway Server — A2A Routes Not Configured", () => {
  it("A2A routes not mounted when no a2aContext", async () => {
    const ctx = createContext();
    const app = createApp(ctx); // No a2aContext
    const res = await app.request("/v1/a2a/agents");
    expect(res.status).toBe(404);
  });
});
