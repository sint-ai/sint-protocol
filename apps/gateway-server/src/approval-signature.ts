import { canonicalJsonStringify } from "@pshkv/core";
import { verify } from "@pshkv/gate-capability-tokens";

/** Verify a fresh, request-bound vote from an allowlisted operator key. */
export function verifyOperatorVote(
  requestId: string,
  body: Record<string, unknown>,
  agentId: string,
  authorizedKeys: readonly string[],
  nowMs = Date.now(),
): boolean {
  const by = body["by"];
  const signedAt = body["signedAt"];
  const signature = body["signature"];
  if (typeof by !== "string" || typeof signedAt !== "string" || typeof signature !== "string") return false;
  if (by === agentId || !authorizedKeys.includes(by)) return false;
  if (body["status"] !== "approved" && body["status"] !== "denied") return false;
  if (body["reason"] !== undefined && body["reason"] !== null
    && typeof body["reason"] !== "string") return false;
  const timestamp = Date.parse(signedAt);
  if (!Number.isFinite(timestamp) || timestamp > nowMs + 30_000 || nowMs - timestamp > 300_000) return false;
  const payload = canonicalJsonStringify({
    requestId, status: body["status"], by, signedAt, reason: body["reason"] ?? null,
  });
  return verify(by, signature, payload);
}
