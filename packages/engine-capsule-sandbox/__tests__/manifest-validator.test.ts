/**
 * SINT Protocol — Manifest validator unit tests.
 *
 * Validates the Zod-based manifest validation logic.
 */

import { describe, it, expect } from "vitest";
import { validateManifest } from "../src/manifest-validator.js";
import type { SintCapsuleManifest } from "@sint-ai/core";

/** A valid UUIDv7 for test fixtures. */
const VALID_UUID = "01905f7c-0000-7000-8000-000000000001";

/** A valid SHA-256 hash (64 hex chars). */
const VALID_HASH = "a".repeat(64);

/**
 * Returns a complete, valid manifest for use as a test fixture.
 * Individual tests override specific fields to trigger validation errors.
 */
function validManifest(): SintCapsuleManifest {
  return {
    capsuleId: VALID_UUID,
    version: "1.0.0",
    name: "test-capsule",
    author: "sint-labs",
    sensors: ["camera_rgb"],
    actuators: [],
    safetyDeclarations: {},
    resourceLimits: {
      maxMemoryMB: 256,
      maxCpuTimeMs: 5000,
      maxStorageMB: 50,
    },
    runtime: "typescript",
    entryPoint: "src/index.ts",
    contentHash: VALID_HASH,
  };
}

describe("validateManifest", () => {
  it("validates correct manifest", () => {
    const result = validateManifest(validManifest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("test-capsule");
      expect(result.value.capsuleId).toBe(VALID_UUID);
    }
  });

  it("rejects missing capsuleId", () => {
    const { capsuleId: _ignored, ...rest } = validManifest();
    const result = validateManifest(rest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
      expect(result.error.message).toContain("capsuleId");
    }
  });

  it("rejects missing name", () => {
    const { name: _ignored, ...rest } = validManifest();
    const result = validateManifest(rest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
      expect(result.error.message).toContain("name");
    }
  });

  it("rejects missing sensors array", () => {
    const { sensors: _ignored, ...rest } = validManifest();
    const result = validateManifest(rest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
    }
  });

  it("rejects invalid version format", () => {
    const manifest = { ...validManifest(), version: "not-semver" };
    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
      expect(result.error.message).toContain("version");
    }
  });

  it("rejects missing contentHash", () => {
    const { contentHash: _ignored, ...rest } = validManifest();
    const result = validateManifest(rest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
      expect(result.error.message).toContain("contentHash");
    }
  });

  it("rejects invalid runtime", () => {
    const manifest = { ...validManifest(), runtime: "python" };
    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
      expect(result.error.message).toContain("runtime");
    }
  });

  it("rejects missing resourceLimits", () => {
    const { resourceLimits: _ignored, ...rest } = validManifest();
    const result = validateManifest(rest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
    }
  });

  it("rejects negative maxMemoryMB", () => {
    const manifest = {
      ...validManifest(),
      resourceLimits: {
        maxMemoryMB: -1,
        maxCpuTimeMs: 5000,
        maxStorageMB: 50,
      },
    };
    const result = validateManifest(manifest);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MANIFEST_INVALID");
    }
  });

  it("validates manifest with all optional fields", () => {
    const manifest: SintCapsuleManifest = {
      ...validManifest(),
      description: "A detailed description of the capsule",
      safetyDeclarations: {
        maxForceNewtons: 100,
        maxVelocityMps: 1.5,
        requiresHumanPresence: true,
        canTriggerEstop: false,
      },
    };
    const result = validateManifest(manifest);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe(
        "A detailed description of the capsule",
      );
      expect(result.value.safetyDeclarations.maxForceNewtons).toBe(100);
      expect(result.value.safetyDeclarations.requiresHumanPresence).toBe(true);
    }
  });
});
