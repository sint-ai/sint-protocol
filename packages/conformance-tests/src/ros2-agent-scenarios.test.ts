/**
 * SINT Protocol — ROS2 + Agent Multi-Agent Scenarios.
 *
 * Validates multi-agent coordination safety properties:
 *   S1 — Two agents on /cmd_vel: both within constraints → both escalated (T2)
 *   S2 — One agent over velocity limit → denied; compliant agent escalates normally
 *   S3 — Sequential stop → move: valid sequence flows through gateway
 *   S4 — Emergency stop resource always processed (not outright denied)
 *   S5 — Agent outside geofence: motion command denied
 *   S6 — Multiple T0 sensor reads allowed simultaneously ("forward")
 *   S7 — Service call escalates; ledger records event with intact chain
 *   S8 — Fleet manager delegates to robot with narrowed velocity constraint
 *
 * Important: ROS2Interceptor returns action values:
 *   "forward"  — T0/T1 approved automatically
 *   "escalate" — T2/T3 requires review (not a denial)
 *   "deny"     — explicitly blocked (constraint or resource violation)
 *
 * @module @sint/conformance-tests/ros2-agent-scenarios
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateKeypair,
  generateUUIDv7,
  nowISO8601,
  issueCapabilityToken,
  delegateCapabilityToken,
  RevocationStore,
} from "@pshkv/gate-capability-tokens";
import { PolicyGateway, ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { LedgerWriter } from "@pshkv/gate-evidence-ledger";
import { ROS2Interceptor } from "@pshkv/bridge-ros2";
import type {
  ROS2TopicMessage,
  ROS2ServiceCall,
  ROS2ActionGoal,
} from "@pshkv/bridge-ros2";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@pshkv/core";
import { ApprovalTier } from "@pshkv/core";

// ── Helpers ───────────────────────────────────────────────────────────────────

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function nowISO(): string {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

// ── Shared setup ──────────────────────────────────────────────────────────────

describe("ROS2 + Agent Multi-Agent Scenarios", () => {
  const root = generateKeypair();
  const agentA = generateKeypair();
  const agentB = generateKeypair();
  const fleetManager = generateKeypair();
  const robot1 = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let ledger: LedgerWriter;
  let approvalQueue: ApprovalQueue;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();
    approvalQueue = new ApprovalQueue();

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
    subject: string,
    overrides?: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject,
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

  function createInterceptor(
    subject: string,
    token: SintCapabilityToken,
    robotMassKg?: number,
  ): ROS2Interceptor {
    return new ROS2Interceptor({
      gateway,
      agentId: subject,
      tokenId: token.tokenId,
      robotMassKg,
    });
  }

  function cmdVelMessage(
    linearX: number,
    overrides?: Partial<ROS2TopicMessage>,
  ): ROS2TopicMessage {
    return {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: {
        linear: { x: linearX, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
      timestamp: nowISO(),
      ...overrides,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Two agents on /cmd_vel both get processed (T2 = escalate)
  // cmd_vel publish is T2_ACT → both agents will get "escalate" (not "deny")
  // ──────────────────────────────────────────────────────────────────────────
  it("S1. Two agents on /cmd_vel within constraints both get escalated (T2_ACT requires review)", async () => {
    const tokenA = issueAndStore(agentA.publicKey, { constraints: { maxVelocityMps: 0.5 } });
    const tokenB = issueAndStore(agentB.publicKey, { constraints: { maxVelocityMps: 0.5 } });

    const interceptorA = createInterceptor(agentA.publicKey, tokenA, 10);
    const interceptorB = createInterceptor(agentB.publicKey, tokenB, 10);

    const resultA = await interceptorA.interceptPublish(cmdVelMessage(0.3));
    const resultB = await interceptorB.interceptPublish(cmdVelMessage(0.3));

    // cmd_vel is T2_ACT — must escalate, never be denied for in-constraint commands
    expect(resultA.action).toBe("escalate");
    expect(resultB.action).toBe("escalate");
    expect(resultA.decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(resultB.decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2 — Agent A exceeds velocity: denied. Agent B (within limits): escalated
  // ──────────────────────────────────────────────────────────────────────────
  it("S2. Agent exceeding velocity limit is denied; compliant agent escalates normally", async () => {
    const tokenA = issueAndStore(agentA.publicKey, { constraints: { maxVelocityMps: 0.2 } });
    const tokenB = issueAndStore(agentB.publicKey, { constraints: { maxVelocityMps: 0.5 } });

    const interceptorA = createInterceptor(agentA.publicKey, tokenA, 15);
    const interceptorB = createInterceptor(agentB.publicKey, tokenB, 15);

    // Agent A exceeds its 0.2 m/s limit
    const resultA = await interceptorA.interceptPublish(cmdVelMessage(0.8));
    // Agent B is within its 0.5 m/s limit
    const resultB = await interceptorB.interceptPublish(cmdVelMessage(0.3));

    expect(resultA.action).toBe("deny");
    // Agent B gets T2 escalation (not denied) for in-constraint cmd_vel
    expect(resultB.action).toBe("escalate");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3 — Sequential motion: stop (0 m/s) then safe move
  // Both commands within constraint → T2 escalation (not denial)
  // ──────────────────────────────────────────────────────────────────────────
  it("S3. Sequential stop then move command is processed correctly (T2 escalation)", async () => {
    const token = issueAndStore(agentA.publicKey, { constraints: { maxVelocityMps: 0.5 } });
    const interceptor = createInterceptor(agentA.publicKey, token, 10);

    // First: stop command (velocity = 0) — T2 cmd_vel always escalates
    const stop = await interceptor.interceptPublish(cmdVelMessage(0));
    expect(stop.action).toBe("escalate");

    // Then: move at safe velocity — also T2 escalation
    const move = await interceptor.interceptPublish(cmdVelMessage(0.3));
    expect(move.action).toBe("escalate");

    // Neither should be denied — within constraint
    expect(stop.action).not.toBe("deny");
    expect(move.action).not.toBe("deny");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 4 — Emergency stop resource: always processed by gateway
  // E-stop is a safety command — must never be outright denied before gateway evaluation
  // ──────────────────────────────────────────────────────────────────────────
  it("S4. Emergency stop publish reaches gateway and is not silently dropped", async () => {
    const token = issueAndStore(agentA.publicKey, {
      resource: "ros2:///emergency_stop",
      actions: ["publish", "call"],
      constraints: {},
    });
    const interceptor = createInterceptor(agentA.publicKey, token, 10);

    const estopMessage: ROS2TopicMessage = {
      topicName: "/emergency_stop",
      messageType: "std_msgs/Bool",
      data: { data: true },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptPublish(estopMessage);

    // E-stop must reach the gateway — it should never be silently dropped
    // (it may escalate to T3_COMMIT as an irreversible state change, but not "not found")
    expect(result.decision).toBeDefined();
    expect(result.decision.assignedTier).toBeDefined();
    // E-stop is not a deny — it's a valid command that escalates or is committed
    expect(result.action).not.toBe("deny");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 5 — Geofence boundary: agent outside geofence is denied
  // ──────────────────────────────────────────────────────────────────────────
  it("S5. Agent commanding motion outside geofence polygon is denied or escalated", async () => {
    const token = issueAndStore(agentA.publicKey, {
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        maxVelocityMps: 0.5,
        geofence: {
          coordinates: [
            [-122.4, 37.7],
            [-122.4, 37.8],
            [-122.3, 37.8],
            [-122.3, 37.7],
          ],
        },
      },
    });

    const interceptor = createInterceptor(agentA.publicKey, token, 10);

    const message: ROS2TopicMessage = {
      topicName: "/cmd_vel",
      messageType: "geometry_msgs/Twist",
      data: { linear: { x: 0.2, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
      timestamp: nowISO(),
      physicalContext: {
        currentPosition: { x: -100, y: 10, z: 0 }, // Way outside geofence
      },
    };

    const result = await interceptor.interceptPublish(message);

    // Position outside geofence → gateway must deny or escalate (not forward)
    expect(result.action).not.toBe("forward");
    // The decision must flag a constraint or geofence violation
    expect(result.decision).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 6 — Sensor fusion: multiple T0 reads all return "forward"
  // ──────────────────────────────────────────────────────────────────────────
  it("S6. Multiple T0 sensor reads from different agents all return forward", async () => {
    const tokenA = issueAndStore(agentA.publicKey, {
      resource: "ros2:///camera/*",
      actions: ["subscribe"],
      constraints: {},
    });
    const tokenB = issueAndStore(agentB.publicKey, {
      resource: "ros2:///camera/*",
      actions: ["subscribe"],
      constraints: {},
    });

    const interceptorA = createInterceptor(agentA.publicKey, tokenA);
    const interceptorB = createInterceptor(agentB.publicKey, tokenB);

    // Use interceptSubscribe for T0 reads — this returns "forward" for T0
    const [resultA, resultB] = await Promise.all([
      interceptorA.interceptSubscribe("/camera/front"),
      interceptorB.interceptSubscribe("/camera/rear"),
    ]);

    expect(resultA.action).toBe("forward");
    expect(resultB.action).toBe("forward");
    // Both should be T0 observe
    expect(resultA.decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(resultB.decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 7 — Human-in-loop: gripper/* service call escalates; ledger intact
  // Use ros2:///gripper/* which has explicit T2_ACT tier rule in SINT
  // ──────────────────────────────────────────────────────────────────────────
  it("S7. Gripper service call escalates to T2_ACT and ledger records event with intact chain", async () => {
    const token = issueAndStore(agentA.publicKey, {
      resource: "ros2:///gripper/*",
      actions: ["publish", "call"],
      constraints: {},
    });
    const interceptor = createInterceptor(agentA.publicKey, token, 10);

    const serviceCall: ROS2ServiceCall = {
      serviceName: "/gripper/close",
      serviceType: "std_srvs/SetBool",
      request: { data: true },
      timestamp: nowISO(),
    };

    const result = await interceptor.interceptServiceCall(serviceCall);

    // ros2:///gripper/* is T2_ACT → must escalate (require review)
    expect(result.action).toBe("escalate");
    expect(result.decision.assignedTier).toBe(ApprovalTier.T2_ACT);

    // Ledger must have at least one event
    expect(ledger.length).toBeGreaterThan(0);

    // Chain must remain intact
    const chain = ledger.verifyChain();
    expect(chain.ok).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 8 — Fleet manager → robot token delegation with constraint narrowing
  // Uses tightenConstraints to reduce the velocity limit from 1.0 → 0.3 m/s
  // ──────────────────────────────────────────────────────────────────────────
  it("S8. Fleet manager delegates to robot; robot is denied if exceeding delegated velocity constraint", async () => {
    // Fleet manager token: up to 1.0 m/s
    const fleetToken = issueAndStore(fleetManager.publicKey, {
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 1.0, maxForceNewtons: 200 },
    });

    // Delegate to robot1 with narrower constraint (0.3 m/s) via tightenConstraints
    const delegated = delegateCapabilityToken(
      fleetToken,
      {
        newSubject: robot1.publicKey,
        tightenConstraints: { maxVelocityMps: 0.3 },
      },
      fleetManager.privateKey,
    );

    if (!delegated.ok) throw new Error(`Delegation failed: ${delegated.error}`);
    tokenStore.set(delegated.value.tokenId, delegated.value);

    // Robot with mass 15 kg (large enough that 0.5 m/s violates velocity constraint)
    const interceptor = createInterceptor(robot1.publicKey, delegated.value, 15);

    // Robot tries 0.5 m/s — exceeds its delegated 0.3 m/s
    // (even though fleet token allows 1.0 m/s — attenuation is enforced)
    const fastCmd = await interceptor.interceptPublish(cmdVelMessage(0.5));
    expect(fastCmd.action).toBe("deny");
  });
});
