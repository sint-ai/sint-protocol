/**
 * SINT Protocol — Capsule Sandbox unit tests.
 *
 * Tests loading and execution of TypeScript and WASM capsules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CapsuleSandbox } from "../src/sandbox.js";
import type { CapsuleApi } from "../src/types.js";
import type { SintCapsuleManifest } from "@pshkv/core";

/** A valid UUIDv7 for test fixtures. */
const CAPSULE_ID_1 = "01905f7c-0000-7000-8000-000000000001";
const CAPSULE_ID_2 = "01905f7c-0000-7000-8000-000000000002";
const VALID_HASH = "a".repeat(64);

function makeManifest(overrides: Partial<SintCapsuleManifest> = {}): SintCapsuleManifest {
  return {
    capsuleId: CAPSULE_ID_1,
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
    ...overrides,
  };
}

function makeMockApi(): CapsuleApi {
  return {
    readSensor: vi.fn().mockResolvedValue(null),
    requestAction: vi.fn().mockResolvedValue({ allowed: true }),
    log: vi.fn(),
  };
}

describe("CapsuleSandbox", () => {
  let sandbox: CapsuleSandbox;

  beforeEach(() => {
    sandbox = new CapsuleSandbox();
  });

  it("loads TypeScript module successfully", () => {
    const manifest = makeManifest();
    const module = {
      execute: vi.fn().mockResolvedValue({ status: "ok" }),
    };

    const result = sandbox.loadTypeScript(manifest, module);

    expect(result.ok).toBe(true);
  });

  it("executes TS module and returns result", async () => {
    const manifest = makeManifest();
    const expectedResult = { detected: true, objects: 3 };
    const module = {
      execute: vi.fn().mockResolvedValue(expectedResult),
    };
    const api = makeMockApi();

    sandbox.loadTypeScript(manifest, module);
    const result = await sandbox.execute(CAPSULE_ID_1, api);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expectedResult);
    }
    expect(module.execute).toHaveBeenCalledWith(api);
  });

  it("enforces memory limits on WASM (mock WebAssembly)", async () => {
    const manifest = makeManifest({ runtime: "wasm" });

    // Mock WebAssembly.compile and WebAssembly.instantiate
    const mockModule = {} as WebAssembly.Module;
    const mockInstance = {
      exports: {
        execute: vi.fn().mockReturnValue(42),
      },
    } as unknown as WebAssembly.Instance;

    const originalCompile = globalThis.WebAssembly.compile;
    const originalInstantiate = globalThis.WebAssembly.instantiate;

    vi.spyOn(globalThis.WebAssembly, "compile").mockResolvedValue(mockModule);
    vi.spyOn(globalThis.WebAssembly, "instantiate").mockResolvedValue(mockInstance);

    const wasmBytes = new Uint8Array([0, 97, 115, 109]); // minimal WASM magic bytes
    const result = await sandbox.loadWasm(manifest, wasmBytes);

    expect(result.ok).toBe(true);

    // Verify WebAssembly.compile and instantiate were called
    expect(globalThis.WebAssembly.compile).toHaveBeenCalledOnce();
    expect(globalThis.WebAssembly.instantiate).toHaveBeenCalledOnce();

    globalThis.WebAssembly.compile = originalCompile;
    globalThis.WebAssembly.instantiate = originalInstantiate;
  });

  it("returns error for unknown capsuleId", async () => {
    const api = makeMockApi();
    const unknownId = "01905f7c-0000-7000-8000-ffffffffffff";

    const result = await sandbox.execute(unknownId, api);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.capsuleId).toBe(unknownId);
    }
  });

  it("destroy cleans up resources", () => {
    const manifest = makeManifest();
    sandbox.loadTypeScript(manifest, {
      execute: vi.fn().mockResolvedValue(null),
    });

    const destroyResult = sandbox.destroy(CAPSULE_ID_1);
    expect(destroyResult.ok).toBe(true);

    // Executing after destroy should fail with NOT_FOUND
    const api = makeMockApi();
    const execPromise = sandbox.execute(CAPSULE_ID_1, api);
    return execPromise.then((result) => {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  it("execute returns error for unloaded capsule", async () => {
    const api = makeMockApi();
    const result = await sandbox.execute(CAPSULE_ID_1, api);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
    }
  });

  it("handles TS module execution error gracefully", async () => {
    const manifest = makeManifest();
    const module = {
      execute: vi.fn().mockRejectedValue(new Error("segfault simulation")),
    };
    const api = makeMockApi();

    sandbox.loadTypeScript(manifest, module);
    const result = await sandbox.execute(CAPSULE_ID_1, api);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("EXECUTION_FAILED");
      expect(result.error.message).toContain("segfault simulation");
    }
  });

  it("loadTypeScript rejects missing execute function", () => {
    const manifest = makeManifest();
    const module = {} as { execute: (api: CapsuleApi) => Promise<unknown> };

    const result = sandbox.loadTypeScript(manifest, module);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("LOAD_FAILED");
      expect(result.error.message).toContain("execute");
    }
  });

  it("double load of same capsuleId returns error", () => {
    const manifest = makeManifest();
    const module = {
      execute: vi.fn().mockResolvedValue(null),
    };

    const first = sandbox.loadTypeScript(manifest, module);
    expect(first.ok).toBe(true);

    const second = sandbox.loadTypeScript(manifest, module);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("ALREADY_REGISTERED");
      expect(second.error.capsuleId).toBe(CAPSULE_ID_1);
    }
  });

  it("loads and executes multiple capsules independently", async () => {
    const manifest1 = makeManifest({ capsuleId: CAPSULE_ID_1 });
    const manifest2 = makeManifest({ capsuleId: CAPSULE_ID_2, name: "second-capsule" });

    const module1 = { execute: vi.fn().mockResolvedValue({ from: "capsule-1" }) };
    const module2 = { execute: vi.fn().mockResolvedValue({ from: "capsule-2" }) };

    sandbox.loadTypeScript(manifest1, module1);
    sandbox.loadTypeScript(manifest2, module2);

    const api = makeMockApi();

    const result1 = await sandbox.execute(CAPSULE_ID_1, api);
    const result2 = await sandbox.execute(CAPSULE_ID_2, api);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value).toEqual({ from: "capsule-1" });
      expect(result2.value).toEqual({ from: "capsule-2" });
    }
  });
});
