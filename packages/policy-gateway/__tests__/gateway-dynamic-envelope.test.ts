/**
 * SINT Protocol — PolicyGateway DynamicEnvelopePlugin tests.
 *
 * Validates environment-adaptive safety envelope tightening (ROSClaw gap fix).
 *
 * The token's static maxVelocityMps (e.g. 2.0 m/s) is the ceiling.
 * The DynamicEnvelopePlugin returns a tighter limit based on real-time sensor
 * state (obstacle distance, human proximity). The effective limit is
 *   min(token.maxVelocityMps, envelope.maxVelocityMps).
 *
 * Test cases:
 * - No plugin → token limit used (existing behavior unchanged)
 * - Obstacle nearby → envelope caps velocity below token limit → deny
 * - Velocity within token limit AND within envelope → allow
 * - Token limit tighter than envelope → token limit wins (envelope is a no-op)
 * - Plugin error → fail-open (token limit used, request proceeds)
 * - Envelope emits "policy.envelope.applied" event when reason provided
 * - Force envelope tightening → deny when force exceeds envelope but not token
 * - maxVelocityMps: 0 envelope → any nonzero velocity is denied
 */

import { describe, it, expect, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import type { DynamicEnvelopePlugin } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint-ai/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@sint-ai/core";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

/**
 * Make a token covering a read-only sensor resource (T0_OBSERVE → "allow").
 * maxVelocityMps/maxForceNewtons still apply if the request includes those values.
 */
function makeToken(
  opts: {
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    resource?: string;
  } = {},
): SintCapabilityToken {
  const resource = opts.resource ?? "ros2:///camera/front";
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource,
      actions: ["subscribe", "publish"],
      constraints: {
        maxVelocityMps: opts.maxVelocityMps,
        maxForceNewtons: opts.maxForceNewtons,
      },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(),
      revocable: false,
    },
    root.privateKey,
  );
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

/**
 * Make a request against a T0_OBSERVE resource (camera subscribe → "allow" tier).
 * Physical context values are passed through for constraint checking.
 */
function makeRequest(
  token: SintCapabilityToken,
  velocityMps?: number,
  forceNewtons?: number,
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f000",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///camera/front",
    action: "subscribe",
    params: {},
    physicalContext:
      velocityMps !== undefined || forceNewtons !== undefined
        ? {
            currentVelocityMps: velocityMps,
            currentForceNewtons: forceNewtons,
          }
        : undefined,
  };
}

