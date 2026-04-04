import { describe, it, expect } from "vitest";

import { selectDeploymentProfile, canRunOnnx } from "../src/profiler.js";

describe("selectDeploymentProfile", () => {
  it("selects 'full' for arm64 + GPU + 32GB (Jetson Orin)", () => {
    const profile = selectDeploymentProfile({
      arch: "arm64",
      platform: "linux",
      cpuCores: 12,
      totalMemoryMB: 32_768,
      hasGpu: true,
    });
    expect(profile).toBe("full");
  });

  it("selects 'lite' for arm64 + no GPU + 2GB (RPi Zero)", () => {
    const profile = selectDeploymentProfile({
      arch: "arm64",
      platform: "linux",
      cpuCores: 1,
      totalMemoryMB: 2_048,
      hasGpu: false,
    });
    expect(profile).toBe("lite");
  });

  it("selects 'full' for x64 + GPU (workstation)", () => {
    const profile = selectDeploymentProfile({
      arch: "x64",
      platform: "linux",
      cpuCores: 16,
      totalMemoryMB: 65_536,
      hasGpu: true,
    });
    expect(profile).toBe("full");
  });

  it("selects 'edge' for darwin platform (macOS dev)", () => {
    const profile = selectDeploymentProfile({
      arch: "arm64",
      platform: "darwin",
      cpuCores: 10,
      totalMemoryMB: 16_384,
      hasGpu: true,
    });
    expect(profile).toBe("edge");
  });
});

describe("canRunOnnx", () => {
  it("returns true for 'full' and 'edge' profiles", () => {
    expect(canRunOnnx("full")).toBe(true);
    expect(canRunOnnx("edge")).toBe(true);
  });

  it("returns false for 'lite' and 'split' profiles", () => {
    expect(canRunOnnx("lite")).toBe(false);
    expect(canRunOnnx("split")).toBe(false);
  });
});
