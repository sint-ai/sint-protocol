/**
 * SINT Gateway Server — SSE Endpoint Tests.
 *
 * Tests the /v1/approvals/events Server-Sent Events endpoint.
 * Uses Hono's built-in test client to verify SSE stream behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/** Parse SSE text into an array of parsed JSON events. */
function parseSSE(text: string): unknown[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      return JSON.parse(dataLine!.slice(6));
    });
}

describe("SSE Approvals Endpoint", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  async function issueAndStoreToken(
    overrides?: Partial<SintCapabilityTokenRequest>,
  ) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
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

  async function createEscalatedRequest() {
    const token = await issueAndStoreToken();
    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: {},
      }),
    });
    return res.json() as Promise<{ action: string; approvalRequestId: string }>;
  }

  it("GET /v1/approvals/events returns SSE content type", async () => {
    const res = await app.request("/v1/approvals/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("SSE stream includes existing pending approvals", async () => {
    // Create an escalated request first
    await createEscalatedRequest();

    // Connect to SSE — should get the pending request
    const res = await app.request("/v1/approvals/events");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read the first chunk (should contain the queued event)
    const { value } = await reader.read();
    reader.cancel();

    const text = decoder.decode(value);
    const events = parseSSE(text);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect((events[0] as any).type).toBe("queued");
  });

  it("SSE streams new approval events in real-time", async () => {
    // Connect to SSE first (no pending requests yet)
    const res = await app.request("/v1/approvals/events");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Now create an escalated request — the SSE stream should emit it
    await createEscalatedRequest();

    // Give the event time to propagate
    await new Promise((r) => setTimeout(r, 50));

    const { value } = await reader.read();
    reader.cancel();

    const text = decoder.decode(value);
    const events = parseSSE(text);

    // Should have at least the queued event
    const queuedEvent = events.find((e: any) => e.type === "queued");
    expect(queuedEvent).toBeDefined();
  });

  it("SSE streams resolution events", async () => {
    // Create an escalated request
    const { approvalRequestId } = await createEscalatedRequest();

    // Connect to SSE
    const res = await app.request("/v1/approvals/events");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial state (queued events)
    await reader.read();

    // Resolve the approval
    await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "test-operator" }),
    });

    // Give the event time to propagate
    await new Promise((r) => setTimeout(r, 50));

    const { value } = await reader.read();
    reader.cancel();

    const text = decoder.decode(value);
    const events = parseSSE(text);

    const resolvedEvent = events.find((e: any) => e.type === "resolved");
    expect(resolvedEvent).toBeDefined();
    expect((resolvedEvent as any).requestId).toBe(approvalRequestId);
  });

  it("SSE with no pending approvals returns empty stream", async () => {
    const res = await app.request("/v1/approvals/events");
    expect(res.status).toBe(200);

    // Body should be a readable stream
    expect(res.body).toBeDefined();
  });
});
