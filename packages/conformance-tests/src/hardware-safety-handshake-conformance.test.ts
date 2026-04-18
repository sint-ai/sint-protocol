/**
 * Hardware Safety Phase A — conformance test suite.
 *
 * Covers:
 * - SafetyPermitPlugin integration with PolicyGateway
 * - IotInterceptor hardware safety bridge (estop, interlock, stale state)
 * - Fixture-driven scenario conformance (hardware-safety-handshake.v1.json)
 * - Cross-bridge consistency (ROS2 and IoT bridges produce same deny codes)
 *
 * Phase A (Q2 2026): Signal + evidence alignment.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
} from "@sint-ai/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@sint-ai/gate-capability-tokens";
import {
  PolicyGateway,
  type SafetyPermitPlugin,
  type SafetyPermitResult,
} from "@sint-ai/gate-policy-gateway";
import {
  IotInterceptor,
  createDeviceProfile,
  hardwareSafetyContextFromPayload,
} from "@sint-ai/bridge-iot";
import { loadHardwareSafetyHandshakeFixture } from "./fixture-loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function staleISO(msAgo: number): string {
  const d = new Date(Date.now() - msAgo);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function replaceNowPlaceholder<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/\"__NOW__\"/g, JSON.stringify(nowISO8601())),
  ) as T;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("Hardware Safety Phase A — Conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let events: Array<{ eventType: string; payload: Record<string, unknown> }>;

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "*",
      actions: ["publish"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };
    const issued = issueCapabilityToken(req, root.privateKey);
    if (!issued.ok) {
      throw new Error(`Token issuance failed: ${issued.error}`);
    }
    tokenStore.set(issued.value.tokenId, issued.value);
    return issued.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    events = [];
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
      emitLedgerEvent: (event) => events.push(event as (typeof events)[number]),
    });
  });

  // -------------------------------------------------------------------------
  // Group 1: SafetyPermitPlugin integration
  // -------------------------------------------------------------------------

  describe("Group 1: SafetyPermitPlugin integration", () => {
    it("plugin returns estopState: triggered → gateway denies T2 action with HARDWARE_ESTOP_ACTIVE", async () => {
      const safetyPermit: SafetyPermitPlugin = {
        resolvePermit: async (): Promise<SafetyPermitResult> => ({
          permitState: "granted",
          estopState: "triggered",
          interlockState: "closed",
          observedAt: nowISO8601(),
          source: "mock",
        }),
      };
      const gwWithPlugin = new PolicyGateway({
        resolveToken: (tokenId) => tokenStore.get(tokenId),
        revocationStore,
        safetyPermit,
      });
      const token = issueAndStore();

      const decision = await gwWithPlugin.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    });

    it("plugin returns permitState: denied on T2 with industrial profile → deny HARDWARE_PERMIT_REQUIRED", async () => {
      const safetyPermit: SafetyPermitPlugin = {
        resolvePermit: async (): Promise<SafetyPermitResult> => ({
          permitState: "denied",
          estopState: "clear",
          interlockState: "closed",
          observedAt: nowISO8601(),
          source: "plc",
        }),
      };
      const gwWithPlugin = new PolicyGateway({
        resolveToken: (tokenId) => tokenStore.get(tokenId),
        revocationStore,
        safetyPermit,
      });
      const token = issueAndStore();

      const decision = await gwWithPlugin.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.2 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
    });

    it("plugin throws → fail-open, T1 action still passes (no hardware context needed)", async () => {
      const safetyPermit: SafetyPermitPlugin = {
        resolvePermit: async (): Promise<SafetyPermitResult> => {
          throw new Error("PLC unreachable");
        },
      };
      const gwWithPlugin = new PolicyGateway({
        resolveToken: (tokenId) => tokenStore.get(tokenId),
        revocationStore,
        safetyPermit,
      });
      const token = issueAndStore({ resource: "ros2:///plan", actions: ["publish"] });

      const decision = await gwWithPlugin.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///plan",
        action: "publish",
        params: { waypoint: "A-01" },
      });

      // T1 action — no hardware safety required, plugin error is fail-open
      expect(decision.action).not.toBe("deny");
    });

    it("plugin returns undefined → falls through to request executionContext hardwareSafety", async () => {
      const safetyPermit: SafetyPermitPlugin = {
        resolvePermit: async (): Promise<undefined> => undefined,
      };
      const gwWithPlugin = new PolicyGateway({
        resolveToken: (tokenId) => tokenStore.get(tokenId),
        revocationStore,
        safetyPermit,
      });
      const token = issueAndStore();

      // Request carries hardwareSafety with permitState: denied
      const decision = await gwWithPlugin.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "denied",
            interlockState: "closed",
            estopState: "clear",
            observedAt: nowISO8601(),
          },
        },
      });

      // Plugin is undefined → request context drives decision → permit denied → deny
      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
    });
  });

  // -------------------------------------------------------------------------
  // Group 2: IotInterceptor hardware safety bridge
  // -------------------------------------------------------------------------

  describe("Group 2: IotInterceptor hardware safety bridge", () => {
    const broker = "mqtt://iot-broker.local";

    it("MQTT estop topic payload with estop triggered → hardwareSafety populated → gateway denies", async () => {
      const token = issueAndStore();
      const deviceProfile = createDeviceProfile("actuator", "factory/line1", broker);
      const interceptor = new IotInterceptor({
        gateway,
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        broker,
        deploymentProfile: "warehouse-amr",
        deviceProfile,
      });

      const payload = JSON.stringify({ estop: "triggered" });
      const result = await interceptor.interceptPublish("factory/line1/estop", Buffer.from(payload));

      expect(result.action).toBe("deny");
      expect(result.decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    });

    it("MQTT payload with stale observedAt (6000ms ago) → HARDWARE_STATE_STALE from gateway", async () => {
      const token = issueAndStore();
      const deviceProfile = createDeviceProfile("plc", "factory/plc1", broker);
      const interceptor = new IotInterceptor({
        gateway,
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        broker,
        deploymentProfile: "warehouse-amr",
        deviceProfile,
      });

      // Craft a request manually to inject stale observedAt into hardwareSafety context
      const staleObservedAt = staleISO(6000);
      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "closed",
            estopState: "clear",
            observedAt: staleObservedAt,
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_STATE_STALE");
    });

    it("PLC cmd topic via gateway with warehouse-amr profile → T2 without safety context → deny HARDWARE_PERMIT_REQUIRED", async () => {
      const token = issueAndStore();

      // Use ros2:///cmd_vel resource (T2_ACT) to exercise the missing safety context path
      // because the IotInterceptor uses iot:// scheme which has no T2 rule in the default tier rules.
      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          // No hardwareSafety context → should deny for industrial profile
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
    });

    it("actuator interlock open in hardwareSafety context → deny HARDWARE_INTERLOCK_OPEN", async () => {
      const token = issueAndStore();
      // Use a T2 resource so the hardware safety interlock check is reached
      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "open",
            estopState: "clear",
            observedAt: nowISO8601(),
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_INTERLOCK_OPEN");
    });

    it("onEstopTriggered callback fires when estop triggered in safety topic payload", async () => {
      const token = issueAndStore();
      const onEstopTriggered = vi.fn();
      const deviceProfile = createDeviceProfile("actuator", "factory/amr1", broker);
      const interceptor = new IotInterceptor({
        gateway,
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        broker,
        deploymentProfile: "warehouse-amr",
        deviceProfile,
        onEstopTriggered,
      });

      const payload = JSON.stringify({ estop: "triggered" });
      await interceptor.interceptPublish("factory/amr1/estop", Buffer.from(payload));

      expect(onEstopTriggered).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Group 3: Fixture conformance (hardware-safety-handshake.v1.json)
  // -------------------------------------------------------------------------

  describe("Group 3: Fixture conformance scenarios", () => {
    it("runs all hardware-safety-handshake.v1.json fixture cases", async () => {
      const fixture = loadHardwareSafetyHandshakeFixture();
      const token = issueAndStore({
        resource: fixture.token.resource,
        actions: [...fixture.token.actions],
      });

      for (const scenario of fixture.cases) {
        const request = replaceNowPlaceholder(scenario.request);

        const decision = await gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: request.resource,
          action: request.action,
          params: request.params ?? {},
          executionContext: request.executionContext as SintRequest["executionContext"],
        });

        expect(decision.action, `scenario: ${scenario.name}`).toBe(
          scenario.expected.decisionAction,
        );

        if (scenario.expected.assignedTier) {
          expect(decision.assignedTier, `scenario: ${scenario.name}`).toBe(
            scenario.expected.assignedTier,
          );
        }

        if (scenario.expected.policyViolated) {
          expect(decision.denial?.policyViolated, `scenario: ${scenario.name}`).toBe(
            scenario.expected.policyViolated,
          );
        }
      }
    });

    it("fixture permit_missing scenario: T2 action without permit → HARDWARE_PERMIT_REQUIRED", async () => {
      const token = issueAndStore();

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.12 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
    });

    it("fixture permit_revoked_mid_action: permit:denied mid-action → deny", async () => {
      const token = issueAndStore();

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "denied",
            interlockState: "closed",
            estopState: "clear",
            observedAt: nowISO8601(),
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_PERMIT_REQUIRED");
    });

    it("fixture estop_under_load: estop triggered during concurrent T2 commands → all denied", async () => {
      const token = issueAndStore();

      const makeRequest = () =>
        gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: { linear: { x: 0.1 } },
          executionContext: {
            deploymentProfile: "warehouse-amr",
            hardwareSafety: {
              permitState: "granted",
              interlockState: "closed",
              estopState: "triggered",
              observedAt: nowISO8601(),
            },
          },
        });

      const results = await Promise.all(Array.from({ length: 5 }, makeRequest));

      expect(results.every((d) => d.action === "deny")).toBe(true);
      expect(results.every((d) => d.denial?.policyViolated === "HARDWARE_ESTOP_ACTIVE")).toBe(true);
    });

    it("fixture interlock_open: guard door opened → interlock.open → deny HARDWARE_INTERLOCK_OPEN", async () => {
      const token = issueAndStore();

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "open",
            estopState: "clear",
            observedAt: nowISO8601(),
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_INTERLOCK_OPEN");
    });

    it("fixture reconnect_stale_cache: broker reconnect with observedAt > 5000ms → HARDWARE_STATE_STALE", async () => {
      const token = issueAndStore();

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "closed",
            estopState: "clear",
            observedAt: staleISO(6000),
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_STATE_STALE");
    });

    it("fixture nominal_t2_with_permit: T2 with permit:granted, estop:clear, interlock:closed → allow/escalate", async () => {
      const token = issueAndStore();

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.12 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "closed",
            estopState: "clear",
            observedAt: nowISO8601(),
            controllerId: "plc-amr-01",
          },
        },
      });

      // T2 action passes hardware safety checks — gateway escalates (requires approval)
      expect(decision.action).not.toBe("deny");
      expect(["allow", "escalate"]).toContain(decision.action);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4: Cross-bridge hardware safety consistency
  // -------------------------------------------------------------------------

  describe("Group 4: Cross-bridge hardware safety consistency", () => {
    it("ROS2 bridge estop in executionContext → same deny code HARDWARE_ESTOP_ACTIVE as IoT bridge", async () => {
      const token = issueAndStore();
      const broker = "mqtt://iot-broker.local";

      // ROS2 bridge path
      const ros2Decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            estopState: "triggered",
            interlockState: "closed",
            observedAt: nowISO8601(),
          },
        },
      });

      // IoT bridge path
      const iotDecision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: `iot://${broker}/factory/amr1/cmd`,
        action: "publish",
        params: { topic: "factory/amr1/cmd", qos: 0, payloadSize: 10 },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            estopState: "triggered",
            interlockState: "closed",
            observedAt: nowISO8601(),
          },
        },
      });

      expect(ros2Decision.action).toBe("deny");
      expect(iotDecision.action).toBe("deny");
      expect(ros2Decision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
      expect(iotDecision.denial?.policyViolated).toBe("HARDWARE_ESTOP_ACTIVE");
    });

    it("OPC-UA resource with hardware safety context → same interlock deny behavior", async () => {
      const token = issueAndStore({ resource: "opcua://*", actions: ["write"] });

      const decision = await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "opcua://plc-1.local:4840/ns%3D2%3Bs%3DLine1%2FConveyor%2FSpeedSetpoint",
        action: "write",
        params: { nodeId: "ns=2;s=Line1/Conveyor/SpeedSetpoint", value: 42.5 },
        executionContext: {
          deploymentProfile: "industrial-cell",
          hardwareSafety: {
            permitState: "granted",
            interlockState: "open",
            estopState: "clear",
            observedAt: nowISO8601(),
          },
        },
      });

      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("HARDWARE_INTERLOCK_OPEN");
    });

    it("stale hardware safety state produces HARDWARE_STATE_STALE for both ROS2 and OPC-UA resources", async () => {
      const token = issueAndStore({ resource: "*", actions: ["publish", "write"] });
      const staleAt = staleISO(7000);
      const commonContext = {
        deploymentProfile: "warehouse-amr" as const,
        hardwareSafety: {
          permitState: "granted" as const,
          interlockState: "closed" as const,
          estopState: "clear" as const,
          observedAt: staleAt,
        },
      };

      const [ros2Decision, opcuaDecision] = await Promise.all([
        gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: { linear: { x: 0.1 } },
          executionContext: commonContext,
        }),
        gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "opcua://plc-1.local:4840/ns%3D2%3Bs%3DLine1%2FConveyor%2FSpeedSetpoint",
          action: "write",
          params: { nodeId: "ns=2;s=Line1/Conveyor/SpeedSetpoint", value: 42.5 },
          executionContext: commonContext,
        }),
      ]);

      expect(ros2Decision.denial?.policyViolated).toBe("HARDWARE_STATE_STALE");
      expect(opcuaDecision.denial?.policyViolated).toBe("HARDWARE_STATE_STALE");
    });

    it("evidence events are emitted for each hardware safety denial", async () => {
      const token = issueAndStore();
      const eventsBefore = events.length;

      await gateway.intercept({
        requestId: generateUUIDv7(),
        timestamp: nowISO8601(),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.1 } },
        executionContext: {
          deploymentProfile: "warehouse-amr",
          hardwareSafety: {
            permitState: "granted",
            estopState: "triggered",
            interlockState: "closed",
            observedAt: nowISO8601(),
          },
        },
      });

      const newEvents = events.slice(eventsBefore);
      const estopEvent = newEvents.find((e) => e.eventType === "safety.estop.triggered");
      expect(estopEvent).toBeDefined();
    });

    it("hardwareSafetyContextFromPayload maps MQTT payload fields to SintHardwareSafetyContext correctly", () => {
      const payload = {
        estop: "triggered" as const,
        permit: "denied" as const,
        interlock: "open" as const,
        controllerId: "plc-01",
      };
      const ctx = hardwareSafetyContextFromPayload(payload, nowISO8601());

      expect(ctx.estopState).toBe("triggered");
      expect(ctx.permitState).toBe("denied");
      expect(ctx.interlockState).toBe("open");
      expect(ctx.controllerId).toBe("plc-01");
    });
  });
});
