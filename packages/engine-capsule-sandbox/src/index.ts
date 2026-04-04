/**
 * SINT Protocol — Capsule Sandbox.
 *
 * WASM/TS capsule loading, validation, and sandboxed execution
 * for the SINT Protocol Engine Layer (L3).
 *
 * @module @sint/engine-capsule-sandbox
 */

export * from "./types.js";
export { validateManifest } from "./manifest-validator.js";
export { verifyContentHash } from "./content-verifier.js";
export { CapsuleSandbox } from "./sandbox.js";
export type { CapsuleSandboxConfig } from "./sandbox.js";
export { createCapsuleImports } from "./capsule-api.js";
export { CapsuleRegistry } from "./registry.js";
