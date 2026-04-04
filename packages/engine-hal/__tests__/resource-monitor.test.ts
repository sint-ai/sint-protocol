import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ResourceMonitor } from "../src/resource-monitor.js";

const { mockCpus, mockTotalmem, mockFreemem } = vi.hoisted(() => ({
  mockCpus: vi.fn(() => [
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
  ]),
  mockTotalmem: vi.fn(() => 8 * 1024 * 1024 * 1024),
  mockFreemem: vi.fn(() => 4 * 1024 * 1024 * 1024),
}));

vi.mock("node:os", () => ({
  default: {
    cpus: mockCpus,
    totalmem: mockTotalmem,
    freemem: mockFreemem,
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();

  mockCpus.mockReturnValue([
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
  ]);
  mockTotalmem.mockReturnValue(8 * 1024 * 1024 * 1024);
  mockFreemem.mockReturnValue(4 * 1024 * 1024 * 1024);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ResourceMonitor", () => {
  it("starts and stops without error", () => {
    const monitor = new ResourceMonitor();
    expect(() => monitor.start()).not.toThrow();
    expect(() => monitor.stop()).not.toThrow();
  });

  it("getSnapshot returns valid ResourceSnapshot", () => {
    const monitor = new ResourceMonitor();
    const result = monitor.getSnapshot();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveProperty("cpuUsagePercent");
      expect(result.value).toHaveProperty("memoryUsedMB");
      expect(result.value).toHaveProperty("memoryTotalMB");
      expect(result.value).toHaveProperty("timestamp");
      expect(result.value.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    }
  });

  it("CPU usage is between 0 and 100", () => {
    const monitor = new ResourceMonitor();

    // First call sets baseline
    monitor.getSnapshot();

    // Simulate CPU activity by changing times on next call
    mockCpus.mockReturnValueOnce([
      { model: "test", speed: 2400, times: { user: 200, nice: 0, sys: 100, idle: 900, irq: 0 } },
      { model: "test", speed: 2400, times: { user: 200, nice: 0, sys: 100, idle: 900, irq: 0 } },
    ]);

    const result = monitor.getSnapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cpuUsagePercent).toBeGreaterThanOrEqual(0);
      expect(result.value.cpuUsagePercent).toBeLessThanOrEqual(100);
    }
  });

  it("memory values are positive", () => {
    const monitor = new ResourceMonitor();
    const result = monitor.getSnapshot();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.memoryUsedMB).toBeGreaterThan(0);
      expect(result.value.memoryTotalMB).toBeGreaterThan(0);
    }
  });

  it("warning callback fires on high CPU", () => {
    const callbackFn = vi.fn();
    const monitor = new ResourceMonitor({ cpuWarningPercent: 50 }, 1000);
    monitor.onThresholdExceeded(callbackFn);

    // Start — sets baseline CPU times
    monitor.start();

    // On first interval tick, simulate high CPU (most time in user/sys, little idle)
    mockCpus.mockReturnValueOnce([
      { model: "test", speed: 2400, times: { user: 1000, nice: 0, sys: 500, idle: 810, irq: 0 } },
      { model: "test", speed: 2400, times: { user: 1000, nice: 0, sys: 500, idle: 810, irq: 0 } },
    ]);

    vi.advanceTimersByTime(1000);

    expect(callbackFn).toHaveBeenCalled();
    const [_snapshot, level] = callbackFn.mock.calls[0]!;
    expect(["warning", "critical"]).toContain(level);

    monitor.stop();
  });

  it("critical callback fires on very high memory", () => {
    const callbackFn = vi.fn();
    const monitor = new ResourceMonitor({ memoryCriticalPercent: 90 }, 1000);
    monitor.onThresholdExceeded(callbackFn);

    monitor.start();

    // Simulate very high memory usage (95% used — only 5% free)
    mockFreemem.mockReturnValueOnce(Math.round(0.05 * 8 * 1024 * 1024 * 1024));

    vi.advanceTimersByTime(1000);

    expect(callbackFn).toHaveBeenCalled();
    const [_snapshot, level] = callbackFn.mock.calls[0]!;
    expect(level).toBe("critical");

    monitor.stop();
  });

  it("stop clears interval and no more callbacks fire", () => {
    const callbackFn = vi.fn();
    const monitor = new ResourceMonitor({ cpuWarningPercent: 1 }, 1000);
    monitor.onThresholdExceeded(callbackFn);

    monitor.start();
    vi.advanceTimersByTime(1000);
    const callCountAfterFirstTick = callbackFn.mock.calls.length;

    monitor.stop();
    callbackFn.mockClear();

    // Advance timers — no more callbacks should fire
    vi.advanceTimersByTime(5000);

    expect(callbackFn).not.toHaveBeenCalled();
    expect(callCountAfterFirstTick).toBeGreaterThanOrEqual(0);
  });
});
