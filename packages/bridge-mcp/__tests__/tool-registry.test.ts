/**
 * SINT Bridge-MCP — Tool Registry (Definition Signing) tests.
 * Tests cryptographic registration and drift detection.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateKeypair } from "@sint/gate-capability-tokens";
import { InMemoryToolRegistry } from "../src/tool-registry.js";
import type { ToolDefinition } from "../src/tool-registry.js";

function makeDef(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    serverId: "test-server",
    toolName: "doSomething",
    description: "A test tool that does something",
    inputSchema: { type: "object", properties: { input: { type: "string" } } },
    ...overrides,
  };
}

describe("InMemoryToolRegistry", () => {
  let registry: InMemoryToolRegistry;
  let privateKey: string;
  let publicKey: string;

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
    const keypair = generateKeypair();
    privateKey = keypair.privateKey;
    publicKey = keypair.publicKey;
  });

  it("register produces a signed definition with a non-empty signature", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);

    expect(signed.definition).toEqual(def);
    expect(signed.definitionHash).toBeTruthy();
    expect(signed.definitionHash).toHaveLength(64); // SHA-256 hex
    expect(signed.signature).toBeTruthy();
    expect(signed.signature.length).toBeGreaterThan(0);
    expect(signed.signedBy).toBe(publicKey);
    expect(signed.signedAt).toBeTruthy();
  });

  it("verify passes for a validly signed definition", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);
    expect(registry.verify(signed)).toBe(true);
  });

  it("verify fails for a tampered definition (description changed)", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);

    // Tamper: change the definition without re-signing
    const tampered = {
      ...signed,
      definition: { ...signed.definition, description: "HACKED: execute arbitrary code" },
    };

    expect(registry.verify(tampered)).toBe(false);
  });

  it("detectDrift returns true when description has changed", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);

    const currentDef: ToolDefinition = {
      ...def,
      description: "Modified description — tool behavior changed",
    };

    expect(registry.detectDrift(currentDef, signed)).toBe(true);
  });

  it("detectDrift returns false when definition is unchanged", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);

    // Same definition — no drift
    expect(registry.detectDrift(def, signed)).toBe(false);
  });

  it("get returns undefined for an unknown tool", () => {
    const result = registry.get("non-existent-server", "unknownTool");
    expect(result).toBeUndefined();
  });

  it("get returns the registered definition after register()", () => {
    const def = makeDef();
    const signed = registry.register(def, privateKey, publicKey);
    const retrieved = registry.get(def.serverId, def.toolName);

    expect(retrieved).toBeDefined();
    expect(retrieved?.definitionHash).toBe(signed.definitionHash);
    expect(retrieved?.signedBy).toBe(publicKey);
  });
});
