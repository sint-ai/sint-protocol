/**
 * SINT Gateway Server — Ledger semantic query & chain-of-custody proof route tests.
 *
 * Tests:
 *   GET /v1/ledger/query  — semantic filter endpoint
 *   GET /v1/ledger/:eventId/proof  — NIST chain-of-custody proof
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";

describe("Ledger Query & Proof Routes", () => {
  let ctx: ServerContext;
  let app: Hono;
  const agentId = "c".repeat(64);

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);

    // Seed the in-memory ledger with a few events
    ctx.ledger.append({
      eventType: "agent.registered",
      agentId,
      payload: { resource: "ros2:///camera/front", action: "subscribe", tier: "T0_observe" },
    });
    ctx.ledger.append({
      eventType: "policy.evaluated",
      agentId,
      payload: { resource: "ros2:///cmd_vel", action: "publish", tier: "T2_act" },
    });
    ctx.ledger.append({
      eventType: "action.completed",
      agentId,
      payload: { resource: "ros2:///camera/front", action: "subscribe", tier: "T0_observe" },
    });
  });

  // ── GET /v1/ledger/query ────────────────────────────────────────────────

  it("GET /v1/ledger/query returns 200 with events array", async () => {
    const res = await app.request("/v1/ledger/query");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /v1/ledger/query filters by agentId", async () => {
    const other = "d".repeat(64);
    ctx.ledger.append({ eventType: "token.issued", agentId: other, payload: {} });

    const res = await app.request(`/v1/ledger/query?agentId=${agentId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    for (const event of body.events) {
      expect(event.agentId).toBe(agentId);
    }
  });

  it("GET /v1/ledger/query respects limit param", async () => {
    const res = await app.request("/v1/ledger/query?limit=1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.events.length).toBeLessThanOrEqual(1);
    expect(body.limit).toBe(1);
  });

  it("GET /v1/ledger/query returns events in descending timestamp order", async () => {
    const res = await app.request("/v1/ledger/query");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const timestamps: number[] = body.events.map((e: any) =>
      new Date(e.timestamp).getTime(),
    );
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]!).toBeGreaterThanOrEqual(timestamps[i]!);
    }
  });

  // ── GET /v1/ledger/:eventId/proof ────────────────────────────────────────

  it("GET /v1/ledger/:eventId/proof returns 200 with valid proof for known event", async () => {
    const events = ctx.ledger.getAll();
    const targetEvent = events[1]!; // second event

    const res = await app.request(`/v1/ledger/${targetEvent.eventId}/proof`);
    expect(res.status).toBe(200);
    const proof = await res.json() as any;
    expect(proof.eventId).toBe(targetEvent.eventId);
    expect(proof.proofValid).toBe(true);
    expect(Array.isArray(proof.verificationSteps)).toBe(true);
    expect(typeof proof.chainPosition).toBe("number");
  });

  it("GET /v1/ledger/:eventId/proof returns 404 for unknown eventId", async () => {
    const res = await app.request("/v1/ledger/non-existent-event-id/proof");
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it("GET /v1/ledger/:eventId/proof includes generatedAt timestamp", async () => {
    const events = ctx.ledger.getAll();
    const targetEvent = events[0]!;

    const res = await app.request(`/v1/ledger/${targetEvent.eventId}/proof`);
    expect(res.status).toBe(200);
    const proof = await res.json() as any;
    expect(proof.generatedAt).toBeDefined();
    expect(() => new Date(proof.generatedAt)).not.toThrow();
  });

  it("GET /v1/ledger/:eventId/proof chainPosition is 0 for first event", async () => {
    const events = ctx.ledger.getAll();
    const firstEvent = events[0]!;

    const res = await app.request(`/v1/ledger/${firstEvent.eventId}/proof`);
    expect(res.status).toBe(200);
    const proof = await res.json() as any;
    expect(proof.chainPosition).toBe(0);
  });
});
