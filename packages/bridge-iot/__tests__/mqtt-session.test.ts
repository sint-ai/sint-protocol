/**
 * SINT Protocol — MQTT Session Manager tests.
 *
 * 9 test cases covering:
 * 1. authorizedPublish → gateway allow → calls mqttClient.publish
 * 2. authorizedPublish → gateway deny → throws MqttAuthorizationError
 * 3. authorizedSubscribe → gateway allow → calls mqttClient.subscribe
 * 4. authorizedSubscribe → gateway deny → throws MqttAuthorizationError
 * 5. Safety-critical topic (estop) resource URI contains "estop"
 * 6. Sensor topic resource URI indicates T0-tier topic
 * 7. getStats() increments authorized/denied counters correctly
 * 8. Gateway escalate → throws MqttAuthorizationError (no fail-open execution)
 * 9. Gateway error → propagated (no silent swallow)
 */

import { describe, it, expect, vi } from "vitest";
import { MqttGatewaySession, MqttAuthorizationError } from "../src/mqtt-session.js";
import type { MqttClientAdapter, GatewayLike } from "../src/mqtt-session.js";
import type { PolicyDecision } from "@pshkv/core";

const AGENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const TOKEN_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const BROKER = "mqtt://broker.example.com";

function makeAllowDecision(): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000001" as any,
    timestamp: new Date().toISOString(),
    action: "allow",
    assignedTier: "T0_observe" as any,
    assignedRisk: "T0_read" as any,
  };
}

function makeDenyDecision(policyViolated = "TOKEN_NOT_FOUND"): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000002" as any,
    timestamp: new Date().toISOString(),
    action: "deny",
    assignedTier: "T3_commit" as any,
    assignedRisk: "T3_irreversible" as any,
    denial: { reason: "Denied", policyViolated },
  };
}

function makeEscalateDecision(): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000003" as any,
    timestamp: new Date().toISOString(),
    action: "escalate",
    assignedTier: "T2_act" as any,
    assignedRisk: "T2_stateful" as any,
    escalation: {
      requiredTier: "T2_act" as any,
      reason: "Action requires operator approval",
      timeoutMs: 300000,
      fallbackAction: "deny",
    },
  };
}

function makeGateway(decision: PolicyDecision): GatewayLike {
  return { intercept: vi.fn().mockResolvedValue(decision) };
}

function makeMqttClient(): MqttClientAdapter & {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
} {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

describe("MqttGatewaySession", () => {
  it("1. authorizedPublish → gateway allow → calls mqttClient.publish", async () => {
    const gateway = makeGateway(makeAllowDecision());
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    const decision = await session.authorizedPublish(
      "factory/zone1/sensor/temperature",
      Buffer.from("22.5"),
      { qos: 1 },
    );

    expect(decision.action).toBe("allow");
    expect(mqttClient.publish).toHaveBeenCalledWith(
      "factory/zone1/sensor/temperature",
      Buffer.from("22.5"),
      { qos: 1 },
    );
    expect(gateway.intercept).toHaveBeenCalledTimes(1);
  });

  it("2. authorizedPublish → gateway deny → throws MqttAuthorizationError", async () => {
    const gateway = makeGateway(makeDenyDecision("TOKEN_NOT_FOUND"));
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await expect(
      session.authorizedPublish("factory/zone1/cmd/valve/open", "open"),
    ).rejects.toThrow(MqttAuthorizationError);

    // publish should NOT be called on deny
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it("3. authorizedSubscribe → gateway allow → calls mqttClient.subscribe", async () => {
    const gateway = makeGateway(makeAllowDecision());
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    const decision = await session.authorizedSubscribe("factory/+/sensor/#", { qos: 0 });

    expect(decision.action).toBe("allow");
    expect(mqttClient.subscribe).toHaveBeenCalledWith("factory/+/sensor/#", { qos: 0 });
  });

  it("4. authorizedSubscribe → gateway deny → throws MqttAuthorizationError", async () => {
    const gateway = makeGateway(makeDenyDecision("TOKEN_NOT_FOUND"));
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await expect(
      session.authorizedSubscribe("factory/+/sensor/#"),
    ).rejects.toThrow(MqttAuthorizationError);

    expect(mqttClient.subscribe).not.toHaveBeenCalled();
  });

  it("5. Safety-critical topic (estop) resource URI contains 'estop'", async () => {
    let capturedRequest: any;
    const gateway: GatewayLike = {
      intercept: vi.fn().mockImplementation((req) => {
        capturedRequest = req;
        return Promise.resolve(makeAllowDecision());
      }),
    };
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await session.authorizedPublish("safety/estop/trigger", "1");

    // Verify the resource URI reflects the estop topic
    expect(capturedRequest.resource).toContain("estop");
    expect(capturedRequest.action).toBe("publish");
  });

  it("6. Sensor topic resource URI reflects sensor topic path", async () => {
    let capturedRequest: any;
    const gateway: GatewayLike = {
      intercept: vi.fn().mockImplementation((req) => {
        capturedRequest = req;
        return Promise.resolve(makeAllowDecision());
      }),
    };
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await session.authorizedSubscribe("factory/zone1/temperature");

    expect(capturedRequest.resource).toContain("temperature");
    expect(capturedRequest.resource).toMatch(/^mqtt:\/\//);
    expect(capturedRequest.action).toBe("subscribe");
  });

  it("7. getStats() increments authorized/denied counters correctly", async () => {
    const mqttClient = makeMqttClient();

    // First session: 2 allowed publishes
    const allowGateway = makeGateway(makeAllowDecision());
    const allowSession = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway: allowGateway,
      mqttClient,
    });
    await allowSession.authorizedPublish("sensor/temp", "22.5");
    await allowSession.authorizedPublish("sensor/humidity", "60");
    expect(allowSession.getStats().authorized).toBe(2);
    expect(allowSession.getStats().denied).toBe(0);

    // Second session: 1 denied
    const denyGateway = makeGateway(makeDenyDecision("TOKEN_NOT_FOUND"));
    const denySession = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway: denyGateway,
      mqttClient,
    });
    await expect(denySession.authorizedPublish("cmd/valve", "open")).rejects.toThrow(MqttAuthorizationError);
    expect(denySession.getStats().authorized).toBe(0);
    expect(denySession.getStats().denied).toBe(1);
  });

  it("8. Gateway escalate → throws MqttAuthorizationError (no fail-open execution)", async () => {
    const gateway = makeGateway(makeEscalateDecision());
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await expect(session.authorizedPublish("factory/zone1/cmd/valve/open", "open")).rejects.toThrow(
      MqttAuthorizationError,
    );
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it("9. Gateway error → propagated (no silent swallow)", async () => {
    const gateway: GatewayLike = {
      intercept: vi.fn().mockRejectedValue(new Error("gateway crashed")),
    };
    const mqttClient = makeMqttClient();
    const session = new MqttGatewaySession({
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      gateway,
      mqttClient,
    });

    await expect(session.authorizedPublish("sensor/temp", "22.5")).rejects.toThrow("gateway crashed");
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });
});
