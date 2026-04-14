/**
 * SINT bridge-iot — IotInterceptor tests.
 *
 * 20 test cases covering:
 * 1. Temperature sensor publish → T0_OBSERVE allowed → action: "forward"
 * 2. Actuator publish (non-safety topic) → T2_ACT → action: "escalate"
 * 3. PLC cmd/start publish → tier override applies → T2_ACT minimum
 * 4. Safety topic: estop payload { estop: "clear" } → executionContext.hardwareSafety populated, allowed
 * 5. Safety topic: estop payload { estop: "triggered" } → gateway returns deny → action: "deny"
 * 6. interlock topic: { interlock: "open" } → deny
 * 7. permit topic: { permit: "denied" } → deny
 * 8. Non-JSON payload on safety topic → no hardwareSafety context (graceful)
 * 9. onEstopTriggered callback fires when estop triggered
 * 10. Subscribe → action: "subscribe" in request params
 * 11. Missing device profile → no safety topic detection, no hardwareSafety
 * 12. deploymentProfile passed through to executionContext
 * 13. Resource URI format: iot://broker/topic
 * 14. Stale hardware safety (observedAt far in past) → gateway denies
 * 15. Smart meter topic → T0_OBSERVE allowed
 * 16. Actuator interlock topic → hardwareSafety populated
 * 17. controllerId from payload → forwarded in hardwareSafety
 * 18. Multiple safety topics in profile → each detected correctly
 * 19. QoS option passed through to params
 * 20. Gateway throw → error propagates (no silent swallow)
 */

import { describe, it, expect, vi } from "vitest";
import { IotInterceptor } from "../src/iot-interceptor.js";
import type { IotGatewayLike } from "../src/iot-interceptor.js";
import { createDeviceProfile } from "../src/device-profiles.js";
import type { PolicyDecision, SintRequest } from "@pshkv/core";

const AGENT_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const TOKEN_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const BROKER = "broker.example.com";

function makeAllowDecision(): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000001" as any,
    timestamp: new Date().toISOString(),
    action: "allow",
    assignedTier: "T0_observe" as any,
    assignedRisk: "T0_read" as any,
  };
}

function makeDenyDecision(reason = "HARDWARE_ESTOP_ACTIVE"): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000002" as any,
    timestamp: new Date().toISOString(),
    action: "deny",
    assignedTier: "T2_act" as any,
    assignedRisk: "T2_write_high" as any,
    denial: { reason, policyViolated: reason },
  };
}

function makeEscalateDecision(): PolicyDecision {
  return {
    requestId: "01905f7c-4e8a-7000-8000-000000000003" as any,
    timestamp: new Date().toISOString(),
    action: "escalate",
    assignedTier: "T2_act" as any,
    assignedRisk: "T2_write_high" as any,
    escalation: {
      requiredTier: "T2_act" as any,
      reason: "Actuator command requires human approval",
      timeoutMs: 30000,
      fallbackAction: "deny",
    },
  };
}

function makeMockGateway(decision: PolicyDecision): IotGatewayLike & { lastRequest: SintRequest | null } {
  const gateway = {
    lastRequest: null as SintRequest | null,
    async intercept(req: SintRequest): Promise<PolicyDecision> {
      gateway.lastRequest = req;
      return decision;
    },
  };
  return gateway;
}

