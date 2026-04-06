import type { RegistryEntry } from "./types.js";

/** Fields we expect on a SintCapabilityToken (loosely typed). */
interface TokenLike {
  tokenId?: string;
  issuer?: string;
  subject?: string;
  resource?: string;
  issuedAt?: string;
  expiresAt?: string;
  signature?: string;
}

/**
 * Build a RegistryEntry from a capability token.
 * Throws if the token is missing required fields or is expired.
 */
export function buildRegistryEntry(token: unknown, publisherNote?: string): RegistryEntry {
  const t = token as TokenLike;

  if (!t.tokenId) throw new Error("Token missing tokenId");
  if (!t.issuer) throw new Error("Token missing issuer");
  if (!t.subject) throw new Error("Token missing subject (publicKey)");
  if (!t.resource) throw new Error("Token missing resource (toolScope)");
  if (!t.issuedAt) throw new Error("Token missing issuedAt");
  if (!t.expiresAt) throw new Error("Token missing expiresAt");
  if (!t.signature) throw new Error("Token missing signature — token must be signed");

  // Check not expired
  if (new Date(t.expiresAt) <= new Date()) {
    throw new Error(`Token ${t.tokenId} is expired (expiresAt: ${t.expiresAt})`);
  }

  return {
    tokenId: t.tokenId,
    issuer: t.issuer,
    toolScope: t.resource,
    validFrom: t.issuedAt,
    validTo: t.expiresAt,
    publicKey: t.subject,
    signature: t.signature,
    publishedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    ...(publisherNote !== undefined && { publisherNote }),
  };
}
