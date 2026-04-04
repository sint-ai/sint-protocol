import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { loadEngineConfig } from "../src/config.js";
import { DEFAULT_THRESHOLDS } from "../src/types.js";

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn<(path: string, encoding: string) => Promise<string>>(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mockReadFile,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadEngineConfig", () => {
  it("loads default config when no file exists", async () => {
    const enoentError = new Error("ENOENT") as NodeJS.ErrnoException;
    enoentError.code = "ENOENT";
    mockReadFile.mockRejectedValue(enoentError);

    const result = await loadEngineConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resourceThresholds).toEqual(DEFAULT_THRESHOLDS);
      expect(result.value.deploymentProfile).toBeUndefined();
    }
  });

  it("merges config with defaults", async () => {
    const configJson = JSON.stringify({
      deploymentProfile: "edge",
      resourceThresholds: {
        cpuWarningPercent: 70,
      },
      samplingIntervalMs: 3000,
    });
    mockReadFile.mockResolvedValue(configJson);

    const result = await loadEngineConfig();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deploymentProfile).toBe("edge");
      expect(result.value.samplingIntervalMs).toBe(3000);
      expect(result.value.resourceThresholds?.cpuWarningPercent).toBe(70);
      expect(result.value.resourceThresholds?.cpuCriticalPercent).toBe(
        DEFAULT_THRESHOLDS.cpuCriticalPercent,
      );
      expect(result.value.resourceThresholds?.memoryWarningPercent).toBe(
        DEFAULT_THRESHOLDS.memoryWarningPercent,
      );
    }
  });

  it("rejects invalid config values", async () => {
    const invalidJson = JSON.stringify({
      deploymentProfile: "invalid_profile",
      samplingIntervalMs: -100,
    });
    mockReadFile.mockResolvedValue(invalidJson);

    const result = await loadEngineConfig();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Invalid config");
    }
  });

  it("handles custom config path", async () => {
    const configJson = JSON.stringify({ deploymentProfile: "full" });
    mockReadFile.mockResolvedValue(configJson);

    const customPath = "/etc/sint/engine.json";
    const result = await loadEngineConfig(customPath);

    expect(result.ok).toBe(true);
    expect(mockReadFile).toHaveBeenCalledWith(customPath, "utf-8");
    if (result.ok) {
      expect(result.value.deploymentProfile).toBe("full");
    }
  });

  it("returns ok with empty config for missing file", async () => {
    const enoentError = new Error("ENOENT") as NodeJS.ErrnoException;
    enoentError.code = "ENOENT";
    mockReadFile.mockRejectedValue(enoentError);

    const result = await loadEngineConfig("/nonexistent/path.json");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.resourceThresholds).toEqual(DEFAULT_THRESHOLDS);
    }
  });
});
