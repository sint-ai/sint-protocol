/**
 * Inspection Capsule — Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { classifyDefects, execute, DEFAULT_INSPECTION_CONFIG } from "../src/index.js";

function createMockApi() {
  return {
    readSensor: vi.fn(),
    requestAction: vi.fn(),
    log: vi.fn(),
  };
}

describe("classifyDefects", () => {
  it("returns no defects for high confidence reading", () => {
    const defects = classifyDefects({ pixels: [] }, 0.95);
    expect(defects).toEqual([]);
  });

  it("returns defect for low confidence reading", () => {
    const defects = classifyDefects({ pixels: [] }, 0.3);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects[0]!.label).toBe("surface_anomaly");
    expect(defects[0]!.confidence).toBeGreaterThan(0);
  });

  it("respects custom confidence threshold", () => {
    const config = { ...DEFAULT_INSPECTION_CONFIG, confidenceThreshold: 0.9 };
    const defects = classifyDefects({ pixels: [] }, 0.85, config);
    expect(defects.length).toBeGreaterThan(0);
  });
});

describe("execute", () => {
  it("returns inspection result with no defects for high quality", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: { pixels: [] }, confidence: 0.95 });

    const result = await execute(api);
    expect(result.hasDefects).toBe(false);
    expect(result.qualityScore).toBe(1.0);
    expect(result.defects).toEqual([]);
  });

  it("returns defects for low quality camera reading", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: { pixels: [] }, confidence: 0.3 });

    const result = await execute(api);
    expect(result.hasDefects).toBe(true);
    expect(result.defects.length).toBeGreaterThan(0);
    expect(result.qualityScore).toBeLessThan(1.0);
  });

  it("handles missing camera data gracefully", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue(null);

    const result = await execute(api);
    expect(result.hasDefects).toBe(false);
    expect(result.qualityScore).toBe(0);
    expect(api.log).toHaveBeenCalledWith("warn", "No camera data available");
  });

  it("logs inspection lifecycle events", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: {}, confidence: 0.9 });

    await execute(api);
    expect(api.log).toHaveBeenCalledWith("info", expect.stringContaining("Starting visual inspection"));
    expect(api.log).toHaveBeenCalledWith("info", expect.stringContaining("Inspection complete"));
  });

  it("only reads camera_rgb sensor", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: {}, confidence: 0.9 });

    await execute(api);
    expect(api.readSensor).toHaveBeenCalledWith("camera_rgb");
    expect(api.readSensor).toHaveBeenCalledTimes(1);
  });
});
