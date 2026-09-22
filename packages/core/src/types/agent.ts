/**
 * SINT Protocol — Agent identity types.
 *
 * Every SINT agent has a cryptographic identity (Ed25519 passport)
 * and optional on-chain identity (ERC-8004).
 *
 * @module @pshkv/core/types/agent
 */

import type {
  Ed25519PublicKey,
  ISO8601,
  UUIDv7,
} from "./primitives.js";

/**
 * Trust levels for agents. New agents start at UNTRUSTED
 * and build trust through successful, audited operations.
 */
export enum AgentTrustLevel {
  UNTRUSTED = "untrusted",
  PROVISIONAL = "provisional",
  TRUSTED = "trusted",
  VERIFIED = "verified",
}

/**
 * A registered SINT agent's identity profile.
 */
export interface SintAgentIdentity {
  /** Unique agent identifier. */
  readonly agentId: UUIDv7;

  /** Ed25519 public key — the primary identity credential. */
  readonly publicKey: Ed25519PublicKey;

  /** Human-readable name for this agent. */
  readonly name: string;

  /** Agent description / purpose. */
  readonly description?: string;

  /** Current trust level. */
  readonly trustLevel: AgentTrustLevel;

  /** When this agent was registered. */
  readonly registeredAt: ISO8601;

  /** Last time this agent was active. */
  readonly lastActiveAt?: ISO8601;

  /** Supported protocol capabilities. */
  readonly capabilities: readonly string[];

  /** Hardware platform this agent runs on (if physical). */
  readonly hardwarePlatform?: string;

  /** On-chain identity reference (ERC-8004 token ID). */
  readonly erc8004TokenId?: string;

  /** Peaq Machine ID (for economic layer integration). */
  readonly peaqMachineId?: string;
}
