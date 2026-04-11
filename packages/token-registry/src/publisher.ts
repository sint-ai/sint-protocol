import type { RegistryEntry, RegistryPublishRequest } from "./types.js";

export function buildRegistryEntry(req: RegistryPublishRequest): RegistryEntry {
  const now = new Date();
  const validTo = new Date(req.validTo);
  if (validTo <= now) {
    throw new Error(`Token ${req.tokenId} is already expired (validTo: ${req.validTo})`);
  }
  return {
    tokenId: req.tokenId,
    issuer: req.issuer,
    subject: req.subject,
    resource: req.resource,
    actions: req.actions,
    validFrom: req.validFrom,
    validTo: req.validTo,
    publishedAt: now.toISOString(),
    publisherNote: req.publisherNote,
  };
}