function makeEnvelope(overrides: {
  maxVelocityMps?: number;
  maxForceNewtons?: number;
  reason?: string;
}): DynamicEnvelopePlugin {
  return { computeEnvelope: vi.fn().mockResolvedValue(overrides) };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("DynamicEnvelopePlugin", () => {
  it("no plugin → token limit used unchanged", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const gw = new PolicyGateway({ resolveToken: () => token });
    // 1.9 m/s is within the 2.0 m/s token limit → should allow
    const req = makeRequest(token, 1.9);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  it("obstacle nearby → envelope caps velocity below token → deny", async () => {
    // Token allows 2.0 m/s, but obstacle at 0.4m → envelope caps at 0.1 m/s
    const token = makeToken({ maxVelocityMps: 2.0 });
    const envelope = makeEnvelope({ maxVelocityMps: 0.1, reason: "obstacle at 0.4m" });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    // 0.5 m/s is within token limit (2.0) but exceeds envelope (0.1)
    const req = makeRequest(token, 0.5);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(decision.denial?.reason).toContain("dynamic envelope");
  });

  it("velocity within both token and envelope → allow", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const envelope = makeEnvelope({ maxVelocityMps: 0.5, reason: "caution zone" });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    // 0.3 m/s is within both token (2.0) and envelope (0.5)
    const req = makeRequest(token, 0.3);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  it("token limit tighter than envelope → token limit wins", async () => {
    // Token: 0.3 m/s, envelope returns 2.0 m/s (looser — should be ignored)
    const token = makeToken({ maxVelocityMps: 0.3 });
    const envelope = makeEnvelope({ maxVelocityMps: 2.0 });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    // 0.5 m/s exceeds token limit (0.3) — envelope's loose limit is irrelevant
    const req = makeRequest(token, 0.5);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    // violation message should NOT say "dynamic envelope" (token limit applied)
    expect(decision.denial?.reason).not.toContain("dynamic envelope");
  });

  it("plugin error → fail-open (token limit used, request proceeds)", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const brokenEnvelope: DynamicEnvelopePlugin = {
      computeEnvelope: vi.fn().mockRejectedValue(new Error("lidar offline")),
    };
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: brokenEnvelope,
    });
    // 1.9 m/s is within token limit — plugin error should not block
    const req = makeRequest(token, 1.9);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  it("plugin error → fail-open even when velocity would violate envelope", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const brokenEnvelope: DynamicEnvelopePlugin = {
      computeEnvelope: vi.fn().mockRejectedValue(new Error("sensor timeout")),
    };
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: brokenEnvelope,
    });
    // 1.5 m/s is within token limit — plugin offline should not block
    const req = makeRequest(token, 1.5);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  it("envelope emits policy.envelope.applied event with reason", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const envelope = makeEnvelope({ maxVelocityMps: 0.2, reason: "human at 1.2m" });
    const emitted: string[] = [];
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
      emitLedgerEvent: (ev) => emitted.push(ev.eventType),
    });
    const req = makeRequest(token, 0.1); // within envelope — allow
    await gw.intercept(req);
    expect(emitted).toContain("policy.envelope.applied");
  });

  it("no event emitted when envelope has no reason", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    // No reason field → no envelope event
    const envelope = makeEnvelope({ maxVelocityMps: 0.5 });
    const emitted: string[] = [];
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
      emitLedgerEvent: (ev) => emitted.push(ev.eventType),
    });
    const req = makeRequest(token, 0.3);
    await gw.intercept(req);
    expect(emitted).not.toContain("policy.envelope.applied");
  });

  it("force envelope tightening → deny when force exceeds envelope but not token", async () => {
    // Token: 100N, envelope: 20N (human detected nearby)
    const token = makeToken({ maxForceNewtons: 100 });
    const envelope = makeEnvelope({ maxForceNewtons: 20, reason: "fragile object nearby" });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    // 50N is within token (100N) but exceeds envelope (20N)
    const req = makeRequest(token, undefined, 50);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("dynamic envelope");
  });

  it("zero-velocity envelope → any positive velocity is denied", async () => {
    const token = makeToken({ maxVelocityMps: 5.0 });
    // Emergency stop: envelope returns 0 m/s
    const envelope = makeEnvelope({ maxVelocityMps: 0, reason: "emergency stop zone" });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    const req = makeRequest(token, 0.01);
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
  });

  it("envelope applies to velocity but not force when only velocity set", async () => {
    // Token has both velocity and force constraints. Envelope overrides velocity only.
    // The request carries velocity context only (no force) — physicalContext with force
    // would escalate tier to T2_ACT per tier-assigner rules.
    const token = makeToken({ maxVelocityMps: 2.0, maxForceNewtons: 100 });
    const envelope = makeEnvelope({ maxVelocityMps: 0.5 }); // no force override
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: envelope,
    });
    // Only velocity in physicalContext (0.4 m/s < 0.5 m/s envelope → ok)
    const req = makeRequest(token, 0.4); // makeRequest uses camera/subscribe → T0_OBSERVE
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
    // Verify envelope was consulted
    expect((envelope.computeEnvelope as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(req);
  });

  it("plugin is called with the full request", async () => {
    const token = makeToken({ maxVelocityMps: 2.0 });
    const computeEnvelope = vi.fn().mockResolvedValue({ maxVelocityMps: 1.0 });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: { computeEnvelope },
    });
    const req = makeRequest(token, 0.5);
    await gw.intercept(req);
    expect(computeEnvelope).toHaveBeenCalledWith(req);
  });
});
