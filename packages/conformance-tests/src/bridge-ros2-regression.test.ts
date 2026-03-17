/**
 * SINT Protocol — Bridge-ROS2 Regression Test Suite.
 *
 * Tests that ROS 2 topic publishes, subscriptions, service calls,
 * and action goals correctly flow through the SINT security gate
 * with physical safety constraints.
 *
 * These tests MUST pass on every PR that touches @sint/bridge-ros2
 * or @sint/gate-policy-gateway.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeypair,
  generateUUIDv7,
  nowISO8601,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import { ROS2Interceptor } from "@sint/bridge-ros2";
import type {
  ROS2TopicMessage,
  ROS2ServiceCall,
  ROS2ActionGoal,
} from "@sint/bridge-ros2";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint/core";
import { ApprovalTier } from "@sint/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Bridge-ROS2 Regression Tests", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let ledger: LedgerWriter;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();

    gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: (event) => {
        ledger.append({
          eventType: event.eventType as any,
          agentId: event.agentId,
          tokenId: event.tokenId,
          payload: event.payload,
        });
      },
    });
  });

  function issueAndStore(
    overrides?: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxVelocityMps: 0.5,
        maxForceNewtons: 50,
      },
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

  function createInterceptor(token: SintCapabilityToken, robotMassKg?: number) {
    return new ROS2Interceptor({
      gateway,
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      robotMassKg,
    });
  }

  // ──────────────────────────────────────────────────────────
  // ROS2-1: Sensor subscribe should be forwarded (T0)
  // ──────────────────────────────────────────────────────────
  it("ROS2-1. Camera sensor subscribe should be forwarded", async () => {
    const token = issueAndStore({
      resource: "ros2:///camera/*",
      actions: ["subscribe"],
    });
    const interceptor = createInterceptor(token);

    const result = await interceptor.interceptSubscribe("/camera/front");

    expect(result.action).toBe("forward");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-2: cmd_vel publish is T2_ACT (escalation required)
  // ──────────────────────────────────────────────────────────
  it("ROS2-2. cmd_vel publish gets T2_ACT tier requiring review", async () => {
    const token = issueAndStore();
    const interceptor = createInterceptor(token);

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.3, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0.1 },
      },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(message);

    // cmd_vel is T2_ACT — requires review (escalation)
    expect(result.decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(result.action).toBe("escalate");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-3: cmd_vel with excessive velocity must be denied
  // ──────────────────────────────────────────────────────────
  it("ROS2-3. cmd_vel publish exceeding velocity constraint must be denied", async () => {
    const token = issueAndStore({
      constraints: { maxVelocityMps: 0.5 },
    });
    const interceptor = createInterceptor(token);

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 2.0, y: 0, z: 0 }, // 2.0 m/s > 0.5 m/s limit
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(message);

    expect(result.action).toBe("deny");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-4: Human presence should escalate cmd_vel tier
  // ──────────────────────────────────────────────────────────
  it("ROS2-4. cmd_vel with human presence escalates to T3_COMMIT", async () => {
    const token = issueAndStore();

    // Test via direct gateway call since the interceptor
    // extracts physical context from Twist but doesn't set humanDetected
    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { velocity: 0.3 },
      physicalContext: {
        humanDetected: true,
        currentVelocityMps: 0.3,
      },
    });

    // cmd_vel has escalateOnHumanPresence: true
    // T2_ACT + human presence → T3_COMMIT
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-5: Revoked token must deny publish
  // ──────────────────────────────────────────────────────────
  it("ROS2-5. Publish with revoked token must be denied", async () => {
    const token = issueAndStore();
    const interceptor = createInterceptor(token);

    // Revoke the token
    revocationStore.revoke(token.tokenId, "Robot compromised", "security-team");

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.1, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(message);

    expect(result.action).toBe("deny");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-6: Service call maps to correct resource URI
  // ──────────────────────────────────────────────────────────
  it("ROS2-6. Service call routes through gateway correctly", async () => {
    const token = issueAndStore({
      resource: "ros2:///set_mode",
      actions: ["call"],
    });
    const interceptor = createInterceptor(token);

    const serviceCall: ROS2ServiceCall = {
      serviceName: "/set_mode",
      serviceType: "std_srvs/SetBool",
      request: { data: true },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptServiceCall(serviceCall);

    // Should be processed by gateway (not session-not-found)
    expect(result.decision).toBeDefined();
    expect(result.resourceName).toBe("/set_mode");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-7: Action goal routes through gateway
  // ──────────────────────────────────────────────────────────
  it("ROS2-7. Action goal routes through gateway correctly", async () => {
    const token = issueAndStore({
      resource: "ros2:///navigate_to_pose",
      actions: ["call"],
    });
    const interceptor = createInterceptor(token);

    const actionGoal: ROS2ActionGoal = {
      actionName: "/navigate_to_pose",
      actionType: "nav2_msgs/NavigateToPose",
      goal: {
        pose: { position: { x: 1, y: 2, z: 0 }, orientation: { w: 1 } },
      },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptActionGoal(actionGoal);

    expect(result.decision).toBeDefined();
    expect(result.resourceName).toBe("/navigate_to_pose");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-8: All intercepts generate ledger events
  // ──────────────────────────────────────────────────────────
  it("ROS2-8. All intercepts generate audit ledger events", async () => {
    const token = issueAndStore();
    const interceptor = createInterceptor(token);

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 0.1, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: nowISO(),
    };

    await interceptor.interceptPublish(message);

    expect(ledger.length).toBeGreaterThan(0);

    // Verify chain integrity
    const chainResult = ledger.verifyChain();
    expect(chainResult.ok).toBe(true);
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-9: Force constraint violation must be blocked
  // ──────────────────────────────────────────────────────────
  it("ROS2-9. Twist message with estimated force exceeding limit is denied", async () => {
    const token = issueAndStore({
      constraints: { maxForceNewtons: 50 },
    });
    // 25kg robot moving at high velocity → large estimated force
    const interceptor = createInterceptor(token, 25);

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: 5.0, y: 0, z: 0 }, // Very high velocity
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(message);

    // Should be denied due to velocity/force constraint violation
    expect(result.action).toBe("deny");
  });

  // ──────────────────────────────────────────────────────────
  // ROS2-10: Mode change requires T3_COMMIT
  // ──────────────────────────────────────────────────────────
  it("ROS2-10. Mode change gets T3_COMMIT tier (irreversible)", async () => {
    const token = issueAndStore({
      resource: "ros2:///mode_change",
      actions: ["publish", "call"],
    });
    const interceptor = createInterceptor(token);

    const message: ROS2TopicMessage = {
      topicName: "/mode_change",
      messageType: "std_msgs/String",
      data: { data: "autonomous" },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(message);

    expect(result.decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
  });
});
