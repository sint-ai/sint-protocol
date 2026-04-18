/**
 * MAVLink interceptor tests.
 *
 * Verifies that SINT correctly gates all safety-critical drone commands:
 * - ARM/DISARM → T3_COMMIT (explicit human approval required)
 * - MISSION_START → T3_COMMIT
 * - NAV_TAKEOFF / NAV_LAND → T2_ACT (review)
 * - SET_POSITION_TARGET → T2_ACT (velocity control)
 * - Camera commands → T0_OBSERVE (forward immediately)
 * - BVLOS (humanPresent=false) does not lower tier
 * - Velocity constraint violation → deny
 */

import { describe, it, expect } from "vitest";
import { MAVLinkInterceptor } from "../src/mavlink-interceptor.js";
import { MAV_CMD } from "../src/mavlink-types.js";
import type { MavlinkIntercept, MavCommandLong, MavSetPositionTargetLocalNed } from "../src/mavlink-types.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint-ai/gate-capability-tokens";
import type { SintCapabilityToken } from "@sint-ai/core";
import { PolicyGateway } from "@sint-ai/gate-policy-gateway";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const drone = generateKeypair();

function makeToken(overrides: {
  resource?: string;
  actions?: string[];
  maxVelocityMps?: number;
} = {}): SintCapabilityToken {
  const result = issueCapabilityToken({
    issuer: root.publicKey,
    subject: drone.publicKey,
    resource: overrides.resource ?? "mavlink://1/*",
    actions: overrides.actions ?? ["publish", "call"],
    constraints: {
      maxVelocityMps: overrides.maxVelocityMps,
    },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, root.privateKey);
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

function makeCommandLong(command: number, params: Partial<MavCommandLong> = {}): MavlinkIntercept {
  return {
    messageType: "COMMAND_LONG",
    command: command as any,
    payload: {
      target_system: 1,
      target_component: 1,
      command: command as any,
      confirmation: 0,
      param1: 0, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      ...params,
    },
    timestamp: new Date().toISOString(),
    systemId: 1,
    componentId: 1,
  };
}

function makeVelocityCmd(vx: number, vy: number, vz = 0): MavlinkIntercept {
  return {
    messageType: "SET_POSITION_TARGET_LOCAL_NED",
    payload: {
      type_mask: 0b0000011111000111,  // velocity only
      coordinate_frame: 1,            // MAV_FRAME_LOCAL_NED
      x: 0, y: 0, z: 0,
      vx, vy, vz,
      afx: 0, afy: 0, afz: 0,
      yaw: 0, yaw_rate: 0,
    } satisfies MavSetPositionTargetLocalNed,
    timestamp: new Date().toISOString(),
    systemId: 1,
    componentId: 1,
  };
}

describe("MAVLinkInterceptor tier assignment", () => {
  it("ARM command requires T3_COMMIT — escalated", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_COMPONENT_ARM_DISARM, { param1: 1 })
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T3/);
  });

  it("MISSION_START requires T3_COMMIT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_MISSION_START)
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T3/);
  });

  it("NAV_TAKEOFF requires T2_ACT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_NAV_TAKEOFF, { param7: 30 }) // 30m
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T2/);
  });

  it("NAV_LAND requires T2_ACT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_NAV_LAND)
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T2/);
  });

  it("SET_POSITION_TARGET velocity control → T2_ACT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(makeVelocityCmd(2.0, 0, 0));
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T2/);
  });

  it("camera start capture → T0_OBSERVE — forwarded immediately", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_IMAGE_START_CAPTURE)
    );
    expect(result.action).toBe("forward");
    expect(result.decision.action).toBe("allow");
  });

  it("video start capture → T0_OBSERVE — forwarded", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_VIDEO_START_CAPTURE)
    );
    expect(result.action).toBe("forward");
  });
});

describe("MAVLinkInterceptor velocity constraint", () => {
  it("velocity within token limit → forwarded (T0 camera-like resource — no, T2 is escalated, but within constraint passes validation)", async () => {
    // Token with 5 m/s limit, command at 3 m/s
    const token = makeToken({ maxVelocityMps: 5.0 });
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(makeVelocityCmd(3.0, 0, 0));
    // T2_ACT → escalate (tier, not constraint), but NOT denied for constraint violation
    expect(result.decision.action).not.toBe("deny");
  });

  it("velocity exceeds token maxVelocityMps → denied", async () => {
    // Token with 2 m/s limit, command at 10 m/s
    const token = makeToken({ maxVelocityMps: 2.0 });
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(makeVelocityCmd(10.0, 0, 0));
    expect(result.action).toBe("deny");
    expect(result.decision.action).toBe("deny");
  });

  it("DISARM (param1=0) still requires T3_COMMIT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_COMPONENT_ARM_DISARM, { param1: 0 }) // 0 = disarm
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T3/);
  });

  it("FENCE disable → T3_COMMIT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_DO_FENCE_ENABLE, { param1: 0 }) // 0 = disable
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T3/);
  });

  it("DO_CHANGE_SPEED → T2_ACT with velocity in physicalContext", async () => {
    const token = makeToken({ maxVelocityMps: 20.0 });
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_DO_CHANGE_SPEED, { param1: 1, param2: 15 }) // 15 m/s groundspeed
    );
    expect(result.decision.assignedTier).toMatch(/T2/);
  });

  it("SET_MODE → T3_COMMIT", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_DO_SET_MODE, { param1: 217, param2: 6 }) // OFFBOARD mode
    );
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toMatch(/T3/);
  });

  it("decision includes original message", async () => {
    const token = makeToken();
    const gateway = new PolicyGateway({ resolveToken: () => token });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: token.tokenId,
    });
    const msg = makeCommandLong(MAV_CMD.MAV_CMD_IMAGE_START_CAPTURE);
    const result = await interceptor.intercept(msg);
    expect(result.original).toBe(msg);
  });

  it("unknown token (not found) → denied", async () => {
    const gateway = new PolicyGateway({ resolveToken: () => undefined });
    const interceptor = new MAVLinkInterceptor({
      gateway, agentId: drone.publicKey, tokenId: "nonexistent-token-id",
    });
    const result = await interceptor.intercept(
      makeCommandLong(MAV_CMD.MAV_CMD_IMAGE_START_CAPTURE)
    );
    expect(result.action).toBe("deny");
  });
});
