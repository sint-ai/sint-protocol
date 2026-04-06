/**
 * SINT bridge-iot — Hardware Safety Bridge tests.
 *
 * 8 test cases covering:
 * 1. hardwareSafetyContextFromPayload: all fields present → all mapped
 * 2. Partial payload (only estop) → only estopState set
 * 3. Empty payload → only observedAt set
 * 4. Custom observedAt → used instead of now()
 * 5. isSafetyTopic: topic ending with "/estop" → true for actuator profile
 * 6. isSafetyTopic: topic not matching any suffix → false
 * 7. isSafetyTopic: empty safetyTopics (temperature-sensor) → always false
 * 8. parseHardwareSafetyPayload: valid JSON → object; invalid JSON → undefined; non-object → undefined
 */

import { describe, it, expect } from "vitest";
import {
  hardwareSafetyContextFromPayload,
  isSafetyTopic,
  parseHardwareSafetyPayload,
} from "../src/hardware-safety-bridge.js";
import { createDeviceProfile } from "../src/device-profiles.js";

describe("hardwareSafetyContextFromPayload", () => {
  it("maps all fields when all are present", () => {
    const result = hardwareSafetyContextFromPayload(
      {
        estop: "clear",
        permit: "granted",
        interlock: "closed",
        controllerId: "plc-01",
      },
      "2026-04-05T10:00:00.000000Z",
    );
    expect(result.estopState).toBe("clear");
    expect(result.permitState).toBe("granted");
    expect(result.interlockState).toBe("closed");
    expect(result.controllerId).toBe("plc-01");
    expect(result.observedAt).toBe("2026-04-05T10:00:00.000000Z");
  });

  it("only sets estopState when only estop is provided", () => {
    const result = hardwareSafetyContextFromPayload({ estop: "triggered" });
    expect(result.estopState).toBe("triggered");
    expect(result.permitState).toBeUndefined();
    expect(result.interlockState).toBeUndefined();
    expect(result.controllerId).toBeUndefined();
    expect(result.observedAt).toBeDefined();
  });

  it("only sets observedAt when payload is empty", () => {
    const result = hardwareSafetyContextFromPayload({});
    expect(result.estopState).toBeUndefined();
    expect(result.permitState).toBeUndefined();
    expect(result.interlockState).toBeUndefined();
    expect(result.controllerId).toBeUndefined();
    expect(result.observedAt).toBeDefined();
  });

  it("uses custom observedAt instead of now()", () => {
    const customTime = "2026-01-01T00:00:00.000000Z";
    const result = hardwareSafetyContextFromPayload({}, customTime);
    expect(result.observedAt).toBe(customTime);
  });
});

describe("isSafetyTopic", () => {
  it("returns true for a topic ending with '/estop' for actuator profile", () => {
    const profile = createDeviceProfile("actuator", "factory/line1", "broker.example.com");
    expect(isSafetyTopic("factory/line1/estop", profile)).toBe(true);
  });

  it("returns true for a topic ending with '/interlock' for actuator profile", () => {
    const profile = createDeviceProfile("actuator", "factory/line1", "broker.example.com");
    expect(isSafetyTopic("factory/line1/interlock", profile)).toBe(true);
  });

  it("returns false for a topic not matching any suffix", () => {
    const profile = createDeviceProfile("actuator", "factory/line1", "broker.example.com");
    expect(isSafetyTopic("factory/line1/temperature", profile)).toBe(false);
  });

  it("always returns false for temperature-sensor profile (empty safetyTopics)", () => {
    const profile = createDeviceProfile("temperature-sensor", "sensors/zone1", "broker.example.com");
    expect(isSafetyTopic("sensors/zone1/estop", profile)).toBe(false);
    expect(isSafetyTopic("sensors/zone1/interlock", profile)).toBe(false);
    expect(isSafetyTopic("sensors/zone1/temperature", profile)).toBe(false);
  });
});

describe("parseHardwareSafetyPayload", () => {
  it("parses valid JSON string → object", () => {
    const result = parseHardwareSafetyPayload('{"estop":"clear","permit":"granted"}');
    expect(result).toEqual({ estop: "clear", permit: "granted" });
  });

  it("parses valid JSON Buffer → object", () => {
    const buf = Buffer.from('{"interlock":"closed"}', "utf8");
    const result = parseHardwareSafetyPayload(buf);
    expect(result).toEqual({ interlock: "closed" });
  });

  it("returns undefined for invalid JSON", () => {
    const result = parseHardwareSafetyPayload("not-valid-json");
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-object JSON (array)", () => {
    const result = parseHardwareSafetyPayload('["estop","clear"]');
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-object JSON (string)", () => {
    const result = parseHardwareSafetyPayload('"just a string"');
    expect(result).toBeUndefined();
  });

  it("returns undefined for null JSON", () => {
    const result = parseHardwareSafetyPayload("null");
    expect(result).toBeUndefined();
  });
});
