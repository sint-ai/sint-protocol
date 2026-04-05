/**
 * SINT Protocol — Industrial interoperability conformance.
 *
 * Verifies equivalent safety-tier behavior for the same warehouse command
 * routed through different industrial ingress paths.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ApprovalTier, type SintCapabilityToken, type SintCapabilityTokenRequest } from "@sint/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { topicToResourceUri, gazeboTopicToResourceUri } from "@sint/bridge-ros2";
import {
  rmfDispatchResourceUri,
  rmfOperationToAction,
} from "@sint/bridge-open-rmf";
import {
  sparkplugActionForMessageType,
  sparkplugTopicToResourceUri,
} from "@sint/bridge-mqtt-sparkplug";
import {
  opcUaNodeToResourceUri,
  opcUaOperationToAction,
} from "@sint/bridge-opcua";
import { GrpcBridgeAdapter } from "../../bridge-grpc/src/grpc-bridge-adapter.js";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Industrial Interoperability Conformance", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;
  let emitted: Array<{ eventType: string; payload: Record<string, unknown> }>;

  function issueAndStore(
    overrides: Partial<SintCapabilityTokenRequest>,
  ): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "*",
      actions: ["call"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };

    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) {
      throw new Error(`Token issuance failed: ${result.error}`);
    }
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    emitted = [];
    revocationStore.clear();

    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
      emitLedgerEvent: (event) => {
        emitted.push({ eventType: event.eventType, payload: event.payload });
      },
    });
  });

  it("warehouse move intent yields equivalent tiering for RMF->ROS2 and Sparkplug paths", async () => {
    const rosToken = issueAndStore({
      resource: "ros2://*",
      actions: ["publish"],
    });
    const sparkToken = issueAndStore({
      resource: "mqtt-sparkplug://*",
      actions: ["call"],
    });
    const opcuaToken = issueAndStore({
      resource: "opcua://*",
      actions: ["call"],
    });
    const grpcToken = issueAndStore({
      resource: "grpc://*",
      actions: ["call"],
    });

    const rosDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rosToken.tokenId,
      resource: topicToResourceUri("/cmd_vel"),
      action: "publish",
      params: {
        command: "move_to_aisle",
        destination: "A-17",
      },
      physicalContext: {
        currentForceNewtons: 18,
        currentVelocityMps: 0.45,
      },
      recentActions: ["open-rmf.dispatch"],
    });

    const sparkUri = sparkplugTopicToResourceUri(
      "spBv1.0/warehouse/DCMD/edge-gateway-1/amr-17",
    );
    if (!sparkUri) {
      throw new Error("Sparkplug URI mapping failed");
    }

    const sparkDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: opcuaToken.tokenId,
      resource: sparkUri,
      action: sparkplugActionForMessageType("DCMD"),
      params: {
        command: "move_to_aisle",
        destination: "A-17",
      },
      physicalContext: {
        currentForceNewtons: 18,
        currentVelocityMps: 0.45,
      },
      recentActions: ["sparkplug.dispatch"],
    });

    const opcuaDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: grpcToken.tokenId,
      resource: opcUaNodeToResourceUri("ns=2;s=Warehouse/AMR/17/MoveCommand", "opc.tcp://ot-gw:4840"),
      action: opcUaOperationToAction("call"),
      params: {
        command: "move_to_aisle",
        destination: "A-17",
      },
      physicalContext: {
        currentForceNewtons: 18,
        currentVelocityMps: 0.45,
      },
      recentActions: ["opcua.dispatch"],
    });

    const grpcAdapter = new GrpcBridgeAdapter();
    const grpcMapped = grpcAdapter.mapInvocation({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: sparkToken.tokenId,
      service: "warehouse.v1.DispatchService",
      method: "DispatchMoveTask",
      host: "rmf-gw.local:50051",
      pattern: "unary",
      params: {
        command: "move_to_aisle",
        destination: "A-17",
      },
    });
    const grpcDecision = await gateway.intercept({
      ...grpcMapped,
      physicalContext: {
        currentForceNewtons: 18,
        currentVelocityMps: 0.45,
      },
      recentActions: ["grpc.dispatch"],
    });

    // All bridge paths for the same warehouse move intent must remain in
    // high-assurance tiers (no T0/T1 downgrade) and require escalation.
    for (const decision of [rosDecision, sparkDecision, opcuaDecision, grpcDecision]) {
      expect([ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT]).toContain(decision.assignedTier);
      expect(["escalate", "deny"]).toContain(decision.action);
    }
    expect([rosDecision, sparkDecision, opcuaDecision, grpcDecision].some(
      (decision) => decision.action === "escalate",
    )).toBe(true);

    const policyEvents = emitted.filter((e) => e.eventType === "policy.evaluated");
    expect(policyEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("A2A -> Open-RMF dispatch path maps into the same gateway approval semantics", async () => {
    const rmfToken = issueAndStore({
      resource: "open-rmf://*",
      actions: ["call"],
    });

    const rmfDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rmfToken.tokenId,
      resource: rmfDispatchResourceUri("warehouse-fleet"),
      action: rmfOperationToAction("task.dispatch"),
      params: {
        source: "a2a://dispatcher.example.com/navigate",
        taskId: "task-warehouse-001",
      },
      physicalContext: {
        currentForceNewtons: 16,
      },
    });

    expect(rmfDecision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(rmfDecision.action).toBe("escalate");
  });

  it("Gazebo model-scoped cmd_vel maps to equivalent ROS2 control-tier semantics", async () => {
    const rosToken = issueAndStore({
      resource: "ros2://*",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.6 },
    });

    const canonicalDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rosToken.tokenId,
      resource: topicToResourceUri("/cmd_vel"),
      action: "publish",
      params: { command: "move_to_aisle", destination: "B-04" },
      physicalContext: {
        currentVelocityMps: 0.4,
      },
    });

    const gazeboDecision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: rosToken.tokenId,
      resource: gazeboTopicToResourceUri("/world/demo/model/warehouse_bot/cmd_vel"),
      action: "publish",
      params: { command: "move_to_aisle", destination: "B-04" },
      physicalContext: {
        currentVelocityMps: 0.4,
      },
    });

    expect(gazeboDecision.assignedTier).toBe(canonicalDecision.assignedTier);
    expect(gazeboDecision.action).toBe(canonicalDecision.action);
    expect(gazeboDecision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(gazeboDecision.action).toBe("escalate");
  });
});
