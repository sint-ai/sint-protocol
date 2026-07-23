import {
  canonicalJsonStringify,
  err,
  ok,
  type Result,
} from "@pshkv/core";
import {
  getPublicKey,
  hashSha256,
  sign,
  verify,
} from "@pshkv/gate-capability-tokens";
import {
  dispatchEnvelopePayloadSchema,
  effectPackPayloadSchema,
  signedDispatchEnvelopeSchema,
  signedEffectPackSchema,
} from "./contracts.js";
import type {
  DispatchEnvelopePayload,
  EffectPackPayload,
  SignedDispatchEnvelope,
  SignedEffectPack,
} from "./types.js";

export function createSignedEffectPack(
  payload: EffectPackPayload,
  privateKey: string,
): Result<SignedEffectPack, string> {
  const parsed = effectPackPayloadSchema.safeParse(payload);
  if (!parsed.success) return err(`invalid effect pack: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  if (getPublicKey(privateKey) !== payload.issuer) return err("pack issuer does not match signing key");

  const canonical = canonicalJsonStringify(payload);
  const digest = hashSha256(canonical);
  return ok({ ...payload, digest, signature: sign(privateKey, digest) });
}

export function verifySignedEffectPack(
  candidate: unknown,
): Result<SignedEffectPack, string> {
  const parsed = signedEffectPackSchema.safeParse(candidate);
  if (!parsed.success) return err(`invalid effect pack: ${parsed.error.issues[0]?.message ?? "unknown"}`);

  const { digest, signature, ...payload } = parsed.data;
  const expectedDigest = hashSha256(canonicalJsonStringify(payload));
  if (digest !== expectedDigest) return err("effect pack digest mismatch");
  if (!verify(payload.issuer, signature, digest)) return err("effect pack signature invalid");
  return ok(parsed.data as SignedEffectPack);
}

export function createSignedDispatchEnvelope(
  payload: DispatchEnvelopePayload,
  privateKey: string,
): Result<SignedDispatchEnvelope, string> {
  const parsed = dispatchEnvelopePayloadSchema.safeParse(payload);
  if (!parsed.success) return err(`invalid dispatch envelope: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  if (getPublicKey(privateKey) !== payload.signer) return err("dispatch signer does not match signing key");

  return ok({
    ...payload,
    signature: sign(privateKey, canonicalJsonStringify(payload)),
  });
}

export function verifySignedDispatchEnvelope(
  candidate: unknown,
): Result<SignedDispatchEnvelope, string> {
  const parsed = signedDispatchEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(`invalid dispatch envelope: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  const { signature, ...payload } = parsed.data;
  if (!verify(payload.signer, signature, canonicalJsonStringify(payload))) {
    return err("dispatch envelope signature invalid");
  }
  return ok(parsed.data as unknown as SignedDispatchEnvelope);
}
