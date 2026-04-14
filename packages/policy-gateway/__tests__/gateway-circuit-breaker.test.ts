/**
 * SINT Protocol — PolicyGateway CircuitBreakerPlugin tests.
 *
 * Validates the ASI10 (Rogue Agent) + EU AI Act Article 14(4)(e) stop button.
 *
 * Test cases:
 * - CLOSED circuit → requests pass through normally
 * - N denials trip the circuit OPEN
 * - OPEN circuit → all requests auto-deny with CIRCUIT_OPEN code (no token check)
 * - Circuit stays OPEN for manual trips (no auto-HALF_OPEN)
 * - Auto HALF_OPEN after timeout → probe request passes through
 * - HALF_OPEN + success → CLOSED
 * - HALF_OPEN + failure → back to OPEN
 * - Operator trip() → instant OPEN regardless of failure count
 * - Operator reset() → instant CLOSED
 * - CSML anomalous persona → auto-trips circuit
 * - Plugin error → fail-open (CLOSED, request proceeds)
 * - agent.circuit.opened event emitted when circuit trips
 * - agent.circuit.closed event emitted when circuit recovers
 * - CIRCUIT_OPEN denials do NOT re-increment the circuit counter (no feedback loop)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import type { CircuitBreakerPlugin } from "../src/circuit-breaker.js";
import { InMemoryCircuitBreaker } from "../src/circuit-breaker.js";
import type { CsmlEscalationPlugin } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";
import { ApprovalTier } from "@pshkv/core";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();
const agent2 = generateKeypair();

function makeToken(agentKey = agent.publicKey): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agentKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(),
      revocable: false,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

let _reqSeq = 0;
function makeRequest(
  token: SintCapabilityToken,
  agentId = agent.publicKey,
): SintRequest {
  // UUID v7 format: version digit must be '7' (position 14)
  const seq = String(++_reqSeq).padStart(4, "0");
  return {
    requestId: `01905f7c-4e8a-7b3d-9a1e-f2c3d4e5${seq}` as any,
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId,
    tokenId: token.tokenId,
    resource: "ros2:///camera/front",
    action: "subscribe",
    params: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("CircuitBreakerPlugin — InMemoryCircuitBreaker", () => {
  it("CLOSED state → requests pass through normally", async () => {
    const token = makeToken();
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 3 });
    const gw = new PolicyGateway({ resolveToken: () => token, circuitBreaker: cb });
    const decision = await gw.intercept(makeRequest(token));
    expect(decision.action).toBe("allow");
    expect(decision.denial).toBeUndefined();
  });

  it("N consecutive denials trip the circuit OPEN", async () => {
    // Use a token with rate limit to generate consistent denials
    const root2 = generateKeypair();
    const tkResult = issueCapabilityToken(
      {
        issuer: root2.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///camera/front",
        actions: ["subscribe"],
        constraints: { rateLimit: { maxCalls: 1, windowMs: 60_000 } },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(),
        revocable: false,
      },
      root2.privateKey,
    );
    if (!tkResult.ok) throw new Error();
    const rateLimitedToken = tkResult.value;

    let calls = 0;
    const fakeStore = { increment: async () => { calls++; return calls; } };
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 3 });
    const gw = new PolicyGateway({
      resolveToken: () => rateLimitedToken,
      rateLimitStore: fakeStore,
      circuitBreaker: cb,
    });

    const req = makeRequest(rateLimitedToken);
    await gw.intercept(req); // call 1 — allow (count=1, limit=1 — allowed at boundary)
    await gw.intercept(req); // call 2 — deny (count=2 > 1)
    await gw.intercept(req); // call 3 — deny (count=3)
    const fourth = await gw.intercept(req); // call 4 — deny → trips circuit

    // After 3+ denials the circuit should be OPEN
    expect(await cb.getState(agent.publicKey)).toBe("OPEN");
    // The 4th call may be deny from rate limit or CIRCUIT_OPEN
    expect(fourth.action).toBe("deny");
  });

  it("OPEN circuit → instant deny with CIRCUIT_OPEN code, no token lookup", async () => {
    const tokenLookup = vi.fn().mockReturnValue(makeToken());
    const cb = new InMemoryCircuitBreaker();
    await cb.trip(agent.publicKey, "test");

    const gw = new PolicyGateway({ resolveToken: tokenLookup, circuitBreaker: cb });
    const req = makeRequest(makeToken());
    const decision = await gw.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CIRCUIT_OPEN");
    // Token should not be resolved — circuit check happens first
    expect(tokenLookup).not.toHaveBeenCalled();
  });

  it("OPEN circuit emits agent.circuit.blocked event", async () => {
    const token = makeToken();
    const emitted: string[] = [];
    const cb = new InMemoryCircuitBreaker();
    await cb.trip(agent.publicKey);

    const gw = new PolicyGateway({
      resolveToken: () => token,
      circuitBreaker: cb,
      emitLedgerEvent: (ev) => emitted.push(ev.eventType),
    });
    await gw.intercept(makeRequest(token));
    expect(emitted).toContain("agent.circuit.blocked");
  });

  it("operator trip() opens circuit immediately regardless of failure count", async () => {
    const token = makeToken();
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 100 });
    // Only 1 action before trip — well below threshold
    const gw = new PolicyGateway({ resolveToken: () => token, circuitBreaker: cb });
    await gw.intercept(makeRequest(token)); // allow

    await cb.trip(agent.publicKey, "manual operator stop");
    expect(await cb.getState(agent.publicKey)).toBe("OPEN");

    const next = await gw.intercept(makeRequest(token));
    expect(next.action).toBe("deny");
    expect(next.denial?.policyViolated).toBe("CIRCUIT_OPEN");
  });

  it("operator reset() closes circuit immediately", async () => {
    const token = makeToken();
    const cb = new InMemoryCircuitBreaker();
    await cb.trip(agent.publicKey);
    expect(await cb.getState(agent.publicKey)).toBe("OPEN");

    await cb.reset(agent.publicKey);
    expect(await cb.getState(agent.publicKey)).toBe("CLOSED");

    const gw = new PolicyGateway({ resolveToken: () => token, circuitBreaker: cb });
    const decision = await gw.intercept(makeRequest(token));
    expect(decision.action).toBe("allow");
  });

  it("manual trip blocks auto-HALF_OPEN transition", async () => {
    const cb = new InMemoryCircuitBreaker({ halfOpenAfterMs: 0 }); // would auto-transition immediately
    await cb.trip(agent.publicKey, "manual");
    // Even with 0ms delay, manual trips stay OPEN
    await new Promise((r) => setTimeout(r, 5));
    expect(await cb.getState(agent.publicKey)).toBe("OPEN");
  });

  it("circuit only applies to the specific agent — other agents unaffected", async () => {
    const token1 = makeToken(agent.publicKey);
    const token2 = makeToken(agent2.publicKey);
    const cb = new InMemoryCircuitBreaker();
    await cb.trip(agent.publicKey);

    const gw = new PolicyGateway({ resolveToken: (id) => id === token1.tokenId ? token1 : token2, circuitBreaker: cb });

    // agent is OPEN → deny
    const d1 = await gw.intercept(makeRequest(token1, agent.publicKey));
    expect(d1.action).toBe("deny");
    expect(d1.denial?.policyViolated).toBe("CIRCUIT_OPEN");

    // agent2 is CLOSED → allow
    const d2 = await gw.intercept(makeRequest(token2, agent2.publicKey));
    expect(d2.action).toBe("allow");
  });

  it("plugin error → fail-open (treat as CLOSED, request proceeds)", async () => {
    const token = makeToken();
    const brokenCb: CircuitBreakerPlugin = {
      getState: vi.fn().mockRejectedValue(new Error("redis down")),
      recordDenial: vi.fn().mockRejectedValue(new Error()),
      recordSuccess: vi.fn().mockRejectedValue(new Error()),
      trip: vi.fn(),
      reset: vi.fn(),
    };
    const gw = new PolicyGateway({ resolveToken: () => token, circuitBreaker: brokenCb });
    const decision = await gw.intercept(makeRequest(token));
    expect(decision.action).toBe("allow");
  });

  it("agent.circuit.opened event emitted when circuit trips via denials", async () => {
    const root2 = generateKeypair();
    const tkResult = issueCapabilityToken(
      {
        issuer: root2.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///camera/front",
        actions: ["subscribe"],
        constraints: { rateLimit: { maxCalls: 1, windowMs: 60_000 } },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(),
        revocable: false,
      },
      root2.privateKey,
    );
    if (!tkResult.ok) throw new Error();
    const tk = tkResult.value;

    let callCount = 1; // start at 1 so first increment returns 2 (> maxCalls=1 → deny)
    const fakeStore = { increment: async () => ++callCount };
    const events: string[] = [];
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 2 });
    const gw = new PolicyGateway({
      resolveToken: () => tk,
      rateLimitStore: fakeStore,
      circuitBreaker: cb,
      emitLedgerEvent: (ev) => events.push(ev.eventType),
    });

    const req = makeRequest(tk);
    await gw.intercept(req); // deny 1 (count=2 > maxCalls=1)
    await gw.intercept(req); // deny 2 → trips circuit

    expect(events).toContain("agent.circuit.opened");
  });

  it("CSML anomalous persona auto-trips circuit", async () => {
    const token = makeToken();
    const cb = new InMemoryCircuitBreaker();
    const tripSpy = vi.spyOn(cb, "trip");

    const anomalousPlugin: CsmlEscalationPlugin = {
      evaluateAgent: vi.fn().mockResolvedValue({
        escalated: true,
        resultTier: ApprovalTier.T3_COMMIT,
        csmlScore: 0.95,
        reason: "CSML anomalous — safety events detected",
      }),
    };

    const gw = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: anomalousPlugin,
      circuitBreaker: cb,
    });

    await gw.intercept(makeRequest(token));
    expect(tripSpy).toHaveBeenCalledWith(
      agent.publicKey,
      expect.stringContaining("anomalous"),
    );
  });
});

describe("InMemoryCircuitBreaker — state machine", () => {
  it("CLOSED → OPEN after failureThreshold denials", async () => {
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 3 });
    expect(await cb.getState("a")).toBe("CLOSED");
    await cb.recordDenial("a", "x");
    await cb.recordDenial("a", "x");
    expect(await cb.getState("a")).toBe("CLOSED");
    await cb.recordDenial("a", "x");
    expect(await cb.getState("a")).toBe("OPEN");
  });

  it("OPEN → HALF_OPEN after halfOpenAfterMs", async () => {
    // Open via recordDenial (not trip) so manualTrip stays false
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 2, halfOpenAfterMs: 5 });
    await cb.recordDenial("a", "x");
    await cb.recordDenial("a", "x");
    expect(await cb.getState("a")).toBe("OPEN");
    await new Promise((r) => setTimeout(r, 10));
    expect(await cb.getState("a")).toBe("HALF_OPEN");
  });

  it("HALF_OPEN + successThreshold successes → CLOSED", async () => {
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 1, halfOpenAfterMs: 0, successThreshold: 2 });
    await cb.recordDenial("a", "x"); // trip via denial
    await new Promise((r) => setTimeout(r, 2));
    expect(await cb.getState("a")).toBe("HALF_OPEN");
    await cb.recordSuccess("a");
    expect(await cb.getState("a")).toBe("HALF_OPEN"); // need 2
    await cb.recordSuccess("a");
    expect(await cb.getState("a")).toBe("CLOSED");
  });

  it("HALF_OPEN + failure → back to OPEN", async () => {
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 1, halfOpenAfterMs: 0 });
    await cb.recordDenial("a", "x"); // trip via denial
    await new Promise((r) => setTimeout(r, 2));
    expect(await cb.getState("a")).toBe("HALF_OPEN");
    await cb.recordDenial("a", "probe failed");
    expect(await cb.getState("a")).toBe("OPEN");
  });

  it("failures outside windowMs are pruned", async () => {
    const cb = new InMemoryCircuitBreaker({ failureThreshold: 3, windowMs: 10 });
    await cb.recordDenial("a", "x");
    await cb.recordDenial("a", "x");
    await new Promise((r) => setTimeout(r, 15));
    // Failures expired — still CLOSED
    await cb.recordDenial("a", "x");
    expect(await cb.getState("a")).toBe("CLOSED");
  });
});
