/**
 * SINT Protocol — crypto profile verification.
 *
 * Keeps capability-token validation crypto-agile while preserving the default
 * fail-closed posture for profiles this package cannot verify locally.
 */

import {
  type CapabilityTokenError,
  type Result,
  type SintCapabilityToken,
  type SintCryptoProfile,
  err,
  ok,
} from "@pshkv/core";
import { verify } from "./crypto.js";

export interface CryptoProfileVerificationInput {
  readonly token: SintCapabilityToken;
  readonly signingPayload: string;
}

export type CryptoProfileVerifier = (
  input: CryptoProfileVerificationInput,
) => Result<true, CapabilityTokenError>;

export type CryptoProfileVerifierRegistry = Partial<
  Record<SintCryptoProfile, CryptoProfileVerifier>
>;

export const CLASSIC_ED25519_PROFILE: SintCryptoProfile = "classic-ed25519";

export const DEFAULT_CRYPTO_PROFILE_VERIFIERS: CryptoProfileVerifierRegistry = {
  [CLASSIC_ED25519_PROFILE]: ({ token, signingPayload }) => {
    const valid = verify(token.issuer, token.signature, signingPayload);
    return valid ? ok(true) : err("INVALID_SIGNATURE");
  },
};

export function verifyTokenCryptoProfile(
  token: SintCapabilityToken,
  signingPayload: string,
  registry: CryptoProfileVerifierRegistry = DEFAULT_CRYPTO_PROFILE_VERIFIERS,
): Result<true, CapabilityTokenError> {
  const profile = token.cryptoProfile ?? CLASSIC_ED25519_PROFILE;
  const verifier = registry[profile];
  if (!verifier) {
    return err("UNSUPPORTED_CRYPTO_PROFILE");
  }

  return verifier({ token, signingPayload });
}
