import { describe, it, expect } from "vitest";
import { SensorBus } from "../src/sensor-bus.js";
import type { SintSensorReading } from "@pshkv/core";
import type { SensorSource } from "../src/types.js";

function makeReading(
  sensorId: string,
  confidence: number,
  timestamp?: string,
): SintSensorReading {
  return {
    sensorId,
    modality: "camera_rgb",
    timestamp: timestamp ?? new Date().toISOString(),
    data: new Float32Array([confidence]),
    confidence,
  };
}

function makeSource(sensorId: string, bufferSize = 10): SensorSource {
  return { sensorId, modality: "camera_rgb", bufferSize };
}

describe("SensorBus", () => {
  it("registerSensor adds sensor successfully", () => {
    const bus = new SensorBus();
    const result = bus.registerSensor(makeSource("cam0"));
    expect(result.ok).toBe(true);
    expect(bus.getSensorIds()).toContain("cam0");
  });

  it("unregisterSensor removes sensor successfully", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0"));
    const result = bus.unregisterSensor("cam0");
    expect(result.ok).toBe(true);
    expect(bus.getSensorIds()).not.toContain("cam0");
  });

  it("pushReading stores in ring buffer", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0"));
    const reading = makeReading("cam0", 0.9);
    const result = bus.pushReading(reading);
    expect(result.ok).toBe(true);

    const latest = bus.getLatestReading("cam0");
    expect(latest.ok).toBe(true);
    if (latest.ok) {
      expect(latest.value).toEqual(reading);
    }
  });

  it("getLatestReading returns most recent reading", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0"));
    bus.pushReading(makeReading("cam0", 0.8));
    const second = makeReading("cam0", 0.95);
    bus.pushReading(second);

    const result = bus.getLatestReading("cam0");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(second);
    }
  });

  it("getReadings returns last N readings in oldest-to-newest order", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0", 100));
    for (let i = 0; i < 5; i++) {
      bus.pushReading(makeReading("cam0", i * 0.1));
    }

    const result = bus.getReadings("cam0", 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
      // Should be ordered oldest to newest: 0.2, 0.3, 0.4
      expect(result.value[0]!.confidence).toBeCloseTo(0.2);
      expect(result.value[1]!.confidence).toBeCloseTo(0.3);
      expect(result.value[2]!.confidence).toBeCloseTo(0.4);
    }
  });

  it("ring buffer wraps correctly at capacity", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0", 3));

    // Push 5 readings into a buffer of size 3
    for (let i = 0; i < 5; i++) {
      bus.pushReading(makeReading("cam0", i * 0.1));
    }

    const result = bus.getReadings("cam0");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have exactly 3 readings (buffer capacity)
      expect(result.value.length).toBe(3);
      // Should be the last 3: 0.2, 0.3, 0.4
      expect(result.value[0]!.confidence).toBeCloseTo(0.2);
      expect(result.value[1]!.confidence).toBeCloseTo(0.3);
      expect(result.value[2]!.confidence).toBeCloseTo(0.4);
    }
  });

  it("pushReading to unknown sensor returns error", () => {
    const bus = new SensorBus();
    const result = bus.pushReading(makeReading("unknown", 0.5));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("unknown");
    }
  });

  it("unregisterSensor for unknown sensor returns error", () => {
    const bus = new SensorBus();
    const result = bus.unregisterSensor("ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("ghost");
    }
  });

  it("fuseWorldState returns valid SintWorldState", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0"));
    bus.pushReading({
      sensorId: "cam0",
      modality: "camera_rgb",
      timestamp: "2026-03-17T10:00:00.000000Z",
      data: [
        {
          classLabel: "box",
          confidence: 0.9,
          boundingBox3D: {
            min: { x: 1, y: 1, z: 0 },
            max: { x: 2, y: 2, z: 1 },
          },
          isHuman: false,
        },
      ],
      confidence: 0.9,
    });

    const result = bus.fuseWorldState();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timestamp).toBeDefined();
      expect(result.value.objects.length).toBe(1);
      expect(result.value.objects[0]!.classLabel).toBe("box");
      expect(result.value.robotPose).toBeDefined();
      expect(result.value.anomalyFlags).toEqual([]);
      expect(result.value.humanPresent).toBe(false);
    }
  });

  it("getSensorIds lists all registered IDs", () => {
    const bus = new SensorBus();
    bus.registerSensor(makeSource("cam0"));
    bus.registerSensor({ sensorId: "lidar0", modality: "lidar", bufferSize: 10 });
    bus.registerSensor({ sensorId: "imu0", modality: "imu", bufferSize: 20 });

    const ids = bus.getSensorIds();
    expect(ids).toContain("cam0");
    expect(ids).toContain("lidar0");
    expect(ids).toContain("imu0");
    expect(ids.length).toBe(3);
  });
});
