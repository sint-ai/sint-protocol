/**
 * SINT Protocol — Capability Token Issuer.
 *
 * Creates and signs capability tokens with Ed25519.
 * The issuer is the authority that grants permissions to agents.
 *
 * Invariants:
 * - Token issuance is atomic (either fully created with valid signature, or fails)
 * - All inputs are validated via Zod schemas before processing
 * - Secrets never appear in error messages or logs
 * - Timestamps use ISO 8601 with microsecond precision in UTC
 *
 * @module @sint/gate-capability-tokens/issuer
 */

import {
  type CapabilityTokenError,
  type Result,
  type SintCapabilityToken,
  type SintCapabilityTokenRequest,
  capabilityTokenRequestSchema,
  err,
  ok,
} from "@sint-ai/core";
import { sign } from "./crypto.js";
import { generateUUIDv7, nowISO8601 } from "./utils.js";

/**
 * Compute the canonical signing payload for a capability token.
 * The payload is a deterministic JSON string of all token fields
 * (excluding the signature itself).
 *
 * This MUST be a pure function — same inputs always produce same output.
 *
 * @example
 * ```ts
 * const payload = computeSigningPayload(token);
 * ```
 */
export function computeSigningPayload(
  token: Omit<SintCapabilityToken, "signature">,
): string {
  // Canonical JSON: sorted keys, no whitespace, deterministic
  return JSON.stringify({
    actions: token.actions,
    attestationRequirements: token.attestationRequirements,
    constraints: token.constraints,
    delegationChain: token.delegationChain,
    expiresAt: token.expiresAt,
    executionEnvelope: token.executionEnvelope,
    issuedAt: token.issuedAt,
    issuer: token.issuer,
    modelConstraints: token.modelConstraints,
    resource: token.resource,
    revocable: token.revocable,
    revocationEndpoint: token.revocationEndpoint,
    subject: token.subject,
    tokenId: token.tokenId,
    verifiableComputeRequirements: token.verifiableComputeRequirements,
  });
}

/**
 * Issue a new capability token.
 *
 * Validates the request, generates a UUID v7 token ID,
 * signs the token with the issuer's Ed25519 private key,
 * and returns the complete, signed token.
 *
 * @param request - The token issuance request (validated via Zod)
 * @param issuerPrivateKey - The issuer's Ed25519 private key (hex)
 * @returns Result containing the signed token or an error
 *
 * @example
 * ```ts
 * const result = issueCapabilityToken({
 *   issuer: "a1b2c3...",
 *   subject: "d4e5f6...",
 *   resource: "ros2:///cmd_vel",
 *   actions: ["publish"],
 *   constraints: { maxVelocityMps: 0.5 },
 *   delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
 *   expiresAt: "2026-03-16T22:00:00.000000Z",
 *   revocable: true,
 * }, issuerPrivateKey);
 *
 * if (result.ok) {
 *   console.log("Token issued:", result.value.tokenId);
 * }
 * ```
 */
export function issueCapabilityToken(
  request: SintCapabilityTokenRequest,
  issuerPrivateKey: string,
): Result<SintCapabilityToken, CapabilityTokenError> {
  // Validate input via Zod schema
  const parsed = capabilityTokenRequestSchema.safeParse(request);
  if (!parsed.success) {
    return err("MALFORMED_TOKEN");
  }

  // Validate expiry is in the future
  const now = new Date();
  const expiresAt = new Date(request.expiresAt);
  if (expiresAt <= now) {
    return err("TOKEN_EXPIRED");
  }

  // Generate token ID and timestamp
  const tokenId = generateUUIDv7();
  const issuedAt = nowISO8601();

  // Construct the unsigned token
  const unsignedToken: Omit<SintCapabilityToken, "signature"> = {
    tokenId,
    issuer: request.issuer,
    subject: request.subject,
    resource: request.resource,
    actions: request.actions,
    constraints: request.constraints,
    modelConstraints: request.modelConstraints,
    attestationRequirements: request.attestationRequirements,
    verifiableComputeRequirements: request.verifiableComputeRequirements,
    executionEnvelope: request.executionEnvelope,
    delegationChain: request.delegationChain,
    issuedAt,
    expiresAt: request.expiresAt,
    revocable: request.revocable,
    revocationEndpoint: request.revocationEndpoint,
  };

  // Sign the canonical payload
  const payload = computeSigningPayload(unsignedToken);
  const signature = sign(issuerPrivateKey, payload);

  return ok({ ...unsignedToken, signature });
}
