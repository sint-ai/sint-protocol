import { describe, it, expect, vi, afterEach } from "vitest";
import { PerceptionPipeline } from "../src/perception-pipeline.js";
import { SensorBus } from "../src/sensor-bus.js";
import { OnnxExecutor } from "../src/onnx-executor.js";
import type { SintSensorReading } from "@pshkv/core";

function makeSensorBusWithData(): SensorBus {
  const bus = new SensorBus();
  bus.registerSensor({ sensorId: "cam0", modality: "camera_rgb", bufferSize: 10 });
  const reading: SintSensorReading = {
    sensorId: "cam0",
    modality: "camera_rgb",
    timestamp: "2026-03-17T10:00:00.000000Z",
    data: [
      {
        classLabel: "box",
        confidence: 0.9,
        boundingBox3D: {
          min: { x: 2, y: 2, z: 0 },
          max: { x: 3, y: 3, z: 1 },
        },
        isHuman: false,
      },
    ],
    confidence: 0.9,
  };
  bus.pushReading(reading);
  return bus;
}

describe("PerceptionPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start/stop lifecycle works", () => {
    const bus = new SensorBus();
    const mock = OnnxExecutor.createMock();
    const pipeline = new PerceptionPipeline(bus, mock);

    pipeline.start();
    expect(pipeline.isRunning()).toBe(true);
    pipeline.stop();
    expect(pipeline.isRunning()).toBe(false);
  });

  it("isRunning reflects state", () => {
    const bus = new SensorBus();
    const mock = OnnxExecutor.createMock();
    const pipeline = new PerceptionPipeline(bus, mock);

    expect(pipeline.isRunning()).toBe(false);
    pipeline.start();
    expect(pipeline.isRunning()).toBe(true);
    pipeline.stop();
    expect(pipeline.isRunning()).toBe(false);
  });

  it("runOnce returns SintWorldState with ok result", async () => {
    const bus = makeSensorBusWithData();
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const pipeline = new PerceptionPipeline(bus, mock);

    const result = await pipeline.runOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timestamp).toBeDefined();
      expect(result.value.objects).toBeDefined();
      expect(result.value.robotPose).toBeDefined();
      expect(Array.isArray(result.value.anomalyFlags)).toBe(true);
    }
  });

  it("runOnce logs inference event via callback", async () => {
    const bus = makeSensorBusWithData();
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const pipeline = new PerceptionPipeline(bus, mock, {}, (evt) => events.push(evt));

    await pipeline.runOnce();

    const inferenceEvent = events.find(
      (e) => e.eventType === "engine.system1.inference",
    );
    expect(inferenceEvent).toBeDefined();
    expect(inferenceEvent!.payload["objectCount"]).toBe(1);
    expect(typeof inferenceEvent!.payload["durationMs"]).toBe("number");
  });

  it("pipeline uses sensor bus for input", async () => {
    const bus = makeSensorBusWithData();
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const pipeline = new PerceptionPipeline(bus, mock);

    const result = await pipeline.runOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.objects.length).toBe(1);
      expect(result.value.objects[0]!.classLabel).toBe("box");
    }
  });

  it("pipeline handles empty sensor bus gracefully", async () => {
    const bus = new SensorBus();
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const pipeline = new PerceptionPipeline(bus, mock);

    const result = await pipeline.runOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.objects.length).toBe(0);
    }
  });

  it("pipeline propagates anomaly flags", async () => {
    const bus = new SensorBus();
    bus.registerSensor({ sensorId: "cam0", modality: "camera_rgb", bufferSize: 10 });
    // Push an object with very low confidence to trigger anomaly
    bus.pushReading({
      sensorId: "cam0",
      modality: "camera_rgb",
      timestamp: "2026-03-17T10:00:00.000000Z",
      data: [
        {
          classLabel: "unknown",
          confidence: 0.1,
          boundingBox3D: {
            min: { x: 2, y: 2, z: 0 },
            max: { x: 3, y: 3, z: 1 },
          },
          isHuman: false,
        },
      ],
      confidence: 0.1,
    });

    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const pipeline = new PerceptionPipeline(bus, mock);

    const result = await pipeline.runOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have at least one anomaly flag (low confidence)
      expect(result.value.anomalyFlags.length).toBeGreaterThan(0);
      const lowConf = result.value.anomalyFlags.find(
        (f) => f.type === "low_confidence",
      );
      expect(lowConf).toBeDefined();
    }
  });

  it("stop clears interval and no more callbacks fire", async () => {
    vi.useFakeTimers();
    const bus = makeSensorBusWithData();
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const pipeline = new PerceptionPipeline(bus, mock, { inferenceHz: 10 }, (evt) =>
      events.push(evt),
    );

    pipeline.start();
    // Advance time to trigger a few cycles
    await vi.advanceTimersByTimeAsync(300);
    const countBefore = events.length;

    pipeline.stop();
    // Advance more time — no new events should fire
    await vi.advanceTimersByTimeAsync(500);
    expect(events.length).toBe(countBefore);

    vi.useRealTimers();
  });
});
