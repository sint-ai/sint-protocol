import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { detectHardware } from "../src/detector.js";

// Use vi.hoisted() so mock functions are available when vi.mock factories run
const {
  mockArch,
  mockPlatform,
  mockCpus,
  mockTotalmem,
  mockReadFileSync,
  mockExecSync,
} = vi.hoisted(() => ({
  mockArch: vi.fn(() => "x64"),
  mockPlatform: vi.fn(() => "linux"),
  mockCpus: vi.fn(() => [
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
  ]),
  mockTotalmem: vi.fn(() => 16 * 1024 * 1024 * 1024),
  mockReadFileSync: vi.fn((): string => {
    throw new Error("ENOENT");
  }),
  mockExecSync: vi.fn((): string => {
    throw new Error("nvidia-smi not found");
  }),
}));

vi.mock("node:os", () => ({
  default: {
    arch: mockArch,
    platform: mockPlatform,
    cpus: mockCpus,
    totalmem: mockTotalmem,
  },
}));

vi.mock("node:fs", () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Reset default behaviors
  mockArch.mockReturnValue("x64");
  mockPlatform.mockReturnValue("linux");
  mockCpus.mockReturnValue([
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
    { model: "test", speed: 2400, times: { user: 100, nice: 0, sys: 50, idle: 800, irq: 0 } },
  ]);
  mockTotalmem.mockReturnValue(16 * 1024 * 1024 * 1024);
  mockReadFileSync.mockImplementation(() => {
    throw new Error("ENOENT");
  });
  mockExecSync.mockImplementation(() => {
    throw new Error("nvidia-smi not found");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectHardware", () => {
  it("returns correct arch from os.arch()", async () => {
    mockArch.mockReturnValue("arm64");

    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.arch).toBe("arm64");
    }
  });

  it("returns correct platform from os.platform()", async () => {
    mockPlatform.mockReturnValue("darwin");

    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.platform).toBe("darwin");
    }
  });

  it("returns correct CPU count", async () => {
    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cpuCores).toBe(4);
    }
  });

  it("returns correct memory", async () => {
    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalMemoryMB).toBe(16_384);
    }
  });

  it("detects Jetson platform via /proc/device-tree/model", async () => {
    mockArch.mockReturnValue("arm64");
    mockPlatform.mockReturnValue("linux");
    mockTotalmem.mockReturnValue(32 * 1024 * 1024 * 1024);
    mockReadFileSync.mockReturnValue("NVIDIA Jetson Orin\0");
    mockExecSync.mockReturnValue("NVIDIA Jetson Orin, 8.7, 32768\n");

    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.arch).toBe("arm64");
      expect(result.value.gpuInfo).not.toBeNull();
      expect(result.value.gpuInfo?.name).toBe("NVIDIA Jetson Orin");
      expect(result.value.deploymentProfile).toBe("full");
    }
  });

  it("detects GPU via nvidia-smi output", async () => {
    mockExecSync.mockReturnValue("NVIDIA GeForce RTX 4090, 8.9, 24576\n");

    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gpuInfo).not.toBeNull();
      expect(result.value.gpuInfo?.name).toBe("NVIDIA GeForce RTX 4090");
      expect(result.value.gpuInfo?.computeCapability).toBe("8.9");
      expect(result.value.gpuInfo?.memoryMB).toBe(24_576);
    }
  });

  it("falls back gracefully when no GPU available", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("nvidia-smi not found");
    });

    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.gpuInfo).toBeNull();
    }
  });

  it("validates output conforms to SintHardwareProfile", async () => {
    const result = await detectHardware();
    expect(result.ok).toBe(true);
    if (result.ok) {
      const profile = result.value;
      expect(typeof profile.arch).toBe("string");
      expect(typeof profile.platform).toBe("string");
      expect(typeof profile.cpuCores).toBe("number");
      expect(typeof profile.totalMemoryMB).toBe("number");
      expect(typeof profile.deploymentProfile).toBe("string");
      expect(["full", "edge", "split", "lite"]).toContain(profile.deploymentProfile);
      if (profile.gpuInfo !== null) {
        expect(typeof profile.gpuInfo.name).toBe("string");
      }
    }
  });
});
