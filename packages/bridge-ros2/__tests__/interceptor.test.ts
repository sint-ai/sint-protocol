/**
 * SINT Bridge-ROS2 — Interceptor unit tests.
 *
 * Tests the full ROS 2 → SINT security gate pipeline.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ROS2Interceptor } from "../src/ros2-interceptor.js";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";
import { ApprovalTier } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("ROS2Interceptor", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();

    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
    });
  });

  function issueToken(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
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
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  // ── Subscribe (T0) ──

  it("allows sensor subscribe (T0)", async () => {
    const token = issueToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptSubscribe("/camera/front");

    expect(result.action).toBe("forward");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ── Publish cmd_vel (T2) ──

  it("escalates cmd_vel publish (T2)", async () => {
    const token = issueToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 1.0, maxForceNewtons: 100 },
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      robotMassKg: 25,
    });

    const result = await interceptor.interceptPublish({
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.5, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0.1 },
      },
      timestamp: new Date().toISOString(),
    });

    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  // ── Velocity constraint violation ──

  it("denies cmd_vel publish exceeding velocity constraint", async () => {
    const token = issueToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.5 },
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptPublish({
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 1.0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: new Date().toISOString(),
    });

    expect(result.action).toBe("deny");
  });

  // ── Service call (mode_change → T3) ──

  it("escalates mode_change service call (T3)", async () => {
    const token = issueToken({
      resource: "ros2:///mode_change",
      actions: ["call"],
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptServiceCall({
      serviceName: "/mode_change",
      serviceType: "std_srvs/SetBool",
      request: { data: true },
      timestamp: new Date().toISOString(),
    });

    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(result.requiredTier).toBe(ApprovalTier.T3_COMMIT);
  });

  // ── Action goal ──

  it("handles action goal interception", async () => {
    const token = issueToken({
      resource: "ros2:///navigate_to_pose",
      actions: ["call"],
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptActionGoal({
      actionName: "/navigate_to_pose",
      actionType: "nav2_msgs/NavigateToPose",
      goal: {
        pose: {
          position: { x: 1.0, y: 2.0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
      timestamp: new Date().toISOString(),
    });

    // navigate_to_pose with "call" action matches default MCP rules → T1
    // but no specific ROS2 rule for it, so depends on tier assignment
    expect(["forward", "escalate"]).toContain(result.action);
  });

  // ── Unauthorized resource ──

  it("denies publish to unauthorized topic", async () => {
    const token = issueToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptPublish({
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.1, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: new Date().toISOString(),
    });

    expect(result.action).toBe("deny");
  });

  // ── Revoked token ──

  it("denies operations with revoked token", async () => {
    const token = issueToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    revocationStore.revoke(token.tokenId, "compromised", "admin");

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
    });

    const result = await interceptor.interceptSubscribe("/camera/front");
    expect(result.action).toBe("deny");
  });

  // ── Physical context extraction ──

  it("extracts velocity from Twist in physical context", async () => {
    const token = issueToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 2.0, maxForceNewtons: 200 },
    });

    const interceptor = new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      robotMassKg: 10,
    });

    // velocity = sqrt(0.3^2 + 0.4^2) = 0.5 m/s, under limit of 2.0
    const result = await interceptor.interceptPublish({
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.3, y: 0.4, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: new Date().toISOString(),
    });

    // Should pass constraints (0.5 < 2.0) but escalate because T2_ACT
    expect(result.action).toBe("escalate");
  });
});
