/**
 * SINT Bridge-MCP — Tool Definition Signing & Registry.
 *
 * Provides cryptographic signing of MCP tool definitions to detect
 * tool poisoning attacks (ASI-class supply-chain threat) where a server
 * changes a tool's behavior after initial registration.
 *
 * @module @sint/bridge-mcp/tool-registry
 */

import { hashSha256, sign, verify } from "@pshkv/gate-capability-tokens";
import { canonicalJsonStringify } from "@pshkv/core";
import type { MCPToolAnnotations } from "./types.js";

/**
 * An MCP tool definition as provided by a server.
 */
export interface ToolDefinition {
  readonly serverId: string;
  readonly toolName: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations?: MCPToolAnnotations;
}

/**
 * A tool definition with an Ed25519 signature over its canonical hash.
 */
export interface SignedToolDefinition {
  readonly definition: ToolDefinition;
  /** SHA-256 hex of the canonical JSON of the definition. */
  readonly definitionHash: string;
  /** Ed25519 hex signature over the definitionHash. */
  readonly signature: string;
  /** Ed25519 public key hex of the signer. */
  readonly signedBy: string;
  /** ISO 8601 timestamp of signing. */
  readonly signedAt: string;
}

/**
 * Interface for a tool definition registry.
 */
export interface ToolRegistry {
  /** Register and cryptographically sign a tool definition. */
  register(def: ToolDefinition, privateKey: string, publicKey: string): SignedToolDefinition;
  /** Verify the signature on a signed tool definition. */
  verify(signed: SignedToolDefinition): boolean;
  /**
   * Detect drift: returns true if the current definition differs from the registered one.
   * A drift indicates possible tool poisoning (server changed tool after registration).
   */
  detectDrift(current: ToolDefinition, registered: SignedToolDefinition): boolean;
  /** Retrieve a signed definition by server ID and tool name. */
  get(serverId: string, toolName: string): SignedToolDefinition | undefined;
}

/**
 * Compute the canonical JSON hash of a tool definition (sorted keys for determinism).
 */
function canonicalHash(def: ToolDefinition): string {
  const canonical = canonicalJsonStringify({
    serverId: def.serverId,
    toolName: def.toolName,
    description: def.description,
    inputSchema: def.inputSchema,
    annotations: def.annotations ?? null,
  });
  return hashSha256(canonical);
}

/**
 * In-memory implementation of the ToolRegistry.
 * Suitable for testing and single-process deployments.
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private readonly store = new Map<string, SignedToolDefinition>();

  private static registryKey(serverId: string, toolName: string): string {
    return `${serverId}::${toolName}`;
  }

  register(def: ToolDefinition, privateKey: string, publicKey: string): SignedToolDefinition {
    const definitionHash = canonicalHash(def);
    const signature = sign(privateKey, definitionHash);
    const signedAt = new Date().toISOString();
    const signed: SignedToolDefinition = {
      definition: def,
      definitionHash,
      signature,
      signedBy: publicKey,
      signedAt,
    };
    const key = InMemoryToolRegistry.registryKey(def.serverId, def.toolName);
    this.store.set(key, signed);
    return signed;
  }

  verify(signed: SignedToolDefinition): boolean {
    // Re-compute hash from the stored definition to ensure hash integrity
    const recomputedHash = canonicalHash(signed.definition);
    if (recomputedHash !== signed.definitionHash) return false;
    // Verify Ed25519 signature over the definition hash
    return verify(signed.signedBy, signed.signature, signed.definitionHash);
  }

  detectDrift(current: ToolDefinition, registered: SignedToolDefinition): boolean {
    const currentHash = canonicalHash(current);
    return currentHash !== registered.definitionHash;
  }

  get(serverId: string, toolName: string): SignedToolDefinition | undefined {
    const key = InMemoryToolRegistry.registryKey(serverId, toolName);
    return this.store.get(key);
  }
}
