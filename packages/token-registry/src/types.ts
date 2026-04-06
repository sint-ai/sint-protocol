/**
 * SINT Protocol — Token Registry Types.
 *
 * Public capability token registry — allows issuers to publish
 * signed tokens for ecosystem verification. Enables the viral
 * sint-scan --check-registry flow.
 */

export interface RegistryEntry {
  /** UUID v7 — the token's ID. */
  readonly tokenId: string;
  /** Ed25519 public key of the issuing authority. */
  readonly issuer: string;
  /** Resource URI pattern this token covers (e.g. "mcp://filesystem/*"). */
  readonly toolScope: string;
  /** ISO8601 — token issuedAt / validFrom. */
  readonly validFrom: string;
  /** ISO8601 — token expiresAt. */
  readonly validTo: string;
  /** Ed25519 public key of the token subject (the agent). */
  readonly publicKey: string;
  /** Ed25519 signature from the original token. */
  readonly signature: string;
  /** ISO8601 — when this registry entry was published. */
  readonly publishedAt: string;
  /** Optional human-readable note from publisher. */
  readonly publisherNote?: string | undefined;
}

export interface RegistryPublishRequest {
  /** The full capability token to register. */
  readonly token: unknown; // SintCapabilityToken — typed loosely to avoid deep dep
  readonly publisherNote?: string | undefined;
}

export interface RegistryLookupResult {
  readonly found: boolean;
  readonly entry?: RegistryEntry | undefined;
}

export interface RegistryListFilter {
  readonly issuer?: string | undefined;
  readonly toolScope?: string | undefined;
}
