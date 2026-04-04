/**
 * SINT Protocol — @sint/bridge-iot IoT Resource Mapper tests.
 *
 * 12 test cases covering:
 * 1. MQTT sensor topic → T0_OBSERVE URI
 * 2. MQTT actuator topic (valve/pump) → T2_ACT
 * 3. MQTT safety/estop topic → T3_COMMIT
 * 4. MQTT firmware/OTA topic → T3_COMMIT
 * 5. CoAP GET → T0_OBSERVE
 * 6. CoAP PUT on actuator path → T2_ACT
 * 7. CoAP PUT on firmware path → T3_COMMIT
 * 8. isSafetyCriticalIotTopic: "estop" topic → true
 * 9. isSafetyCriticalIotTopic: "temperature" → false
 * 10. parseIotResourceUri: mqtt:// → parses correctly
 * 11. parseIotResourceUri: coap:// → parses correctly
 * 12. parseIotResourceUri: invalid → null
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@sint/core";
import {
  mqttTopicToResourceUri,
  coapToResourceUri,
  defaultTierForMqttTopic,
  defaultTierForCoapMethod,
  isSafetyCriticalIotTopic,
  parseIotResourceUri,
} from "../src/iot-resource-mapper.js";

describe("IoT Resource Mapper — MQTT", () => {
  it("1. MQTT sensor topic → T0_OBSERVE URI with correct scheme", () => {
    const uri = mqttTopicToResourceUri("broker.example.com", "factory/zone1/temperature");
    expect(uri).toMatch(/^mqtt:\/\//);
    expect(uri).toContain("factory/zone1/temperature");

    const tier = defaultTierForMqttTopic("factory/zone1/temperature");
    expect(tier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("2. MQTT actuator topic (valve) → T2_ACT", () => {
    const tier = defaultTierForMqttTopic("plant/zone2/valve/control");
    expect(tier).toBe(ApprovalTier.T2_ACT);
  });

  it("3. MQTT safety/estop topic → T3_COMMIT", () => {
    const tier = defaultTierForMqttTopic("safety/estop/trigger");
    expect(tier).toBe(ApprovalTier.T3_COMMIT);

    const tier2 = defaultTierForMqttTopic("plant/emergency/stop");
    expect(tier2).toBe(ApprovalTier.T3_COMMIT);

    const tier3 = defaultTierForMqttTopic("cell/interlock/override");
    expect(tier3).toBe(ApprovalTier.T3_COMMIT);
  });

  it("4. MQTT firmware/OTA topic → T3_COMMIT", () => {
    const tier = defaultTierForMqttTopic("edge/gateway/ota/update");
    expect(tier).toBe(ApprovalTier.T3_COMMIT);

    const tier2 = defaultTierForMqttTopic("devices/sensor01/firmware");
    expect(tier2).toBe(ApprovalTier.T3_COMMIT);
  });
});

describe("IoT Resource Mapper — CoAP", () => {
  it("5. CoAP GET → T0_OBSERVE regardless of path", () => {
    const tier = defaultTierForCoapMethod("/sensors/temperature", "GET");
    expect(tier).toBe(ApprovalTier.T0_OBSERVE);

    const tier2 = defaultTierForCoapMethod("/actuators/valve", "GET");
    expect(tier2).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("6. CoAP PUT on actuator path → T2_ACT", () => {
    const tier = defaultTierForCoapMethod("/devices/pump/control", "PUT");
    expect(tier).toBe(ApprovalTier.T2_ACT);

    const tier2 = defaultTierForCoapMethod("/actuators/relay/state", "POST");
    expect(tier2).toBe(ApprovalTier.T2_ACT);
  });

  it("7. CoAP PUT on firmware path → T3_COMMIT", () => {
    const tier = defaultTierForCoapMethod("/ota/firmware/apply", "PUT");
    expect(tier).toBe(ApprovalTier.T3_COMMIT);

    const uri = coapToResourceUri("edge-gateway.local", 5683, "/ota/firmware/apply");
    expect(uri).toBe("coap://edge-gateway.local:5683/ota/firmware/apply");
  });
});

describe("IoT Resource Mapper — isSafetyCriticalIotTopic", () => {
  it("8. 'estop' topic → true", () => {
    expect(isSafetyCriticalIotTopic("safety/estop/main")).toBe(true);
    expect(isSafetyCriticalIotTopic("cell/interlock/sensor")).toBe(true);
    expect(isSafetyCriticalIotTopic("plant/emergency/shutdown")).toBe(true);
    expect(isSafetyCriticalIotTopic("device/firmware/update")).toBe(true);
  });

  it("9. 'temperature' sensor topic → false", () => {
    expect(isSafetyCriticalIotTopic("factory/zone1/temperature")).toBe(false);
    expect(isSafetyCriticalIotTopic("sensors/humidity/reading")).toBe(false);
    expect(isSafetyCriticalIotTopic("plant/pump/valve")).toBe(false);
  });
});

describe("IoT Resource Mapper — parseIotResourceUri", () => {
  it("10. mqtt:// URI → parses correctly", () => {
    const broker = "broker.example.com";
    const topic = "factory/zone1/temperature";
    const uri = mqttTopicToResourceUri(broker, topic);

    const parsed = parseIotResourceUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("mqtt");
    expect(parsed?.host).toBe(broker);
    expect(parsed?.path).toContain("factory");
  });

  it("11. coap:// URI → parses correctly", () => {
    const uri = coapToResourceUri("192.168.1.100", 5683, "/sensors/temperature");

    const parsed = parseIotResourceUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed?.protocol).toBe("coap");
    expect(parsed?.host).toBe("192.168.1.100");
    expect(parsed?.path).toBe("/sensors/temperature");
  });

  it("12. invalid URI → null", () => {
    expect(parseIotResourceUri("http://example.com/foo")).toBeNull();
    expect(parseIotResourceUri("not-a-uri")).toBeNull();
    expect(parseIotResourceUri("")).toBeNull();
  });
});
