import {
  canonicalJsonStringify,
  MAX_DELEGATION_DEPTH,
  type CapabilityTokenError,
  type Result,
  type SintCapabilityToken,
  err,
  ok,
} from "@pshkv/core";
import {
  validateTokenExpiry,
  validateTokenSchema,
  validateTokenSignature,
  type RevocationStore,
} from "@pshkv/gate-capability-tokens";
import type { TokenResolver } from "./gateway.js";

/** Verify every link back to a configured root, including revocation and attenuation. */
export async function verifyTokenTrustChain(
  leaf: SintCapabilityToken,
  resolveToken: TokenResolver,
  trustedIssuers: readonly string[],
  revocationStore?: RevocationStore,
): Promise<Result<true, CapabilityTokenError>> {
  if (trustedIssuers.length === 0) return err("UNKNOWN_ISSUER");
  const visited = new Set<string>();
  let child: SintCapabilityToken | undefined = leaf;
  while (child) {
    if (visited.has(child.tokenId)) return err("MALFORMED_TOKEN");
    visited.add(child.tokenId);
    const schema = validateTokenSchema(child);
    if (!schema.ok) return schema;
    const signature = validateTokenSignature(child);
    if (!signature.ok) return signature;
    const expiry = validateTokenExpiry(child);
    if (!expiry.ok) return expiry;
    if (revocationStore) {
      const revocation = revocationStore.checkRevocation(child.tokenId);
      if (!revocation.ok) return revocation;
    }

    const parentId = child.delegationChain.parentTokenId;
    if (parentId === null) {
      return child.delegationChain.depth === 0 && trustedIssuers.includes(child.issuer)
        ? ok(true)
        : err("UNKNOWN_ISSUER");
    }
    if (child.delegationChain.depth < 1 || child.delegationChain.depth > MAX_DELEGATION_DEPTH) {
      return err("DELEGATION_DEPTH_EXCEEDED");
    }
    const parent: SintCapabilityToken | undefined = await resolveToken(parentId);
    if (!parent || parent.tokenId !== parentId) return err("MALFORMED_TOKEN");
    if (!isAttenuated(child, parent)) return err("INSUFFICIENT_PERMISSIONS");
    child = parent;
  }
  return err("MALFORMED_TOKEN");
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJsonStringify(left ?? null) === canonicalJsonStringify(right ?? null);
}

function isAttenuated(child: SintCapabilityToken, parent: SintCapabilityToken): boolean {
  if (child.issuer !== parent.subject || !child.delegationChain.attenuated
    || child.delegationChain.depth !== parent.delegationChain.depth + 1) return false;
  if (child.resource !== parent.resource || !child.actions.every(action => parent.actions.includes(action))) return false;
  if (Date.parse(child.expiresAt) > Date.parse(parent.expiresAt)) return false;
  if (parent.revocable && !child.revocable) return false;

  // Every signed extension must remain unchanged unless its attenuation rule is explicit below.
  const extensions = [
    "modelConstraints", "regulatedDataPolicy", "attestationRequirements",
    "verifiableComputeRequirements", "executionEnvelope", "adaptationPermit",
    "behavioralConstraints", "autonomyPolicy", "humanAuthorityRequirements",
    "deploymentEnvelope", "manufacturingEnvelope", "hazardousEnergyEnvelope",
    "passportId", "cryptoProfile", "postQuantumSignatures",
  ] as const;
  for (const field of extensions) {
    if (!same(child[field], parent[field])) return false;
  }
  const numericLimits = new Set([
    "maxForceNewtons", "maxVelocityMps", "maxRepetitions", "maxTorqueNm",
    "maxJerkMps3", "maxAngularVelocityRps", "contactForceThresholdN",
  ]);
  const parentConstraints = parent.constraints as Record<string, unknown>;
  const childConstraints = child.constraints as Record<string, unknown>;
  for (const [key, parentValue] of Object.entries(parentConstraints)) {
    const childValue = childConstraints[key];
    if (childValue === undefined) return false;
    if (numericLimits.has(key) && typeof parentValue === "number" && typeof childValue === "number") {
      if (childValue > parentValue) return false;
    } else if (!same(childValue, parentValue)) return false;
  }
  return true;
}
