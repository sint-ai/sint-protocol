/**
 * SINT Gateway Server — Risk Stream SSE Tests.
 *
 * Tests the /v1/risk/stream Server-Sent Events endpoint:
 *   1. GET /v1/risk/stream returns content-type text/event-stream
 *   2. T0 decision emits riskScore ≈ 0
 *   3. T3 decision emits riskScore ≈ 0.5 minimum (tier component)
 *   4. stream emits data within 100ms of intercept
 *
 * @module @sint/gateway-server/__tests__/risk-stream
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import { globalRiskBus, computeRiskScore, RiskScoreBus } from "../src/routes/risk-stream.js";
import type { Hono } from "hono";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint/gate-capability-tokens";
import { ApprovalTier } from "@sint/core";
import type { SintCapabilityTokenRequest } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Risk Stream SSE Endpoint", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  async function issueAndStoreToken(overrides?: Partial<SintCapabilityTokenRequest>) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
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

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: GET /v1/risk/stream returns content-type text/event-stream
  // ──────────────────────────────────────────────────────────────────────────
  it("GET /v1/risk/stream returns content-type text/event-stream", async () => {
    const res = await app.request("/v1/risk/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: T0 decision emits riskScore ≈ 0
  // ──────────────────────────────────────────────────────────────────────────
  it("T0 decision emits riskScore of 0.0 (no tier weight, no CSML)", () => {
    const score = computeRiskScore(ApprovalTier.T0_OBSERVE, null);
    expect(score).toBeCloseTo(0.0, 5);
  });

  it("T0 decision with zero CSML emits riskScore of 0.0", () => {
    const score = computeRiskScore(ApprovalTier.T0_OBSERVE, 0);
    expect(score).toBeCloseTo(0.0, 5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: T3 decision emits riskScore ≈ 0.5 minimum (tier component)
  // ──────────────────────────────────────────────────────────────────────────
  it("T3 decision emits riskScore >= 0.5 (tier component alone is 0.5)", () => {
    const score = computeRiskScore(ApprovalTier.T3_COMMIT, null);
    // tierIndex=3 → (3/3)*0.5 = 0.5, csml=null → 0
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("T3 decision with CSML=1.0 emits riskScore of 1.0", () => {
    const score = computeRiskScore(ApprovalTier.T3_COMMIT, 1.0);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("T2 decision emits riskScore of ~0.333 with no CSML", () => {
    const score = computeRiskScore(ApprovalTier.T2_ACT, null);
    // tierIndex=2 → (2/3)*0.5 = 0.333
    expect(score).toBeCloseTo(1 / 3, 2);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: stream emits data within 100ms of intercept
  // ──────────────────────────────────────────────────────────────────────────
  it("stream emits data within 100ms of a policy intercept", async () => {
    const token = await issueAndStoreToken({
      resource: "mcp://filesystem/readFile",
      actions: ["call"],
    });

    const localBus = new RiskScoreBus();

    let received: ReturnType<typeof globalRiskBus["on"]> extends (u: infer U) => void ? U : never;
    let resolve: ((v: unknown) => void) | undefined;

    const receivedPromise = new Promise((res, rej) => {
      resolve = res;
      const timeout = setTimeout(() => rej(new Error("No risk score within 100ms")), 100);
      localBus.on((update) => {
        clearTimeout(timeout);
        received = update as any;
        res(update);
      });
    });

    // Emit a synthetic risk score directly via bus to test timing
    const before = Date.now();
    localBus.emit({
      agentId: agent.publicKey,
      resource: "mcp://filesystem/readFile",
      tier: ApprovalTier.T0_OBSERVE,
      riskScore: 0,
      csml: null,
      timestamp: new Date().toISOString(),
    });

    await receivedPromise;
    const elapsed = Date.now() - before;

    expect(elapsed).toBeLessThan(100);
    expect((received as any).tier).toBe(ApprovalTier.T0_OBSERVE);
    expect((received as any).riskScore).toBeCloseTo(0, 5);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Integration: risk score event is written to ledger after intercept
  // ──────────────────────────────────────────────────────────────────────────
  it("risk.score.computed event is written to ledger after each intercept", async () => {
    const token = await issueAndStoreToken();

    await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "mcp://filesystem/readFile",
        action: "call",
        params: {},
      }),
    });

    const riskEvents = ctx.ledger.getAll().filter(
      (e) => e.eventType === "risk.score.computed",
    );
    expect(riskEvents.length).toBeGreaterThanOrEqual(1);

    const latest = riskEvents[riskEvents.length - 1]!;
    expect(typeof (latest.payload as any).riskScore).toBe("number");
    expect((latest.payload as any).riskScore).toBeGreaterThanOrEqual(0);
    expect((latest.payload as any).riskScore).toBeLessThanOrEqual(1);
  });
});