describe("IotInterceptor", () => {
  it("1. temperature sensor publish → allowed → action: 'forward'", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("temperature-sensor", "sensors/temp", BROKER),
    });
    const result = await interceptor.interceptPublish("sensors/temp/reading", '{"value":23.5}');
    expect(result.action).toBe("forward");
    expect(result.topic).toBe("sensors/temp/reading");
  });

  it("2. actuator publish (non-safety topic) → escalate → action: 'escalate'", async () => {
    const gateway = makeMockGateway(makeEscalateDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/valve", BROKER),
    });
    const result = await interceptor.interceptPublish("factory/valve/cmd", '{"open":true}');
    expect(result.action).toBe("escalate");
    expect(result.requiredTier).toBe("T2_act");
  });

  it("3. PLC cmd/start publish → T2_ACT minimum (gateway escalates)", async () => {
    const gateway = makeMockGateway(makeEscalateDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("plc", "factory/plc1", BROKER),
    });
    const result = await interceptor.interceptPublish("factory/plc1/cmd/start", '{"run":true}');
    expect(result.action).toBe("escalate");
    expect(result.decision.escalation?.requiredTier).toBe("T2_act");
  });

  it("4. safety topic estop clear → hardwareSafety populated → allowed", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
    });
    await interceptor.interceptPublish("factory/line1/estop", '{"estop":"clear"}');
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety).toBeDefined();
    expect(req.executionContext?.hardwareSafety?.estopState).toBe("clear");
  });

  it("5. safety topic estop triggered → gateway denies → action: 'deny'", async () => {
    const gateway = makeMockGateway(makeDenyDecision("HARDWARE_ESTOP_ACTIVE"));
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
    });
    const result = await interceptor.interceptPublish(
      "factory/line1/estop",
      '{"estop":"triggered"}',
    );
    expect(result.action).toBe("deny");
    expect(result.denyReason).toBe("HARDWARE_ESTOP_ACTIVE");
  });

  it("6. interlock topic { interlock: 'open' } → deny", async () => {
    const gateway = makeMockGateway(makeDenyDecision("HARDWARE_PERMIT_REQUIRED"));
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
    });
    const result = await interceptor.interceptPublish(
      "factory/line1/interlock",
      '{"interlock":"open"}',
    );
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety?.interlockState).toBe("open");
    expect(result.action).toBe("deny");
  });

  it("7. permit topic { permit: 'denied' } → deny", async () => {
    const gateway = makeMockGateway(makeDenyDecision("HARDWARE_PERMIT_REQUIRED"));
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("plc", "factory/plc1", BROKER),
    });
    const result = await interceptor.interceptPublish(
      "factory/plc1/permit",
      '{"permit":"denied"}',
    );
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety?.permitState).toBe("denied");
    expect(result.action).toBe("deny");
  });

  it("8. non-JSON payload on safety topic → no hardwareSafety context (graceful)", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
    });
    await interceptor.interceptPublish("factory/line1/estop", "not-json-data");
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety).toBeUndefined();
  });

  it("9. onEstopTriggered callback fires when estop triggered", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const onEstopTriggered = vi.fn();
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
      onEstopTriggered,
    });
    await interceptor.interceptPublish(
      "factory/line1/estop",
      '{"estop":"triggered"}',
    );
    expect(onEstopTriggered).toHaveBeenCalledOnce();
    expect(onEstopTriggered).toHaveBeenCalledWith("factory/line1/estop", '{"estop":"triggered"}');
  });

  it("9b. onEstopTriggered does NOT fire when estop is clear", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const onEstopTriggered = vi.fn();
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
      onEstopTriggered,
    });
    await interceptor.interceptPublish("factory/line1/estop", '{"estop":"clear"}');
    expect(onEstopTriggered).not.toHaveBeenCalled();
  });

  it("10. interceptSubscribe → action 'subscribe' in request params", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
    });
    await interceptor.interceptSubscribe("sensors/#");
    const req = gateway.lastRequest!;
    expect(req.action).toBe("subscribe");
    expect(req.params?.topicPattern).toBe("sensors/#");
  });

  it("11. missing device profile → no hardwareSafety, publish proceeds normally", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      // no deviceProfile
    });
    // Even if topic looks like a safety topic, no detection without profile
    await interceptor.interceptPublish("factory/line1/estop", '{"estop":"triggered"}');
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety).toBeUndefined();
  });

  it("12. deploymentProfile passed through to executionContext", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deploymentProfile: "industrial-safety",
    });
    await interceptor.interceptPublish("sensors/temp/reading", '{"value":22}');
    const req = gateway.lastRequest!;
    expect(req.executionContext?.deploymentProfile).toBe("industrial-safety");
  });

  it("13. resource URI format is iot://broker/topic", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
    });
    await interceptor.interceptPublish("factory/sensor/temp", '{"value":25}');
    const req = gateway.lastRequest!;
    expect(req.resource).toBe(`iot://${BROKER}/factory/sensor/temp`);
  });

  it("14. stale hardware safety observedAt far in past → gateway denies", async () => {
    const staleDenyDecision = makeDenyDecision("HARDWARE_STATE_STALE");
    const gateway = makeMockGateway(staleDenyDecision);
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/line1", BROKER),
    });
    // The test simulates the gateway returning stale denial after receiving the context
    const result = await interceptor.interceptPublish(
      "factory/line1/estop",
      '{"estop":"clear"}',
    );
    expect(result.action).toBe("deny");
    expect(result.denyReason).toBe("HARDWARE_STATE_STALE");
  });

  it("15. smart meter publish → T0_OBSERVE allowed → action: 'forward'", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("smart-meter", "meters/zone1", BROKER),
    });
    const result = await interceptor.interceptPublish(
      "meters/zone1/energy",
      '{"kwh":123.45}',
    );
    expect(result.action).toBe("forward");
    // Smart meter has no safety topics, so no hardwareSafety on energy topic
    expect(gateway.lastRequest?.executionContext?.hardwareSafety).toBeUndefined();
  });

  it("16. actuator interlock topic → hardwareSafety is populated", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("actuator", "factory/robot", BROKER),
    });
    await interceptor.interceptPublish(
      "factory/robot/interlock",
      '{"interlock":"closed"}',
    );
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety?.interlockState).toBe("closed");
  });

  it("17. controllerId from payload forwarded in hardwareSafety", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("plc", "factory/plc1", BROKER),
    });
    await interceptor.interceptPublish(
      "factory/plc1/estop",
      '{"estop":"clear","controllerId":"plc-safety-01"}',
    );
    const req = gateway.lastRequest!;
    expect(req.executionContext?.hardwareSafety?.controllerId).toBe("plc-safety-01");
  });

  it("18. multiple safety topics detected correctly", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
      deviceProfile: createDeviceProfile("plc", "factory/plc1", BROKER),
    });

    // estop topic
    await interceptor.interceptPublish("factory/plc1/estop", '{"estop":"clear"}');
    expect(gateway.lastRequest?.executionContext?.hardwareSafety?.estopState).toBe("clear");

    // interlock topic
    await interceptor.interceptPublish("factory/plc1/interlock", '{"interlock":"closed"}');
    expect(gateway.lastRequest?.executionContext?.hardwareSafety?.interlockState).toBe("closed");

    // permit topic
    await interceptor.interceptPublish("factory/plc1/permit", '{"permit":"granted"}');
    expect(gateway.lastRequest?.executionContext?.hardwareSafety?.permitState).toBe("granted");
  });

  it("19. QoS option passed through to params", async () => {
    const gateway = makeMockGateway(makeAllowDecision());
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
    });
    await interceptor.interceptPublish("sensors/temp", '{"value":25}', { qos: 2 });
    const req = gateway.lastRequest!;
    expect(req.params?.qos).toBe(2);
  });

  it("20. gateway throw → error propagates (no silent swallow)", async () => {
    const gateway: IotGatewayLike = {
      async intercept(_req: SintRequest): Promise<PolicyDecision> {
        throw new Error("Gateway connection error");
      },
    };
    const interceptor = new IotInterceptor({
      gateway,
      agentId: AGENT_ID,
      tokenId: TOKEN_ID,
      broker: BROKER,
    });
    await expect(
      interceptor.interceptPublish("sensors/temp", '{"value":25}'),
    ).rejects.toThrow("Gateway connection error");
  });
});
