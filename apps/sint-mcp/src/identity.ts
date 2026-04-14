/**
 * SINT MCP — Agent Identity Manager.
 *
 * Manages Ed25519 keypairs and capability tokens for the MCP session.
 * Auto-generates a keypair if not provided via config.
 *
 * @module @sint/mcp/identity
 */

import type { SintCapabilityToken } from "@pshkv/core";
import {
  generateKeypair,
  getPublicKey,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";

/** Agent identity with keypair and default token. */
export interface AgentIdentity {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly defaultToken: SintCapabilityToken;
}

/**
 * Create an agent identity with an Ed25519 keypair.
 *
 * If a private key is provided, derives the public key.
 * Otherwise generates a fresh keypair.
 */
export function createAgentIdentity(
  privateKeyHex?: string,
): AgentIdentity {
  let publicKey: string;
  let privateKey: string;

  if (privateKeyHex) {
    privateKey = privateKeyHex;
    publicKey = getPublicKey(privateKeyHex);
  } else {
    const keypair = generateKeypair();
    publicKey = keypair.publicKey;
    privateKey = keypair.privateKey;
  }

  // Compute expiry 24 hours from now
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  // Issue a default capability token with broad permissions
  const result = issueCapabilityToken(
    {
      issuer: publicKey,
      subject: publicKey,
      resource: "mcp://*",
      actions: ["call", "exec.run", "subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    privateKey,
  );

  if (!result.ok) {
    throw new Error(`Failed to issue default token: ${result.error}`);
  }

  return {
    publicKey,
    privateKey,
    defaultToken: result.value,
  };
}
