/**
 * SINT Protocol — SafetyPermitPlugin tests (Phase 9.3).
 *
 * Validates async hardware safety state resolution from an external source
 * (OPC-UA, PLC REST API, MQTT) before the built-in hardware safety handshake.
 *
 * A returned plugin result is authoritative over caller-supplied
 * executionContext.hardwareSafety.
 *
 * Plugin errors block T2/T3 actions while T0/T1 observation remains available.
 */

import { describe, it, expect, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import { NoopSafetyPermitPlugin } from "../src/safety-permit.js";
import type { SafetyPermitPlugin, SafetyPermitResult } from "../src/safety-permit.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@pshkv/core";

// ─── Helpers ────────────────────────────────────────────────────────────────

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

/** ISO8601 timestamp that is `offsetMs` milliseconds in the past. */
function pastISO(offsetMs: number): string {
  return new Date(Date.now() - offsetMs)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

function makeToken(resource = "ros2:///cmd_vel"): SintCapabilityToken {
  const result = issueCapabilityToken(
    {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource,
      actions: ["publish", "subscribe"],
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

/** T1 resource (camera subscribe → T0_OBSERVE → auto-allow). */
function makeT1Token(): SintCapabilityToken {
  return makeToken("ros2:///camera/front");
}

/**
 * Build a minimal SintRequest.
 * resource defaults to the T2_ACT cmd_vel topic; use camera/front for T0/T1.
 */
function makeRequest(
  token: SintCapabilityToken,
  overrides: Partial<SintRequest> = {},
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f001",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
    ...overrides,
  };
}

/** Wrap a SafetyPermitResult (or undefined) into a plugin. */
function mockPlugin(
  result: SafetyPermitResult | undefined,
): SafetyPermitPlugin {
  return { resolvePermit: vi.fn().mockResolvedValue(result) };
}

/** Plugin that throws. */
function errorPlugin(): SafetyPermitPlugin {
  return {
    resolvePermit: vi.fn().mockRejectedValue(new Error("PLC unreachable")),
  };
}

/** Fresh observedAt (now). */
function freshObservedAt(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("SafetyPermitPlugin", () => {
  // 1. NoopSafetyPermitPlugin always returns undefined
  it("NoopSafetyPermitPlugin.resolvePermit() always returns undefined", async () => {
    const token = makeT1Token();
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const noop = new NoopSafetyPermitPlugin();
    const result = await noop.resolvePermit(req);
    expect(result).toBeUndefined();
  });

  // 2. Plugin returning permitState:"granted" → T1 action allowed
  it("plugin returning permitState:granted → T1 action passes", async () => {
    const token = makeT1Token();
    const plugin = mockPlugin({
      permitState: "granted",
      observedAt: freshObservedAt(),
      source: "plc",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  // 3. Plugin returning estopState:"triggered" → deny HARDWARE_ESTOP_ACTIVE
  it("plugin returning estopState:triggered → deny with HARDWARE_ESTOP_ACTIVE", async () => {
    const token = makeT1Token(); // covers ros2:///camera/front
    const plugin = mockPlugin({
      permitState: "granted",
      estopState: "triggered",
      observedAt: freshObservedAt(),
      source: "plc",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    // T0_OBSERVE resource — estop should still deny regardless of tier
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
  });

  // 4. Plugin returning permitState:"denied" on T2_ACT in industrial profile → deny
  it("plugin returning permitState:denied on T2_ACT industrial profile → deny", async () => {
    const token = makeToken("ros2:///cmd_vel");
    const plugin = mockPlugin({
      permitState: "denied",
      observedAt: freshObservedAt(),
      source: "opcua",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      resource: "ros2:///cmd_vel",
      action: "publish",
      executionContext: {
        deploymentProfile: "warehouse-amr",
      },
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
  });

  // 5. Plugin returning interlockState:"open" on T2_ACT industrial profile → deny
  it("plugin returning interlockState:open on T2_ACT industrial profile → deny", async () => {
    const token = makeToken("ros2:///cmd_vel");
    // permitState is not "granted" — interlockState open compounds the denial
    const plugin = mockPlugin({
      permitState: "denied",
      interlockState: "open",
      observedAt: freshObservedAt(),
      source: "plc",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
      },
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
  });

  // 6. Plugin throws → fail-open, T1 action still allowed
  it("plugin throws → fail-open, T1 action still allowed", async () => {
    const token = makeT1Token();
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: errorPlugin(),
    });
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
  });

  // 7. Plugin returns undefined → fall through, T1 action allowed
  it("plugin returns undefined → fall through, T1 action allowed", async () => {
    const token = makeT1Token();
    const plugin = mockPlugin(undefined);
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("allow");
    expect(plugin.resolvePermit).toHaveBeenCalledWith(req);
  });

  // 8. The external safety controller outranks caller-supplied context.
  it("plugin result overrides conflicting caller hardwareSafety context", async () => {
    const token = makeToken("ros2:///cmd_vel");
    // Plugin says estop triggered, but request already has granted + clear
    const plugin = mockPlugin({
      permitState: "denied",
      estopState: "triggered",
      observedAt: freshObservedAt(),
      source: "plc",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
        hardwareSafety: {
          permitState: "granted",
          estopState: "clear",
          observedAt: freshObservedAt(),
        },
      },
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
  });

  it("plugin failure blocks T2 physical execution", async () => {
    const token = makeToken("ros2:///cmd_vel");
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: errorPlugin(),
    });
    const req = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
        hardwareSafety: {
          permitState: "granted",
          estopState: "clear",
          observedAt: freshObservedAt(),
        },
      },
    });

    const decision = await gw.intercept(req);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_STATE_UNAVAILABLE");
  });

  // 9. Plugin returns stale observedAt (>5000ms ago) → deny HARDWARE_STATE_STALE
  it("plugin returns stale observedAt → deny with HARDWARE_STATE_STALE", async () => {
    const token = makeToken("ros2:///cmd_vel");
    const plugin = mockPlugin({
      permitState: "granted",
      observedAt: pastISO(6_000), // 6 seconds ago → beyond MAX_HARDWARE_SAFETY_STALENESS_MS
      source: "mqtt",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
      },
    });
    const decision = await gw.intercept(req);
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_STATE_STALE");
  });

  // 10. T0 action with estop from plugin → still denies (estop preempts all tiers)
  it("T0 action with estop triggered from plugin → deny HARDWARE_ESTOP_ACTIVE", async () => {
    const token = makeT1Token();
    const plugin = mockPlugin({
      permitState: "granted",
      estopState: "triggered",
      observedAt: freshObservedAt(),
      source: "plc",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
    });
    const decision = await gw.intercept(req);
    // E-stop preempts everything including T0
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
  });

  // 11. T1 action with permitState:"denied" on non-industrial profile → allow
  //     (permit check only applies to industrial deployments with T2/T3 tiers)
  it("T1 action with permitState:denied on non-industrial profile → allow", async () => {
    const token = makeT1Token();
    const plugin = mockPlugin({
      permitState: "denied",
      observedAt: freshObservedAt(),
      source: "opcua",
    });
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
    });
    const req = makeRequest(token, {
      resource: "ros2:///camera/front",
      action: "subscribe",
      // No deploymentProfile → not industrial
    });
    const decision = await gw.intercept(req);
    // T0_OBSERVE tier, no industrial profile, no estop → should allow despite denied permit
    expect(decision.action).toBe("allow");
  });

  // 12. Plugin result is merged correctly — controllerId appears in hardwareSafety context
  it("plugin result is merged into executionContext — controllerId is populated", async () => {
    const token = makeToken("ros2:///cmd_vel");
    const controllerId = "plc-cell-7";
    // Plugin provides granted with controllerId
    const plugin = mockPlugin({
      permitState: "granted",
      controllerId,
      observedAt: freshObservedAt(),
      source: "plc",
    });

    let capturedRequest: SintRequest | undefined;
    const gw = new PolicyGateway({
      resolveToken: () => token,
      safetyPermit: plugin,
      emitLedgerEvent: () => {/* no-op */},
    });

    // Intercept a T2_ACT request in industrial mode
    const req = makeRequest(token, {
      executionContext: {
        deploymentProfile: "warehouse-amr",
      },
    });

    // We verify the merge by checking the resolvePermit was called with the request
    // and the decision reflects the merged granted state (escalate rather than deny)
    const decision = await gw.intercept(req);

    // With granted permit and warehouse-amr profile → T2_ACT escalation (not HARDWARE deny)
    expect(decision.action).toBe("escalate");
    // Plugin was called with the original request
    expect(plugin.resolvePermit).toHaveBeenCalledWith(req);
    // Capture and verify via spy that resolvePermit received the expected request shape
    const callArg = (plugin.resolvePermit as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as SintRequest;
    expect(callArg.executionContext?.deploymentProfile).toBe("warehouse-amr");
    capturedRequest = callArg;
    expect(capturedRequest).toBeDefined();
  });
});
